import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AgronomistLanguage,
  AgronomistMessage,
  ClimateScenario,
  DatasetAvailabilityRecord,
  DatasetKey,
  DatasetSyncStatus,
  FarmBannerSyncState,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  PersistenceState,
  RotationPlanResponse,
  SavedScenarioSnapshot,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import {
  CLIMATE_PRESETS,
  SimulatedImpactMetrics,
  calculateGeometryStats,
  computeScenarioImpact,
} from '../utils/geoAndAgronomy';
import { createDefaultFarmInputs, evaluateAndRankStrategies } from '../utils/rotationAgronomyEngine';
import { buildRegionalBaselineRotation } from '../data/defaultRotations';
import {
  buildFarmDatasetCacheKey,
  createFarmOnServer,
  deleteFarmOnServer,
  deleteScenarioSnapshot,
  fetchFarmsFromServer,
  fetchWithAbort,
  loadActiveFarmId,
  loadFarmInputsMap,
  loadSavedFarms,
  loadSavedScenarios,
  patchFarmOnServer,
  saveActiveFarmId,
  saveFarmInputsForId,
  saveFarmsToStorage,
  saveScenarioSnapshot,
  updateFarmOnServer,
} from '../utils/farmStorage';

export function normalizeFarmParcel(farm: FarmParcel): FarmParcel {
  const stats = calculateGeometryStats(farm.boundary, farm.zones);
  const zones = (farm.zones || []).map((z) => {
    const zStats = calculateGeometryStats(z.boundary);
    return {
      ...z,
      boundary: zStats.closedRing,
      areaHectares: zStats.areaHectares,
      perimeterMeters: zStats.perimeterMeters,
      areaPctOfFarm: Number(
        Math.min(100, (zStats.areaHectares / Math.max(0.01, stats.areaHectares)) * 100).toFixed(1)
      ),
      center: zStats.center,
    };
  });
  return {
    ...farm,
    boundary: stats.closedRing,
    areaHectares: stats.areaHectares,
    areaAcres: stats.areaAcres,
    perimeterMeters: stats.perimeterMeters,
    boundingBox: stats.boundingBox,
    geometryVersion: stats.geometryVersion,
    geometryType: farm.geometryType || 'Polygon',
    center: stats.center,
    zones,
  };
}

export const BANNER_STATUS_COPY: Record<FarmBannerSyncState, string> = {
  idle: 'Select or draw a farm parcel to load telemetry.',
  loading: 'Acquiring farm intelligence...',
  updated: 'Farm data updated successfully.',
  partial: 'Some datasets are unavailable for this location.',
  error: 'Unable to retrieve this dataset. Retry.',
};

interface SelectedFarmContextValue {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  persistence: PersistenceState;
  selectFarmImmediate: (farm: FarmParcel) => void;
  createFarm: (farm: FarmParcel) => Promise<FarmParcel>;
  updateFarm: (farm: FarmParcel) => Promise<FarmParcel>;
  patchFarmMetadata: (farmId: string, patch: Partial<FarmParcel>) => Promise<FarmParcel>;
  deleteFarm: (farmId: string) => Promise<void>;

  // Telemetry & per-dataset sync status
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  obsLoading: boolean;
  soilLoading: boolean;
  sentinel2Loading: boolean;
  obsError: string | null;
  soilError: string | null;
  sentinel2Error: string | null;
  bannerSyncState: FarmBannerSyncState;
  bannerStatusMessage: string;
  datasetStatuses: Record<DatasetKey, DatasetSyncStatus>;
  datasetAvailability: DatasetAvailabilityRecord[];
  retryFarmDatasets: (target?: DatasetKey) => void;

  // Scenario, Rotation, Impact & Farm-Scoped Agronomist
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  savedScenarios: SavedScenarioSnapshot[];
  changeScenario: (next: ClimateScenario) => void;
  saveScenario: (sc: ClimateScenario, waterStressIndex: number, simulatedPrecip90dMm: number) => void;
  deleteScenario: (id: string) => void;

  farmerPriority: FarmerPriority;
  farmRotationInputs: FarmRotationInputs;
  rotationPlan: RotationPlanResponse;
  selectedStrategyId: string;
  generatingAi: boolean;
  aiError: string | null;
  setSelectedStrategyId: (id: string) => void;
  changeFarmerPriority: (next: FarmerPriority) => void;
  changeFarmInputs: (next: FarmRotationInputs) => void;
  generateAiRotation: () => Promise<void>;

  agronomistLang: AgronomistLanguage;
  setAgronomistLang: (lang: AgronomistLanguage) => void;
  agronomistMessages: AgronomistMessage[];
  addAgronomistMessage: (msg: AgronomistMessage) => void;
  clearAgronomistMessages: () => void;
}

const SelectedFarmContext = createContext<SelectedFarmContextValue | null>(null);

export const SelectedFarmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [farms, setFarms] = useState<FarmParcel[]>(() => loadSavedFarms().map(normalizeFarmParcel));
  const [activeFarm, setActiveFarm] = useState<FarmParcel>(() => {
    const all = loadSavedFarms().map(normalizeFarmParcel);
    const savedId = loadActiveFarmId();
    return all.find((f) => f.id === savedId) || all[0];
  });
  const [persistence, setPersistence] = useState<PersistenceState>({
    source: 'server-json-store',
    status: 'idle',
    message: null,
    lastSavedAt: null,
  });

  // Telemetry state
  const [observations, setObservations] = useState<NasaObservationBundle | null>(null);
  const [soil, setSoil] = useState<SoilProfile | null>(null);
  const [sentinel2Catalog, setSentinel2Catalog] = useState<Sentinel2CatalogResponse | null>(null);

  const [obsLoading, setObsLoading] = useState(false);
  const [soilLoading, setSoilLoading] = useState(false);
  const [sentinel2Loading, setSentinel2Loading] = useState(false);

  const [obsError, setObsError] = useState<string | null>(null);
  const [soilError, setSoilError] = useState<string | null>(null);
  const [sentinel2Error, setSentinel2Error] = useState<string | null>(null);

  const [datasetStatuses, setDatasetStatuses] = useState<Record<DatasetKey, DatasetSyncStatus>>({
    sentinel2: 'idle',
    modis: 'idle',
    smap: 'idle',
    gpm: 'idle',
    nasaPower: 'idle',
    openMeteo: 'idle',
    soil: 'idle',
  });

  // Keyed telemetry cache: [dataset::farmId::geometryVersion::params]
  const telemetryCacheRef = useRef<Map<string, unknown>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const activeFarmRef = useRef(activeFarm);
  activeFarmRef.current = activeFarm;

  // Climate & Rotation state
  const [scenario, setScenario] = useState<ClimateScenario>(CLIMATE_PRESETS[0]);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioSnapshot[]>(() =>
    loadSavedScenarios()
  );
  const [farmerPriority, setFarmerPriority] = useState<FarmerPriority>('drought-resilience');
  const [farmRotationInputs, setFarmRotationInputs] = useState<FarmRotationInputs>(() => {
    const savedMap = loadFarmInputsMap();
    const initialFarm = activeFarm;
    return savedMap[initialFarm.id] || createDefaultFarmInputs(initialFarm, null);
  });
  const [rotationPlan, setRotationPlan] = useState<RotationPlanResponse>(() => {
    const savedMap = loadFarmInputsMap();
    const inputs = savedMap[activeFarm.id] || createDefaultFarmInputs(activeFarm, null);
    return buildRegionalBaselineRotation(activeFarm, 'drought-resilience', CLIMATE_PRESETS[0], inputs);
  });
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('climate-resilient');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Per-farm scoped AI Agronomist conversation threads so Farm A never leaks into Farm B
  const [agronomistLang, setAgronomistLang] = useState<AgronomistLanguage>('en');
  const [agronomistMessagesByFarm, setAgronomistMessagesByFarm] = useState<
    Record<string, AgronomistMessage[]>
  >({});

  // Hydrate persisted farms from Express backend on startup
  useEffect(() => {
    let cancelled = false;
    fetchFarmsFromServer()
      .then((res) => {
        if (cancelled) return;
        const normalized = res.farms.map(normalizeFarmParcel);
        setFarms(normalized);
        saveFarmsToStorage(normalized);
        const savedId = loadActiveFarmId();
        const picked = normalized.find((f) => f.id === savedId) || normalized[0];
        if (picked) setActiveFarm(picked);
        setPersistence({
          source: 'server-json-store',
          status: 'idle',
          message: null,
          lastSavedAt: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setPersistence({
          source: 'demo-local-fallback',
          status: 'idle',
          message: 'Backend /api/farms unavailable; running in Demo Local Fallback mode.',
          lastSavedAt: null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDatasetsForFarm = useCallback(
    async (farm: FarmParcel, options?: { bypassCache?: boolean; onlyDataset?: DatasetKey }) => {
      const normalized = normalizeFarmParcel(farm);
      const farmId = normalized.id;
      const gv = normalized.geometryVersion || 'gv-init';
      const lat = normalized.center.lat;
      const lon = normalized.center.lon;
      const bbox = normalized.boundingBox ??
        calculateGeometryStats(normalized.boundary).boundingBox ?? [
          lon - 0.002,
          lat - 0.002,
          lon + 0.002,
          lat + 0.002,
        ];
      const bboxParam = bbox.join(',');

      // Abort any previous in-flight farm requests cleanly
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const requestId = ++activeRequestIdRef.current;

      const obsKey = buildFarmDatasetCacheKey('observations', farmId, gv, `${lat.toFixed(4)},${lon.toFixed(4)}`);
      const soilKey = buildFarmDatasetCacheKey('soil', farmId, gv, `${lat.toFixed(4)},${lon.toFixed(4)}`);
      const s2Key = buildFarmDatasetCacheKey('sentinel2', farmId, gv, bboxParam);

      const bypass = Boolean(options?.bypassCache);
      const only = options?.onlyDataset;
      const isPowerGroup =
        only === 'nasaPower' || only === 'openMeteo' || only === 'modis' || only === 'smap' || only === 'gpm';

      const cachedObs = !bypass ? (telemetryCacheRef.current.get(obsKey) as NasaObservationBundle | undefined) : undefined;
      const cachedSoil = !bypass ? (telemetryCacheRef.current.get(soilKey) as SoilProfile | undefined) : undefined;
      const cachedS2 = !bypass ? (telemetryCacheRef.current.get(s2Key) as Sentinel2CatalogResponse | undefined) : undefined;

      const needObs = (!only || isPowerGroup) && !cachedObs;
      const needSoil = (!only || only === 'soil') && !cachedSoil;
      const needS2 = (!only || only === 'sentinel2') && !cachedS2;

      const computeObsStatuses = (bundle?: NasaObservationBundle | null) => {
        if (!bundle) {
          return {
            nasaPower: 'loading' as DatasetSyncStatus,
            openMeteo: 'loading' as DatasetSyncStatus,
            modis: 'loading' as DatasetSyncStatus,
            smap: 'loading' as DatasetSyncStatus,
            gpm: 'loading' as DatasetSyncStatus,
          };
        }
        return {
          nasaPower: (bundle.sourceStatus.nasaPower === 'live' ? 'available' : 'fallback') as DatasetSyncStatus,
          openMeteo: (bundle.sourceStatus.openMeteo === 'live' ? 'available' : 'fallback') as DatasetSyncStatus,
          modis: 'available' as DatasetSyncStatus,
          smap: 'available' as DatasetSyncStatus,
          gpm: 'available' as DatasetSyncStatus,
        };
      };

      // Immediately clear stale datasets belonging to the previous farm (zero Farm A leftover leakage)
      if (!only) {
        setObservations(cachedObs ?? null);
        setSoil(cachedSoil ?? null);
        setSentinel2Catalog(cachedS2 ?? null);
        setObsError(null);
        setSoilError(null);
        setSentinel2Error(null);
        setDatasetStatuses({
          ...computeObsStatuses(cachedObs),
          soil: cachedSoil
            ? cachedSoil.source.includes('ISRIC SoilGrids')
              ? 'available'
              : 'fallback'
            : 'loading',
          sentinel2: cachedS2 ? (cachedS2.available ? 'available' : 'unavailable') : 'loading',
        });
      } else {
        if (isPowerGroup) {
          setObsError(null);
          setDatasetStatuses((prev) => ({
            ...prev,
            nasaPower: 'loading',
            openMeteo: 'loading',
            modis: 'loading',
            smap: 'loading',
            gpm: 'loading',
          }));
        } else if (only === 'soil') {
          setSoilError(null);
          setDatasetStatuses((prev) => ({ ...prev, soil: 'loading' }));
        } else if (only === 'sentinel2') {
          setSentinel2Error(null);
          setDatasetStatuses((prev) => ({ ...prev, sentinel2: 'loading' }));
        }
      }

      if (!needObs && !needSoil && !needS2) {
        setObsLoading(false);
        setSoilLoading(false);
        setSentinel2Loading(false);
        return;
      }

      setObsLoading(needObs);
      setSoilLoading(needSoil);
      setSentinel2Loading(needS2);

      const isStillCurrent = () =>
        !controller.signal.aborted &&
        requestId === activeRequestIdRef.current &&
        activeFarmRef.current.id === farmId &&
        (activeFarmRef.current.geometryVersion || 'gv-init') === gv;

      const powerPromise = needObs
        ? fetchWithAbort<NasaObservationBundle>(
            `/api/nasa/power?lat=${lat}&lon=${lon}`,
            controller.signal
          )
        : Promise.resolve(cachedObs ?? null);

      const soilPromise = needSoil
        ? fetchWithAbort<SoilProfile>(
            `/api/soil/profile?lat=${lat}&lon=${lon}`,
            controller.signal
          )
        : Promise.resolve(cachedSoil ?? null);

      const s2Promise = needS2
        ? fetchWithAbort<Sentinel2CatalogResponse>(
            `/api/satellite/sentinel2?lat=${lat}&lon=${lon}&bbox=${encodeURIComponent(bboxParam)}`,
            controller.signal
          )
        : Promise.resolve(cachedS2 ?? null);

      const [powerRes, soilRes, s2Res] = await Promise.allSettled([
        powerPromise,
        soilPromise,
        s2Promise,
      ]);

      if (!isStillCurrent()) return;

      if (needObs) {
        if (powerRes.status === 'fulfilled' && powerRes.value) {
          telemetryCacheRef.current.set(obsKey, powerRes.value);
          setObservations(powerRes.value);
          setObsError(null);
          setDatasetStatuses((prev) => ({
            ...prev,
            ...computeObsStatuses(powerRes.value),
          }));
        } else {
          const msg =
            powerRes.status === 'rejected' && powerRes.reason instanceof Error
              ? powerRes.reason.message
              : 'Failed to retrieve NASA POWER climate observations.';
          setObservations(null);
          setObsError(msg);
          setDatasetStatuses((prev) => ({
            ...prev,
            nasaPower: 'error',
            openMeteo: 'error',
            modis: 'unavailable',
            smap: 'unavailable',
            gpm: 'unavailable',
          }));
        }
        setObsLoading(false);
      }

      if (needSoil) {
        if (soilRes.status === 'fulfilled' && soilRes.value) {
          telemetryCacheRef.current.set(soilKey, soilRes.value);
          const soilData = soilRes.value;
          setSoil(soilData);
          setSoilError(null);
          setDatasetStatuses((prev) => ({
            ...prev,
            soil: soilData.source.includes('ISRIC SoilGrids') ? 'available' : 'fallback',
          }));
          setFarmRotationInputs((prev) =>
            prev.soilTestOverrideEnabled
              ? prev
              : {
                  ...prev,
                  customPhH2O: soilData.phH2O,
                  customOrganicCarbonGKg: soilData.organicCarbonGKg,
                  customNitrogenStatus: soilData.nitrogenGKg < 0.85 ? 'Low' : 'Medium',
                }
          );
        } else {
          const msg =
            soilRes.status === 'rejected' && soilRes.reason instanceof Error
              ? soilRes.reason.message
              : 'Failed to retrieve soil profile.';
          setSoil(null);
          setSoilError(msg);
          setDatasetStatuses((prev) => ({ ...prev, soil: 'error' }));
        }
        setSoilLoading(false);
      }

      if (needS2) {
        if (s2Res.status === 'fulfilled' && s2Res.value) {
          telemetryCacheRef.current.set(s2Key, s2Res.value);
          setSentinel2Catalog(s2Res.value);
          setSentinel2Error(null);
          setDatasetStatuses((prev) => ({
            ...prev,
            sentinel2: s2Res.value!.available ? 'available' : 'unavailable',
          }));
        } else {
          const msg =
            s2Res.status === 'rejected' && s2Res.reason instanceof Error
              ? s2Res.reason.message
              : 'Failed to query Sentinel-2 imagery catalog.';
          setSentinel2Catalog(null);
          setSentinel2Error(msg);
          setDatasetStatuses((prev) => ({ ...prev, sentinel2: 'error' }));
        }
        setSentinel2Loading(false);
      }
    },
    []
  );

  // Trigger farm synchronization whenever activeFarm.id OR geometryVersion changes
  useEffect(() => {
    const savedMap = loadFarmInputsMap();
    const nextInputs = savedMap[activeFarm.id] || createDefaultFarmInputs(activeFarm, null);
    setFarmRotationInputs(nextInputs);
    saveActiveFarmId(activeFarm.id);
    setAiError(null);
    fetchDatasetsForFarm(activeFarm);
  }, [activeFarm.id, activeFarm.geometryVersion, fetchDatasetsForFarm]);

  // Abort pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Re-evaluate rotation plan automatically whenever farm, geometry, soil, observations, scenario, inputs, or priority update
  useEffect(() => {
    setRotationPlan((prev) => {
      if (prev.model.includes('Gemini') && prev.agroDiagnosis.includes(activeFarm.name)) {
        const evals = evaluateAndRankStrategies({
          strategies: prev.strategies,
          farm: activeFarm,
          soil,
          observations,
          scenario,
          inputs: farmRotationInputs,
          priority: farmerPriority,
        });
        const bestId =
          Object.values(evals).sort((a, b) => a.rank - b.rank)[0]?.strategyId ||
          prev.recommendedStrategyId;
        return { ...prev, farmerPriority, recommendedStrategyId: bestId };
      }
      const nextBaseline = buildRegionalBaselineRotation(
        activeFarm,
        farmerPriority,
        scenario,
        farmRotationInputs,
        soil,
        observations
      );
      return nextBaseline;
    });
  }, [
    activeFarm,
    activeFarm.id,
    activeFarm.geometryVersion,
    soil,
    observations,
    scenario,
    farmRotationInputs,
    farmerPriority,
  ]);

  useEffect(() => {
    setSelectedStrategyId((prev) =>
      rotationPlan.strategies.some((s) => s.id === prev)
        ? prev
        : rotationPlan.recommendedStrategyId
    );
  }, [activeFarm.id, rotationPlan.recommendedStrategyId, rotationPlan.strategies]);

  const impact = useMemo(() => computeScenarioImpact(observations, scenario), [observations, scenario]);

  const selectFarmImmediate = useCallback((farm: FarmParcel) => {
    const normalized = normalizeFarmParcel(farm);
    setActiveFarm(normalized);
    saveActiveFarmId(normalized.id);
  }, []);

  const createFarm = useCallback(async (newFarm: FarmParcel): Promise<FarmParcel> => {
    const normalizedInput = normalizeFarmParcel(newFarm);
    setPersistence((p) => ({ ...p, status: 'saving', message: null }));
    try {
      const res = await createFarmOnServer(normalizedInput);
      const nextFarms = res.farms.map(normalizeFarmParcel);
      const saved = normalizeFarmParcel(res.farm);
      setFarms(nextFarms);
      saveFarmsToStorage(nextFarms);
      setActiveFarm(saved);
      saveActiveFarmId(saved.id);
      setPersistence({
        source: 'server-json-store',
        status: 'saved',
        message: null,
        lastSavedAt: new Date().toISOString(),
      });
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save new farm to server.';
      setPersistence((p) => ({ ...p, status: 'error', message: msg }));
      throw err;
    }
  }, []);

  const updateFarm = useCallback(async (updatedFarm: FarmParcel): Promise<FarmParcel> => {
    const normalizedInput = normalizeFarmParcel(updatedFarm);
    setPersistence((p) => ({ ...p, status: 'saving', message: null }));
    try {
      const res = await updateFarmOnServer(normalizedInput);
      const nextFarms = res.farms.map(normalizeFarmParcel);
      const saved = normalizeFarmParcel(res.farm);
      setFarms(nextFarms);
      saveFarmsToStorage(nextFarms);
      setActiveFarm(saved);
      saveActiveFarmId(saved.id);
      setPersistence({
        source: 'server-json-store',
        status: 'saved',
        message: null,
        lastSavedAt: new Date().toISOString(),
      });
      return saved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update farm on server.';
      setPersistence((p) => ({ ...p, status: 'error', message: msg }));
      throw err;
    }
  }, []);

  const patchFarmMetadata = useCallback(
    async (farmId: string, patch: Partial<FarmParcel>): Promise<FarmParcel> => {
      setPersistence((p) => ({ ...p, status: 'saving', message: null }));
      try {
        const res = await patchFarmOnServer(farmId, patch);
        const nextFarms = res.farms.map(normalizeFarmParcel);
        const saved = normalizeFarmParcel(res.farm);
        setFarms(nextFarms);
        saveFarmsToStorage(nextFarms);
        if (activeFarmRef.current.id === farmId) {
          setActiveFarm(saved);
        }
        setPersistence({
          source: 'server-json-store',
          status: 'saved',
          message: null,
          lastSavedAt: new Date().toISOString(),
        });
        return saved;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to update farm properties.';
        setPersistence((p) => ({ ...p, status: 'error', message: msg }));
        throw err;
      }
    },
    []
  );

  const deleteFarm = useCallback(async (farmId: string) => {
    setPersistence((p) => ({ ...p, status: 'saving', message: null }));
    try {
      const res = await deleteFarmOnServer(farmId);
      const nextFarms = res.farms.map(normalizeFarmParcel);
      setFarms(nextFarms);
      saveFarmsToStorage(nextFarms);
      if (activeFarmRef.current.id === farmId && nextFarms[0]) {
        setActiveFarm(nextFarms[0]);
        saveActiveFarmId(nextFarms[0].id);
      }
      setPersistence({
        source: 'server-json-store',
        status: 'saved',
        message: null,
        lastSavedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to delete farm.';
      setPersistence((p) => ({ ...p, status: 'error', message: msg }));
    }
  }, []);

  const retryFarmDatasets = useCallback(
    (target?: DatasetKey) => {
      fetchDatasetsForFarm(activeFarmRef.current, { bypassCache: true, onlyDataset: target });
    },
    [fetchDatasetsForFarm]
  );

  const changeScenario = useCallback((next: ClimateScenario) => {
    setScenario(next);
  }, []);

  const saveScenario = useCallback(
    (sc: ClimateScenario, waterStressIndex: number, simulatedPrecip90dMm: number) => {
      const updated = saveScenarioSnapshot({
        id: `sc-${Date.now()}`,
        farmId: activeFarmRef.current.id,
        farmName: activeFarmRef.current.name,
        savedAt: new Date().toISOString(),
        scenario: sc,
        waterStressIndex,
        simulatedPrecip90dMm,
      });
      setSavedScenarios(updated);
    },
    []
  );

  const deleteScenario = useCallback((id: string) => {
    setSavedScenarios(deleteScenarioSnapshot(id));
  }, []);

  const changeFarmerPriority = useCallback((nextPriority: FarmerPriority) => {
    setFarmerPriority(nextPriority);
  }, []);

  const changeFarmInputs = useCallback((nextInputs: FarmRotationInputs) => {
    setFarmRotationInputs(nextInputs);
    saveFarmInputsForId(activeFarmRef.current.id, nextInputs);
  }, []);

  const generateAiRotation = useCallback(async () => {
    if (!observations || !soil) return;
    const targetFarm = activeFarmRef.current;
    const targetGv = targetFarm.geometryVersion;
    setGeneratingAi(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmName: targetFarm.name,
          region: targetFarm.region,
          agroClimaticZone: targetFarm.agroClimaticZone,
          areaHectares: targetFarm.areaHectares,
          farmerPriority,
          observationsSummary: observations.summary,
          soilProfile: soil,
          climateScenario: scenario,
          simulatedImpact: impact,
          farmInputs: farmRotationInputs,
        }),
      });
      const data = (await res.json()) as RotationPlanResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gemini rotation engine returned an error.');
      }
      // Guard against farm switch mid-generation
      if (
        activeFarmRef.current.id !== targetFarm.id ||
        activeFarmRef.current.geometryVersion !== targetGv
      ) {
        return;
      }
      if (Array.isArray(data.strategies) && data.strategies.length >= 3) {
        const evals = evaluateAndRankStrategies({
          strategies: data.strategies,
          farm: targetFarm,
          soil,
          observations,
          scenario,
          inputs: farmRotationInputs,
          priority: farmerPriority,
        });
        const bestId =
          Object.values(evals).sort((a, b) => a.rank - b.rank)[0]?.strategyId ||
          data.recommendedStrategyId ||
          data.strategies[0].id;
        setRotationPlan({ ...data, recommendedStrategyId: bestId });
        setSelectedStrategyId(bestId);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach Gemini API.');
    } finally {
      setGeneratingAi(false);
    }
  }, [observations, soil, farmerPriority, scenario, impact, farmRotationInputs]);

  const agronomistMessages = useMemo(
    () => agronomistMessagesByFarm[activeFarm.id] || [],
    [agronomistMessagesByFarm, activeFarm.id]
  );

  const addAgronomistMessage = useCallback((msg: AgronomistMessage) => {
    const fid = activeFarmRef.current.id;
    setAgronomistMessagesByFarm((prev) => ({
      ...prev,
      [fid]: [...(prev[fid] || []), msg],
    }));
  }, []);

  const clearAgronomistMessages = useCallback(() => {
    const fid = activeFarmRef.current.id;
    setAgronomistMessagesByFarm((prev) => ({ ...prev, [fid]: [] }));
  }, []);

  const bannerSyncState: FarmBannerSyncState = useMemo(() => {
    if (obsLoading || soilLoading || sentinel2Loading) return 'loading';
    const statuses = Object.values(datasetStatuses);
    if (statuses.every((s) => s === 'error')) return 'error';
    if (statuses.some((s) => s === 'error' || s === 'unavailable' || s === 'fallback')) return 'partial';
    if (statuses.every((s) => s === 'available')) return 'updated';
    return 'idle';
  }, [obsLoading, soilLoading, sentinel2Loading, datasetStatuses]);

  const bannerStatusMessage = BANNER_STATUS_COPY[bannerSyncState];

  const datasetAvailability: DatasetAvailabilityRecord[] = useMemo(() => {
    const s2Scene = sentinel2Catalog?.scenes?.[0];
    const powerMeta =
      observations?.sourceStatus.nasaPower === 'live'
        ? observations.sourceStatus.nasaPowerMeta
        : undefined;
    const farmId = activeFarm.id;
    const geometryVersion = activeFarm.geometryVersion || 'gv-init';
    return [
      {
        key: 'sentinel2',
        label: 'Copernicus Sentinel-2 L2A (10 m)',
        status: datasetStatuses.sentinel2,
        source: 'Planetary Computer STAC',
        resolution: '10 m native',
        observationDate: s2Scene ? `${s2Scene.date} (${s2Scene.cloudCoverPct}% cloud)` : null,
        units: 'Reflectance / NDVI',
        classification: 'Observed',
        limitation: sentinel2Catalog?.queryBbox
          ? `Queried farm bbox [${sentinel2Catalog.queryBbox.map((n) => n.toFixed(3)).join(', ')}].`
          : 'Optical bands require clear sky.',
        error: sentinel2Error || undefined,
        farmId,
        geometryVersion,
      },
      {
        key: 'nasaPower',
        label: 'NASA POWER Agroclimatology',
        status: datasetStatuses.nasaPower,
        source:
          observations?.sourceStatus.nasaPower === 'live'
            ? 'NASA POWER AG Daily'
            : 'Regional Climatology Fallback',
        resolution: '0.5° × 0.625° (~55 km grid)',
        observationDate: powerMeta ? `${powerMeta.startDate} → ${powerMeta.endDate}` : null,
        units: '°C, mm, MJ/m2/d',
        classification: observations?.sourceStatus.nasaPower === 'live' ? 'Observed' : 'Estimated',
        limitation: 'Synoptic grid around farm centroid; not an in-field weather station.',
        error: obsError || undefined,
        farmId,
        geometryVersion,
      },
      {
        key: 'openMeteo',
        label: 'Open-Meteo 7-Day Forecast',
        status: datasetStatuses.openMeteo,
        source: 'ECMWF / GFS NWP Feed',
        resolution: '~11 km grid',
        observationDate: observations?.forecast7d?.[0]?.date || null,
        units: '°C, mm, m3/m3',
        classification: 'Modeled',
        limitation: 'Short-range numerical forecast at parcel centroid.',
        farmId,
        geometryVersion,
      },
      {
        key: 'smap',
        label: 'NASA SMAP L4 Soil Moisture',
        status: datasetStatuses.smap,
        source: 'NASA EOSDIS GIBS / NSIDC',
        resolution: '9 km (~8,100 ha cell)',
        observationDate: powerMeta?.endDate || null,
        units: '% wetness',
        classification: 'Modeled',
        limitation: 'Coarse 9 km product reflects regional watershed moisture, not small parcel boundaries.',
        farmId,
        geometryVersion,
      },
      {
        key: 'gpm',
        label: 'NASA GPM IMERG Precipitation',
        status: datasetStatuses.gpm,
        source: 'NASA EOSDIS GIBS / GSFC',
        resolution: '10 km grid',
        observationDate: powerMeta?.endDate || null,
        units: 'mm/day',
        classification: 'Observed',
        limitation: '10 km grid smooths localized convective showers.',
        farmId,
        geometryVersion,
      },
      {
        key: 'modis',
        label: 'NASA MODIS Terra NDVI',
        status: datasetStatuses.modis,
        source: 'NASA EOSDIS GIBS',
        resolution: '250 m native',
        observationDate: '8-day composite',
        units: 'NDVI (-1 to 1)',
        classification: 'Observed',
        limitation: '250 m pixels blend adjacent smallholder plots.',
        farmId,
        geometryVersion,
      },
      {
        key: 'soil',
        label: 'ISRIC SoilGrids v2.0 Depth Profile',
        status: datasetStatuses.soil,
        source: soil?.source || 'ISRIC SoilGrids / Regional Baseline',
        resolution: '250 m soil grid',
        observationDate: 'Static v2.0 horizon release',
        units: 'pH, g/kg, %',
        classification: soil?.source.includes('ISRIC SoilGrids') ? 'Observed' : 'Estimated',
        limitation: '250 m model output; verify pH and NPK via local soil lab test.',
        error: soilError || undefined,
        farmId,
        geometryVersion,
      },
    ];
  }, [
    activeFarm.geometryVersion,
    activeFarm.id,
    datasetStatuses,
    obsError,
    observations,
    sentinel2Catalog,
    sentinel2Error,
    soil,
    soilError,
  ]);

  const value: SelectedFarmContextValue = {
    farms,
    activeFarm,
    persistence,
    selectFarmImmediate,
    createFarm,
    updateFarm,
    patchFarmMetadata,
    deleteFarm,
    observations,
    soil,
    sentinel2Catalog,
    obsLoading,
    soilLoading,
    sentinel2Loading,
    obsError,
    soilError,
    sentinel2Error,
    bannerSyncState,
    bannerStatusMessage,
    datasetStatuses,
    datasetAvailability,
    retryFarmDatasets,
    scenario,
    impact,
    savedScenarios,
    changeScenario,
    saveScenario,
    deleteScenario,
    farmerPriority,
    farmRotationInputs,
    rotationPlan,
    selectedStrategyId,
    generatingAi,
    aiError,
    setSelectedStrategyId,
    changeFarmerPriority,
    changeFarmInputs,
    generateAiRotation,
    agronomistLang,
    setAgronomistLang,
    agronomistMessages,
    addAgronomistMessage,
    clearAgronomistMessages,
  };

  return <SelectedFarmContext.Provider value={value}>{children}</SelectedFarmContext.Provider>;
};

export function useSelectedFarm(): SelectedFarmContextValue {
  const ctx = useContext(SelectedFarmContext);
  if (!ctx) {
    throw new Error('useSelectedFarm must be used within a SelectedFarmProvider');
  }
  return ctx;
}

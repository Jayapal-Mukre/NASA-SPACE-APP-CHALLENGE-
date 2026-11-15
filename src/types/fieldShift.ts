export type DataProvenance =
  | 'nasa-power'
  | 'nasa-gibs'
  | 'open-meteo'
  | 'isric-soilgrids'
  | 'estimated'
  | 'simulated'
  | 'gemini-ai';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export type FarmBoundaryStatus = 'Verified' | 'Draft' | 'Modified';

export interface FarmZone {
  id: string;
  name: string;
  cropType: string;
  soilType: string;
  irrigationType: IrrigationAvailability;
  areaHectares: number;
  perimeterMeters: number;
  areaPctOfFarm: number;
  center: GeoPoint;
  color: string;
  boundary: [number, number][]; // [lon, lat] closed GeoJSON Polygon ring
  updatedAt: string;
}

export interface FarmParcel {
  id: string;
  name: string;
  region: string;
  district?: string;
  state?: string;
  country: string;
  isKarnatakaDemo: boolean;
  agroClimaticZone: string;
  elevationMeters: number;
  areaHectares: number;
  areaAcres?: number;
  perimeterMeters?: number;
  boundingBox?: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  geometryVersion?: string;
  geometryType?: 'Polygon' | 'MultiPolygon';
  polygons?: [number, number][][];
  primarySoilType: string;
  dominantCrops: string[];
  irrigationType?: IrrigationAvailability;
  plantingInfo?: string;
  boundaryStatus?: FarmBoundaryStatus;
  center: GeoPoint;
  boundary: [number, number][]; // [lon, lat] polygon ring
  zones?: FarmZone[];
  description: string;
  updatedAt?: string;
}

export type EditorTool =
  | 'select'
  | 'draw-farm'
  | 'draw-zone'
  | 'edit'
  | 'add-vertex'
  | 'delete-vertex'
  | 'move';

export type EditingTarget =
  | { type: 'farm' }
  | { type: 'zone'; zoneId: string };

export interface PersistenceState {
  status: 'idle' | 'loading' | 'saving' | 'saved' | 'error';
  source: 'server-json-store' | 'demo-local-fallback';
  message: string | null;
  lastSavedAt: string | null;
}

export interface DailyObservation {
  date: string;
  tempC: number;
  tempMaxC: number;
  tempMinC: number;
  precipMm: number;
  soilWetnessTopPct: number;
  soilWetnessRootPct: number;
  solarIrradianceMj: number;
  humidityPct: number;
  windMs: number;
  estimatedNdvi: number;
  estimatedEt0Mm: number;
}

export interface MonthlyClimatology {
  month: string;
  tempC: number;
  precipMm: number;
  solarMj: number;
}

export interface ForecastDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipMm: number;
  soilMoisture0to1cm: number;
  soilMoisture3to9cm: number;
  soilMoisture9to27cm: number;
  soilTemp0cm: number;
}

export interface NasaObservationBundle {
  location: GeoPoint;
  fetchedAt: string;
  sourceStatus: {
    nasaPower: 'live' | 'fallback';
    openMeteo: 'live' | 'fallback';
    nasaPowerMeta?: {
      product: string;
      startDate: string;
      endDate: string;
      validDays: number;
      missingFillPoints: number;
    };
    message?: string;
  };
  summary: {
    meanTempC: number;
    maxTempC: number;
    minTempC: number;
    totalPrecip90dMm: number;
    meanSurfaceSoilWetnessPct: number;
    meanRootSoilWetnessPct: number;
    meanSolarMj: number;
    meanHumidityPct: number;
    estimatedNdvi: number;
    aridityIndex: number;
  };
  dailySeries: DailyObservation[];
  monthlyClimatology: MonthlyClimatology[];
  forecast7d: ForecastDay[];
}

export interface SoilProfile {
  location: GeoPoint;
  source: 'ISRIC SoilGrids v2.0 (Measured)' | 'Regional Agro-Ecological Baseline (Estimated)';
  textureClass: string;
  sandPct: number;
  siltPct: number;
  clayPct: number;
  phH2O: number;
  organicCarbonGKg: number;
  nitrogenGKg: number;
  cecCmolKg: number;
  bulkDensityKgDm3: number;
  waterHoldingCapacityMmM: number;
  depthLayers: {
    depth: string;
    moisturePct: number;
    organicCarbonGKg: number;
    ph: number;
  }[];
  amendmentNotes: string[];
}

export type ClimatePresetId =
  | 'baseline'
  | 'reduced-monsoon'
  | 'extreme-monsoon'
  | 'heat-stress'
  | 'delayed-monsoon'
  | 'reduced-irrigation'
  | 'combined-stress'
  | 'ssp2-2040'
  | 'el-nino-drought'
  | 'custom';

export interface ClimateScenario {
  presetId: ClimatePresetId;
  label: string;
  tempDeltaC: number;
  precipChangePct: number;
  irrigationEfficiencyPct: number;
  monsoonOnsetDelayDays?: number;
  drySpellDurationDays?: number;
  plantingDateShiftDays?: number;
  isHypothetical?: boolean;
  projectionNote?: string;
}

export type FarmerPriority =
  | 'water-conservation'
  | 'soil-restoration'
  | 'income-potential'
  | 'drought-resilience'
  | 'erosion-reduction'
  | 'crop-diversification';

export type IrrigationAvailability =
  | 'rainfed'
  | 'protective-tank'
  | 'borewell-drip'
  | 'canal-surface';

export type EquipmentAvailability =
  | 'manual-bullock'
  | 'shared-tractor'
  | 'precision-drill-drip';

export type MarketPreference =
  | 'local-msp-mandi'
  | 'pulse-oilseed-value'
  | 'fodder-mixed'
  | 'commercial-horticulture';

export type PlantingSeasonFocus =
  | 'Full Annual Cycle'
  | 'Kharif'
  | 'Rabi'
  | 'Zaid / Summer';

export interface FarmRotationInputs {
  existingCropSequence: string;
  irrigationAvailability: IrrigationAvailability;
  waterConstraintNote: string;
  plantingSeason: PlantingSeasonFocus;
  equipmentAvailability: EquipmentAvailability;
  marketPreference: MarketPreference;
  soilTestOverrideEnabled: boolean;
  customPhH2O: number;
  customOrganicCarbonGKg: number;
  customNitrogenStatus: 'Low' | 'Medium' | 'Optimal';
}

export interface RotationSeason {
  season: string;
  plantingWindow: string;
  crop: string;
  botanicalOrRole: string;
  durationDays: number;
  waterNeedMm: number;
  nitrogenImpactKgHa: number;
  notes: string;
  whySelected?: string;
  environmentalEvidence?: string;
  soilBenefit?: string;
  rootDepthClass?: string;
  equipmentNeed?: string;
  riskNote?: string;
}

export interface AgronomicAnalysis {
  waterRequirementNote: string;
  nitrogenFixationKgHa: number;
  nutrientCyclingNote: string;
  organicMatterContribution: string;
  soilCoverPct: number;
  erosionProtection: 'High' | 'Moderate' | 'Low';
  rootDepthDiversity: string;
  pestCycleInterruption: string;
  growingSeasonSuitability: 'High' | 'Moderate' | 'Constrained';
  marketSuitability: string;
  equipmentRequirements: string;
}

export interface StrategyExplainability {
  whyRecommended: string;
  evidenceBasis: string[];
  modelingAssumptions: string[];
  additionalInfoRequired: string[];
}

export interface RotationStrategy {
  id: string;
  name: string;
  categoryLabel?: string;
  focus: string;
  suitabilityRating: 'High' | 'Moderate' | 'Constrained';
  summary: string;
  totalWaterDemandMm: number;
  waterBalanceNote: string;
  soilNitrogenDeltaKgHa: number;
  carbonSequestrationTHaYr: number;
  soilImprovementMechanism: string;
  risksAndUncertainties: string[];
  seasons: RotationSeason[];
  agronomicAnalysis?: AgronomicAnalysis;
  explainability?: StrategyExplainability;
}

export interface RotationPlanResponse {
  generatedAt: string;
  model: string;
  farmerPriority: FarmerPriority;
  agroDiagnosis: string;
  recommendedStrategyId: string;
  strategies: RotationStrategy[];
}

export type AgronomistLanguage = 'en' | 'kn' | 'hi';

export type UiExperienceMode = 'farmer' | 'researcher';

export interface AgronomistMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  language?: AgronomistLanguage;
}

export interface SavedScenarioSnapshot {
  id: string;
  farmId: string;
  farmName: string;
  savedAt: string;
  scenario: ClimateScenario;
  waterStressIndex: number;
  simulatedPrecip90dMm: number;
}

export type AreaUnit = 'ha' | 'acres';

export type ActiveWorkspace =
  | 'overview'
  | 'showcase'
  | 'earth'
  | 'operations'
  | 'map'
  | 'satellite'
  | 'observations'
  | 'rotation-lab'
  | 'climate-sim'
  | 'digital-twin'
  | 'rotation-twin'
  | 'agronomist'
  | 'command'
  | 'reports'
  | 'methodology'
  | 'demo';

export type GibsLayerId = 'true-color' | 'ndvi' | 'soil-moisture' | 'precipitation' | 'none';

export type BasemapId = 'esri-imagery' | 'sentinel2-true-color' | 'modis-true-color' | 'terrain-hillshade';

export type ScientificOverlayId =
  | 'none'
  | 'sentinel2-ndvi'
  | 'ndvi'
  | 'soil-moisture'
  | 'precipitation'
  | 'terrain-hillshade';

export interface Sentinel2Scene {
  id: string;
  date: string;
  datetime: string;
  cloudCoverPct: number;
  platform: string;
  mgrsTile: string;
  trueColorTileUrl: string;
  ndviTileUrl: string;
}

export interface Sentinel2CatalogResponse {
  available: boolean;
  provider: string;
  resolutionMeters: number;
  queryBbox?: [number, number, number, number] | null;
  scenes: Sentinel2Scene[];
  message?: string;
}

export type DatasetKey =
  | 'sentinel2'
  | 'modis'
  | 'smap'
  | 'gpm'
  | 'nasaPower'
  | 'openMeteo'
  | 'soil';

export type DatasetSyncStatus =
  | 'idle'
  | 'loading'
  | 'available'
  | 'fallback'
  | 'unavailable'
  | 'error';

export type FarmBannerSyncState =
  | 'idle'
  | 'loading'
  | 'updated'
  | 'partial'
  | 'error';

export interface DatasetAvailabilityRecord {
  key: DatasetKey;
  label: string;
  status: DatasetSyncStatus;
  source: string;
  resolution: string;
  observationDate: string | null;
  units?: string;
  classification: 'Observed' | 'Modeled' | 'Estimated' | 'Simulated';
  limitation: string;
  error?: string;
  farmId: string;
  geometryVersion: string;
}

export interface FarmDataEnvelope<T> {
  farmId: string;
  geometryVersion: string;
  queryLocation: {
    lat: number;
    lon: number;
    boundingBox?: [number, number, number, number] | null;
  };
  dataset: string;
  observationDate: string | null;
  units: string;
  source: string;
  resolution: string;
  classification: 'Observed' | 'Modeled' | 'Estimated' | 'Simulated';
  retrievalStatus: DatasetSyncStatus;
  error?: string;
  data: T | null;
}

import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Calendar,
  Plus,
  FlaskConical,
  ArrowRight,
  Trash2,
  Download,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sprout,
  BookmarkCheck,
} from 'lucide-react';
import {
  ActiveWorkspace,
  ClimateScenario,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  RotationPlanResponse,
  RotationStrategy,
  SavedScenarioSnapshot,
  Sentinel2CatalogResponse,
  SoilProfile,
  UiExperienceMode,
} from '../types/fieldShift';
import {
  SimulatedImpactMetrics,
  calculateGeometryStats,
  computePolygonBounds,
  hectaresToAcres,
} from '../utils/geoAndAgronomy';

interface FarmerCommandCenterProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  onSelectFarm: (farm: FarmParcel) => void;
  onCreateFarm: (newFarm: FarmParcel) => void;
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  rotationPlan: RotationPlanResponse;
  selectedStrategyId: string;
  onSelectStrategy: (id: string) => void;
  farmInputs: FarmRotationInputs;
  onChangeFarmInputs: (next: FarmRotationInputs) => void;
  savedScenarios: SavedScenarioSnapshot[];
  onLoadScenario: (sc: ClimateScenario) => void;
  onDeleteScenario: (id: string) => void;
  uiMode: UiExperienceMode;
  onChangeUiMode: (mode: UiExperienceMode) => void;
  onNavigate: (ws: ActiveWorkspace) => void;
  onOpenReportModal: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildBoundarySvgPoints(
  boundary: [number, number][],
  customBounds?: [[number, number], [number, number]] | null
): string {
  if (!boundary || boundary.length < 3) return '15,15 85,15 85,85 15,85';
  let minX = customBounds ? customBounds[0][0] : Infinity;
  let maxX = customBounds ? customBounds[1][0] : -Infinity;
  let minY = customBounds ? customBounds[0][1] : Infinity;
  let maxY = customBounds ? customBounds[1][1] : -Infinity;
  if (!customBounds) {
    for (const [lon, lat] of boundary) {
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
  }
  const span = Math.max(1e-5, maxX - minX, maxY - minY);
  return boundary
    .map(([lon, lat]) => {
      const x = 10 + ((lon - minX) / span) * 80;
      const y = 90 - ((lat - minY) / span) * 80;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function getSeasonMonthFlags(seasonName: string): {
  sowing: number[];
  growth: number[];
  harvest: number[];
} {
  const s = seasonName.toLowerCase();
  if (s.includes('kharif')) {
    return { sowing: [5], growth: [6, 7, 8], harvest: [9] }; // Jun sow, Jul-Sep grow, Oct harvest
  }
  if (s.includes('rabi')) {
    return { sowing: [9, 10], growth: [11, 0], harvest: [1] }; // Oct-Nov sow, Dec-Jan grow, Feb harvest
  }
  // Zaid / Summer
  return { sowing: [1, 2], growth: [3], harvest: [4] }; // Feb-Mar sow, Apr grow, May harvest
}

export const FarmerCommandCenter: React.FC<FarmerCommandCenterProps> = ({
  farms,
  activeFarm,
  onSelectFarm,
  onCreateFarm,
  observations,
  soil,
  sentinel2Catalog,
  scenario,
  impact,
  rotationPlan,
  selectedStrategyId,
  onSelectStrategy,
  farmInputs,
  onChangeFarmInputs,
  savedScenarios,
  onLoadScenario,
  onDeleteScenario,
  uiMode,
  onChangeUiMode,
  onNavigate,
  onOpenReportModal,
}) => {
  const [showAddFarm, setShowAddFarm] = useState(false);
  const [newFarmName, setNewFarmName] = useState('');
  const [newFarmRegion, setNewFarmRegion] = useState('Karnataka, India');
  const [newFarmLat, setNewFarmLat] = useState('14.4644');
  const [newFarmLon, setNewFarmLon] = useState('75.9218');
  const [newFarmArea, setNewFarmArea] = useState('18.5');
  const [newFarmSoil, setNewFarmSoil] = useState('Red Sandy Loam');
  const [newFarmCrops, setNewFarmCrops] = useState('Ragi, Pigeon Pea, Groundnut');

  const activeStrategy: RotationStrategy =
    rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0];
  const latestS2 = sentinel2Catalog?.scenes?.[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const parcelBounds = useMemo(() => computePolygonBounds(activeFarm.boundary), [activeFarm.boundary]);
  const svgPoints = useMemo(
    () => buildBoundarySvgPoints(activeFarm.boundary, parcelBounds),
    [activeFarm.boundary, parcelBounds]
  );
  const svgZones = useMemo(
    () =>
      (activeFarm.zones || []).map((z) => ({
        id: z.id,
        color: z.color,
        points: buildBoundarySvgPoints(z.boundary, parcelBounds),
      })),
    [activeFarm.zones, parcelBounds]
  );

  const effectivePh = farmInputs.soilTestOverrideEnabled
    ? farmInputs.customPhH2O
    : (soil?.phH2O ?? null);
  const effectiveSoc = farmInputs.soilTestOverrideEnabled
    ? farmInputs.customOrganicCarbonGKg
    : (soil?.organicCarbonGKg ?? null);

  const soilGapRows = [
    {
      param: 'Soil pH (H2O)',
      status: farmInputs.soilTestOverrideEnabled
        ? `Field Lab Override (${effectivePh})`
        : soil
          ? `ISRIC SoilGrids Est. (${soil.phH2O})`
          : 'Unavailable',
      isFieldMeasured: farmInputs.soilTestOverrideEnabled,
      action: 'Verify 0–15 cm composite soil pH before lime/gypsum budgeting.',
    },
    {
      param: 'Organic Carbon (g/kg)',
      status: farmInputs.soilTestOverrideEnabled
        ? `Field Lab Override (${effectiveSoc} g/kg)`
        : soil
          ? `ISRIC SoilGrids Est. (${soil.organicCarbonGKg} g/kg)`
          : 'Unavailable',
      isFieldMeasured: farmInputs.soilTestOverrideEnabled,
      action: 'Collect Walkley-Black lab SOC test every 2–3 rotation cycles.',
    },
    {
      param: 'Available Nitrogen (kg/ha)',
      status: farmInputs.soilTestOverrideEnabled
        ? `Farmer Rating: ${farmInputs.customNitrogenStatus}`
        : 'Missing Field Lab Test (Total N only in ISRIC)',
      isFieldMeasured: false,
      action: 'Run alkaline KMnO₄ available N test before Kharif top-dressing.',
    },
    {
      param: 'Available Phosphorus (P₂O₅)',
      status: 'Missing Field Lab Test (Not detectable by satellite)',
      isFieldMeasured: false,
      action: 'Request Olsen / Bray-P lab assay (satellites cannot measure P ppm).',
    },
    {
      param: 'Available Potassium (K₂O)',
      status: 'Missing Field Lab Test (Not detectable by satellite)',
      isFieldMeasured: false,
      action: 'Request ammonium-acetate exchangeable K test.',
    },
    {
      param: 'Texture & Drainage Rate',
      status: soil
        ? `${soil.textureClass} (${soil.sandPct}/${soil.siltPct}/${soil.clayPct}%) · WHC ${soil.waterHoldingCapacityMmM} mm/m`
        : 'Regional Baseline Only',
      isFieldMeasured: false,
      action: 'Run 15-minute simple ring/percolation drainage check on low spots.',
    },
  ];

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(newFarmLat);
    const lon = parseFloat(newFarmLon);
    const area = parseFloat(newFarmArea);
    if (!newFarmName.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const d = 0.0022;
    const boundary: [number, number][] = [
      [lon - d, lat + d],
      [lon + d, lat + d],
      [lon + d, lat - d],
      [lon - d, lat - d],
      [lon - d, lat + d],
    ];
    const stats = calculateGeometryStats(boundary);
    const crops = newFarmCrops
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const parcel: FarmParcel = {
      id: `saved-${Date.now()}`,
      name: newFarmName.trim(),
      region: newFarmRegion.trim() || 'Custom Region',
      country: newFarmRegion.toLowerCase().includes('india') ? 'India' : 'Global',
      isKarnatakaDemo: lat >= 11.5 && lat <= 18.6 && lon >= 74 && lon <= 78.6,
      agroClimaticZone: 'Saved User Parcel',
      elevationMeters: 520,
      areaHectares: Number.isFinite(area) && area > 0 ? Number(area.toFixed(2)) : stats.areaHectares,
      areaAcres: stats.areaAcres,
      perimeterMeters: stats.perimeterMeters,
      boundingBox: stats.boundingBox,
      geometryVersion: stats.geometryVersion,
      geometryType: 'Polygon',
      primarySoilType: newFarmSoil.trim() || 'Needs farmer input',
      dominantCrops: crops,
      center: stats.center,
      boundary: stats.closedRing,
      description: `User-saved parcel created in Farmer Command Center (${newFarmRegion}).`,
    };
    onCreateFarm(parcel);
    setNewFarmName('');
    setShowAddFarm(false);
  };

  return (
    <div className="space-y-5">
      {/* 8.1 & 8.8 Command Center Header + Farmer / Researcher Mode Toggle */}
      <div className="mission-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#32D9FF]/15 pb-4">
          <div>
            <div className="text-[11px] font-mono text-[#32D9FF] uppercase tracking-wider">
              Unified Farmer Command Center · Saved Parcel Operations
            </div>
            <h2 className="text-lg lg:text-xl font-bold text-slate-100 mt-0.5">
              {activeFarm.name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeFarm.region} · {activeFarm.areaHectares} ha ·{' '}
              <span className="font-mono text-slate-300">
                {activeFarm.center.lat.toFixed(4)}°, {activeFarm.center.lon.toFixed(4)}°
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 8.8 Farmer vs Researcher Mode */}
            <div className="flex items-center gap-1 bg-[#05080f] border border-slate-800 rounded-lg p-1 text-xs">
              <button
                type="button"
                onClick={() => onChangeUiMode('farmer')}
                className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
                  uiMode === 'farmer'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Farmer Mode
              </button>
              <button
                type="button"
                onClick={() => onChangeUiMode('researcher')}
                className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
                  uiMode === 'researcher'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Researcher Mode
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenReportModal}
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF / CSV</span>
            </button>
          </div>
        </div>

        {/* 8.2 Unified Farm Health Overview + SVG Boundary Polygon */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Polygon Boundary & Quick Navigation */}
          <div className="lg:col-span-3 bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-3.5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#F4F8FF]">Farm Boundary</span>
              <span className="font-mono text-[11px] text-[#32D9FF]">
                {activeFarm.areaHectares} ha ({hectaresToAcres(activeFarm.areaHectares)} ac)
              </span>
            </div>
            <div className="h-28 w-full bg-[#091426] border border-[#32D9FF]/15 rounded-lg flex items-center justify-center relative">
              <svg viewBox="0 0 100 100" className="w-24 h-24">
                <polygon
                  points={svgPoints}
                  fill="rgba(50, 217, 255, 0.16)"
                  stroke="#32D9FF"
                  strokeWidth="2"
                />
                {svgZones.map((z) => (
                  <polygon
                    key={z.id}
                    points={z.points}
                    fill={z.color}
                    fillOpacity="0.28"
                    stroke={z.color}
                    strokeWidth="1.5"
                    strokeDasharray="2 1"
                  />
                ))}
              </svg>
              <span className="absolute bottom-1.5 right-2 text-[10px] font-mono text-[#8CA2BD]">
                {activeFarm.boundary.length} pts · {(activeFarm.zones || []).length} zones
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('operations')}
              className="w-full py-2 px-3 rounded-lg bg-[#091426] border border-[#32D9FF]/25 text-xs font-medium text-[#32D9FF] hover:border-[#32D9FF]/70 flex items-center justify-center gap-1.5"
            >
              <span>Edit Boundary &amp; Zones</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Farm Health Metrics (Farmer vs Researcher phrasing) */}
          <div className="lg:col-span-9 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#05080f] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] text-slate-400">
                {uiMode === 'farmer' ? '90-Day Rain (NASA Observed)' : 'NASA POWER PRECTOTCORR (0.5°)'}
              </div>
              <div className="text-lg font-mono tabular-nums font-semibold text-cyan-300 mt-1">
                {observations ? `${observations.summary.totalPrecip90dMm} mm` : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {uiMode === 'farmer'
                  ? `Mean Air Temp: ${observations?.summary.meanTempC ?? '—'}°C`
                  : `CV: ${impact.historicalRainVariabilityCvPct}% · ${powerMeta?.validDays ?? 90}d valid`}
              </div>
            </div>

            <div className="bg-[#05080f] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] text-slate-400">
                {uiMode === 'farmer' ? 'Satellite & Crop Greenness' : 'Sentinel-2 L2A & Hydro NDVI'}
              </div>
              <div className="text-lg font-mono tabular-nums font-semibold text-emerald-300 mt-1">
                {observations ? observations.summary.estimatedNdvi : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {uiMode === 'farmer'
                  ? `Latest clear S2: ${latestS2 ? latestS2.date : 'Basemap'}`
                  : `10 m S2: ${latestS2 ? `${latestS2.date} (${latestS2.cloudCoverPct}% cld)` : 'Pending'} · Modeled NDVI`}
              </div>
            </div>

            <div className="bg-[#05080f] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] text-slate-400">
                {uiMode === 'farmer' ? 'Soil Type, pH & Moisture' : 'ISRIC / Root Wetness (GWETROOT)'}
              </div>
              <div className="text-lg font-mono tabular-nums font-semibold text-slate-100 mt-1">
                pH {effectivePh ?? '—'} · {observations?.summary.meanRootSoilWetnessPct ?? '—'}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {uiMode === 'farmer'
                  ? `${soil?.textureClass || activeFarm.primarySoilType}`
                  : `SOC ${effectiveSoc ?? '—'} g/kg · WHC ${soil?.waterHoldingCapacityMmM ?? '—'} mm/m`}
              </div>
            </div>

            <div className="bg-[#05080f] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] text-slate-400">
                {uiMode === 'farmer' ? 'Climate Water Stress (Sim.)' : `Scenario Water Balance (${scenario.label})`}
              </div>
              <div
                className={`text-lg font-mono tabular-nums font-semibold mt-1 ${
                  impact.waterStressIndex >= 65
                    ? 'text-rose-300'
                    : impact.waterStressIndex >= 38
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {impact.waterStressIndex}/100 ({impact.growingSuitabilityStatus})
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {uiMode === 'farmer'
                  ? `Erosion cover: ${activeStrategy.agronomicAnalysis?.soilCoverPct ?? 75}%`
                  : `ET₀ ${impact.referenceEt0Mm} · Bal ${impact.seasonalWaterBalanceMm} mm`}
              </div>
            </div>

            {/* Active Rotation & Quick Edit Strip */}
            <div className="col-span-2 sm:col-span-4 bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 text-xs">
                <div className="text-[#8CA2BD]">
                  Existing Crops: <span className="text-[#F4F8FF] font-medium">{farmInputs.existingCropSequence}</span> ·{' '}
                  Irrigation: <span className="text-[#32D9FF]">{farmInputs.irrigationAvailability}</span>
                </div>
                <div className="text-[#52E3A4] font-semibold">
                  Active Rotation Plan: {activeStrategy.name} ({activeStrategy.totalWaterDemandMm} mm · Net N{' '}
                  {activeStrategy.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}
                  {activeStrategy.soilNitrogenDeltaKgHa} kg/ha)
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('rotation-lab')}
                  className="px-3 py-1.5 rounded-lg bg-[#091426] border border-[#32D9FF]/25 text-xs text-[#32D9FF] hover:border-[#32D9FF]/70 whitespace-nowrap"
                >
                  Open Rotation Lab
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('agronomist')}
                  className="px-3 py-1.5 rounded-lg bg-[#091426] border border-[#52E3A4]/30 text-xs text-[#52E3A4] hover:border-[#52E3A4]/70 whitespace-nowrap"
                >
                  Ask AI Copilot
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 8.3 Interactive 12-Month Crop & Operations Calendar */}
      <div className="mission-panel rounded-xl p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#32D9FF]/15 pb-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>12-Month Agricultural Planning Calendar — {activeStrategy.name}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Regional planning windows derived from active rotation sequence; verify exact local sowing dates with IMD/KVK monsoon bulletins.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {rotationPlan.strategies.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStrategy(s.id)}
                className={`px-2.5 py-1 rounded border whitespace-nowrap ${
                  s.id === activeStrategy.id
                    ? 'bg-cyan-500/20 border-cyan-400/70 text-cyan-200'
                    : 'bg-[#05080f] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.categoryLabel || s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left py-2 pr-3 font-medium w-52">Season / Crop Phase</th>
                {MONTHS.map((m) => (
                  <th key={m} className="text-center py-2 px-1 font-mono text-[11px] font-medium">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {activeStrategy.seasons.map((season, sIdx) => {
                const flags = getSeasonMonthFlags(season.season);
                return (
                  <tr key={sIdx}>
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-100">{season.crop}</div>
                      <div className="text-[10px] font-mono text-cyan-300">
                        {season.season} · {season.plantingWindow}
                      </div>
                    </td>
                    {MONTHS.map((m, mIdx) => {
                      const isSow = flags.sowing.includes(mIdx);
                      const isGrow = flags.growth.includes(mIdx);
                      const isHarv = flags.harvest.includes(mIdx);
                      return (
                        <td key={m} className="p-1 text-center">
                          {isSow ? (
                            <div className="py-1.5 rounded bg-cyan-500/25 border border-cyan-500/50 text-[10px] font-mono text-cyan-200">
                              Sow
                            </div>
                          ) : isGrow ? (
                            <div className="py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-mono text-emerald-200">
                              Grow
                            </div>
                          ) : isHarv ? (
                            <div className="py-1.5 rounded bg-amber-500/20 border border-amber-500/50 text-[10px] font-mono text-amber-200">
                              Harv
                            </div>
                          ) : (
                            <div className="py-1.5 text-slate-700">·</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              <tr>
                <td className="py-2.5 pr-3">
                  <div className="font-medium text-slate-300">Soil Sampling &amp; Irrigation Prep</div>
                  <div className="text-[10px] text-slate-400">Pre-monsoon lab testing &amp; bund repair</div>
                </td>
                {MONTHS.map((m, mIdx) => {
                  const isSample = mIdx === 3 || mIdx === 4; // Apr-May pre-Kharif sampling
                  const isIrrigCheck = mIdx === 9 || mIdx === 0 || mIdx === 2; // Oct, Jan, Mar
                  return (
                    <td key={m} className="p-1 text-center">
                      {isSample ? (
                        <div className="py-1.5 rounded bg-slate-800 border border-slate-600 text-[10px] font-mono text-slate-200">
                          Soil
                        </div>
                      ) : isIrrigCheck ? (
                        <div className="py-1.5 rounded bg-sky-950/70 border border-sky-700/50 text-[10px] font-mono text-sky-300">
                          Irrig
                        </div>
                      ) : (
                        <div className="py-1.5 text-slate-700">·</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 8.4 Saved Farms, Inline Crop/Farm Editor, Multi-Farm Comparison & 8.5 Soil Sampling Planner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Saved Farms Manager & Comparison + Saved Scenarios */}
        <div className="lg:col-span-6 mission-panel rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#32D9FF]/15 pb-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Saved Farms &amp; Multi-Parcel Comparison ({farms.length})</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Persisted locally across reloads; create parcels, edit crop sequences, or switch active farm.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddFarm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddFarm ? 'Cancel' : 'Create Farm'}</span>
            </button>
          </div>

          {showAddFarm && (
            <form
              onSubmit={handleCreateSubmit}
              className="bg-[#05080f] border border-cyan-500/30 rounded-xl p-3.5 space-y-2.5 text-xs"
            >
              <div className="font-semibold text-cyan-300">Create &amp; Save New Farm Parcel</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={newFarmName}
                  onChange={(e) => setNewFarmName(e.target.value)}
                  placeholder="Farm Name (e.g. Davanagere Plot B)"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
                />
                <input
                  type="text"
                  value={newFarmRegion}
                  onChange={(e) => setNewFarmRegion(e.target.value)}
                  placeholder="Region / District"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
                />
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newFarmLat}
                  onChange={(e) => setNewFarmLat(e.target.value)}
                  placeholder="Latitude"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 font-mono text-slate-100"
                />
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newFarmLon}
                  onChange={(e) => setNewFarmLon(e.target.value)}
                  placeholder="Longitude"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 font-mono text-slate-100"
                />
                <input
                  type="number"
                  step="0.5"
                  value={newFarmArea}
                  onChange={(e) => setNewFarmArea(e.target.value)}
                  placeholder="Area (ha)"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 font-mono text-slate-100"
                />
                <input
                  type="text"
                  value={newFarmSoil}
                  onChange={(e) => setNewFarmSoil(e.target.value)}
                  placeholder="Soil Type"
                  className="px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
                />
              </div>
              <input
                type="text"
                value={newFarmCrops}
                onChange={(e) => setNewFarmCrops(e.target.value)}
                placeholder="Dominant crops (comma-separated)"
                className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400"
              >
                Save Parcel &amp; Load Telemetry
              </button>
            </form>
          )}

          {/* Quick Update Crop Sequence for Active Farm */}
          <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300 font-medium">
              <span className="flex items-center gap-1.5">
                <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                Active Crop Sequence (Saved Automatically)
              </span>
              <span className="font-mono text-[11px] text-slate-400">{activeFarm.name}</span>
            </div>
            <input
              type="text"
              value={farmInputs.existingCropSequence}
              onChange={(e) =>
                onChangeFarmInputs({ ...farmInputs, existingCropSequence: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
            />
          </div>

          {/* Multi-Farm Comparison Table */}
          <div className="overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="text-left py-2 pr-2 font-medium">Parcel</th>
                  <th className="text-right py-2 px-2 font-medium">Area</th>
                  <th className="text-left py-2 px-2 font-medium">Soil / Crops</th>
                  <th className="text-right py-2 pl-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {farms.map((f) => {
                  const isCurr = f.id === activeFarm.id;
                  return (
                    <tr key={f.id} className={isCurr ? 'bg-emerald-500/8' : ''}>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-slate-100 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>{f.name}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {f.center.lat.toFixed(2)}°, {f.center.lon.toFixed(2)}° · {f.elevationMeters} m
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-300">
                        {f.areaHectares} ha
                      </td>
                      <td className="py-2 px-2 text-[11px] text-slate-400">
                        <div className="text-slate-300 truncate max-w-[160px]">{f.primarySoilType}</div>
                        <div className="truncate max-w-[160px]">{f.dominantCrops.join(' · ')}</div>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectFarm(f)}
                          disabled={isCurr}
                          className={`px-2.5 py-1 rounded border text-[11px] whitespace-nowrap ${
                            isCurr
                              ? 'border-emerald-500/40 text-emerald-300'
                              : 'border-slate-700 text-slate-300 hover:border-cyan-400'
                          }`}
                        >
                          {isCurr ? 'Active' : 'Select'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Saved Climate Scenario Snapshots */}
          <div className="border-t border-slate-800 pt-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                Saved Climate Scenarios ({savedScenarios.length})
              </span>
              <button
                type="button"
                onClick={() => onNavigate('climate-sim')}
                className="text-[11px] text-[#32D9FF] hover:underline flex items-center gap-1"
              >
                <Sliders className="w-3 h-3" />
                <span>Open Simulator</span>
              </button>
            </div>
            {savedScenarios.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No saved scenario snapshots yet. Adjust sliders in the Climate Simulator and click &ldquo;Save Scenario&rdquo;.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {savedScenarios.map((snap) => (
                  <div
                    key={snap.id}
                    className="flex items-center justify-between gap-2 bg-[#05080f] border border-slate-800 rounded-lg px-3 py-2 text-[11px]"
                  >
                    <div>
                      <div className="text-slate-200 font-medium">
                        {snap.scenario.label} · {snap.farmName}
                      </div>
                      <div className="font-mono text-slate-400">
                        ΔT {snap.scenario.tempDeltaC}°C · Rain {snap.scenario.precipChangePct}% · Stress {snap.waterStressIndex}/100
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onLoadScenario(snap.scenario)}
                        className="px-2 py-1 rounded border border-slate-700 text-cyan-300 hover:border-cyan-400"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteScenario(snap.id)}
                        aria-label="Delete saved scenario"
                        className="p-1 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: 8.5 Dedicated Soil Sampling & Information Gap Planner */}
        <div className="lg:col-span-6 mission-panel rounded-xl p-5 space-y-4">
          <div className="border-b border-[#32D9FF]/15 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <span>Soil Sampling &amp; Information Gap Planner</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Optical/radar satellites cannot directly measure exact soil nutrient concentrations (N, P, K). Use this planner to target physical soil lab tests.
            </p>
          </div>

          <div className="space-y-2">
            {soilGapRows.map((row) => (
              <div
                key={row.param}
                className="bg-[#05080f] border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                    {row.isFieldMeasured ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span>{row.param}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{row.action}</div>
                </div>
                <div
                  className={`font-mono text-[11px] shrink-0 ${
                    row.isFieldMeasured ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {row.status}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3.5 text-[11px] text-slate-300 space-y-1">
            <div className="font-semibold text-cyan-300">Recommended Composite Field Sampling Protocol</div>
            <p>
              Collect 8–10 zig-zag auger subsamples per uniform management zone at 0–15 cm (topsoil fertility) and 15–30 cm (subsoil pH/compaction) prior to Kharif land preparation, mix thoroughly, and submit a 500 g composite sample to your nearest Soil Health Card / KVK laboratory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

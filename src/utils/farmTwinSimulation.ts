import {
  ClimateScenario,
  FarmParcel,
  NasaObservationBundle,
  RotationStrategy,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import { SimulatedImpactMetrics, computeScenarioImpact } from './geoAndAgronomy';

export type CropSpeciesId = 'jowar' | 'maize' | 'chickpea' | 'pigeon-pea' | 'groundnut';

export interface CropSpeciesSpec {
  id: CropSpeciesId;
  label: string;
  botanicalName: string;
  rootArchitecture: 'fibrous-deep' | 'fibrous-brace' | 'taproot-nodule' | 'taproot-deep' | 'prostrate-peg';
  maxHeightM: number;
  maxRootDepthCm: number;
  rowSpacingFactor: number;
  waterSensitivity: number; // 0.35 drought-hardy .. 1.0 sensitive
  healthyColorHex: number;
  stressedColorHex: number;
  harvestColorHex: number;
  canopyNotes: string;
}

export const CROP_SPECIES_LIBRARY: Record<CropSpeciesId, CropSpeciesSpec> = {
  jowar: {
    id: 'jowar',
    label: 'Jowar (Sorghum)',
    botanicalName: 'Sorghum bicolor',
    rootArchitecture: 'fibrous-deep',
    maxHeightM: 2.1,
    maxRootDepthCm: 135,
    rowSpacingFactor: 1.0,
    waterSensitivity: 0.42,
    healthyColorHex: 0x3f8f29,
    stressedColorHex: 0xb47b2b,
    harvestColorHex: 0xd4a24c,
    canopyNotes: 'Waxy-cuticle blades with dense terminal panicles; high osmotic drought tolerance.',
  },
  maize: {
    id: 'maize',
    label: 'Maize',
    botanicalName: 'Zea mays',
    rootArchitecture: 'fibrous-brace',
    maxHeightM: 2.35,
    maxRootDepthCm: 115,
    rowSpacingFactor: 1.05,
    waterSensitivity: 0.88,
    healthyColorHex: 0x228b22,
    stressedColorHex: 0xc28e2b,
    harvestColorHex: 0xd9a74a,
    canopyNotes: 'Tall stalks with brace roots, broad arching leaves, tassels and husked ears; sensitive at silking.',
  },
  chickpea: {
    id: 'chickpea',
    label: 'Chickpea (Bengal Gram)',
    botanicalName: 'Cicer arietinum',
    rootArchitecture: 'taproot-nodule',
    maxHeightM: 0.62,
    maxRootDepthCm: 95,
    rowSpacingFactor: 0.82,
    waterSensitivity: 0.48,
    healthyColorHex: 0x15803d,
    stressedColorHex: 0xa17f32,
    harvestColorHex: 0xc9a857,
    canopyNotes: 'Low bushy legume canopy with nitrogen-fixing rhizobia nodules suited to residual winter moisture.',
  },
  'pigeon-pea': {
    id: 'pigeon-pea',
    label: 'Pigeon Pea (Tur)',
    botanicalName: 'Cajanus cajan',
    rootArchitecture: 'taproot-deep',
    maxHeightM: 1.85,
    maxRootDepthCm: 175,
    rowSpacingFactor: 1.15,
    waterSensitivity: 0.38,
    healthyColorHex: 0x16a34a,
    stressedColorHex: 0x9c8236,
    harvestColorHex: 0xc2983e,
    canopyNotes: 'Woody multi-branching perennialized shrub; deep taproot penetrates compacted subsoil pans.',
  },
  groundnut: {
    id: 'groundnut',
    label: 'Groundnut',
    botanicalName: 'Arachis hypogaea',
    rootArchitecture: 'prostrate-peg',
    maxHeightM: 0.48,
    maxRootDepthCm: 80,
    rowSpacingFactor: 0.85,
    waterSensitivity: 0.62,
    healthyColorHex: 0x229944,
    stressedColorHex: 0xb08434,
    harvestColorHex: 0xc79f48,
    canopyNotes: 'Low spreading ground-cover mats reducing topsoil evaporation; pegs pods into friable topsoil.',
  },
};

export interface GrowthStageInfo {
  index: number;
  id: 'seed-prep' | 'germination' | 'vegetative' | 'flowering' | 'grain-fill' | 'harvest';
  label: string;
  shortLabel: string;
  progress: number; // midpoint 0..1
  rangeLabel: string;
  description: string;
}

export const GROWTH_STAGES: GrowthStageInfo[] = [
  {
    index: 0,
    id: 'seed-prep',
    label: 'Seed Preparation',
    shortLabel: 'Seed Prep',
    progress: 0.08,
    rangeLabel: '0–10 DAS',
    description: 'Furrow ridging, residue incorporation, and pre-sowing seedbed moisture conditioning.',
  },
  {
    index: 1,
    id: 'germination',
    label: 'Germination',
    shortLabel: 'Germination',
    progress: 0.24,
    rangeLabel: '10–22 DAS',
    description: 'Coleoptile emergence and primary seminal root anchoring in upper 0–15 cm topsoil.',
  },
  {
    index: 2,
    id: 'vegetative',
    label: 'Vegetative Growth',
    shortLabel: 'Vegetative',
    progress: 0.44,
    rangeLabel: '22–50 DAS',
    description: 'Rapid leaf area expansion, row canopy closure, and root architecture branching.',
  },
  {
    index: 3,
    id: 'flowering',
    label: 'Flowering',
    shortLabel: 'Flowering',
    progress: 0.64,
    rangeLabel: '50–75 DAS',
    description: 'Panicle/tassel/raceme emergence; peak crop evapotranspiration and moisture sensitivity.',
  },
  {
    index: 4,
    id: 'grain-fill',
    label: 'Grain / Pod Development',
    shortLabel: 'Grain / Pod',
    progress: 0.82,
    rangeLabel: '75–100 DAS',
    description: 'Assimilate translocation into grain heads or pods; maximum root-zone water extraction.',
  },
  {
    index: 5,
    id: 'harvest',
    label: 'Harvest Maturity',
    shortLabel: 'Harvest',
    progress: 0.98,
    rangeLabel: '100–125 DAS',
    description: 'Physiological maturity, golden-amber canopy dry-down, and residual biomass retention.',
  },
];

export function resolveGrowthStage(progress: number): GrowthStageInfo {
  if (progress < 0.16) return GROWTH_STAGES[0];
  if (progress < 0.33) return GROWTH_STAGES[1];
  if (progress < 0.54) return GROWTH_STAGES[2];
  if (progress < 0.72) return GROWTH_STAGES[3];
  if (progress < 0.9) return GROWTH_STAGES[4];
  return GROWTH_STAGES[5];
}

export function resolveCropSpeciesId(cropName: string): CropSpeciesId {
  const lower = cropName.toLowerCase();
  if (lower.includes('maize') || lower.includes('corn')) return 'maize';
  if (lower.includes('pigeon') || lower.includes('tur') || lower.includes('arhar')) return 'pigeon-pea';
  if (lower.includes('chickpea') || lower.includes('bengal') || lower.includes('gram') || lower.includes('cowpea') || lower.includes('soy')) {
    return 'chickpea';
  }
  if (lower.includes('groundnut') || lower.includes('peanut') || lower.includes('sunflower') || lower.includes('safflower')) {
    return 'groundnut';
  }
  return 'jowar';
}

export interface TwinBiophysicalState {
  species: CropSpeciesSpec;
  stage: GrowthStageInfo;
  isVertisol: boolean;
  isBaselineComparison: boolean;
  // Climate & Satellite Grounding
  observedRain90dMm: number | null;
  observedMeanTempC: number | null;
  sentinel2SceneDate: string | null;
  sentinel2CloudPct: number | null;
  // Modeled Outputs (Never presented as direct plant measurements)
  modeledTopsoilMoisturePct: number;
  modeledSubsoilMoisturePct: number;
  modeledWaterStressIndex: number;
  modeledCanopyVigor: number; // 0.25 .. 1.0
  modeledGroundCoverPct: number;
  modeledRootDepthCm: number;
  modeledCompactionDepthCm: number;
  modeledOrganicCarbonGKg: number;
  modeledInfiltrationMmHr: number;
  modeledPondLevelPct: number;
  canopyConditionLabel: 'Vigorous (Modeled)' | 'Moderate Stress (Modeled)' | 'Elevated Stress (Modeled)';
}

export function computeTwinBiophysicalState(params: {
  farm: FarmParcel;
  soil: SoilProfile | null;
  observations: NasaObservationBundle | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  strategy: RotationStrategy;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  activeSeasonIdx: number;
  growthProgress: number;
  speciesOverride: CropSpeciesId | 'auto';
  irrigationActive: boolean;
  rainActive: boolean;
  compareBaselineMode: boolean;
}): TwinBiophysicalState {
  const {
    farm,
    soil,
    observations,
    sentinel2Catalog,
    strategy,
    scenario,
    impact,
    activeSeasonIdx,
    growthProgress,
    speciesOverride,
    irrigationActive,
    rainActive,
    compareBaselineMode,
  } = params;

  const activeSeason = strategy.seasons[activeSeasonIdx % strategy.seasons.length];
  const speciesId =
    speciesOverride === 'auto' ? resolveCropSpeciesId(activeSeason?.crop || 'Jowar') : speciesOverride;
  const species = CROP_SPECIES_LIBRARY[speciesId];
  const stage = resolveGrowthStage(growthProgress);

  const baselineScenario: ClimateScenario = {
    presetId: 'baseline',
    label: 'Historical Baseline',
    tempDeltaC: 0,
    precipChangePct: 0,
    irrigationEfficiencyPct: 45,
  };
  const effectiveImpact = compareBaselineMode
    ? computeScenarioImpact(observations, baselineScenario)
    : impact;
  const effectiveScenario = compareBaselineMode ? baselineScenario : scenario;

  const soilTypeStr = (soil?.textureClass || farm.primarySoilType).toLowerCase();
  const isVertisol = soilTypeStr.includes('vertisol') || soilTypeStr.includes('clay');

  const irrigationBoost = irrigationActive ? 9.5 * (effectiveScenario.irrigationEfficiencyPct / 65) : 0;
  const rainBoost = rainActive ? 6.5 : 0;

  const baseRootMoist = effectiveImpact.simulatedRootMoisturePct;
  const topsoilMoist = Number(
    Math.min(92, Math.max(8, baseRootMoist * 0.92 + irrigationBoost + rainBoost - Math.max(0, effectiveScenario.tempDeltaC) * 2.1)).toFixed(1)
  );
  const subsoilMoist = Number(
    Math.min(95, Math.max(14, baseRootMoist * 1.06 + (rainActive ? 3 : 0) + (irrigationActive ? 4 : 0))).toFixed(1)
  );

  // Species-modulated stress & vigor
  const rawStress = effectiveImpact.waterStressIndex * (0.65 + species.waterSensitivity * 0.52);
  const bufferedStress = Math.max(4, Math.min(98, rawStress - (irrigationActive ? 14 : 0) - (rainActive ? 8 : 0)));
  const modeledWaterStressIndex = Math.round(bufferedStress);

  const modeledCanopyVigor = Number(
    Math.max(0.24, Math.min(1.0, 1.04 - modeledWaterStressIndex * 0.0076)).toFixed(2)
  );

  const stageCoverCurve =
    stage.index === 0 ? 0.14 : stage.index === 1 ? 0.28 : stage.index === 2 ? 0.68 : stage.index === 3 ? 0.9 : stage.index === 4 ? 0.94 : 0.78;
  const residueBonus = strategy.id === 'carbon-regenerative' ? 14 : strategy.id === 'climate-resilient' ? 9 : 4;
  const modeledGroundCoverPct = Math.round(
    Math.min(96, Math.max(8, stageCoverCurve * 82 * (0.62 + modeledCanopyVigor * 0.38) + residueBonus))
  );

  const rootGrowthFraction = Math.min(1, 0.12 + growthProgress * 0.92);
  const modeledRootDepthCm = Math.round(
    species.maxRootDepthCm * rootGrowthFraction * (isVertisol ? 0.95 : 1.02)
  );

  const modeledCompactionDepthCm = isVertisol ? 32 : 28;
  const modeledOrganicCarbonGKg = soil?.organicCarbonGKg ?? (isVertisol ? 5.8 : 7.1);

  const baseInfiltration = isVertisol ? 11 : 24;
  const modeledInfiltrationMmHr = Number(
    (baseInfiltration + (modeledOrganicCarbonGKg * 0.8) + (species.id === 'pigeon-pea' ? 5 : 0)).toFixed(1)
  );

  const pondDelta = (effectiveScenario.precipChangePct / 100) * 28 - Math.max(0, effectiveScenario.tempDeltaC) * 4.5 + (rainActive ? 12 : 0) - (irrigationActive ? 6 : 0);
  const modeledPondLevelPct = Math.round(Math.min(96, Math.max(18, 66 + pondDelta)));

  const canopyConditionLabel: TwinBiophysicalState['canopyConditionLabel'] =
    modeledWaterStressIndex < 32
      ? 'Vigorous (Modeled)'
      : modeledWaterStressIndex < 62
        ? 'Moderate Stress (Modeled)'
        : 'Elevated Stress (Modeled)';

  const latestS2 = sentinel2Catalog?.scenes?.[0] ?? null;

  return {
    species,
    stage,
    isVertisol,
    isBaselineComparison: compareBaselineMode,
    observedRain90dMm: observations?.summary.totalPrecip90dMm ?? null,
    observedMeanTempC: observations?.summary.meanTempC ?? null,
    sentinel2SceneDate: latestS2?.date ?? null,
    sentinel2CloudPct: latestS2?.cloudCoverPct ?? null,
    modeledTopsoilMoisturePct: topsoilMoist,
    modeledSubsoilMoisturePct: subsoilMoist,
    modeledWaterStressIndex,
    modeledCanopyVigor,
    modeledGroundCoverPct,
    modeledRootDepthCm,
    modeledCompactionDepthCm,
    modeledOrganicCarbonGKg,
    modeledInfiltrationMmHr,
    modeledPondLevelPct,
    canopyConditionLabel,
  };
}

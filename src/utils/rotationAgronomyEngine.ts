import {
  ClimateScenario,
  FarmParcel,
  FarmRotationInputs,
  FarmerPriority,
  NasaObservationBundle,
  RotationStrategy,
  SoilProfile,
} from '../types/fieldShift';

export const PRIORITY_OPTIONS: {
  id: FarmerPriority;
  label: string;
  description: string;
  weightsLabel: string;
}[] = [
  {
    id: 'water-conservation',
    label: 'Water Conservation',
    description: 'Minimizes seasonal evapotranspiration demand and borewell/canal drawdown.',
    weightsLabel: '45% Water Fit · 25% Drought Fit · 15% Soil Cover · 15% Operations',
  },
  {
    id: 'soil-restoration',
    label: 'Soil Restoration',
    description: 'Maximizes biological N fixation, organic residue carbon, and subsoil root porosity.',
    weightsLabel: '35% N Fixation · 30% Soil Cover · 25% Root Diversity · 10% Pest Break',
  },
  {
    id: 'income-potential',
    label: 'Income Potential',
    description: 'Balances commercial cash/oilseed/pulse phases within water and equipment limits.',
    weightsLabel: '45% Market & Ops · 25% Water Fit · 15% Pest Break · 15% N Balance',
  },
  {
    id: 'drought-resilience',
    label: 'Drought Resilience',
    description: 'Prioritizes deep-rooted C4 cereals, millets, and dry-spell buffering intercrops.',
    weightsLabel: '35% Water Fit · 30% Root Diversity · 20% Soil Cover · 15% Diversification',
  },
  {
    id: 'erosion-reduction',
    label: 'Erosion Reduction',
    description: 'Maximizes living canopy days and post-harvest surface residue armor.',
    weightsLabel: '45% Soil Cover · 25% Root Diversity · 15% Water Fit · 15% Pest Break',
  },
  {
    id: 'crop-diversification',
    label: 'Crop Diversification',
    description: 'Breaks monoculture pest/disease cycles via 3–4 distinct botanical crop families.',
    weightsLabel: '35% Pest Break · 30% Root Diversity · 20% N Fixation · 15% Market & Ops',
  },
];

export function createDefaultFarmInputs(farm: FarmParcel, soil: SoilProfile | null): FarmRotationInputs {
  const isWet =
    farm.irrigationType === 'canal-surface' ||
    farm.irrigationType === 'borewell-drip' ||
    farm.id.includes('mandya') ||
    farm.id.includes('iowa');
  const defaultIrrigation =
    farm.irrigationType || (isWet ? 'canal-surface' : 'protective-tank');
  return {
    existingCropSequence: farm.dominantCrops.length > 0 ? farm.dominantCrops.join(' → ') : '',
    irrigationAvailability: defaultIrrigation,
    waterConstraintNote: farm.irrigationType
      ? `Farm parcel registered irrigation mode: ${farm.irrigationType}.`
      : isWet
        ? 'Seasonal canal/subsoil support; confirm parcel water allocation.'
        : 'Irrigation method not yet verified by farmer — defaulting to protective-tank baseline.',
    plantingSeason: 'Full Annual Cycle',
    equipmentAvailability: farm.isKarnatakaDemo ? 'shared-tractor' : 'precision-drill-drip',
    marketPreference: farm.isKarnatakaDemo ? 'pulse-oilseed-value' : 'local-msp-mandi',
    soilTestOverrideEnabled: false,
    customPhH2O: soil?.phH2O ?? 6.8,
    customOrganicCarbonGKg: soil?.organicCarbonGKg ?? 7.0,
    customNitrogenStatus: (soil?.nitrogenGKg ?? 0.8) < 0.85 ? 'Low' : 'Medium',
  };
}

export interface StrategyEvaluation {
  strategyId: string;
  rank: number;
  constraintFlags: string[];
  constraintsPassed: boolean;
  effectiveSuitability: 'High' | 'Moderate' | 'Constrained';
  waterBudgetStatus: string;
  radarAxes: {
    waterEfficiency: number; // 0..100 transparent normalized index
    nitrogenCycling: number;
    soilProtection: number;
    rootDiversity: number;
    pestInterruption: number;
    operationalMarketFit: number;
  };
  rankingBasisNote: string;
  multicriteriaScore: number; // internal sort order only, displayed via physical metrics & rank
}

function clamp100(v: number): number {
  return Math.round(Math.max(12, Math.min(98, v)));
}

export function evaluateAndRankStrategies(params: {
  strategies: RotationStrategy[];
  farm: FarmParcel;
  soil: SoilProfile | null;
  observations: NasaObservationBundle | null;
  scenario: ClimateScenario;
  inputs: FarmRotationInputs;
  priority: FarmerPriority;
}): Record<string, StrategyEvaluation> {
  const { strategies, soil, scenario, inputs, priority } = params;

  const effectivePh = inputs.soilTestOverrideEnabled
    ? inputs.customPhH2O
    : (soil?.phH2O ?? 6.8);

  const rawEvaluations = strategies.map((s) => {
    const flags: string[] = [];

    // 1. Hard Water & Irrigation Ceiling Constraint (scaled to number of seasons in the strategy)
    const seasonCount = Math.max(1, s.seasons.length);
    const annualFactor = seasonCount / 4;
    const irrigationCeilings: Record<FarmRotationInputs['irrigationAvailability'], number> = {
      rainfed: 1320,
      'protective-tank': 1520,
      'borewell-drip': 1750,
      'canal-surface': 1900,
    };
    const rainFactor = 1 + scenario.precipChangePct / 200; // drought shrinks ceiling
    const adjustedCeiling = Math.round(
      irrigationCeilings[inputs.irrigationAvailability] * annualFactor * rainFactor
    );

    if (s.totalWaterDemandMm > adjustedCeiling) {
      flags.push(
        `Water ceiling exceeded: ${s.totalWaterDemandMm} mm demand vs ~${adjustedCeiling} mm ${inputs.irrigationAvailability} budget.`
      );
    }

    // 2. Soil pH Constraint Check
    const hasLegumes = s.seasons.some((st) =>
      /gram|pea|soy|cowpea|groundnut|clover|bean|tur|sesbania/i.test(st.crop)
    );
    if (effectivePh < 5.6 && hasLegumes) {
      flags.push(`Acidic soil pH (${effectivePh}) suppresses legume rhizobia nodulation without agricultural lime.`);
    }
    if (effectivePh > 8.1 && s.seasons.some((st) => /groundnut|maize|paddy/i.test(st.crop))) {
      flags.push(`Alkaline soil pH (${effectivePh}) increases Zn/Fe deficiency risk in maize or groundnut.`);
    }

    // 3. Equipment Compatibility Constraint
    const needsPrecision = s.seasons.some((st) =>
      /drip|zero-till|strip-till|fertigation|mulch/i.test(`${st.crop} ${st.notes}`)
    );
    if (inputs.equipmentAvailability === 'manual-bullock' && needsPrecision) {
      flags.push('Requires shared zero-till seed drill or drip kit beyond manual/bullock baseline.');
    }

    // 4. Current Practice Monoculture / Disease Carryover Check
    if (s.id === 'current-practice') {
      flags.push('Baseline practice retains higher cereal/host carryover and lower biological N fixation.');
    }

    // Transparent physical normalization (strictly derived from agronomic quantities, normalized per season)
    const normalized4SeasonWater = s.totalWaterDemandMm / annualFactor;
    const waterEfficiency = clamp100(100 - ((normalized4SeasonWater - 1050) / 950) * 68);
    const nitrogenCycling = clamp100(48 + s.soilNitrogenDeltaKgHa * 0.72);
    const coverPct =
      s.agronomicAnalysis?.soilCoverPct ??
      (s.id === 'carbon-regenerative' ? 88 : s.id === 'climate-resilient' ? 78 : s.id === 'precision-commercial' ? 68 : 48);
    const soilProtection = clamp100(coverPct);

    const uniqueRoles = new Set(s.seasons.map((se) => se.botanicalOrRole.split(' ')[0].toLowerCase())).size;
    const rootDiversity = clamp100(
      s.id === 'carbon-regenerative'
        ? 92
        : s.id === 'climate-resilient'
          ? 86
          : s.id === 'precision-commercial'
            ? 78
            : 40 + uniqueRoles * 8
    );

    const pestInterruption = clamp100(
      s.id === 'current-practice' ? 38 : 56 + uniqueRoles * 10
    );

    let marketMatch = s.id === 'precision-commercial' ? 90 : s.id === 'climate-resilient' ? 74 : s.id === 'carbon-regenerative' ? 70 : 62;
    if (inputs.marketPreference === 'pulse-oilseed-value' && (s.id === 'climate-resilient' || s.id === 'carbon-regenerative')) {
      marketMatch += 12;
    }
    if (inputs.marketPreference === 'fodder-mixed' && s.seasons.some((se) => /sorghum|jowar|millet|ragi|maize/i.test(se.crop))) {
      marketMatch += 10;
    }
    const operationalMarketFit = clamp100(marketMatch - (flags.length > 0 ? 14 : 0));

    // Multicriteria priority calculation (transparent weights matching PRIORITY_OPTIONS)
    let score = 0;
    if (priority === 'water-conservation') {
      score = waterEfficiency * 0.45 + rootDiversity * 0.25 + soilProtection * 0.15 + operationalMarketFit * 0.15;
    } else if (priority === 'soil-restoration') {
      score = nitrogenCycling * 0.35 + soilProtection * 0.3 + rootDiversity * 0.25 + pestInterruption * 0.1;
    } else if (priority === 'income-potential') {
      score = operationalMarketFit * 0.45 + waterEfficiency * 0.25 + pestInterruption * 0.15 + nitrogenCycling * 0.15;
    } else if (priority === 'drought-resilience') {
      score = waterEfficiency * 0.35 + rootDiversity * 0.3 + soilProtection * 0.2 + pestInterruption * 0.15;
    } else if (priority === 'erosion-reduction') {
      score = soilProtection * 0.45 + rootDiversity * 0.25 + waterEfficiency * 0.15 + pestInterruption * 0.15;
    } else {
      // crop-diversification
      score = pestInterruption * 0.35 + rootDiversity * 0.3 + nitrogenCycling * 0.2 + operationalMarketFit * 0.15;
    }

    // Hard constraint penalty ensures infeasible water/equipment options do not rank #1
    const hardViolations = flags.filter((f) => f.includes('Water ceiling') || f.includes('beyond manual')).length;
    const adjustedScore = score - hardViolations * 18;

    const effectiveSuitability: 'High' | 'Moderate' | 'Constrained' =
      hardViolations > 0 ? 'Constrained' : s.suitabilityRating;

    const waterBudgetStatus =
      s.totalWaterDemandMm <= adjustedCeiling
        ? `Within ${inputs.irrigationAvailability} budget (${s.totalWaterDemandMm} / ${adjustedCeiling} mm)`
        : `Exceeds ${inputs.irrigationAvailability} budget (+${s.totalWaterDemandMm - adjustedCeiling} mm)`;

    return {
      strategyId: s.id,
      rank: 1,
      constraintFlags: flags,
      constraintsPassed: hardViolations === 0,
      effectiveSuitability,
      waterBudgetStatus,
      radarAxes: {
        waterEfficiency,
        nitrogenCycling,
        soilProtection,
        rootDiversity,
        pestInterruption,
        operationalMarketFit,
      },
      rankingBasisNote: `${PRIORITY_OPTIONS.find((p) => p.id === priority)?.weightsLabel || ''}`,
      multicriteriaScore: adjustedScore,
    };
  });

  // Assign ranks 1..N
  const sorted = [...rawEvaluations].sort((a, b) => b.multicriteriaScore - a.multicriteriaScore);
  const byId: Record<string, StrategyEvaluation> = {};
  sorted.forEach((ev, idx) => {
    ev.rank = idx + 1;
    byId[ev.strategyId] = ev;
  });

  return byId;
}

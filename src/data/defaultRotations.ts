import {
  ClimateScenario,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  RotationPlanResponse,
  RotationStrategy,
  SoilProfile,
} from '../types/fieldShift';
import {
  createDefaultFarmInputs,
  evaluateAndRankStrategies,
  PRIORITY_OPTIONS,
} from '../utils/rotationAgronomyEngine';

export const FARMER_PRIORITY_OPTIONS = PRIORITY_OPTIONS;

export function buildRegionalBaselineRotation(
  farm: FarmParcel,
  priority: FarmerPriority = 'drought-resilience',
  scenario?: ClimateScenario,
  inputs?: FarmRotationInputs,
  soil?: SoilProfile | null,
  observations?: NasaObservationBundle | null
): RotationPlanResponse {
  const isKarnataka = farm.isKarnatakaDemo;
  const effectiveInputs = inputs ?? createDefaultFarmInputs(farm, soil ?? null);
  const existingCrops =
    effectiveInputs.existingCropSequence
      .split(/→|->|,|\//)
      .map((s) => s.trim())
      .filter(Boolean);
  const hasRecordedBaselineCrop = existingCrops.length > 0 || farm.dominantCrops.length > 0;
  const primary = existingCrops[0] || farm.dominantCrops[0] || 'Needs farmer input (Baseline Cereal/Millet)';
  const secondary = existingCrops[1] || farm.dominantCrops[1] || (existingCrops[0] ? existingCrops[0] : 'Needs farmer input (Secondary Phase)');
  const activeScenario: ClimateScenario = scenario ?? {
    presetId: 'baseline',
    label: 'Historical Baseline',
    tempDeltaC: 0,
    precipChangePct: 0,
    irrigationEfficiencyPct: 45,
  };

  const isDryScenario = activeScenario.precipChangePct <= -15 || activeScenario.tempDeltaC >= 1.8;
  const isWetFarm =
    farm.id.includes('mandya') ||
    effectiveInputs.irrigationAvailability === 'canal-surface' ||
    effectiveInputs.irrigationAvailability === 'borewell-drip';

  const obsTemp = observations?.summary.meanTempC;
  const obsRain = observations?.summary.totalPrecip90dMm;
  const obsWetness = observations?.summary.meanRootSoilWetnessPct;
  const effectivePh = effectiveInputs.soilTestOverrideEnabled
    ? effectiveInputs.customPhH2O
    : (soil?.phH2O ?? 6.8);
  const effectiveSoc = effectiveInputs.soilTestOverrideEnabled
    ? effectiveInputs.customOrganicCarbonGKg
    : (soil?.organicCarbonGKg ?? 7.0);

  const obsEvidenceLine = observations
    ? `Measured NASA POWER 90d telemetry (${farm.center.lat.toFixed(3)}°, ${farm.center.lon.toFixed(3)}°): ${obsTemp}°C mean temp, ${obsRain} mm cumulative rainfall, ${obsWetness}% root-zone soil wetness.`
    : `Awaiting live NASA POWER pull for ${farm.name} (${farm.agroClimaticZone}).`;

  const soilEvidenceLine = soil
    ? `${effectiveInputs.soilTestOverrideEnabled ? 'Farmer Soil Test Override' : soil.source}: pH ${effectivePh}, SOC ${effectiveSoc} g/kg, ${soil.textureClass} (${soil.waterHoldingCapacityMmM} mm/m WHC).`
    : `Soil profile: ${farm.primarySoilType || 'Needs farmer input'} (awaiting SoilGrids / lab test).`;

  // Strategy A: Current Farming Practice (Empirical Benchmark)
  const currentWaterPerSeason = isWetFarm ? [640, 480, 290, 520] : [450, 310, 140, 440];
  const currentTotalWater = currentWaterPerSeason.reduce((a, b) => a + b, 0);

  const strategyCurrent: RotationStrategy = {
    id: 'current-practice',
    name: hasRecordedBaselineCrop ? `Current Practice (${primary} → ${secondary})` : `Baseline Comparison (Pending Farmer Crop Input)`,
    categoryLabel: 'A · Current Practice',
    focus: 'Empirical baseline benchmark for comparison',
    suitabilityRating: effectiveInputs.irrigationAvailability === 'rainfed' && isWetFarm ? 'Constrained' : 'Moderate',
    summary: hasRecordedBaselineCrop
      ? `Mirrors recorded farm practice (${effectiveInputs.existingCropSequence || farm.dominantCrops.join(' → ')}) with limited legume break phases and conventional tillage.`
      : `Existing crop history for ${farm.name} is not yet recorded ("Needs farmer input"); enter crop history in Farm Inputs to calibrate this baseline.`,
    totalWaterDemandMm: currentTotalWater,
    waterBalanceNote:
      isWetFarm
        ? `High baseline water draw (${currentTotalWater} mm); depends on steady canal/borewell supply during dry Rabi/Summer windows.`
        : `Moderate water draw (${currentTotalWater} mm), but bare summer fallow exposes topsoil to evaporative loss.`,
    soilNitrogenDeltaKgHa: -28,
    carbonSequestrationTHaYr: 0.2,
    soilImprovementMechanism:
      'Minimal organic residue return; repeated cereal or monocrop cultivation gradually mines labile nitrogen and soil organic carbon.',
    risksAndUncertainties: [
      'Repeated host crop families sustain soil-borne pathogens, stem borers, and weed seedbanks.',
      'Extended fallow or low surface residue increases splash erosion and topsoil crusting during pre-monsoon storms.',
      'Higher reliance on synthetic urea/DAP to offset negative biological nitrogen balance (-28 kg/ha modeled).',
    ],
    seasons: [
      {
        season: 'Kharif (Year 1)',
        plantingWindow: isKarnataka ? 'Jun 15 – Jul 15' : 'May 10 – Jun 10',
        crop: primary,
        botanicalOrRole: 'Existing Primary Cash / Cereal Crop',
        durationDays: 125,
        waterNeedMm: currentWaterPerSeason[0],
        nitrogenImpactKgHa: -24,
        notes: 'Conventional seedbed preparation aligned with current parcel baseline.',
        whySelected: `Represents the current dominant Kharif choice (${primary}) recorded for ${farm.name}.`,
        environmentalEvidence: obsEvidenceLine,
        soilBenefit: 'Provides baseline cereal/biomass stover if retained rather than burned.',
        rootDepthClass: 'Shallow–Moderate (0–45 cm)',
        equipmentNeed: 'Standard cultivator / existing farm implements',
        riskNote: 'Vulnerable to dry spells during flowering if no companion intercrop buffers canopy.',
      },
      {
        season: 'Rabi (Year 1)',
        plantingWindow: isKarnataka ? 'Oct 20 – Nov 15' : 'Oct 01 – Oct 25',
        crop: secondary,
        botanicalOrRole: 'Existing Secondary Crop / Residual Phase',
        durationDays: 110,
        waterNeedMm: currentWaterPerSeason[1],
        nitrogenImpactKgHa: -16,
        notes: 'Utilizes stored post-monsoon moisture or supplemental tank/borewell support.',
        whySelected: `Preserves current Rabi practice (${secondary}) as a reference comparison against diversified options.`,
        environmentalEvidence: soilEvidenceLine,
        soilBenefit: 'Limited root diversity when paired with another shallow-rooted cereal or monocrop.',
        rootDepthClass: 'Shallow–Moderate (0–50 cm)',
        equipmentNeed: 'Existing seeder or broadcast sowing',
        riskNote: 'Residual moisture deficit can reduce grain fill under El Niño / -20% rainfall anomalies.',
      },
      {
        season: 'Zaid / Summer',
        plantingWindow: isKarnataka ? 'Feb 15 – Apr 30' : 'Mar 15 – May 01',
        crop: isWetFarm ? `Short-Cycle ${secondary} / Partial Fallow` : 'Bare Summer Fallow',
        botanicalOrRole: 'Unplanted Fallow or Water-Intensive Summer Crop',
        durationDays: 70,
        waterNeedMm: currentWaterPerSeason[2],
        nitrogenImpactKgHa: 0,
        notes: 'High solar radiation exposes unshaded soil surface to thermal crusting.',
        whySelected: 'Reflects common summer fallow or high-ET cash cycle before pre-monsoon showers.',
        environmentalEvidence: 'High pre-monsoon solar load (>21 MJ/m²/d) accelerates topsoil moisture evaporation.',
        soilBenefit: 'Zero living root days during fallow leaves microbial biomass dormant.',
        rootDepthClass: 'None / Shallow (<30 cm)',
        equipmentNeed: 'Minimal tillage or fallow harrowing',
        riskNote: 'Wind & first-shower sheet erosion risk due to <35% ground cover.',
      },
      {
        season: 'Kharif (Year 2)',
        plantingWindow: isKarnataka ? 'Jun 15 – Jul 15' : 'May 10 – Jun 10',
        crop: primary,
        botanicalOrRole: 'Continuous Primary Crop Cycle',
        durationDays: 125,
        waterNeedMm: currentWaterPerSeason[3],
        nitrogenImpactKgHa: 12,
        notes: 'Requires basal fertilizer replenishment to sustain baseline establishment.',
        whySelected: `Completes the 2-year status-quo baseline returning to ${primary}.`,
        environmentalEvidence: `Comparison benchmark against ${effectiveInputs.irrigationAvailability} constraint.`,
        soilBenefit: 'Baseline stover incorporation only.',
        rootDepthClass: 'Shallow–Moderate (0–45 cm)',
        equipmentNeed: 'Existing farm machinery',
        riskNote: 'Carryover pest/disease pressure if non-host break crop is absent.',
      },
    ],
    agronomicAnalysis: {
      waterRequirementNote: `Modeled ${currentTotalWater} mm over 4 phases; high peak demand if ${primary} relies on flood/canal irrigation.`,
      nitrogenFixationKgHa: 8,
      nutrientCyclingNote: 'Net negative nitrogen balance (-28 kg/ha modeled) requiring external N top-dressing.',
      organicMatterContribution: 'Low (+0.2 t C/ha/yr modeled) due to summer fallow and repeated tillage oxidation.',
      soilCoverPct: 44,
      erosionProtection: 'Low',
      rootDepthDiversity: 'Low — predominantly shallow fibrous root zone (0–50 cm)',
      pestCycleInterruption: 'Weak — repeating primary crop within 12–24 months sustains pest & pathogen carryover',
      growingSeasonSuitability: isDryScenario ? 'Constrained' : 'Moderate',
      marketSuitability: `Matches existing ${effectiveInputs.marketPreference} buyer channels with familiar agronomy.`,
      equipmentRequirements: 'Compatible with existing manual/bullock or standard tractor implements.',
    },
    explainability: {
      whyRecommended:
        'Included as the transparent empirical benchmark so every water-saving, nitrogen-fixing, or commercial alternative is measured against your current cropping pattern.',
      evidenceBasis: [
        obsEvidenceLine,
        soilEvidenceLine,
        `Farmer baseline input: "${effectiveInputs.existingCropSequence}" under ${effectiveInputs.irrigationAvailability}.`,
      ],
      modelingAssumptions: [
        'Assumes status-quo residue retention and conventional sowing dates without cover-crop shielding.',
        'Nitrogen balance reflects modeled crop uptake minus minimal atmospheric/residue return.',
      ],
      additionalInfoRequired: [
        'Recent 2-year fertilizer application records (kg N-P-K/ha) to calibrate net nutrient mining.',
        'Observed pest or wilt incidence from previous Kharif harvest.',
      ],
    },
  };

  // Strategy B: Climate-Resilient Water-Conserving Rotation
  const strategyClimate: RotationStrategy = {
    id: 'climate-resilient',
    name: isKarnataka
      ? 'Climate-Resilient Millet, Chickpea & Pigeon Pea Sequence'
      : 'Drought-Buffered Sorghum, Pulse & Cover Sequence',
    categoryLabel: 'B · Climate-Resilient',
    focus: 'Low water footprint & dry-spell buffering',
    suitabilityRating: 'High',
    summary: `Pairs drought-hardy ${isKarnataka ? 'Finger Millet (Ragi) & Sorghum' : 'Sorghum'} with deep-rooted Pigeon Pea and residual-moisture Chickpea to stabilize production under dry spells.`,
    totalWaterDemandMm: 1210,
    waterBalanceNote: isDryScenario
      ? 'Lowest 4-season water demand (1,210 mm); stays viable under drought anomalies with 1–2 protective irrigations at flowering.'
      : 'Closely matches historical monsoon rainfall + residual post-monsoon soil moisture.',
    soilNitrogenDeltaKgHa: 36,
    carbonSequestrationTHaYr: 1.1,
    soilImprovementMechanism:
      'Pigeon pea taproots fracture shallow plow-pans while cowpea surface cover curbs evaporation and adds ~58 kg/ha gross biological N.',
    risksAndUncertainties: [
      'Monsoon onset delayed >20 days past June 15 requires switching to short-duration 90-day Finger Millet / Sorghum cultivars.',
      'Chickpea pod borer (Helicoverpa) pressure rises if warm humid spells occur in late December.',
      'Market price realization relies on local FPO aggregation or state MSP procurement for millets & pulses.',
    ],
    seasons: [
      {
        season: 'Kharif (Year 1)',
        plantingWindow: isKarnataka ? 'Jun 15 – Jul 15' : 'May 15 – Jun 10',
        crop: isKarnataka ? 'Finger Millet (Ragi) + Pigeon Pea (8:2 Intercrop)' : 'Grain Sorghum + Cowpea Intercrop',
        botanicalOrRole: 'C4 Drought-Tolerant Cereal + Deep Taproot Pulse',
        durationDays: 120,
        waterNeedMm: 410,
        nitrogenImpactKgHa: 18,
        notes: '8:2 intercrop buffers mid-season dry spells and shades inter-row soil.',
        whySelected: 'Finger millet / sorghum require 35–40% less water than paddy or maize and recover rapidly after 14-day dry breaks.',
        environmentalEvidence: obsEvidenceLine,
        soilBenefit: 'Simultaneous fibrous cereal roots (0–40 cm) and pigeon pea taproots (to 140 cm) exploit distinct soil horizons.',
        rootDepthClass: 'Dual-Tier Shallow + Deep Taproot (0–140 cm)',
        equipmentNeed: 'Bullock or tractor seed drill (easily adaptable across equipment tiers)',
        riskNote: 'Avoid waterlogging in low-lying pockets; sow on broad-bed furrows if heavy August storms occur.',
      },
      {
        season: 'Rabi (Year 1)',
        plantingWindow: isKarnataka ? 'Oct 15 – Nov 10' : 'Oct 01 – Oct 25',
        crop: isKarnataka ? 'Chickpea (Bengal Gram)' : 'Winter Lentil / Chickpea',
        botanicalOrRole: 'Residual-Moisture Nitrogen Fixer',
        durationDays: 105,
        waterNeedMm: 235,
        nitrogenImpactKgHa: 40,
        notes: 'Establishes on stored post-Kharif root moisture with at most 1 protective irrigation at pod fill.',
        whySelected: 'Chickpea converts residual Rabi soil wetness into high-protein grain while fixing atmospheric N.',
        environmentalEvidence: `${soilEvidenceLine} Optimal chickpea nodulation occurs between pH 6.0 and 7.8.`,
        soilBenefit: 'Rhizobial fixation adds ~40 kg N/ha and releases organic acids that solubilize bound phosphorus.',
        rootDepthClass: 'Medium Taproot (40–90 cm)',
        equipmentNeed: 'Manual / bullock / tractor furrow opener',
        riskNote: 'Monitor Helicoverpa pod borer at 50% flowering; avoid excessive vegetative irrigation.',
      },
      {
        season: 'Zaid / Summer',
        plantingWindow: isKarnataka ? 'Feb 15 – Mar 10' : 'Mar 15 – Apr 05',
        crop: isKarnataka ? 'Short-Duration Green Gram / Cowpea Cover' : 'Drought-Hardy Cowpea Mulch',
        botanicalOrRole: '60-Day Living Mulch & Nitrogen Cover',
        durationDays: 65,
        waterNeedMm: 175,
        nitrogenImpactKgHa: 22,
        notes: 'Maintains canopy shield against thermal crusting prior to pre-monsoon convection.',
        whySelected: 'Eliminates bare summer fallow while keeping supplemental water draw minimal (175 mm).',
        environmentalEvidence: 'Reduces bare-soil radiant heating observed during March–May dry peak.',
        soilBenefit: 'Adds rapid-turnover labile organic residue and keeps >75% soil surface armored.',
        rootDepthClass: 'Shallow–Medium Legume (0–55 cm)',
        equipmentNeed: 'Minimum-till dibbler or harrow seeding',
        riskNote: 'If zero pre-monsoon moisture is available under strictly rainfed conditions, terminate early as surface mulch.',
      },
      {
        season: 'Kharif (Year 2)',
        plantingWindow: isKarnataka ? 'Jun 10 – Jul 05' : 'May 10 – Jun 05',
        crop: isKarnataka ? 'Sorghum (Jowar) + Fodder Cowpea Border' : 'Pearl Millet / Sorghum',
        botanicalOrRole: 'Low-Water Cereal Recovery Phase',
        durationDays: 110,
        waterNeedMm: 390,
        nitrogenImpactKgHa: -44,
        notes: 'Scavenges biologically fixed nitrogen deposited by Year 1 Pigeon Pea, Chickpea, and Green Gram.',
        whySelected: 'Sorghum produces reliable grain + stover fodder while cutting synthetic N fertilizer demand.',
        environmentalEvidence: `Well-suited to ${effectiveInputs.irrigationAvailability} ceiling and ${activeScenario.label}.`,
        soilBenefit: 'High-C:N sorghum roots stabilize aggregates formed during Year 1 pulse phases.',
        rootDepthClass: 'Deep Fibrous Cereal (0–110 cm)',
        equipmentNeed: 'Standard seed drill or manual furrow planting',
        riskNote: 'Control shoot fly with timely sowing within the first 2 weeks of monsoon onset.',
      },
    ],
    agronomicAnalysis: {
      waterRequirementNote: '1,210 mm modeled across 4 phases — lowest consumptive water footprint across all strategies.',
      nitrogenFixationKgHa: 80,
      nutrientCyclingNote: 'Net +36 kg N/ha balance after cereal uptake; pulse organic acids unlock fixed soil P.',
      organicMatterContribution: 'Moderate–High (+1.1 t C/ha/yr modeled) from pigeon pea leaf fall and summer cowpea mulch.',
      soilCoverPct: 79,
      erosionProtection: 'High',
      rootDepthDiversity: 'High — fibrous millets (40 cm), chickpea (85 cm), and pigeon pea taproots (140 cm)',
      pestCycleInterruption: 'Strong — alternates Poaceae cereals and Fabaceae pulses across every season',
      growingSeasonSuitability: 'High',
      marketSuitability: 'Strong fit for MSP/mandi pulse-millet channels and dual-purpose fodder livestock systems.',
      equipmentRequirements: 'Fully feasible with manual/bullock tools or shared tractor seed drills (no mandatory drip kit).',
    },
    explainability: {
      whyRecommended:
        'Minimizes seasonal evapotranspiration failure risk under rainfed or protective tank irrigation while preserving positive biological nitrogen and deep-root aeration.',
      evidenceBasis: [
        obsEvidenceLine,
        soilEvidenceLine,
        `Active climate scenario (${activeScenario.label}) favors low-ET C4 millets + deep taproot pulses.`,
      ],
      modelingAssumptions: [
        'Biologically fixed nitrogen (~80 kg/ha gross, +36 kg/ha net) assumes effective Rhizobium seed inoculation.',
        'Seasonal crop water figures represent modeled ETc envelopes rather than metered parcel flow.',
      ],
      additionalInfoRequired: [
        'Check village tank / borewell water-table depth at end of Rabi (January) before planting summer cowpea.',
        'Verify local FPO/mandi procurement window for Finger Millet and Bengal Gram.',
      ],
    },
  };

  // Strategy C: Soil-Regenerative & Carbon-Building Rotation
  const strategyRegen: RotationStrategy = {
    id: 'carbon-regenerative',
    name: isKarnataka
      ? 'Soil-Regenerative Cover, Safflower & Zero-Till Rotation'
      : 'Regenerative Multi-Cover, Rye & Strip-Till Rotation',
    categoryLabel: 'C · Soil-Regenerative',
    focus: 'Soil organic carbon, biological N & infiltration',
    suitabilityRating:
      effectiveInputs.irrigationAvailability === 'rainfed' && isDryScenario ? 'Moderate' : 'High',
    summary:
      'Maximizes living root days per year through inoculated legumes, deep subsoil-breaking oilseeds, in-situ green manure, and zero-till residue mulch.',
    totalWaterDemandMm: 1365,
    waterBalanceNote:
      'Moderate water demand (1,365 mm); summer Sesbania green manure benefits from pre-monsoon showers or 1–2 protective irrigations.',
    soilNitrogenDeltaKgHa: 60,
    carbonSequestrationTHaYr: 1.7,
    soilImprovementMechanism:
      'In-situ green manure (+4.5 t/ha dry biomass modeled) feeds mycorrhizal fungi, raises CEC, and shatters plow-pans via safflower taproots.',
    risksAndUncertainties: [
      'Summer Sesbania/cowpea green manure biomass underperforms if April–May rainfall is <35 mm without supplemental irrigation.',
      'Zero-till cereal establishment requires shared zero-till seed drill or careful furrow residue parting.',
      'Measurable topsoil organic carbon gains (+0.1–0.2% SOC) accrue over 3–5 years rather than one season.',
    ],
    seasons: [
      {
        season: 'Kharif (Year 1)',
        plantingWindow: isKarnataka ? 'Jun 15 – Jul 10' : 'May 20 – Jun 15',
        crop: isKarnataka ? 'Groundnut / Soybean + Sunnhemp Border' : 'Soybean + Sunnhemp Cover Strip',
        botanicalOrRole: 'Rhizobial Nitrogen-Fixing Legume Oilseed',
        durationDays: 105,
        waterNeedMm: 435,
        nitrogenImpactKgHa: 42,
        notes: 'Inoculate seed with Bradyrhizobium; chop Sunnhemp border at 50 days as surface mulch.',
        whySelected: 'Jump-starts soil biological N fixation and rapidly closes canopy to suppress Kharif weeds.',
        environmentalEvidence: soilEvidenceLine,
        soilBenefit: 'Fixes ~42 kg N/ha net and enriches rhizosphere microbial diversity.',
        rootDepthClass: 'Medium Nodulating Taproot (0–75 cm)',
        equipmentNeed: 'Ridge-furrow planter or shared tractor drill',
        riskNote: 'Calcium/gypsum needed at pegging if Groundnut is chosen on low-CEC sandy loams.',
      },
      {
        season: 'Rabi (Year 1)',
        plantingWindow: isKarnataka ? 'Oct 10 – Nov 05' : 'Sep 25 – Oct 20',
        crop: isKarnataka ? 'Safflower + Chickpea Strip' : 'Winter Rye + Crimson Clover Cover',
        botanicalOrRole: 'Deep Subsoil Breaker + Nitrogen Cover',
        durationDays: 120,
        waterNeedMm: 260,
        nitrogenImpactKgHa: 26,
        notes: 'Safflower taproot fractures compacted B-horizons down to 1.5 m without mechanical subsoiling.',
        whySelected: 'Breaks compaction layers while generating oilseed revenue on residual Rabi moisture.',
        environmentalEvidence: `${obsEvidenceLine} Deep taproots access moisture below 80 cm.`,
        soilBenefit: 'Creates vertical macropores that increase next-monsoon rainwater infiltration rates.',
        rootDepthClass: 'Extra-Deep Taproot (100–160 cm)',
        equipmentNeed: 'Standard seed drill (zero-till compatible)',
        riskNote: 'Avoid aphid buildup on safflower by sowing before Nov 05.',
      },
      {
        season: 'Zaid / Summer',
        plantingWindow: isKarnataka ? 'Mar 01 – Mar 25' : 'Apr 01 – Apr 20',
        crop: 'Sesbania / Cowpea Green Manure Cover',
        botanicalOrRole: 'In-Situ Biomass & Carbon Incorporation',
        durationDays: 55,
        waterNeedMm: 165,
        nitrogenImpactKgHa: 48,
        notes: 'Terminate and mulch at 45 days (pre-flowering) before C:N ratio climbs.',
        whySelected: 'Injects concentrated labile nitrogen (+48 kg/ha modeled) and soft organic mulch before Year 2 cereal.',
        environmentalEvidence: 'Matches pre-monsoon soil warming window to accelerate humification.',
        soilBenefit: 'Boosts soil water-holding capacity and shields surface aggregates from May heat.',
        rootDepthClass: 'Rapid Fibrous + Taproot (0–65 cm)',
        equipmentNeed: 'Shared harrow, roller-crimper, or rotavator shallow incorporation',
        riskNote: 'Do not delay termination past flowering or woody stems will tie up early Kharif nitrogen.',
      },
      {
        season: 'Kharif (Year 2)',
        plantingWindow: isKarnataka ? 'Jun 20 – Jul 15' : 'May 10 – Jun 01',
        crop: isKarnataka ? 'Zero-Till Maize + Finger Millet Strip' : 'Strip-Till Maize',
        botanicalOrRole: 'High-Biomass Carbon-Returning Cereal',
        durationDays: 115,
        waterNeedMm: 505,
        nitrogenImpactKgHa: -56,
        notes: 'Residue mulch cuts surface runoff and lets Maize draw on mineralized legume nitrogen.',
        whySelected: 'Converts accumulated organic N into high grain & stover biomass while leaving heavy surface residue.',
        environmentalEvidence: 'Zero-till mulch lowers topsoil temperature by 2–4°C during July dry breaks.',
        soilBenefit: 'High-biomass stover adds structural particulate organic carbon.',
        rootDepthClass: 'Dense Fibrous Cereal (0–95 cm)',
        equipmentNeed: 'Shared zero-till seed drill (preferred) or shallow furrow opener',
        riskNote: 'Monitor fall armyworm early at V4–V6 leaf stage; requires zero-till drill access for best residue retention.',
      },
    ],
    agronomicAnalysis: {
      waterRequirementNote: '1,365 mm modeled; improved infiltration from safflower + surface mulch raises rainfall capture.',
      nitrogenFixationKgHa: 116,
      nutrientCyclingNote: 'Highest net nitrogen surplus (+60 kg N/ha modeled) reducing synthetic urea dependency.',
      organicMatterContribution: 'High (+1.7 t C/ha/yr modeled) via green manure + high-residue cereal mulch.',
      soilCoverPct: 88,
      erosionProtection: 'High',
      rootDepthDiversity: 'Very High — shallow legumes, dense maize, and 1.5 m safflower taproots',
      pestCycleInterruption: 'Very Strong — 4 botanical families (Fabaceae, Asteraceae, Sesbania, Poaceae)',
      growingSeasonSuitability: effectiveInputs.irrigationAvailability === 'rainfed' && isDryScenario ? 'Moderate' : 'High',
      marketSuitability: 'Balances oilseed/grain cash sales with substantial fertilizer input savings.',
      equipmentRequirements: 'Benefits strongly from shared zero-till drill or rotavator for green manure termination.',
    },
    explainability: {
      whyRecommended:
        'Targets long-term soil organic carbon accrual, biological nitrogen self-sufficiency, and infiltration recovery — critical when baseline SOC is <8 g/kg or topsoil is compacted.',
      evidenceBasis: [
        soilEvidenceLine,
        obsEvidenceLine,
        'Multi-depth root architecture targets subsoil compaction without diesel-heavy deep ripping.',
      ],
      modelingAssumptions: [
        'Carbon accrual (+1.7 t C/ha/yr) is a modeled regional estimate assuming >70% crop residue retention.',
        'Assumes timely termination of Sesbania cover at 45 days.',
      ],
      additionalInfoRequired: [
        'Lab soil organic carbon (%) and compaction penetrometer/infiltration check at 15–30 cm depth.',
        'Confirm custom-hiring availability of a zero-till seed drill before Kharif Year 2.',
      ],
    },
  };

  // Strategy D: Balanced Commercial Diversification
  const strategyCommercial: RotationStrategy = {
    id: 'precision-commercial',
    name: isKarnataka
      ? 'Balanced Groundnut, Maize & Red Gram Commercial Rotation'
      : 'Diversified Maize, Oilseed & Restorative Pulse Rotation',
    categoryLabel: 'D · Balanced Commercial',
    focus: 'Commercial market fit within sustainable pulse breaks',
    suitabilityRating:
      effectiveInputs.irrigationAvailability === 'rainfed' && isDryScenario ? 'Constrained' : 'Moderate',
    summary:
      'Pairs high-demand commercial cash crops (Groundnut, Maize/Cotton, Mulched Horticulture) with restorative Red Gram / Chickpea phases to protect farm revenue and soil fertility.',
    totalWaterDemandMm: 1580,
    waterBalanceNote:
      'Higher total demand (1,580 mm); performs reliably with borewell/drip or canal access, constrained under pure rainfed droughts.',
    soilNitrogenDeltaKgHa: 16,
    carbonSequestrationTHaYr: 0.9,
    soilImprovementMechanism:
      'Silver-black mulch curtails evaporation during summer horticulture while Year 2 Red Gram rebuilds nitrogen and interrupts root pathogens.',
    risksAndUncertainties: [
      'Constrained under strictly rainfed farms during El Niño (-20% rainfall) scenarios.',
      'Commercial vegetable/horticulture phases carry higher working capital outlay and mandi price volatility.',
      'Requires disciplined fertigation/irrigation scheduling to prevent nitrate leaching in sandy loams.',
    ],
    seasons: [
      {
        season: 'Kharif (Year 1)',
        plantingWindow: isKarnataka ? 'Jun 10 – Jul 05' : 'May 05 – May 30',
        crop: isKarnataka ? 'Maize / Cotton + Black Gram Intercrop' : 'Precision Strip Maize + Legume',
        botanicalOrRole: 'High-Yield Commercial Cash + Pulse Intercrop',
        durationDays: 135,
        waterNeedMm: 560,
        nitrogenImpactKgHa: -26,
        notes: 'Intercropped Black Gram provides early cash flow and suppresses inter-row weeds.',
        whySelected: 'Delivers strong Kharif commercial liquidity while offsetting monoculture risk via Black Gram.',
        environmentalEvidence: obsEvidenceLine,
        soilBenefit: 'Intercrop pulse buffers inter-row erosion and fixes partial starter N.',
        rootDepthClass: 'Fibrous + Shallow Pulse (0–85 cm)',
        equipmentNeed: 'Precision planter / paired-row tractor & optional drip',
        riskNote: 'High flowering-stage water sensitivity; requires protective irrigation if 14-day dry spell hits.',
      },
      {
        season: 'Rabi (Year 1)',
        plantingWindow: isKarnataka ? 'Nov 01 – Nov 25' : 'Oct 15 – Nov 10',
        crop: isKarnataka ? 'Groundnut / Sunflower Oilseed' : 'Winter Wheat / Oilseed Rape',
        botanicalOrRole: 'High-Margin Commercial Oilseed',
        durationDays: 110,
        waterNeedMm: 340,
        nitrogenImpactKgHa: 18,
        notes: 'Gypsum top-dressing at pegging supports pod fill on red/sandy loam parcels.',
        whySelected: 'Captures strong regional oilseed demand while avoiding consecutive cereal disease.',
        environmentalEvidence: soilEvidenceLine,
        soilBenefit: 'Groundnut fixes ~18 kg N/ha net; sunflower scavenges deep subsoil P & K.',
        rootDepthClass: 'Medium Oilseed Taproot (0–90 cm)',
        equipmentNeed: 'Tractor seed drill / ridge planter',
        riskNote: 'Alkaline pH >8.1 can induce iron chlorosis in Groundnut without foliar micronutrient spray.',
      },
      {
        season: 'Zaid / Summer',
        plantingWindow: isKarnataka ? 'Feb 01 – Feb 25' : 'Mar 20 – Apr 15',
        crop: isKarnataka ? 'Mulched Drip Onion / Ridge Gourd' : 'Short-Cycle High-Value Soybean',
        botanicalOrRole: 'Targeted Commercial Horticultural Phase',
        durationDays: 85,
        waterNeedMm: 270,
        nitrogenImpactKgHa: -16,
        notes: 'Reflective plastic/organic mulch + drip cuts soil evaporation by ~30% vs flood irrigation.',
        whySelected: 'Targets off-season urban market window when irrigation water is controllable.',
        environmentalEvidence: `Requires ${effectiveInputs.irrigationAvailability === 'rainfed' ? 'supplemental water (not rainfed-feasible)' : 'controlled drip/borewell supply'}.`,
        soilBenefit: 'Mulch shields soil crust; shallow roots avoid subsoil compaction.',
        rootDepthClass: 'Shallow Horticultural (0–40 cm)',
        equipmentNeed: 'Drip lateral kit / raised bed shaper',
        riskNote: 'Perishable market price swings and high sensitivity to summer heatwaves (>38°C).',
      },
      {
        season: 'Kharif (Year 2)',
        plantingWindow: isKarnataka ? 'Jun 15 – Jul 10' : 'May 15 – Jun 10',
        crop: isKarnataka ? 'Pigeon Pea (Red Gram / Tur) + Green Gram' : 'Restorative Pulse-Cereal Break',
        botanicalOrRole: 'Restorative Pulse Cash Crop',
        durationDays: 150,
        waterNeedMm: 410,
        nitrogenImpactKgHa: 40,
        notes: 'Rebuilds soil nitrogen reserves and interrupts horticultural soil-borne pests.',
        whySelected: 'Ensures commercial rotation ends on a soil-restorative high-value pulse rather than exhausting nutrients.',
        environmentalEvidence: 'Deep taproot recovers residual deep nitrate leached from irrigated Year 1 phases.',
        soilBenefit: 'Leaf litter drop (~1.5 t/ha) + +40 kg N/ha net nitrogen credit.',
        rootDepthClass: 'Deep Restorative Taproot (120–150 cm)',
        equipmentNeed: 'Standard tractor/bullock planter',
        riskNote: 'Long 150-day cycle requires well-drained ridges during peak September rain.',
      },
    ],
    agronomicAnalysis: {
      waterRequirementNote: '1,580 mm modeled; requires borewell-drip or canal access for the Rabi/Zaid commercial phases.',
      nitrogenFixationKgHa: 72,
      nutrientCyclingNote: 'Balanced +16 kg N/ha net after Year 2 Red Gram restoration; Year 1 requires split NPK.',
      organicMatterContribution: 'Moderate (+0.9 t C/ha/yr modeled) aided by Pigeon Pea litter drop.',
      soilCoverPct: 68,
      erosionProtection: 'Moderate',
      rootDepthDiversity: 'High — shallow horticulture, fibrous maize, oilseed, and 1.4 m Red Gram taproot',
      pestCycleInterruption: 'Strong — separates cereal, oilseed, horticultural, and pulse hosts cleanly',
      growingSeasonSuitability:
        effectiveInputs.irrigationAvailability === 'rainfed' ? 'Constrained' : 'Moderate',
      marketSuitability: 'Highest alignment with commercial mandi, oilseed mill, and urban horticultural buyers.',
      equipmentRequirements: 'Best suited to shared tractor + drip/mulch kit; constrained on manual/bullock farms.',
    },
    explainability: {
      whyRecommended:
        'Designed for farms with dependable irrigation and precision equipment seeking diversified commercial cash flow while still breaking monoculture decline via Year 2 pulses.',
      evidenceBasis: [
        obsEvidenceLine,
        soilEvidenceLine,
        `Evaluated against farmer equipment (${effectiveInputs.equipmentAvailability}) and market (${effectiveInputs.marketPreference}).`,
      ],
      modelingAssumptions: [
        'Assumes >=65% irrigation application efficiency via drip or lined furrows for summer horticulture.',
        'No yield or profit guarantees are implied; market volatility remains a key farm-level risk.',
      ],
      additionalInfoRequired: [
        'Verified borewell yield (L/s) during February–April peak evaporative demand.',
        'Working capital budget and cold-chain/mandi proximity for perishable summer produce.',
      ],
    },
  };

  const strategies: RotationStrategy[] = [
    strategyCurrent,
    strategyClimate,
    strategyRegen,
    strategyCommercial,
  ];

  // Dynamically rank strategies with hard agronomic constraints + 6-priority weighting
  const evaluations = evaluateAndRankStrategies({
    strategies,
    farm,
    soil: soil ?? null,
    observations: observations ?? null,
    scenario: activeScenario,
    inputs: effectiveInputs,
    priority,
  });

  const updatedStrategies = strategies.map((s) => {
    const ev = evaluations[s.id];
    return ev
      ? {
          ...s,
          suitabilityRating: ev.effectiveSuitability,
        }
      : s;
  });

  const bestStrategy =
    Object.values(evaluations).sort((a, b) => a.rank - b.rank)[0]?.strategyId || 'climate-resilient';

  const priorityLabel = PRIORITY_OPTIONS.find((p) => p.id === priority)?.label ?? priority;

  return {
    generatedAt: new Date().toISOString(),
    model: 'Regional Agronomic Engine (Pre-AI)',
    farmerPriority: priority,
    agroDiagnosis: `${farm.name} (${farm.agroClimaticZone}) on ${farm.primarySoilType} (pH ${effectivePh}, SOC ${effectiveSoc} g/kg) evaluated under ${effectiveInputs.irrigationAvailability} irrigation, ${effectiveInputs.equipmentAvailability} machinery, and "${priorityLabel}" priority. ${isKarnataka ? 'Monsoon concentration in Jun–Oct requires matching rooting depth and sowing dates to residual Rabi moisture.' : 'Multi-family rotation breaks continuous cereal monocropping and buffers mid-season moisture deficits.'}`,
    recommendedStrategyId: bestStrategy,
    strategies: updatedStrategies,
  };
}

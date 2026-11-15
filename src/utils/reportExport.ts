import { jsPDF } from 'jspdf';
import {
  ClimateScenario,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  RotationPlanResponse,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import { SimulatedImpactMetrics } from './geoAndAgronomy';

export interface AdvisoryReportPayload {
  farm: FarmParcel;
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  rotationPlan: RotationPlanResponse;
  selectedStrategyId: string;
  agronomistSummary?: string;
  sentinel2Catalog?: Sentinel2CatalogResponse | null;
  farmInputs?: FarmRotationInputs;
  farmerPriority?: FarmerPriority;
}

export function downloadJsonAdvisory(payload: AdvisoryReportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field-shift-advisory-${payload.farm.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsvAdvisory(payload: AdvisoryReportPayload) {
  const { farm, observations, soil, scenario, impact, rotationPlan, selectedStrategyId } = payload;
  const strategy =
    rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;

  const lines: string[] = [];
  lines.push('SECTION,KEY,VALUE,UNIT_OR_PROVENANCE');
  lines.push(['META', 'Platform', 'FIELD SHIFT — NASA Earth Intelligence', '2026 NASA Space Apps'].map(csvEscape).join(','));
  lines.push(['META', 'GeneratedAt', new Date().toISOString(), 'UTC'].map(csvEscape).join(','));
  lines.push(['FARM', 'Name', farm.name, farm.region].map(csvEscape).join(','));
  lines.push(['FARM', 'Coordinates', `${farm.center.lat},${farm.center.lon}`, 'EPSG:4326 deg'].map(csvEscape).join(','));
  lines.push(['FARM', 'Area', farm.areaHectares, 'hectares'].map(csvEscape).join(','));
  lines.push([
    'NASA_POWER',
    'ObservationWindow',
    powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}` : '90-day baseline',
    `${observations?.sourceStatus.nasaPower ?? 'fallback'} (0.5x0.625 deg)`,
  ].map(csvEscape).join(','));
  lines.push(['NASA_POWER', 'MeanAirTemp90d', observations?.summary.meanTempC ?? 'N/A', 'degC (Measured 2m Air)'].map(csvEscape).join(','));
  lines.push(['NASA_POWER', 'TotalRain90d', observations?.summary.totalPrecip90dMm ?? 'N/A', 'mm (Measured)'].map(csvEscape).join(','));
  lines.push(['NASA_POWER', 'RootSoilWetness', observations?.summary.meanRootSoilWetnessPct ?? 'N/A', '% (Measured/Assimilated)'].map(csvEscape).join(','));
  lines.push(['SOIL', 'Source', soil?.source ?? 'Baseline', '0-30 cm'].map(csvEscape).join(','));
  lines.push(['SOIL', 'Texture_pH_SOC', `${soil?.textureClass ?? farm.primarySoilType} | pH ${soil?.phH2O ?? 'N/A'} | SOC ${soil?.organicCarbonGKg ?? 'N/A'} g/kg`, 'ISRIC / Regional Est.'].map(csvEscape).join(','));
  lines.push(['CLIMATE_SIM', 'Scenario', scenario.label, scenario.isHypothetical ? 'Hypothetical Simulation' : 'Baseline'].map(csvEscape).join(','));
  lines.push(['CLIMATE_SIM', 'WaterStressIndex', impact.waterStressIndex, '0-100 Modeled'].map(csvEscape).join(','));
  lines.push(['CLIMATE_SIM', 'ReferenceET0_ETc', `${impact.referenceEt0Mm} / ${impact.cropWaterRequirementMm}`, 'mm/90d Modeled'].map(csvEscape).join(','));
  lines.push(['CLIMATE_SIM', 'SeasonalWaterBalance', impact.seasonalWaterBalanceMm, 'mm Modeled'].map(csvEscape).join(','));
  lines.push(['ROTATION_SELECTED', 'Strategy', strategy.name, `${rotationPlan.model} (${strategy.suitabilityRating})`].map(csvEscape).join(','));
  lines.push('');

  lines.push('ROTATION_SEASON,PLANTING_WINDOW,CROP,ROLE,DURATION_DAYS,WATER_NEED_MM,NET_N_KG_HA,NOTES');
  for (const s of strategy.seasons) {
    lines.push(
      [s.season, s.plantingWindow, s.crop, s.botanicalOrRole, s.durationDays, s.waterNeedMm, s.nitrogenImpactKgHa, s.notes]
        .map(csvEscape)
        .join(',')
    );
  }
  lines.push('');

  if (observations?.dailySeries?.length) {
    lines.push('DAILY_DATE,TEMP_MEAN_C,TEMP_MAX_C,PRECIP_MM,ROOT_WETNESS_PCT,SOLAR_MJ_M2_D,EST_ET0_MM,EST_NDVI_PROXY');
    for (const d of observations.dailySeries) {
      lines.push(
        [d.date, d.tempC, d.tempMaxC, d.precipMm, d.soilWetnessRootPct, d.solarIrradianceMj, d.estimatedEt0Mm, d.estimatedNdvi]
          .map(csvEscape)
          .join(',')
      );
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field-shift-advisory-${farm.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPdfAdvisory(payload: AdvisoryReportPayload) {
  const {
    farm,
    observations,
    soil,
    scenario,
    impact,
    rotationPlan,
    selectedStrategyId,
    agronomistSummary,
    sentinel2Catalog,
    farmInputs,
  } = payload;

  const strategy =
    rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const latestS2 = sentinel2Catalog?.scenes?.[0];

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  let y = 46;

  const ensureSpace = (needed = 40) => {
    if (y + needed > 790) {
      doc.addPage();
      y = 46;
    }
  };

  const addHeading = (title: string) => {
    ensureSpace(34);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 105, 161);
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const addPara = (text: string, bold = false, size = 9.5, color: [number, number, number] = [30, 41, 59]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const wrapped = doc.splitTextToSize(text, maxWidth);
    ensureSpace(wrapped.length * (size + 3) + 6);
    doc.text(wrapped, margin, y);
    y += wrapped.length * (size + 3) + 4;
  };

  // Header Banner
  doc.setFillColor(10, 16, 29);
  doc.rect(0, 0, pageWidth, 72, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(56, 189, 248);
  doc.text('FIELD SHIFT — FARM INTELLIGENCE & ROTATION ADVISORY', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `2026 NASA Space Apps Challenge · Generated ${new Date().toLocaleString()} · Parcel: ${farm.name}`,
    margin,
    50
  );
  y = 92;

  // 1-4 Farm Profile & Boundary
  addHeading('1. Farm Profile, Location & Boundary');
  addPara(
    `Parcel: ${farm.name} (${farm.region}, ${farm.agroClimaticZone}) · Area: ${farm.areaHectares} ha · Center: ${farm.center.lat.toFixed(4)}°, ${farm.center.lon.toFixed(4)}° · Elevation: ${farm.elevationMeters} m · Boundary Ring Vertices: ${farm.boundary.length}`
  );
  addPara(
    `Existing Crops: ${farmInputs?.existingCropSequence || farm.dominantCrops.join(' -> ')} · Irrigation: ${farmInputs?.irrigationAvailability || 'Regional baseline'} · Equipment: ${farmInputs?.equipmentAvailability || 'Standard'} · Market: ${farmInputs?.marketPreference || 'Mandi'}`
  );

  // 5-9 NASA & Satellite Observations
  addHeading('2. NASA & Copernicus Earth Observation Summary');
  addPara(
    `NASA POWER L2 (${observations?.sourceStatus.nasaPower === 'live' ? 'Live Observed' : 'Climatology Fallback'}, ${powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}, ${powerMeta.validDays} valid days` : '90d window'}, 0.5°x0.625°): Mean Air Temp ${observations?.summary.meanTempC ?? 'N/A'} °C (Min ${observations?.summary.minTempC ?? 'N/A'}°C / Max ${observations?.summary.maxTempC ?? 'N/A'}°C), 90d Rainfall ${observations?.summary.totalPrecip90dMm ?? 'N/A'} mm, Root-Zone Wetness ${observations?.summary.meanRootSoilWetnessPct ?? 'N/A'}%, Solar ${observations?.summary.meanSolarMj ?? 'N/A'} MJ/m2/d.`
  );
  addPara(
    `Satellite Imagery & Vegetation: Copernicus Sentinel-2 L2A (10 m): ${latestS2 ? `${latestS2.date} (${latestS2.cloudCoverPct}% cloud, tile ${latestS2.mgrsTile})` : 'Catalog pending / multi-date Esri basemap'}; Modeled Hydro-Thermal NDVI Proxy: ${observations?.summary.estimatedNdvi ?? 'N/A'}.`
  );

  // 10 Soil & Missing Data
  addHeading('3. Soil Intelligence & Missing Laboratory Measurements');
  addPara(
    `Source: ${soil?.source || 'Estimated'} · Texture: ${soil?.textureClass || farm.primarySoilType} (${soil ? `Sand ${soil.sandPct}% / Silt ${soil.siltPct}% / Clay ${soil.clayPct}%` : 'Est.'}) · pH (H2O): ${soil?.phH2O ?? 'N/A'} · Organic Carbon: ${soil?.organicCarbonGKg ?? 'N/A'} g/kg · CEC: ${soil?.cecCmolKg ?? 'N/A'} cmol/kg · WHC: ${soil?.waterHoldingCapacityMmM ?? 'N/A'} mm/m.`
  );
  addPara(
    'Missing Field Lab Measurements: Field-measured available N, P, K (kg/ha), micronutrient Zn/B/Fe, and exact sub-field drainage infiltration. Optical/radar satellites cannot directly measure exact soil NPK concentrations.',
    false,
    9,
    [146, 64, 14]
  );

  // 11-15 Crop Rotation Comparison & Active Strategy
  addHeading(`4. Selected Rotation Strategy: ${strategy.name}`);
  addPara(`Diagnosis: ${rotationPlan.agroDiagnosis}`);
  addPara(
    `Suitability: ${strategy.suitabilityRating} · 4-Season Water: ${strategy.totalWaterDemandMm} mm (${strategy.waterBalanceNote}) · Net Soil N Delta: ${strategy.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}${strategy.soilNitrogenDeltaKgHa} kg/ha · Modeled Carbon Gain: +${strategy.carbonSequestrationTHaYr} t/ha/yr`
  );
  addPara(`Soil Mechanism: ${strategy.soilImprovementMechanism}`);

  for (const s of strategy.seasons) {
    addPara(
      `• ${s.season} (${s.plantingWindow}): ${s.crop} [${s.botanicalOrRole}] — ${s.durationDays} d, ${s.waterNeedMm} mm water, N ${s.nitrogenImpactKgHa >= 0 ? '+' : ''}${s.nitrogenImpactKgHa} kg/ha. ${s.whySelected || s.notes}`,
      false,
      9
    );
  }

  addHeading('5. Comparison Across All Rotation Strategies');
  for (const st of rotationPlan.strategies) {
    addPara(
      `• ${st.name} [${st.suitabilityRating}]: ${st.totalWaterDemandMm} mm water, Net N ${st.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}${st.soilNitrogenDeltaKgHa} kg/ha, Carbon +${st.carbonSequestrationTHaYr} t/ha/yr, Living Cover ${st.agronomicAnalysis?.soilCoverPct ?? '—'}%.`,
      false,
      9
    );
  }

  // 16-17 Climate Vulnerability
  addHeading(`6. Climate Scenario Vulnerability (${scenario.label})`);
  addPara(
    `Scenario Forcing (Hypothetical User-Defined Perturbation): Air Temp ${scenario.tempDeltaC >= 0 ? '+' : ''}${scenario.tempDeltaC}°C, Rainfall ${scenario.precipChangePct >= 0 ? '+' : ''}${scenario.precipChangePct}%, Irrigation Efficiency ${scenario.irrigationEfficiencyPct}%, Monsoon Delay +${scenario.monsoonOnsetDelayDays ?? 0}d, Dry Spell ${scenario.drySpellDurationDays ?? 4}d.`
  );
  addPara(
    `Modeled Outcomes: Sim. Mean Temp ${impact.simulatedTempC}°C, Sim. 90d Rain ${impact.simulatedPrecip90dMm} mm, Reference ET0 ${impact.referenceEt0Mm} mm, Crop ETc ${impact.cropWaterRequirementMm} mm, Water Balance ${impact.seasonalWaterBalanceMm} mm, Water Stress Index ${impact.waterStressIndex}/100 (${impact.growingSuitabilityStatus}), Heat Days >=35°C: ${impact.heatStressDays} d, Drought Exposure: ${impact.droughtExposureDays} d.`
  );

  // 18-23 Key Recommendations, Assumptions, Limitations, Validation Checklist, References
  addHeading('7. Risks, Assumptions, Limitations & Local Validation Checklist');
  addPara(`Key Risks: ${strategy.risksAndUncertainties.join(' | ')}`);
  addPara(
    'Scientific Assumptions & Data Limitations: NASA POWER (0.5°), SMAP (9 km), and GPM (10 km) describe regional grid averages and do not resolve single smallholder plots. Biological N fixation and organic carbon estimates are modeled envelopes. Modeled suitability is NOT a guarantee of crop yield or financial profit.'
  );
  addPara(
    'Local Validation Checklist: (1) Collect composite 0–15 cm & 15–30 cm soil samples for NPK/pH lab testing; (2) Confirm IMD/KVK agromet monsoon onset before sowing; (3) Verify actual borewell discharge or canal turn schedule before planting summer cover crops.'
  );

  if (agronomistSummary) {
    addHeading('8. AI Agronomist Copilot Summary');
    addPara(agronomistSummary, false, 9);
  }

  addPara(
    'References: NASA POWER Agroclimatology L2; NASA EOSDIS GIBS (MODIS, SMAP L4, GPM IMERG); Copernicus Sentinel-2 L2A (Microsoft Planetary Computer STAC); ISRIC SoilGrids v2.0; Open-Meteo Forecast; Esri World Imagery.',
    false,
    8.5,
    [100, 116, 139]
  );

  doc.save(`field-shift-advisory-${farm.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadHtmlAdvisory(payload: AdvisoryReportPayload) {
  const {
    farm,
    observations,
    soil,
    scenario,
    impact,
    rotationPlan,
    selectedStrategyId,
    agronomistSummary,
    sentinel2Catalog,
  } = payload;
  const strategy =
    rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const latestS2 = sentinel2Catalog?.scenes?.[0];

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>FIELD SHIFT Farm Advisory — ${farm.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; max-width: 960px; margin: 32px auto; padding: 0 24px; line-height: 1.55; }
    header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 4px 0; font-size: 24px; letter-spacing: 0.04em; }
    .sub { color: #475569; font-size: 13px; }
    h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: #0369a1; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-top: 26px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
    .box { border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; background: #f8fafc; }
    .label { font-size: 11px; text-transform: uppercase; color: #64748b; }
    .val { font-size: 17px; font-weight: 700; font-family: monospace; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; }
    .prov { font-size: 11px; color: #475569; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }
    .risk-box { border: 1px solid #f59e0b; background: #fffbeb; padding: 12px; border-radius: 6px; margin-top: 14px; font-size: 13px; }
    footer { margin-top: 36px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>FIELD SHIFT — Farm Resilience &amp; Crop Rotation Advisory</h1>
    <div class="sub">Generated ${new Date().toLocaleString()} · Parcel: <strong>${farm.name}</strong> (${farm.region}) · ${farm.center.lat.toFixed(4)}°, ${farm.center.lon.toFixed(4)}° · ${farm.areaHectares} ha · ${farm.boundary.length} boundary vertices</div>
  </header>

  <h2>1. NASA &amp; Satellite Observations <span class="prov">${observations?.sourceStatus.nasaPower === 'live' ? `NASA POWER L2 (${powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}, ${powerMeta.validDays}d` : '90d'})` : 'Climatology Fallback'}</span></h2>
  <div class="grid">
    <div class="box"><div class="label">90d Mean Air Temp (Observed)</div><div class="val">${observations?.summary.meanTempC ?? 'N/A'} °C</div></div>
    <div class="box"><div class="label">90d Cumulative Rain (Observed)</div><div class="val">${observations?.summary.totalPrecip90dMm ?? 'N/A'} mm</div></div>
    <div class="box"><div class="label">Root-Zone Soil Wetness (Observed)</div><div class="val">${observations?.summary.meanRootSoilWetnessPct ?? 'N/A'} %</div></div>
    <div class="box"><div class="label">Sentinel-2 L2A (10 m)</div><div class="val" style="font-size:13px">${latestS2 ? `${latestS2.date} (${latestS2.cloudCoverPct}% cloud)` : 'Basemap mosaic'}</div></div>
    <div class="box"><div class="label">Mean Solar Irradiance (Observed)</div><div class="val">${observations?.summary.meanSolarMj ?? 'N/A'} MJ/m²/d</div></div>
    <div class="box"><div class="label">Hydro-Thermal NDVI (Modeled Est.)</div><div class="val">${observations?.summary.estimatedNdvi ?? 'N/A'}</div></div>
  </div>

  <h2>2. Soil Intelligence Profile &amp; Missing Lab Tests <span class="prov">${soil?.source || 'Estimated'}</span></h2>
  <div class="grid">
    <div class="box"><div class="label">USDA Texture Class</div><div class="val" style="font-size:15px">${soil?.textureClass ?? farm.primarySoilType}</div></div>
    <div class="box"><div class="label">Soil pH (H2O)</div><div class="val">${soil?.phH2O ?? 'N/A'}</div></div>
    <div class="box"><div class="label">Organic Carbon</div><div class="val">${soil?.organicCarbonGKg ?? 'N/A'} g/kg</div></div>
    <div class="box"><div class="label">Sand / Silt / Clay</div><div class="val" style="font-size:14px">${soil ? `${soil.sandPct}% / ${soil.siltPct}% / ${soil.clayPct}%` : 'N/A'}</div></div>
    <div class="box"><div class="label">Cation Exchange (CEC)</div><div class="val">${soil?.cecCmolKg ?? 'N/A'} cmol/kg</div></div>
    <div class="box"><div class="label">Missing Field Lab Tests</div><div class="val" style="font-size:12px">Available N, P, K (kg/ha) &amp; Infiltration</div></div>
  </div>

  <h2>3. Climate Stress Simulation <span class="prov">${scenario.isHypothetical ? 'Hypothetical Perturbation' : 'Baseline'}: ${scenario.label}</span></h2>
  <div class="grid">
    <div class="box"><div class="label">Simulated Mean Air Temp</div><div class="val">${impact.simulatedTempC} °C (${scenario.tempDeltaC >= 0 ? '+' : ''}${scenario.tempDeltaC}°C)</div></div>
    <div class="box"><div class="label">Simulated 90d Rain</div><div class="val">${impact.simulatedPrecip90dMm} mm (${scenario.precipChangePct >= 0 ? '+' : ''}${scenario.precipChangePct}%)</div></div>
    <div class="box"><div class="label">ET₀ / Crop ETc / Balance</div><div class="val" style="font-size:14px">${impact.referenceEt0Mm} / ${impact.cropWaterRequirementMm} / ${impact.seasonalWaterBalanceMm} mm</div></div>
  </div>

  <h2>4. Selected Strategy &amp; 4-Strategy Comparison: ${strategy.name}</h2>
  <p>${rotationPlan.agroDiagnosis}</p>
  <p><strong>Water Demand &amp; Balance:</strong> ${strategy.totalWaterDemandMm.toLocaleString()} mm total — ${strategy.waterBalanceNote}</p>
  <p><strong>Soil Improvement Mechanism:</strong> ${strategy.soilImprovementMechanism}</p>
  <table>
    <thead>
      <tr><th>Season</th><th>Planting Window</th><th>Crop</th><th>Functional Role</th><th>Duration</th><th>Water Need</th><th>N Balance</th><th>Agronomic Reasoning</th></tr>
    </thead>
    <tbody>
      ${strategy.seasons
        .map(
          (s) =>
            `<tr><td>${s.season}</td><td>${s.plantingWindow}</td><td><strong>${s.crop}</strong></td><td>${s.botanicalOrRole}</td><td>${s.durationDays} d</td><td>${s.waterNeedMm} mm</td><td>${s.nitrogenImpactKgHa >= 0 ? '+' : ''}${s.nitrogenImpactKgHa} kg/ha</td><td>${s.notes}${s.whySelected ? ` — ${s.whySelected}` : ''}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>

  <table>
    <thead>
      <tr><th>All Compared Strategies</th><th>Suitability</th><th>4-Season Water</th><th>Net N Δ</th><th>Carbon Gain (Est.)</th><th>Living Cover %</th></tr>
    </thead>
    <tbody>
      ${rotationPlan.strategies
        .map(
          (st) =>
            `<tr><td><strong>${st.name}</strong></td><td>${st.suitabilityRating}</td><td>${st.totalWaterDemandMm} mm</td><td>${st.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}${st.soilNitrogenDeltaKgHa} kg/ha</td><td>+${st.carbonSequestrationTHaYr} t/ha/yr</td><td>${st.agronomicAnalysis?.soilCoverPct ?? '—'}%</td></tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="risk-box">
    <strong>Risks, Limitations &amp; Local Validation Checklist:</strong>
    <ul>
      ${strategy.risksAndUncertainties.map((r) => `<li>${r}</li>`).join('')}
      <li>Collect composite 0–15 cm &amp; 15–30 cm field soil samples for NPK and micronutrient lab validation before fertilizer budgeting.</li>
      <li>Verify IMD/KVK regional monsoon onset advisories prior to dryland sowing; modeled outputs do not guarantee yields or profit.</li>
    </ul>
  </div>

  ${
    agronomistSummary
      ? `<h2>5. AI Agronomist Copilot Summary</h2><p>${agronomistSummary.replace(/\n/g, '<br/>')}</p>`
      : ''
  }

  <footer>
    FIELD SHIFT — 2026 NASA Space Apps Challenge · Telemetry provenance: NASA POWER (0.5°), NASA GIBS MODIS/SMAP/GPM (250 m–10 km), Copernicus Sentinel-2 L2A (10 m), Esri World Imagery, ISRIC SoilGrids v2.0, Open-Meteo Forecast, and Gemini Advisory Reasoning.
  </footer>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `field-shift-advisory-${farm.id}-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

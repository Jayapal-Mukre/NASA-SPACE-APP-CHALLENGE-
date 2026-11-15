import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Sliders,
  AlertCircle,
  Download,
  BookmarkPlus,
  Info,
  Droplets,
  Thermometer,
  Sprout,
  CalendarDays,
} from 'lucide-react';
import {
  ClimateScenario,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  RotationStrategy,
  SoilProfile,
} from '../types/fieldShift';
import { CLIMATE_PRESETS, computeScenarioImpact } from '../utils/geoAndAgronomy';
import { evaluateAndRankStrategies } from '../utils/rotationAgronomyEngine';

interface ClimateSimulatorProps {
  scenario: ClimateScenario;
  onChangeScenario: (scenario: ClimateScenario) => void;
  observations: NasaObservationBundle | null;
  farm?: FarmParcel;
  soil?: SoilProfile | null;
  strategies?: RotationStrategy[];
  farmInputs?: FarmRotationInputs;
  farmerPriority?: FarmerPriority;
  onSaveScenario?: (scenario: ClimateScenario, waterStressIndex: number, simulatedPrecip90dMm: number) => void;
}

type ClimateChartTab = 'timeline' | 'thermal' | 'balance' | 'vulnerability';

export const ClimateSimulator: React.FC<ClimateSimulatorProps> = ({
  scenario,
  onChangeScenario,
  observations,
  farm,
  soil = null,
  strategies = [],
  farmInputs,
  farmerPriority = 'drought-resilience',
  onSaveScenario,
}) => {
  const [chartTab, setChartTab] = useState<ClimateChartTab>('timeline');
  const [showMethodology, setShowMethodology] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const baselineScenario = CLIMATE_PRESETS[0];
  const baselineImpact = useMemo(
    () => computeScenarioImpact(observations, baselineScenario),
    [observations, baselineScenario]
  );
  const activeImpact = useMemo(
    () => computeScenarioImpact(observations, scenario),
    [observations, scenario]
  );

  // Build 90-day comparative series (Historical NASA POWER vs Simulated Hypothetical)
  const timelineSeries = useMemo(() => {
    const daily = observations?.dailySeries ?? [];
    if (daily.length === 0) return [];
    const rainMult = 1 + scenario.precipChangePct / 100;
    const tempAdd = scenario.tempDeltaC;
    const moistureShift =
      activeImpact.simulatedRootMoisturePct - baselineImpact.simulatedRootMoisturePct;

    // Group into ~3-day intervals (30 points) for crisp rendering
    const sampled = daily.filter((_, idx) => idx % 3 === 0 || idx === daily.length - 1);
    return sampled.map((d) => ({
      date: d.date.slice(5),
      histRain: d.precipMm,
      simRain: Number(Math.max(0, d.precipMm * rainMult).toFixed(1)),
      histMoisture: d.soilWetnessRootPct,
      simMoisture: Number(Math.min(95, Math.max(8, d.soilWetnessRootPct + moistureShift)).toFixed(1)),
      histTemp: d.tempC,
      simTemp: Number((d.tempC + tempAdd).toFixed(1)),
      simMaxTemp: Number((d.tempMaxC + tempAdd).toFixed(1)),
    }));
  }, [observations, scenario, activeImpact.simulatedRootMoisturePct, baselineImpact.simulatedRootMoisturePct]);

  // Monthly water balance series from NASA monthly climatology
  const monthlyBalanceSeries = useMemo(() => {
    const monthly = observations?.monthlyClimatology ?? [];
    if (monthly.length === 0) return [];
    const rainMult = 1 + scenario.precipChangePct / 100;
    const tempAdd = scenario.tempDeltaC;
    return monthly.map((m) => {
      const simRain = Number(Math.max(0, m.precipMm * rainMult).toFixed(1));
      const estMonthlyEtc = Number((Math.max(65, (m.tempC + tempAdd) * 3.8 + m.solarMj * 1.4)).toFixed(0));
      return {
        month: m.month,
        histRain: m.precipMm,
        simRain,
        estCropEtc: estMonthlyEtc,
        netBalance: Number((simRain * 0.78 - estMonthlyEtc).toFixed(0)),
      };
    });
  }, [observations, scenario.precipChangePct, scenario.tempDeltaC]);

  // Dynamic Crop Vulnerability Analysis across all strategies
  const vulnerabilityRows = useMemo(() => {
    if (!farm || !farmInputs || strategies.length === 0) return [];
    const baseEvals = evaluateAndRankStrategies({
      strategies,
      farm,
      soil,
      observations,
      scenario: baselineScenario,
      inputs: farmInputs,
      priority: farmerPriority,
    });
    const simEvals = evaluateAndRankStrategies({
      strategies,
      farm,
      soil,
      observations,
      scenario,
      inputs: farmInputs,
      priority: farmerPriority,
    });

    return strategies.map((s) => {
      const bEv = baseEvals[s.id];
      const sEv = simEvals[s.id];
      const stressMultiplier = 1 + (activeImpact.waterStressIndex - baselineImpact.waterStressIndex) / 140;
      const adjustedWaterDemand = Math.round(
        s.totalWaterDemandMm * (1 + scenario.tempDeltaC * 0.032)
      );
      return {
        id: s.id,
        name: s.name,
        categoryLabel: s.categoryLabel || s.focus,
        baseSuitability: bEv?.effectiveSuitability ?? s.suitabilityRating,
        simSuitability: sEv?.effectiveSuitability ?? s.suitabilityRating,
        simRank: sEv?.rank ?? 1,
        adjustedWaterDemand,
        soilCoverPct: s.agronomicAnalysis?.soilCoverPct ?? 65,
        irrigationPressure:
          adjustedWaterDemand > 1500 && scenario.irrigationEfficiencyPct < 45
            ? 'High Drawdown'
            : adjustedWaterDemand > 1300
              ? 'Moderate'
              : 'Low / Buffered',
        constraintFlags: sEv?.constraintFlags ?? [],
        stressExposure:
          stressMultiplier > 1.25 && s.id === 'precision-commercial'
            ? 'Elevated'
            : s.id === 'climate-resilient'
              ? 'Resilient'
              : s.id === 'carbon-regenerative'
                ? 'Buffered'
                : 'Vulnerable',
      };
    });
  }, [
    farm,
    farmInputs,
    strategies,
    soil,
    observations,
    baselineScenario,
    scenario,
    farmerPriority,
    activeImpact.waterStressIndex,
    baselineImpact.waterStressIndex,
  ]);

  const stressLevel =
    activeImpact.waterStressIndex >= 65
      ? { label: 'High Stress', cls: 'text-rose-400' }
      : activeImpact.waterStressIndex >= 38
        ? { label: 'Moderate Stress', cls: 'text-amber-400' }
        : { label: 'Low Stress', cls: 'text-emerald-400' };

  const exportClimateReport = () => {
    const payload = {
      reportType: 'FIELD SHIFT Phase 6 Climate Intelligence Report',
      generatedAt: new Date().toISOString(),
      disclaimer:
        'Scenario metrics represent user-defined hypothetical perturbations over historical NASA POWER baseline — NOT official seasonal weather forecasts or guaranteed crop yields.',
      farm: farm
        ? {
            name: farm.name,
            region: farm.region,
            coordinates: farm.center,
            areaHectares: farm.areaHectares,
            soilType: farm.primarySoilType,
          }
        : null,
      historicalObservations: observations
        ? {
            source: observations.sourceStatus.nasaPower,
            meta: observations.sourceStatus.nasaPowerMeta,
            summary: observations.summary,
          }
        : null,
      scenarioSettings: scenario,
      climateIndicators: activeImpact,
      strategyVulnerabilityComparison: vulnerabilityRows,
      localVerificationChecklist: [
        'Validate sub-field soil moisture and infiltration rate with local tensiometer or feel test before altering irrigation schedule.',
        'Consult district KVK / IMD agromet bulletin for actual monsoon onset confirmation prior to Kharif sowing.',
        'Verify local borewell discharge / canal release roster if Simulated Seasonal Water Balance is negative.',
      ],
    };

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>FIELD SHIFT Climate Intelligence Report — ${farm?.name || 'Parcel'}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; max-width: 920px; margin: 28px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 15px; color: #0369a1; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 22px; text-transform: uppercase; letter-spacing: 0.05em; }
  .note { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px 12px; border-radius: 6px; font-size: 12px; margin: 12px 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
  th { background: #f1f5f9; }
</style>
</head>
<body>
  <h1>FIELD SHIFT — Climate Intelligence &amp; Vulnerability Report</h1>
  <div>Farm: <strong>${farm?.name || 'Selected Parcel'}</strong> · Generated ${new Date().toLocaleString()}</div>
  <div class="note"><strong>Scientific Disclosure:</strong> ${payload.disclaimer}</div>

  <h2>1. Scenario Settings (${scenario.label})</h2>
  <div class="grid">
    <div class="card">Temp Anomaly: <strong>${scenario.tempDeltaC >= 0 ? '+' : ''}${scenario.tempDeltaC}°C</strong></div>
    <div class="card">Rainfall Shift: <strong>${scenario.precipChangePct >= 0 ? '+' : ''}${scenario.precipChangePct}%</strong></div>
    <div class="card">Irrigation Availability: <strong>${scenario.irrigationEfficiencyPct}%</strong></div>
    <div class="card">Monsoon Onset Delay: <strong>+${scenario.monsoonOnsetDelayDays ?? 0} days</strong></div>
    <div class="card">Dry Spell Duration: <strong>${scenario.drySpellDurationDays ?? 4} days</strong></div>
    <div class="card">Planting Date Shift: <strong>${(scenario.plantingDateShiftDays ?? 0) >= 0 ? '+' : ''}${scenario.plantingDateShiftDays ?? 0} days</strong></div>
  </div>

  <h2>2. Modeled Climate &amp; Hydrological Indicators</h2>
  <div class="grid">
    <div class="card">Simulated Mean Air Temp: <strong>${activeImpact.simulatedTempC} °C</strong></div>
    <div class="card">Simulated 90d Rain: <strong>${activeImpact.simulatedPrecip90dMm} mm</strong></div>
    <div class="card">Reference ET0 (90d Est.): <strong>${activeImpact.referenceEt0Mm} mm</strong></div>
    <div class="card">Crop Water Req (ETc): <strong>${activeImpact.cropWaterRequirementMm} mm</strong></div>
    <div class="card">Seasonal Water Balance: <strong>${activeImpact.seasonalWaterBalanceMm} mm</strong></div>
    <div class="card">Water Stress Index: <strong>${activeImpact.waterStressIndex}/100 (${activeImpact.growingSuitabilityStatus})</strong></div>
    <div class="card">Drought Exposure (&lt;1mm): <strong>${activeImpact.droughtExposureDays} days</strong></div>
    <div class="card">Heat Exposure (&ge;35°C): <strong>${activeImpact.heatStressDays} days</strong></div>
    <div class="card">Extreme Rain (&ge;35mm): <strong>${activeImpact.extremePrecipDays} days</strong></div>
  </div>

  ${
    vulnerabilityRows.length > 0
      ? `<h2>3. Crop Rotation Strategy Vulnerability Comparison</h2>
         <table>
           <thead><tr><th>Strategy</th><th>Baseline Fit</th><th>Scenario Fit</th><th>Adj. Water (mm)</th><th>Irrigation Pressure</th><th>Stress Exposure</th></tr></thead>
           <tbody>
             ${vulnerabilityRows
               .map(
                 (r) =>
                   `<tr><td><strong>${r.name}</strong></td><td>${r.baseSuitability}</td><td>${r.simSuitability} (Rank #${r.simRank})</td><td>${r.adjustedWaterDemand} mm</td><td>${r.irrigationPressure}</td><td>${r.stressExposure}</td></tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : ''
  }

  <h2>4. Uncertainty &amp; Local Verification Checklist</h2>
  <ul>
    ${payload.localVerificationChecklist.map((c) => `<li>${c}</li>`).join('')}
  </ul>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `field-shift-climate-report-${farm?.id || 'parcel'}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateCustom = (patch: Partial<ClimateScenario>) => {
    onChangeScenario({
      ...scenario,
      presetId: 'custom',
      label: 'Custom Scenario',
      isHypothetical: true,
      projectionNote: 'User-defined hypothetical climate perturbation (not an official NASA forecast).',
      ...patch,
    });
  };

  return (
    <div className="mission-panel rounded-xl p-5 space-y-5">
      {/* Header + Actions */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#32D9FF]/15 pb-3.5">
        <div>
          <h3 className="text-base font-semibold text-slate-100">
            Climate Future &amp; Agricultural Resilience Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Hypothetical scenario perturbations over{' '}
            <span className="text-cyan-300">
              {observations?.sourceStatus.nasaPower === 'live'
                ? 'NASA POWER L2 90d historical air/rain baseline'
                : 'climatological baseline'}
            </span>{' '}
            · Propagates live to 3D Twin, Rotation Engine &amp; AI Agronomist
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMethodology((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg bg-[#05080f] border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500/60 whitespace-nowrap shrink-0"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showMethodology ? 'Hide Methodology' : 'Formulas & Assumptions'}</span>
          </button>

          {onSaveScenario && (
            <button
              type="button"
              onClick={() => {
                onSaveScenario(scenario, activeImpact.waterStressIndex, activeImpact.simulatedPrecip90dMm);
                setSavedNotice(true);
                setTimeout(() => setSavedNotice(false), 2500);
              }}
              className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg bg-[#05080f] border border-slate-700 text-xs font-medium text-emerald-300 hover:border-emerald-500/60 whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>{savedNotice ? 'Scenario Saved' : 'Save Scenario'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={exportClimateReport}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Climate Report</span>
          </button>
        </div>
      </div>

      {/* 8 Scenario Presets */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-300">Scenario Presets (8 Agricultural Stress Profiles)</span>
          <span className="text-[11px] text-amber-300">
            {scenario.isHypothetical
              ? scenario.projectionNote || 'User-defined hypothetical simulation — NOT an official NASA forecast.'
              : 'Unperturbed historical baseline.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {CLIMATE_PRESETS.map((preset) => (
            <button
              key={preset.presetId}
              type="button"
              onClick={() => onChangeScenario(preset)}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                scenario.presetId === preset.presetId
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/70'
                  : 'bg-[#05080f] text-slate-300 border-slate-800 hover:border-slate-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Methodology Disclosure Drawer */}
      {showMethodology && (
        <div className="bg-[#05080f] border border-cyan-500/30 rounded-xl p-4 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-cyan-300">
            Scientific Methodology, Equations &amp; Boundary Conditions
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Air Temperature vs. Land Surface Temperature:</strong> Thermal forcing applies ΔT to 2-meter screen-height air temperature (NASA POWER <span className="font-mono">T2M / T2M_MAX</span>), not satellite infrared skin LST.
            </li>
            <li>
              <strong>Reference Evapotranspiration (ET₀ &amp; ETc):</strong> Computed from 90-day Hargreaves-Samani / FAO-56 solar-VPD proxy scaled at +4.2% ET₀ per +1°C warming; composite crop requirement applies Kc ≈ 0.94 plus planting-shift penalty.
            </li>
            <li>
              <strong>Water Balance:</strong> Effective rainfall (<span className="font-mono">0.72 × Simulated Rain</span>) minus <span className="font-mono">ETc</span>; deficit divided by irrigation efficiency gives gross supplemental irrigation demand (mm).
            </li>
            <li>
              <strong>Hypothetical Disclosure:</strong> All scenarios except Historical Baseline are deterministic sensitivity stress tests (including the 2040 IPCC SSP2-4.5 envelope) and do not represent official seasonal forecasts or guaranteed farm yields.
            </li>
          </ul>
        </div>
      )}

      {/* Control Sliders + Core Hydro-Thermal Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: 6 Interactive Sliders */}
        <div className="lg:col-span-5 bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Forcing &amp; Scheduling Controls (Simulated)</span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Air Temperature Anomaly</span>
              <span className="font-mono tabular-nums text-amber-300">
                {scenario.tempDeltaC >= 0 ? '+' : ''}
                {scenario.tempDeltaC.toFixed(1)} °C
              </span>
            </div>
            <input
              type="range"
              min={-1}
              max={4}
              step={0.1}
              value={scenario.tempDeltaC}
              aria-label="Temperature Anomaly"
              onChange={(e) => updateCustom({ tempDeltaC: Number(e.target.value) })}
              className="w-full h-1.5 cursor-pointer accent-amber-400"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Seasonal Rainfall Variation</span>
              <span className="font-mono tabular-nums text-cyan-300">
                {scenario.precipChangePct >= 0 ? '+' : ''}
                {scenario.precipChangePct} %
              </span>
            </div>
            <input
              type="range"
              min={-40}
              max={40}
              step={2}
              value={scenario.precipChangePct}
              aria-label="Seasonal Rainfall Variation"
              onChange={(e) => updateCustom({ precipChangePct: Number(e.target.value) })}
              className="w-full h-1.5 cursor-pointer accent-cyan-400"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-300">Irrigation Availability &amp; Efficiency</span>
              <span className="font-mono tabular-nums text-emerald-300">
                {scenario.irrigationEfficiencyPct} %
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={scenario.irrigationEfficiencyPct}
              aria-label="Irrigation Availability"
              onChange={(e) => updateCustom({ irrigationEfficiencyPct: Number(e.target.value) })}
              className="w-full h-1.5 cursor-pointer accent-emerald-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-800/80">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Monsoon Delay</span>
                <span className="font-mono text-amber-300">+{scenario.monsoonOnsetDelayDays ?? 0}d</span>
              </div>
              <input
                type="range"
                min={0}
                max={35}
                step={1}
                value={scenario.monsoonOnsetDelayDays ?? 0}
                aria-label="Monsoon Onset Delay"
                onChange={(e) => updateCustom({ monsoonOnsetDelayDays: Number(e.target.value) })}
                className="w-full h-1.5 cursor-pointer accent-amber-400"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Dry Spell</span>
                <span className="font-mono text-rose-300">{scenario.drySpellDurationDays ?? 4}d</span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={scenario.drySpellDurationDays ?? 4}
                aria-label="Dry Spell Duration"
                onChange={(e) => updateCustom({ drySpellDurationDays: Number(e.target.value) })}
                className="w-full h-1.5 cursor-pointer accent-rose-400"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Sow Shift</span>
                <span className="font-mono text-cyan-300">
                  {(scenario.plantingDateShiftDays ?? 0) >= 0 ? '+' : ''}
                  {scenario.plantingDateShiftDays ?? 0}d
                </span>
              </div>
              <input
                type="range"
                min={-21}
                max={28}
                step={1}
                value={scenario.plantingDateShiftDays ?? 0}
                aria-label="Planting Date Shift"
                onChange={(e) => updateCustom({ plantingDateShiftDays: Number(e.target.value) })}
                className="w-full h-1.5 cursor-pointer accent-cyan-400"
              />
            </div>
          </div>
        </div>

        {/* Right: 9 Scientifically Grounded Indicator Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Water Stress (Modeled)</span>
              <AlertCircle className={`w-3.5 h-3.5 ${stressLevel.cls}`} />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-mono tabular-nums font-semibold text-slate-100">
                {activeImpact.waterStressIndex}/100
              </span>
              <span className={`text-[11px] font-medium ${stressLevel.cls}`}>
                {activeImpact.growingSuitabilityStatus}
              </span>
            </div>
          </div>

          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">90d Reference ET₀ / ETc</div>
            <div className="mt-1 text-lg font-mono tabular-nums font-semibold text-amber-300">
              {activeImpact.referenceEt0Mm} / {activeImpact.cropWaterRequirementMm} mm
            </div>
            <div className="text-[11px] text-slate-400">FAO-56 / Hargreaves est.</div>
          </div>

          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Seasonal Water Balance</div>
            <div
              className={`mt-1 text-lg font-mono tabular-nums font-semibold ${
                activeImpact.seasonalWaterBalanceMm >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {activeImpact.seasonalWaterBalanceMm >= 0 ? '+' : ''}
              {activeImpact.seasonalWaterBalanceMm} mm
            </div>
            <div className="text-[11px] text-slate-400">Eff. Rain minus Crop ETc</div>
          </div>

          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Sim. 90d Precip &amp; Root %</div>
            <div className="mt-1 text-base font-mono tabular-nums font-semibold text-cyan-300">
              {activeImpact.simulatedPrecip90dMm} mm · {activeImpact.simulatedRootMoisturePct}%
            </div>
            <div className="text-[11px] text-slate-400">
              Hist. CV: {activeImpact.historicalRainVariabilityCvPct}% (Obs.)
            </div>
          </div>

          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Drought &amp; Extreme Rain</div>
            <div className="mt-1 text-base font-mono tabular-nums font-semibold text-slate-100">
              {activeImpact.droughtExposureDays}d dry · {activeImpact.extremePrecipDays}d &ge;35mm
            </div>
            <div className="text-[11px] text-slate-400">90-day exposure window</div>
          </div>

          <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Heat &amp; Vegetation Stress</div>
            <div className="mt-1 text-base font-mono tabular-nums font-semibold text-amber-300">
              {activeImpact.heatStressDays}d &ge;35°C · Veg {activeImpact.vegetationStressIdx}/100
            </div>
            <div className="text-[11px] text-slate-400">
              Air Temp {activeImpact.simulatedTempC}°C (Not LST)
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Scientific Charts & Vulnerability Switcher */}
      <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="text-xs font-semibold text-slate-200">
            Interactive Climate &amp; Vulnerability Visualizations
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setChartTab('timeline')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                chartTab === 'timeline'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#0A101D] border-slate-800 text-slate-300'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Rain &amp; Moisture</span>
            </button>
            <button
              type="button"
              onClick={() => setChartTab('thermal')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                chartTab === 'thermal'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#0A101D] border-slate-800 text-slate-300'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Air Temp &amp; Heat</span>
            </button>
            <button
              type="button"
              onClick={() => setChartTab('balance')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                chartTab === 'balance'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#0A101D] border-slate-800 text-slate-300'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Seasonal Balance</span>
            </button>
            <button
              type="button"
              onClick={() => setChartTab('vulnerability')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                chartTab === 'vulnerability'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#0A101D] border-slate-800 text-slate-300'
              }`}
            >
              <Sprout className="w-3.5 h-3.5" />
              <span>Rotation Vulnerability</span>
            </button>
          </div>
        </div>

        {chartTab === 'timeline' && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timelineSeries} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis yAxisId="rain" tick={{ fill: '#38bdf8', fontSize: 10 }} />
                <YAxis yAxisId="moist" orientation="right" domain={[0, 100]} tick={{ fill: '#34d399', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#05080f', borderColor: '#334155', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="rain" dataKey="histRain" name="Historical Rain (mm/d)" fill="#334155" />
                <Bar yAxisId="rain" dataKey="simRain" name="Simulated Rain (mm/d)" fill="#06b6d4" />
                <Area
                  yAxisId="moist"
                  type="monotone"
                  dataKey="simMoisture"
                  name="Simulated Root Moisture (%)"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.18}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartTab === 'thermal' && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timelineSeries} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#fbbf24', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#05080f', borderColor: '#334155', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <ReferenceLine y={35} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: '35°C Heat Threshold', fill: '#f43f5e', fontSize: 10 }} />
                <Line type="monotone" dataKey="histTemp" name="Historical Air Temp (°C)" stroke="#64748b" dot={false} />
                <Line type="monotone" dataKey="simTemp" name="Simulated Mean Temp (°C)" stroke="#f59e0b" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="simMaxTemp" name="Simulated Daily Max (°C)" stroke="#ef4444" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartTab === 'balance' && (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyBalanceSeries} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: '#05080f', borderColor: '#334155', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="histRain" name="Hist. Monthly Rain (mm)" fill="#475569" />
                <Bar dataKey="simRain" name="Sim. Monthly Rain (mm)" fill="#06b6d4" />
                <Bar dataKey="estCropEtc" name="Est. Crop ETc (mm)" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {chartTab === 'vulnerability' && (
          <div className="space-y-2">
            {vulnerabilityRows.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">
                Connect rotation strategies to display climate vulnerability matrix.
              </div>
            ) : (
              <>
                <div className="text-[11px] text-slate-400">
                  Compares baseline vs. active scenario suitability and irrigation pressure (modeled suitability is not guaranteed yield or profit).
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="text-left py-2 pr-3 font-medium">Rotation Strategy</th>
                        <th className="text-left py-2 px-2 font-medium">Baseline → Active Fit</th>
                        <th className="text-right py-2 px-2 font-medium">Adj. Water</th>
                        <th className="text-left py-2 px-2 font-medium">Irrigation Pressure</th>
                        <th className="text-right py-2 px-2 font-medium">Soil Cover</th>
                        <th className="text-left py-2 pl-2 font-medium">Stress Exposure</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {vulnerabilityRows.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-3 font-medium text-slate-100">
                            <div>{row.name}</div>
                            <div className="text-[10px] font-mono text-slate-400">Rank #{row.simRank} under scenario</div>
                          </td>
                          <td className="py-2 px-2 font-mono">
                            <span className="text-slate-400">{row.baseSuitability}</span> →{' '}
                            <span
                              className={
                                row.simSuitability === 'High'
                                  ? 'text-emerald-300'
                                  : row.simSuitability === 'Moderate'
                                    ? 'text-amber-300'
                                    : 'text-rose-300'
                              }
                            >
                              {row.simSuitability}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums text-cyan-300">
                            {row.adjustedWaterDemand} mm
                          </td>
                          <td className="py-2 px-2 text-slate-300">{row.irrigationPressure}</td>
                          <td className="py-2 px-2 text-right font-mono text-emerald-300">{row.soilCoverPct}%</td>
                          <td className="py-2 pl-2 font-medium text-slate-200">{row.stressExposure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

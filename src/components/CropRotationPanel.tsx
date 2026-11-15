import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import {
  Sparkles,
  CheckCircle2,
  Droplets,
  Leaf,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Microscope,
  Layers,
  AlertOctagon,
} from 'lucide-react';
import {
  ClimateScenario,
  EquipmentAvailability,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  IrrigationAvailability,
  MarketPreference,
  NasaObservationBundle,
  PlantingSeasonFocus,
  RotationPlanResponse,
  RotationStrategy,
  SoilProfile,
} from '../types/fieldShift';
import { evaluateAndRankStrategies, PRIORITY_OPTIONS } from '../utils/rotationAgronomyEngine';

interface CropRotationPanelProps {
  farm: FarmParcel;
  soil: SoilProfile | null;
  observations: NasaObservationBundle | null;
  scenario: ClimateScenario;
  farmInputs: FarmRotationInputs;
  onChangeFarmInputs: (next: FarmRotationInputs) => void;
  plan: RotationPlanResponse;
  farmerPriority: FarmerPriority;
  onChangeFarmerPriority: (priority: FarmerPriority) => void;
  selectedStrategyId: string;
  onSelectStrategy: (id: string) => void;
  onGenerateAiPlan: () => void;
  generating: boolean;
  aiError: string | null;
}

const SUITABILITY_STYLE: Record<RotationStrategy['suitabilityRating'], string> = {
  High: 'text-emerald-300',
  Moderate: 'text-amber-300',
  Constrained: 'text-rose-300',
};

const STRATEGY_COLORS = ['#94a3b8', '#06b6d4', '#10b981', '#f59e0b'];

type InspectionTab = 'calendar' | 'matrix' | 'explainability';

export const CropRotationPanel: React.FC<CropRotationPanelProps> = ({
  farm,
  soil,
  observations,
  scenario,
  farmInputs,
  onChangeFarmInputs,
  plan,
  farmerPriority,
  onChangeFarmerPriority,
  selectedStrategyId,
  onSelectStrategy,
  onGenerateAiPlan,
  generating,
  aiError,
}) => {
  const [inputsOpen, setInputsOpen] = useState(false);
  const [inspectionTab, setInspectionTab] = useState<InspectionTab>('calendar');
  const [expandedSeasonIdx, setExpandedSeasonIdx] = useState<number>(0);

  const evaluations = useMemo(
    () =>
      evaluateAndRankStrategies({
        strategies: plan.strategies,
        farm,
        soil,
        observations,
        scenario,
        inputs: farmInputs,
        priority: farmerPriority,
      }),
    [plan.strategies, farm, soil, observations, scenario, farmInputs, farmerPriority]
  );

  const topRankedId = useMemo(() => {
    const sorted = Object.values(evaluations).sort((a, b) => a.rank - b.rank);
    return sorted[0]?.strategyId || plan.recommendedStrategyId;
  }, [evaluations, plan.recommendedStrategyId]);

  const activeStrategy: RotationStrategy =
    plan.strategies.find((s) => s.id === selectedStrategyId) || plan.strategies[0];
  const activeEval = evaluations[activeStrategy.id];

  const activePriorityObj =
    PRIORITY_OPTIONS.find((p) => p.id === farmerPriority) || PRIORITY_OPTIONS[0];

  const effectivePh = farmInputs.soilTestOverrideEnabled
    ? farmInputs.customPhH2O
    : (soil?.phH2O ?? 6.8);
  const effectiveSoc = farmInputs.soilTestOverrideEnabled
    ? farmInputs.customOrganicCarbonGKg
    : (soil?.organicCarbonGKg ?? 7.0);

  // BarChart Data (Water Demand vs Net N)
  const barComparisonData = plan.strategies.map((s, idx) => ({
    label: s.categoryLabel ? s.categoryLabel.split('·')[0].trim() : `S${idx + 1}`,
    fullName: s.name,
    waterMm: s.totalWaterDemandMm,
    nitrogenKgHa: s.soilNitrogenDeltaKgHa,
    carbonTHaYr: s.carbonSequestrationTHaYr,
  }));

  // RadarChart Data (6 transparent physical axes across strategies)
  const radarAxesData = [
    {
      axis: 'Water Fit',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.waterEfficiency ?? 50])
      ),
    },
    {
      axis: 'N Cycling',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.nitrogenCycling ?? 50])
      ),
    },
    {
      axis: 'Soil Cover',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.soilProtection ?? 50])
      ),
    },
    {
      axis: 'Root Depth',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.rootDiversity ?? 50])
      ),
    },
    {
      axis: 'Pest Break',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.pestInterruption ?? 50])
      ),
    },
    {
      axis: 'Ops & Market',
      ...Object.fromEntries(
        plan.strategies.map((s) => [s.id, evaluations[s.id]?.radarAxes.operationalMarketFit ?? 50])
      ),
    },
  ];

  const activeSeason =
    activeStrategy.seasons[expandedSeasonIdx] || activeStrategy.seasons[0];

  return (
    <div className="space-y-5">
      {/* Header, Farm Constraint Summary, Priority Optimizer & Gemini Trigger */}
      <div className="mission-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Explainable AI Crop Rotation Intelligence Engine — <span className="text-cyan-300">{farm.name}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Synthesis: <span className="text-cyan-300 font-medium">{plan.model}</span> · Top Priority Match:{' '}
              <span className="text-emerald-300 font-medium">
                {plan.strategies.find((s) => s.id === topRankedId)?.name || activePriorityObj.label}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setInputsOpen((v) => !v)}
              className="flex items-center gap-2 px-3.5 py-2.5 min-h-[40px] rounded-lg bg-[#05080f] border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-400/70 transition-colors whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Farm Inputs &amp; Constraints</span>
              {inputsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onGenerateAiPlan}
              disabled={generating || !observations || !soil}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? 'Synthesizing 4 Strategies...' : 'Generate AI Rotation Plan'}</span>
            </button>
          </div>
        </div>

        {/* Active Farm Constraint Readout Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 bg-[#05080f] border border-slate-800/90 rounded-lg p-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Boundary Area</div>
            <div className="font-mono tabular-nums text-slate-200 mt-0.5">{farm.areaHectares} ha</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Existing Crops</div>
            <div
              className={`mt-0.5 truncate ${
                farmInputs.existingCropSequence ? 'text-slate-200' : 'text-amber-300 font-mono'
              }`}
              title={farmInputs.existingCropSequence || 'Needs farmer input'}
            >
              {farmInputs.existingCropSequence || 'Needs farmer input'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Irrigation</div>
            <div className="text-cyan-300 font-medium mt-0.5 capitalize">
              {farmInputs.irrigationAvailability.replace('-', ' ')}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Soil pH / SOC</div>
            <div className="font-mono tabular-nums text-emerald-300 mt-0.5">
              {effectivePh} · {effectiveSoc} g/kg
              {farmInputs.soilTestOverrideEnabled ? ' (Test)' : ' (ISRIC)'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Equipment</div>
            <div className="text-slate-200 mt-0.5 capitalize">
              {farmInputs.equipmentAvailability.replace(/-/g, ' ')}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Season / Market</div>
            <div className="text-slate-200 mt-0.5 truncate">
              {farmInputs.plantingSeason} · {farmInputs.marketPreference.split('-')[0]}
            </div>
          </div>
        </div>

        {/* Collapsible Farm-Specific Inputs & Soil Test Override Form */}
        {inputsOpen && (
          <div className="bg-[#05080f] border border-cyan-500/30 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <div className="text-xs font-semibold text-cyan-300">
                  Farm-Specific Agronomic Inputs &amp; Hard Constraints
                </div>
                <div className="text-[11px] text-slate-400">
                  Updates constraint checking and strategy rankings immediately; also sent to Gemini when synthesizing AI plans.
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Location: {farm.center.lat.toFixed(4)}°, {farm.center.lon.toFixed(4)}° · {farm.primarySoilType}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Existing Crop Sequence</span>
                <input
                  type="text"
                  value={farmInputs.existingCropSequence}
                  onChange={(e) =>
                    onChangeFarmInputs({ ...farmInputs, existingCropSequence: e.target.value })
                  }
                  placeholder="e.g. Finger Millet → Maize → Fallow"
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Irrigation Availability</span>
                <select
                  value={farmInputs.irrigationAvailability}
                  onChange={(e) =>
                    onChangeFarmInputs({
                      ...farmInputs,
                      irrigationAvailability: e.target.value as IrrigationAvailability,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="rainfed">Rainfed Only (Zero Supplemental Irrigation)</option>
                  <option value="protective-tank">Protective Tank / Pond (1–2 Critical Irrigations)</option>
                  <option value="borewell-drip">Borewell + Drip Fertigation</option>
                  <option value="canal-surface">Canal / Surface Command Supply</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Planting Season Focus</span>
                <select
                  value={farmInputs.plantingSeason}
                  onChange={(e) =>
                    onChangeFarmInputs({
                      ...farmInputs,
                      plantingSeason: e.target.value as PlantingSeasonFocus,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="Full Annual Cycle">Full Annual Cycle (Kharif + Rabi + Zaid)</option>
                  <option value="Kharif">Kharif Monsoon Primary (Jun–Oct)</option>
                  <option value="Rabi">Rabi Post-Monsoon Primary (Oct–Feb)</option>
                  <option value="Zaid / Summer">Zaid / Pre-Monsoon Cover Window (Feb–May)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Equipment Availability</span>
                <select
                  value={farmInputs.equipmentAvailability}
                  onChange={(e) =>
                    onChangeFarmInputs({
                      ...farmInputs,
                      equipmentAvailability: e.target.value as EquipmentAvailability,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="manual-bullock">Manual / Bullock-Drawn Implements</option>
                  <option value="shared-tractor">Shared Custom-Hiring Tractor &amp; Drill</option>
                  <option value="precision-drill-drip">Zero-Till Drill + Drip Fertigation Kit</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Market Preference</span>
                <select
                  value={farmInputs.marketPreference}
                  onChange={(e) =>
                    onChangeFarmInputs({
                      ...farmInputs,
                      marketPreference: e.target.value as MarketPreference,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="pulse-oilseed-value">Pulses, Millets &amp; Oilseed Mandi / FPO</option>
                  <option value="local-msp-mandi">Local Grain MSP / Cooperative Procurement</option>
                  <option value="fodder-mixed">Mixed Crop + Livestock Fodder Security</option>
                  <option value="commercial-horticulture">Commercial Urban Horticulture &amp; Cash Crops</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium block">Water Constraint Notes</span>
                <input
                  type="text"
                  value={farmInputs.waterConstraintNote}
                  onChange={(e) =>
                    onChangeFarmInputs({ ...farmInputs, waterConstraintNote: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            {/* Optional Lab Soil Test Override */}
            <div className="border-t border-slate-800 pt-3 space-y-2.5 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={farmInputs.soilTestOverrideEnabled}
                  onChange={(e) =>
                    onChangeFarmInputs({
                      ...farmInputs,
                      soilTestOverrideEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-slate-600 bg-[#0A101D] accent-emerald-500"
                />
                <span>Apply Field Soil Lab Test Results (overrides ISRIC SoilGrids baseline)</span>
              </label>

              {farmInputs.soilTestOverrideEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <label className="space-y-1">
                    <span className="text-slate-400 block">Lab Soil pH (H2O)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="4.2"
                      max="9.2"
                      value={farmInputs.customPhH2O}
                      onChange={(e) =>
                        onChangeFarmInputs({
                          ...farmInputs,
                          customPhH2O: parseFloat(e.target.value) || 6.8,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 font-mono text-slate-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-400 block">Organic Carbon (g/kg)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="45"
                      value={farmInputs.customOrganicCarbonGKg}
                      onChange={(e) =>
                        onChangeFarmInputs({
                          ...farmInputs,
                          customOrganicCarbonGKg: parseFloat(e.target.value) || 7.0,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 font-mono text-slate-100"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-400 block">Available Nitrogen Status</span>
                    <select
                      value={farmInputs.customNitrogenStatus}
                      onChange={(e) =>
                        onChangeFarmInputs({
                          ...farmInputs,
                          customNitrogenStatus: e.target.value as FarmRotationInputs['customNitrogenStatus'],
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-100"
                    >
                      <option value="Low">Low (&lt;280 kg/ha available N)</option>
                      <option value="Medium">Medium (280–560 kg/ha)</option>
                      <option value="Optimal">Optimal (&gt;560 kg/ha)</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6 Farmer Priority Optimization Buttons */}
        <div className="border-t border-slate-800/80 pt-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-200">
              Farmer Priority Optimization (Re-ranks all 4 strategies transparently)
            </span>
            <span className="font-mono text-[11px] text-cyan-300">{activePriorityObj.weightsLabel}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PRIORITY_OPTIONS.map((opt) => {
              const active = opt.id === farmerPriority;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeFarmerPriority(opt.id)}
                  className={`text-left px-3 py-2.5 min-h-[42px] rounded-lg border text-xs transition-colors ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-100'
                      : 'bg-[#05080f] border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{opt.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed border-t border-slate-800/80 pt-3">
          {plan.agroDiagnosis}
        </p>

        {aiError && (
          <div className="flex items-start gap-2.5 bg-rose-950/40 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Gemini Synthesis Notice:</span> {aiError}
            </div>
          </div>
        )}
      </div>

      {/* 4-Strategy Comparison Cards (Current Practice + 3 Alternatives) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {plan.strategies.map((strategy, idx) => {
          const ev = evaluations[strategy.id];
          const isSelected = strategy.id === activeStrategy.id;
          const isTopMatch = strategy.id === topRankedId;
          const suitability = ev?.effectiveSuitability ?? strategy.suitabilityRating;
          const coverPct = strategy.agronomicAnalysis?.soilCoverPct;

          return (
            <button
              key={strategy.id}
              type="button"
              onClick={() => {
                onSelectStrategy(strategy.id);
                setExpandedSeasonIdx(0);
              }}
              className={`text-left rounded-xl p-4 border transition-colors flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-[#0D1E38] border-[#32D9FF]/80 mission-glow-cyan'
                  : 'mission-panel hover:border-[#32D9FF]/40'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-slate-400">
                    Rank #{ev?.rank ?? idx + 1} ·{' '}
                    <span className={SUITABILITY_STYLE[suitability]}>
                      {suitability} Fit
                    </span>
                    {isTopMatch ? ' · Priority Match' : ''}
                  </span>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {strategy.categoryLabel || `Strategy 0${idx + 1}`}
                </div>
                <div className="text-sm font-semibold text-slate-100 leading-snug">{strategy.name}</div>
                <div className="text-[11px] text-cyan-300 font-medium">{strategy.focus}</div>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{strategy.summary}</p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
                <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] text-slate-400">4-Season Water</div>
                    <div className="text-sm font-semibold text-cyan-300">
                      {strategy.totalWaterDemandMm.toLocaleString()} mm
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Net Soil N Δ</div>
                    <div
                      className={`text-sm font-semibold ${
                        strategy.soilNitrogenDeltaKgHa >= 0 ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {strategy.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}
                      {strategy.soilNitrogenDeltaKgHa} kg/ha
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Carbon Gain (Est.)</div>
                    <div className="text-xs font-semibold text-amber-300">
                      +{strategy.carbonSequestrationTHaYr} t/ha/yr
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Living Cover (Est.)</div>
                    <div className="text-xs font-semibold text-emerald-300">
                      {coverPct !== undefined ? `${coverPct}%` : '—'}
                    </div>
                  </div>
                </div>

                {ev && (
                  <div
                    className={`text-[11px] pt-2 border-t border-slate-800/70 ${
                      ev.constraintsPassed ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {ev.constraintsPassed
                      ? 'Constraints Passed'
                      : `${ev.constraintFlags.length} Agronomic Constraint Alert`}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dual Visual Analytics: 6-Axis Agronomic Radar + Water/Nitrogen Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 mission-panel rounded-xl p-4 space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Multicriteria Agronomic Profile (Normalized Physical Indices)
            </h4>
            <p className="text-[11px] text-slate-400">
              Normalized from modeled water demand, N balance, cover %, root tiers, crop-family breaks &amp; farm constraints (0–100 scale, not guaranteed yields).
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarAxesData} outerRadius="72%">
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                {plan.strategies.map((s, idx) => {
                  const color = STRATEGY_COLORS[idx % STRATEGY_COLORS.length];
                  const isActive = s.id === activeStrategy.id;
                  return (
                    <Radar
                      key={s.id}
                      name={s.categoryLabel || s.name.split(' ').slice(0, 2).join(' ')}
                      dataKey={s.id}
                      stroke={color}
                      fill={color}
                      fillOpacity={isActive ? 0.25 : 0.06}
                      strokeWidth={isActive ? 2.4 : 1.3}
                    />
                  );
                })}
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#05080f',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 mission-panel rounded-xl p-4 flex flex-col justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-100 mb-1">
              4-Season Water Demand vs. Net Soil Nitrogen Δ
            </h4>
            <p className="text-[11px] text-slate-400 mb-3">
              Modeled seasonal ETc requirement (mm) vs. biological N balance (kg/ha) across all 4 strategies
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barComparisonData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                  <YAxis
                    yAxisId="water"
                    tick={{ fill: '#38bdf8', fontSize: 10 }}
                    label={{ value: 'mm', position: 'insideTopLeft', fill: '#38bdf8', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="nitrogen"
                    orientation="right"
                    tick={{ fill: '#34d399', fontSize: 10 }}
                    label={{ value: 'kg/ha', position: 'insideTopRight', fill: '#34d399', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#05080f',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar yAxisId="water" dataKey="waterMm" name="Water Demand (mm)" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  <Bar
                    yAxisId="nitrogen"
                    dataKey="nitrogenKgHa"
                    name="Net Soil N Δ (kg/ha)"
                    fill="#10b981"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {activeEval && (
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 text-xs flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-300 font-medium">{activeStrategy.name}</span>
              <span
                className={`font-mono ${
                  activeEval.constraintsPassed ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {activeEval.waterBudgetStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Deep Inspection Tabs: Calendar & Season Reasoning | Agronomic Comparison Matrix | Explainable AI Audit */}
      <div className="mission-panel rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">
              Deep Decision Inspection: {activeStrategy.name}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">{activeStrategy.waterBalanceNote}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setInspectionTab('calendar')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                inspectionTab === 'calendar'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#05080f] border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Rotation Calendar &amp; Sequence</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectionTab('matrix')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                inspectionTab === 'matrix'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#05080f] border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Agronomic Matrix (All 4)</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectionTab('explainability')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                inspectionTab === 'explainability'
                  ? 'bg-cyan-500/15 border-cyan-400/70 text-cyan-200'
                  : 'bg-[#05080f] border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              <Microscope className="w-3.5 h-3.5" />
              <span>Explainable AI &amp; Evidence</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Interactive 4-Season Calendar Strip + Detailed Table + Per-Season Explainability */}
        {inspectionTab === 'calendar' && (
          <div className="space-y-4">
            {/* Horizontal Visual Rotation Calendar Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {activeStrategy.seasons.map((season, i) => {
                const selected = i === expandedSeasonIdx;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setExpandedSeasonIdx(i)}
                    className={`text-left p-3 rounded-lg border transition-colors space-y-1.5 ${
                      selected
                        ? 'bg-emerald-500/12 border-emerald-400/70'
                        : 'bg-[#05080f] border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-cyan-300">{season.season}</span>
                      <span className="text-slate-400">{season.durationDays} d</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-100 leading-snug">{season.crop}</div>
                    <div className="text-[11px] text-slate-400">{season.plantingWindow}</div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums pt-1 border-t border-slate-800/80">
                      <span className="text-cyan-300">{season.waterNeedMm} mm</span>
                      <span className={season.nitrogenImpactKgHa >= 0 ? 'text-emerald-400' : 'text-amber-300'}>
                        N {season.nitrogenImpactKgHa >= 0 ? '+' : ''}
                        {season.nitrogenImpactKgHa} kg/ha
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Season Explainability Card */}
            {activeSeason && (
              <div className="bg-[#05080f] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Leaf className="w-4 h-4" />
                    <span>
                      Season Detail: {activeSeason.season} — {activeSeason.crop}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {activeSeason.botanicalOrRole} · {activeSeason.rootDepthClass || 'Multi-horizon'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="bg-[#0A101D] border border-slate-800/80 rounded-lg p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-cyan-300">Why This Crop Was Selected</div>
                    <p className="text-slate-300 leading-relaxed">
                      {activeSeason.whySelected || activeSeason.notes}
                    </p>
                  </div>
                  <div className="bg-[#0A101D] border border-slate-800/80 rounded-lg p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-300">
                      Environmental Evidence &amp; Soil Benefit
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {activeSeason.environmentalEvidence || 'Grounded in NASA POWER & soil profile baseline.'}{' '}
                      {activeSeason.soilBenefit || ''}
                    </p>
                  </div>
                  <div className="bg-[#0A101D] border border-slate-800/80 rounded-lg p-3 space-y-1">
                    <div className="text-[11px] font-semibold text-amber-300">
                      Equipment Need &amp; Seasonal Risk
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      <span className="text-slate-200 font-medium">Machinery:</span>{' '}
                      {activeSeason.equipmentNeed || 'Standard tractor/bullock planter'}.{' '}
                      <span className="text-amber-200">{activeSeason.riskNote || activeSeason.notes}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Full 4-Season Quantitative Schedule Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left py-2 pr-3 font-medium">Season &amp; Window</th>
                    <th className="text-left py-2 pr-3 font-medium">Crop &amp; Botanical Role</th>
                    <th className="text-left py-2 pr-3 font-medium">Root Zone &amp; Equipment</th>
                    <th className="text-right py-2 px-2 font-medium">Days</th>
                    <th className="text-right py-2 px-2 font-medium">Water</th>
                    <th className="text-right py-2 pl-2 font-medium">N Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStrategy.seasons.map((season, i) => (
                    <tr
                      key={i}
                      onClick={() => setExpandedSeasonIdx(i)}
                      className={`border-b border-slate-800/60 align-top cursor-pointer transition-colors ${
                        i === expandedSeasonIdx ? 'bg-cyan-500/8' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <div className="text-slate-200 font-medium">{season.season}</div>
                        <div className="text-[11px] font-mono text-cyan-300 mt-0.5">{season.plantingWindow}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-100">{season.crop}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          <span className="text-slate-300">{season.botanicalOrRole}</span> — {season.notes}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-slate-300">
                        <div>{season.rootDepthClass || 'Multi-horizon'}</div>
                        <div className="text-slate-400">{season.equipmentNeed || 'Standard implements'}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {season.durationDays} d
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-cyan-300 whitespace-nowrap">
                        {season.waterNeedMm} mm
                      </td>
                      <td
                        className={`py-2.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap ${
                          season.nitrogenImpactKgHa >= 0 ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        {season.nitrogenImpactKgHa >= 0 ? '+' : ''}
                        {season.nitrogenImpactKgHa} kg/ha
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Full Side-by-Side Agronomic Comparison Matrix */}
        {inspectionTab === 'matrix' && (
          <div className="space-y-3">
            <div className="text-[11px] text-slate-400">
              Provenance tags distinguish <span className="text-cyan-300">Modeled Estimates</span> (ETc mm, N fixation, carbon t/ha/yr) from{' '}
              <span className="text-emerald-300">Qualitative Agronomic Assessments</span> and{' '}
              <span className="text-amber-300">Hard Constraint Checks</span>.
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[780px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-300">
                    <th className="text-left py-2.5 pr-4 font-semibold w-48">Agronomic Dimension</th>
                    {plan.strategies.map((s) => (
                      <th key={s.id} className="text-left py-2.5 px-3 font-semibold">
                        <div className="text-slate-100">{s.categoryLabel || s.name}</div>
                        <div className="text-[11px] font-mono text-cyan-300 font-normal">
                          Rank #{evaluations[s.id]?.rank ?? '—'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 align-top">
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Water Demand (Modeled)</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-200">
                        <div className="font-mono text-cyan-300 font-semibold">{s.totalWaterDemandMm} mm</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {s.agronomicAnalysis?.waterRequirementNote || s.waterBalanceNote}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">N Fixation &amp; Net Δ (Modeled)</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-200">
                        <div className="font-mono text-emerald-300 font-semibold">
                          Gross +{s.agronomicAnalysis?.nitrogenFixationKgHa ?? 0} · Net {s.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}
                          {s.soilNitrogenDeltaKgHa} kg/ha
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {s.agronomicAnalysis?.nutrientCyclingNote || s.soilImprovementMechanism}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Organic Carbon &amp; Soil Cover</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-200">
                        <div className="font-mono text-amber-300">
                          +{s.carbonSequestrationTHaYr} t C/ha/yr · {s.agronomicAnalysis?.soilCoverPct ?? '—'}% cover
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {s.agronomicAnalysis?.organicMatterContribution || s.soilImprovementMechanism}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Erosion Protection (Qualitative)</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 font-medium text-slate-200">
                        {s.agronomicAnalysis?.erosionProtection || 'Moderate'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Root Depth Diversity</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-300 text-[11px]">
                        {s.agronomicAnalysis?.rootDepthDiversity || 'Mixed seasonal rooting'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Pest &amp; Disease Interruption</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-300 text-[11px]">
                        {s.agronomicAnalysis?.pestCycleInterruption || 'Multi-family crop sequence'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Season, Market &amp; Equipment Fit</td>
                    {plan.strategies.map((s) => (
                      <td key={s.id} className="py-2.5 px-3 text-slate-300 text-[11px] space-y-1">
                        <div>
                          <span className="text-slate-400">Season:</span>{' '}
                          {s.agronomicAnalysis?.growingSeasonSuitability || s.suitabilityRating}
                        </div>
                        <div>
                          <span className="text-slate-400">Market:</span>{' '}
                          {s.agronomicAnalysis?.marketSuitability || 'Regional mandi compatible'}
                        </div>
                        <div>
                          <span className="text-slate-400">Machinery:</span>{' '}
                          {s.agronomicAnalysis?.equipmentRequirements || 'Standard farm tools'}
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-slate-400 font-medium">Hard Constraint Audit</td>
                    {plan.strategies.map((s) => {
                      const ev = evaluations[s.id];
                      return (
                        <td key={s.id} className="py-2.5 px-3 text-[11px]">
                          {ev && ev.constraintFlags.length > 0 ? (
                            <ul className="space-y-1 text-amber-300 list-disc pl-3.5">
                              {ev.constraintFlags.map((flag, idx) => (
                                <li key={idx}>{flag}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-emerald-300">All water, pH &amp; equipment checks passed</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Explainable AI & Evidence Separation */}
        {inspectionTab === 'explainability' && (
          <div className="space-y-4">
            {/* Hard Constraint Warnings if any */}
            {activeEval && activeEval.constraintFlags.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-3.5 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span>Active Agronomic Constraint Flags for {activeStrategy.name}</span>
                </div>
                <ul className="text-xs text-amber-100/90 list-disc pl-5 space-y-1">
                  {activeEval.constraintFlags.map((flag, i) => (
                    <li key={i}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#05080f] border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Why This Strategy Was Designed / Ranked #{activeEval?.rank ?? '—'}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {activeStrategy.explainability?.whyRecommended || activeStrategy.summary}
                </p>

                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="font-semibold text-emerald-300">Soil &amp; Water Mechanism</div>
                  <p className="text-slate-300 leading-relaxed">{activeStrategy.soilImprovementMechanism}</p>
                </div>

                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Risks &amp; Climate Uncertainties</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {activeStrategy.risksAndUncertainties.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-[#05080f] border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <div className="font-semibold text-emerald-300 mb-1.5">
                    Measured Environmental Evidence (Observed Inputs)
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {(activeStrategy.explainability?.evidenceBasis || [
                      observations
                        ? `NASA POWER 90d: ${observations.summary.meanTempC}°C, ${observations.summary.totalPrecip90dMm} mm rain, ${observations.summary.meanRootSoilWetnessPct}% root wetness.`
                        : 'Regional NASA agro-climatology baseline.',
                      `Soil profile: pH ${effectivePh}, Organic Carbon ${effectiveSoc} g/kg (${soil?.textureClass || farm.primarySoilType}).`,
                    ]).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="font-semibold text-cyan-300 mb-1.5">
                    Modeling Assumptions (Estimates — Not Measured)
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {(activeStrategy.explainability?.modelingAssumptions || [
                      'Seasonal water needs represent modeled crop evapotranspiration (ETc) envelopes.',
                      'Biological nitrogen and carbon accrual depend on rhizobial nodulation and residue retention.',
                    ]).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5 mb-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Additional Farm Data / Lab Tests Needed Before Execution</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    {(activeStrategy.explainability?.additionalInfoRequired || [
                      'Site soil NPK + micronutrient lab test (Zn, B, Fe) prior to sowing.',
                      'Confirm irrigation pump discharge or tank storage before summer cover crop.',
                    ]).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

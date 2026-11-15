import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Play,
  Sparkles,
  FileText,
  CloudRain,
} from 'lucide-react';
import { ActiveWorkspace, ClimateScenario, FarmParcel } from '../types/fieldShift';
import { CLIMATE_PRESETS } from '../utils/geoAndAgronomy';
import { DEMONSTRATION_FARMS } from '../data/farms';

export interface DemoStepConfig {
  stepNumber: number;
  code: string;
  title: string;
  workspace: ActiveWorkspace;
  summary: string;
  actionLabel?: string;
}

export const MISSION_DEMO_STEPS: DemoStepConfig[] = [
  {
    stepNumber: 1,
    code: 'STEP 1 — EXPLORE EARTH',
    title: 'Interactive 3D Earth & Global Agricultural Context',
    workspace: 'earth',
    summary:
      'Orbit the CesiumJS 3D globe overlaid with NASA GIBS MODIS, SMAP, and GPM layers and inspect Karnataka demonstration farm markers.',
  },
  {
    stepNumber: 2,
    code: 'STEP 2 — SELECT A FARM',
    title: 'Select Karnataka Demonstration Farm Parcel',
    workspace: 'command',
    summary:
      'Focus on Dharwad Transitional Tract or Mandya Cauvery Basin to load parcel geometry, baseline crops, and soil profile.',
    actionLabel: 'Select Dharwad Parcel',
  },
  {
    stepNumber: 3,
    code: 'STEP 3 — INSPECT SATELLITE IMAGERY',
    title: 'High-Resolution Esri & 10 m Copernicus Sentinel-2',
    workspace: 'operations',
    summary:
      'Inspect crisp Esri World Imagery boundaries, Copernicus Sentinel-2 L2A scenes & NDVI overlays, or draw/edit a custom field polygon.',
  },
  {
    stepNumber: 4,
    code: 'STEP 4 — ANALYZE NASA DATA',
    title: 'Live NASA POWER Meteorology & Vegetation Analysis',
    workspace: 'satellite',
    summary:
      'Examine 90-day NASA POWER air temperature, rainfall, root-zone soil wetness, solar irradiance, and 7-day Open-Meteo forecasts.',
  },
  {
    stepNumber: 5,
    code: 'STEP 5 — IDENTIFY VULNERABILITIES',
    title: 'Soil Profile, Missing Lab Tests & Drought Exposure',
    workspace: 'command',
    summary:
      'Review ISRIC SoilGrids horizons, organic carbon baseline, soil sampling gaps (NPK lab tests), and seasonal moisture vulnerability.',
  },
  {
    stepNumber: 6,
    code: 'STEP 6 — GENERATE ROTATION STRATEGIES',
    title: 'Explainable AI 4-Strategy Rotation Synthesis',
    workspace: 'rotation-lab',
    summary:
      'Compare Current Practice against Climate-Resilient, Soil-Regenerative, and Commercial Diversification rotations constrained by water, pH, and machinery.',
    actionLabel: 'Run Gemini Rotation Synthesis',
  },
  {
    stepNumber: 7,
    code: 'STEP 7 — COMPARE STRATEGIES',
    title: 'Multicriteria Radar, Agronomic Matrix & Evidence Audit',
    workspace: 'rotation-lab',
    summary:
      'Inspect the 6-axis Radar chart, 4-season calendar, nitrogen/water balance, and clear separation between observed evidence and modeling assumptions.',
  },
  {
    stepNumber: 8,
    code: 'STEP 8 — EXPLORE THE 3D FARM',
    title: 'Interactive Three.js 3D Agricultural Digital Twin',
    workspace: 'digital-twin',
    summary:
      'Inspect individual crop rows, subsurface topsoil/subsoil root cutaway, water infiltration, and seasonal growth progression in 3D.',
  },
  {
    stepNumber: 9,
    code: 'STEP 9 — TEST CLIMATE SCENARIOS',
    title: 'Simulate Reduced Monsoon & Heat Stress Perturbations',
    workspace: 'climate-sim',
    summary:
      'Apply a hypothetical -28% monsoon rainfall + warming scenario to observe real-time shifts in ET₀, water balance, rotation suitability, and 3D canopy stress.',
    actionLabel: 'Apply Reduced Monsoon Scenario',
  },
  {
    stepNumber: 10,
    code: 'STEP 10 — GENERATE ADVISORY',
    title: 'Export Multi-Format Farm Advisory (PDF / CSV / JSON / HTML)',
    workspace: 'command',
    summary:
      'Open the Farm Resilience Advisory export modal to download a comprehensive PDF, CSV telemetry table, JSON bundle, or printable HTML brief.',
    actionLabel: 'Open Advisory Export',
  },
];

interface GuidedMissionDemoProps {
  active: boolean;
  stepIndex: number; // 0..9
  onSelectStep: (idx: number) => void;
  onClose: () => void;
  onSelectFarm: (farm: FarmParcel) => void;
  onGenerateAiRotation: () => void;
  onChangeScenario: (sc: ClimateScenario) => void;
  onOpenReportModal: () => void;
  generatingAi: boolean;
}

export const GuidedMissionDemo: React.FC<GuidedMissionDemoProps> = ({
  active,
  stepIndex,
  onSelectStep,
  onClose,
  onSelectFarm,
  onGenerateAiRotation,
  onChangeScenario,
  onOpenReportModal,
  generatingAi,
}) => {
  if (!active) return null;

  const step = MISSION_DEMO_STEPS[stepIndex] || MISSION_DEMO_STEPS[0];
  const progressPct = Math.round(((stepIndex + 1) / MISSION_DEMO_STEPS.length) * 100);

  const handleStepAction = () => {
    if (step.stepNumber === 2) {
      const pick = DEMONSTRATION_FARMS[1] || DEMONSTRATION_FARMS[0];
      if (pick) onSelectFarm(pick);
    } else if (step.stepNumber === 6) {
      onGenerateAiRotation();
    } else if (step.stepNumber === 9) {
      const reduced = CLIMATE_PRESETS.find((c) => c.presetId === 'reduced-monsoon') || CLIMATE_PRESETS[1];
      onChangeScenario(reduced);
    } else if (step.stepNumber === 10) {
      onOpenReportModal();
    }
  };

  return (
    <div className="sticky top-14 z-30 bg-[#091426]/95 backdrop-blur-md border-b border-[#32D9FF]/35 px-4 lg:px-6 py-3 no-print">
      <div className="max-w-[1440px] mx-auto space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-emerald-300 whitespace-nowrap">
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>FIELD SHIFT — MISSION DEMONSTRATION</span>
            </span>
            <span className="text-xs font-mono text-cyan-300 whitespace-nowrap">
              Step {step.stepNumber} / {MISSION_DEMO_STEPS.length} ({progressPct}%)
            </span>
            <span className="hidden md:inline text-xs font-semibold text-slate-100 truncate">
              {step.code}: {step.title}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {step.actionLabel && (
              <button
                type="button"
                disabled={step.stepNumber === 6 && generatingAi}
                onClick={handleStepAction}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-60 whitespace-nowrap"
              >
                {step.stepNumber === 6 ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : step.stepNumber === 9 ? (
                  <CloudRain className="w-3.5 h-3.5" />
                ) : step.stepNumber === 10 ? (
                  <FileText className="w-3.5 h-3.5" />
                ) : null}
                <span>
                  {step.stepNumber === 6 && generatingAi ? 'Synthesizing...' : step.actionLabel}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={stepIndex === 0}
              onClick={() => onSelectStep(Math.max(0, stepIndex - 1))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-cyan-400 disabled:opacity-40 whitespace-nowrap"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              type="button"
              disabled={stepIndex === MISSION_DEMO_STEPS.length - 1}
              onClick={() => onSelectStep(Math.min(MISSION_DEMO_STEPS.length - 1, stepIndex + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 disabled:opacity-40 whitespace-nowrap"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onSelectStep(0)}
              title="Restart Demo"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:text-white whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Restart</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Exit Mission Demo"
              className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-slate-300 leading-snug">{step.summary}</p>
          {/* Step Jump Strip */}
          <div className="flex items-center gap-1 overflow-x-auto shrink-0">
            {MISSION_DEMO_STEPS.map((s, idx) => (
              <button
                key={s.stepNumber}
                type="button"
                onClick={() => onSelectStep(idx)}
                title={`${s.code}: ${s.title}`}
                className={`w-6 h-6 rounded text-[10px] font-mono font-semibold border transition-colors shrink-0 ${
                  idx === stepIndex
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : idx < stepIndex
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-[#05080f] text-slate-400 border-slate-800 hover:border-slate-600'
                }`}
              >
                {s.stepNumber}
              </button>
            ))}
          </div>
        </div>

        {/* Thin Progress Bar */}
        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

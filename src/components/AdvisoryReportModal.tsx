import React from 'react';
import { X, Download, FileJson, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import {
  AdvisoryReportPayload,
  downloadCsvAdvisory,
  downloadHtmlAdvisory,
  downloadJsonAdvisory,
  downloadPdfAdvisory,
} from '../utils/reportExport';

interface AdvisoryReportModalProps {
  open: boolean;
  onClose: () => void;
  payload: AdvisoryReportPayload;
}

export const AdvisoryReportModal: React.FC<AdvisoryReportModalProps> = ({ open, onClose, payload }) => {
  if (!open) return null;

  const { farm, observations, soil, scenario, impact, rotationPlan, selectedStrategyId, sentinel2Catalog } = payload;
  const strategy =
    rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const latestS2 = sentinel2Catalog?.scenes?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-[#0A101D]/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#070b14]/95 backdrop-blur-md border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Farm Resilience Advisory &amp; Multi-Format Export
            </h2>
            <p className="text-xs text-slate-400">
              {farm.name} · {farm.region} · {farm.areaHectares} ha · {rotationPlan.strategies.length} Strategies
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">NASA 90d Rain (Obs.)</div>
              <div className="text-base font-mono tabular-nums font-semibold text-cyan-300 mt-1">
                {observations?.summary.totalPrecip90dMm ?? 'N/A'} mm
              </div>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">Sentinel-2 L2A (10m)</div>
              <div className="text-sm font-mono font-semibold text-emerald-300 mt-1">
                {latestS2 ? latestS2.date : 'Basemap mosaic'}
              </div>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">Soil Texture / pH</div>
              <div className="text-sm font-semibold text-slate-100 mt-1 truncate">
                {soil?.textureClass || farm.primarySoilType} · pH {soil?.phH2O ?? '—'}
              </div>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3">
              <div className="text-slate-400">Scenario Water Balance</div>
              <div
                className={`text-base font-mono tabular-nums font-semibold mt-1 ${
                  impact.seasonalWaterBalanceMm >= 0 ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {impact.seasonalWaterBalanceMm} mm
              </div>
            </div>
          </div>

          {/* Selected Strategy Preview */}
          <div className="bg-[#05080f] border border-slate-800 rounded-lg p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-sm text-slate-100">
                Selected Strategy: {strategy.name}
              </span>
              <span className="font-mono text-[11px] text-cyan-300">
                {rotationPlan.model} · {strategy.suitabilityRating} · {strategy.totalWaterDemandMm.toLocaleString()} mm
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{rotationPlan.agroDiagnosis}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {strategy.seasons.map((s, idx) => (
                <div key={idx} className="border border-slate-800/80 rounded-lg p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{s.season}</span>
                    <span className="font-mono text-cyan-300">{s.plantingWindow}</span>
                  </div>
                  <div className="font-semibold text-emerald-300 mt-0.5">{s.crop}</div>
                  <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                    {s.durationDays} d · {s.waterNeedMm} mm · N {s.nitrogenImpactKgHa >= 0 ? '+' : ''}
                    {s.nitrogenImpactKgHa} kg/ha
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-800/80 text-amber-300/90">
              <span className="font-semibold">Missing Soil Lab Info:</span> Available NPK (kg/ha), Zn/B micronutrients &amp; site infiltration rate require physical lab sampling.
            </div>
          </div>

          {/* Data Provenance Statement */}
          <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-3 leading-relaxed">
            Data Provenance: Meteorology from{' '}
            {observations?.sourceStatus.nasaPower === 'live'
              ? `NASA POWER L2 Historical (${powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}, ${powerMeta.validDays} valid days` : 'Live'})`
              : 'Climatological Fallback'}
            ; Satellite catalog: {latestS2 ? `Sentinel-2 L2A (${latestS2.date})` : 'Esri Mosaic'}; Soil from{' '}
            {soil?.source || 'Regional Baseline'}; Scenario ({scenario.label}) is a hypothetical sensitivity test; Rotation synthesis by {rotationPlan.model}.
          </div>
        </div>

        {/* Download Actions: PDF, CSV, JSON, HTML, Print */}
        <div className="px-5 py-4 bg-[#070b14] border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>
          <button
            type="button"
            onClick={() => downloadCsvAdvisory(payload)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download CSV</span>
          </button>
          <button
            type="button"
            onClick={() => downloadJsonAdvisory(payload)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <FileJson className="w-3.5 h-3.5 text-cyan-400" />
            <span>Download JSON</span>
          </button>
          <button
            type="button"
            onClick={() => downloadHtmlAdvisory(payload)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-slate-700 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-amber-300" />
            <span>Download HTML</span>
          </button>
          <button
            type="button"
            onClick={() => downloadPdfAdvisory(payload)}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[38px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};

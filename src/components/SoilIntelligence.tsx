import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Layers, FlaskConical, Droplet } from 'lucide-react';
import { SoilProfile } from '../types/fieldShift';

interface SoilIntelligenceProps {
  soil: SoilProfile | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const SoilIntelligence: React.FC<SoilIntelligenceProps> = ({
  soil,
  loading,
  error = null,
  onRetry,
}) => {
  if (loading && !soil) {
    return (
      <div className="bg-[#0A101D]/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="text-xs font-mono text-cyan-300">Querying ISRIC SoilGrids v2.0 250m Depth Horizons...</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-44 bg-[#05080f] border border-slate-800/80 rounded-lg" />
          <div className="h-44 bg-[#05080f] border border-slate-800/80 rounded-lg" />
          <div className="h-44 bg-[#05080f] border border-slate-800/80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!soil) {
    return (
      <div className="bg-[#0A101D] border border-rose-500/40 rounded-xl p-5 flex items-center justify-between gap-4 text-xs">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            {error ? 'Unable to retrieve soil dataset' : 'Soil profile not yet available for this parcel'}
          </p>
          <p className="text-slate-400 mt-0.5">
            {error || 'Click Retry to re-query ISRIC SoilGrids v2.0 for this farm centroid.'}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 shrink-0"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const textureData = [
    { name: 'Sand', value: soil.sandPct, color: '#f59e0b' },
    { name: 'Silt', value: soil.siltPct, color: '#06b6d4' },
    { name: 'Clay', value: soil.clayPct, color: '#10b981' },
  ];

  const phCategory =
    soil.phH2O < 5.8 ? 'Acidic' : soil.phH2O > 7.6 ? 'Alkaline' : 'Near-Neutral (Optimal)';

  const isMeasured = soil.source.includes('ISRIC SoilGrids');

  return (
    <div className="mission-panel rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#32D9FF]/15 pb-3">
        <div>
          <h3 className="text-base font-semibold text-slate-100">Soil Intelligence Profile</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            USDA Class: <span className="text-slate-200 font-medium">{soil.textureClass}</span> · Source:{' '}
            <span className={isMeasured ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'}>
              {soil.source}
            </span>
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-emerald-300">
          Water Holding Capacity: {soil.waterHoldingCapacityMmM} mm/m
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Texture Breakdown */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Particle Size Composition (0–5 cm)</span>
          </div>

          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={textureData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fill: '#e2e8f0', fontSize: 11 }} width={46} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#05080f',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" name="Fraction (%)" radius={[0, 4, 4, 0]}>
                  {textureData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Center: Chemical & Physical Telemetry */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <FlaskConical className="w-4 h-4 text-cyan-400" />
            <span>Soil Chemistry &amp; Carbon Reservoir</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Soil pH (H₂O)</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-slate-100 mt-1">{soil.phH2O}</div>
              <div className="text-[11px] text-cyan-300 mt-0.5">{phCategory}</div>
            </div>

            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Organic Carbon</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-emerald-300 mt-1">
                {soil.organicCarbonGKg}
                <span className="text-xs text-slate-400 ml-1">g/kg</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">SOC Baseline</div>
            </div>

            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">Total Nitrogen</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-slate-100 mt-1">
                {soil.nitrogenGKg}
                <span className="text-xs text-slate-400 ml-1">g/kg</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Bulk {soil.bulkDensityKgDm3} kg/dm³</div>
            </div>

            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-3">
              <div className="text-[11px] text-slate-400">CEC Capacity</div>
              <div className="text-xl font-mono tabular-nums font-semibold text-slate-100 mt-1">
                {soil.cecCmolKg}
                <span className="text-xs text-slate-400 ml-1">cmol/kg</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Nutrient Retention</div>
            </div>
          </div>
        </div>

        {/* Right: Multi-Depth Horizon Table & Amendments */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Droplet className="w-4 h-4 text-emerald-400" />
            <span>Root-Zone Horizon Stratification</span>
          </div>

          <table className="w-full text-xs font-mono tabular-nums border-collapse">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left py-1.5 font-medium">Horizon</th>
                <th className="text-right py-1.5 font-medium">Est. Moist.</th>
                <th className="text-right py-1.5 font-medium">SOC (g/kg)</th>
                <th className="text-right py-1.5 font-medium">pH</th>
              </tr>
            </thead>
            <tbody>
              {soil.depthLayers.map((layer) => (
                <tr key={layer.depth} className="border-b border-slate-800/60 text-slate-200">
                  <td className="py-1.5">{layer.depth}</td>
                  <td className="text-right py-1.5 text-cyan-300">{layer.moisturePct}%</td>
                  <td className="text-right py-1.5 text-emerald-300">{layer.organicCarbonGKg}</td>
                  <td className="text-right py-1.5">{layer.ph}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-medium text-slate-300">Soil Management Guidance</div>
            <ul className="space-y-1 text-xs text-slate-400 list-disc pl-4">
              {soil.amendmentNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

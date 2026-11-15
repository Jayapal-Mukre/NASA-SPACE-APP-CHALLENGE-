import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CloudRain, Thermometer, Droplets, Sun, Sprout, AlertTriangle } from 'lucide-react';
import { NasaObservationBundle } from '../types/fieldShift';

interface ObservationDashboardProps {
  observations: NasaObservationBundle | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const ObservationDashboard: React.FC<ObservationDashboardProps> = ({
  observations,
  loading,
  error,
  onRetry,
}) => {
  const [windowDays, setWindowDays] = useState<30 | 90>(90);

  if (loading && !observations) {
    return (
      <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-6 space-y-4">
        <div className="text-xs font-mono text-cyan-300">Synchronizing NASA POWER L2 Daily &amp; Open-Meteo Telemetry...</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-[#05080f] border border-slate-800/80 rounded-lg" />
          ))}
        </div>
        <div className="h-72 bg-[#05080f] border border-slate-800/80 rounded-lg" />
      </div>
    );
  }

  if (error && !observations) {
    return (
      <div className="bg-[#0A101D] border border-rose-500/40 rounded-xl p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-100">Observation Telemetry Error</p>
            <p className="text-xs text-slate-400 mt-0.5">{error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-3.5 py-2 min-h-[38px] rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 whitespace-nowrap shrink-0"
        >
          Retry Sync
        </button>
      </div>
    );
  }

  if (!observations) {
    return (
      <div className="bg-[#0A101D] border border-amber-500/40 rounded-xl p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">Observation Dataset Unavailable</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Select a valid parcel boundary or click Retry to acquire NASA POWER and Open-Meteo telemetry.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-3.5 py-2 min-h-[38px] rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 whitespace-nowrap shrink-0"
        >
          Retry Sync
        </button>
      </div>
    );
  }

  const dailySlice = observations.dailySeries.slice(-windowDays);
  const isNasaLive = observations.sourceStatus.nasaPower === 'live';
  const isOpenMeteoLive = observations.sourceStatus.openMeteo === 'live';
  const powerMeta = observations.sourceStatus.nasaPowerMeta;

  return (
    <div className="space-y-5">
      {/* Header & Provenance Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 mission-panel rounded-xl px-4 py-3.5">
        <div className="space-y-0.5">
          <h3 className="text-base font-semibold text-slate-100">
            NASA Earth Observation &amp; Agro-Hydrology Analysis
          </h3>
          <p className="text-xs text-slate-400">
            {isNasaLive ? (
              <>
                <span className="text-emerald-300 font-medium">Observed Historical:</span>{' '}
                {powerMeta ? `${powerMeta.product} (${powerMeta.startDate} to ${powerMeta.endDate}, ${powerMeta.validDays} valid days` : 'NASA POWER L2 Daily'}
                {powerMeta && powerMeta.missingFillPoints > 0 ? `, ${powerMeta.missingFillPoints} gap-fills` : ''}
                {powerMeta ? ')' : ''} ·{' '}
              </>
            ) : (
              <span className="text-amber-300">
                Fallback Baseline: {observations.sourceStatus.message || 'Climatological approximation'} ·{' '}
              </span>
            )}
            <span className={isOpenMeteoLive ? 'text-cyan-300' : 'text-amber-300'}>
              {isOpenMeteoLive ? 'Forecast: Open-Meteo 7-Day Live' : 'Forecast: Baseline Projection'}
            </span>
            {' · '}
            <span className="text-slate-300">NDVI &amp; ET0: Hydro-Thermal Modeled Estimate</span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#05080f] border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setWindowDays(30)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              windowDays === 30 ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => setWindowDays(90)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              windowDays === 90 ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Mean Temp</span>
            <Thermometer className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-slate-100">
            {observations.summary.meanTempC}
            <span className="text-xs text-slate-400 ml-1">°C</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
            {observations.summary.minTempC}° – {observations.summary.maxTempC}° · {isNasaLive ? 'NASA Obs' : 'Est'}
          </div>
        </div>

        <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>90d Rainfall</span>
            <CloudRain className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-slate-100">
            {observations.summary.totalPrecip90dMm}
            <span className="text-xs text-slate-400 ml-1">mm</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
            Aridity {observations.summary.aridityIndex} · {isNasaLive ? 'NASA Obs' : 'Est'}
          </div>
        </div>

        <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Root Soil Wetness</span>
            <Droplets className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-slate-100">
            {observations.summary.meanRootSoilWetnessPct}
            <span className="text-xs text-slate-400 ml-1">%</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
            Topsoil {observations.summary.meanSurfaceSoilWetnessPct}% · {isNasaLive ? 'NASA Obs' : 'Est'}
          </div>
        </div>

        <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Solar Irradiance</span>
            <Sun className="w-4 h-4 text-amber-300" />
          </div>
          <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-slate-100">
            {observations.summary.meanSolarMj}
            <span className="text-xs text-slate-400 ml-1">MJ/m²</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-400">
            RH {observations.summary.meanHumidityPct}% · {isNasaLive ? 'NASA Obs' : 'Est'}
          </div>
        </div>

        <div className="bg-[#091426] border border-[#32D9FF]/15 rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Canopy Vigor (NDVI)</span>
            <Sprout className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-mono tabular-nums font-semibold text-emerald-300">
            {observations.summary.estimatedNdvi}
            <span className="text-xs text-slate-400 ml-1">idx</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Modeled Estimate (Hydro-Thermal)
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Rainfall & Root-Zone Soil Wetness */}
        <div className="mission-panel rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Rainfall &amp; Soil Moisture Coupling ({windowDays}d)
              </h4>
              <p className="text-[11px] text-slate-400">
                Daily PRECTOTCORR (mm) vs Surface &amp; Root-Zone Soil Wetness (%) · NASA POWER Observed
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailySlice} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  minTickGap={22}
                />
                <YAxis
                  yAxisId="rain"
                  tick={{ fill: '#38bdf8', fontSize: 10 }}
                  label={{ value: 'mm', position: 'insideTopLeft', fill: '#38bdf8', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="wet"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: '#34d399', fontSize: 10 }}
                  unit="%"
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
                <Bar yAxisId="rain" dataKey="precipMm" name="Rainfall (mm)" fill="#06b6d4" radius={[2, 2, 0, 0]} />
                <Line
                  yAxisId="wet"
                  type="monotone"
                  dataKey="soilWetnessRootPct"
                  name="Root Soil Wetness (%)"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="wet"
                  type="monotone"
                  dataKey="soilWetnessTopPct"
                  name="Surface Wetness (%)"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Thermal Envelope & Solar / Vegetation Vigor */}
        <div className="mission-panel rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">
                Thermal Range &amp; Reference Evapotranspiration ({windowDays}d)
              </h4>
              <p className="text-[11px] text-slate-400">
                T2M Max/Min (°C, NASA POWER) &amp; Modeled FAO-56 ET0 (mm/day)
              </p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailySlice} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  minTickGap={22}
                />
                <YAxis yAxisId="temp" tick={{ fill: '#fbbf24', fontSize: 10 }} unit="°" />
                <YAxis
                  yAxisId="et"
                  orientation="right"
                  domain={[0, 10]}
                  tick={{ fill: '#f43f5e', fontSize: 10 }}
                  label={{ value: 'mm/d', position: 'insideTopRight', fill: '#f43f5e', fontSize: 10 }}
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
                <Area
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMaxC"
                  name="Max Temp (°C)"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.14}
                  strokeWidth={1.8}
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="tempMinC"
                  name="Min Temp (°C)"
                  stroke="#38bdf8"
                  strokeWidth={1.6}
                  dot={false}
                />
                <Line
                  yAxisId="et"
                  type="monotone"
                  dataKey="estimatedEt0Mm"
                  name="Modeled ET0 (mm/d)"
                  stroke="#f43f5e"
                  strokeWidth={1.6}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 12-Month Climatology */}
        <div className="mission-panel rounded-xl p-4">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-slate-100">Annual Monsoon &amp; Thermal Climatology</h4>
            <p className="text-[11px] text-slate-400">
              Long-term monthly precipitation (mm) and temperature (°C) · NASA POWER Historical Climatology
            </p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={observations.monthlyClimatology} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis yAxisId="p" tick={{ fill: '#38bdf8', fontSize: 10 }} />
                <YAxis yAxisId="t" orientation="right" tick={{ fill: '#fbbf24', fontSize: 10 }} unit="°" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#05080f',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="p" dataKey="precipMm" name="Monthly Rain (mm)" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="t"
                  type="monotone"
                  dataKey="tempC"
                  name="Mean Temp (°C)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vegetation Vigor & 7-Day Multi-Depth Soil Forecast */}
        <div className="mission-panel rounded-xl p-4">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-slate-100">
              Modeled Vegetation Vigor &amp; 7-Day Root Forecast
            </h4>
            <p className="text-[11px] text-slate-400">
              Modeled NDVI proxy (hydro-thermal) + Open-Meteo 7-day live land surface forecast
            </p>
          </div>
          <div className="h-32 w-full mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailySlice} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  minTickGap={24}
                />
                <YAxis domain={[0, 1]} tick={{ fill: '#34d399', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#05080f',
                    borderColor: '#334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="estimatedNdvi"
                  name="Modeled NDVI Proxy"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-1.5 font-medium">Date (7d Forecast)</th>
                  <th className="text-right py-1.5 font-medium">Min/Max</th>
                  <th className="text-right py-1.5 font-medium">Rain</th>
                  <th className="text-right py-1.5 font-medium">SM 0–1cm</th>
                  <th className="text-right py-1.5 font-medium">SM 9–27cm</th>
                </tr>
              </thead>
              <tbody>
                {observations.forecast7d.slice(0, 5).map((f) => (
                  <tr key={f.date} className="border-b border-slate-800/50 text-slate-200">
                    <td className="py-1">{f.date}</td>
                    <td className="text-right py-1">
                      {f.tempMinC}° / {f.tempMaxC}°C
                    </td>
                    <td className="text-right py-1 text-cyan-300">{f.precipMm} mm</td>
                    <td className="text-right py-1">{f.soilMoisture0to1cm}%</td>
                    <td className="text-right py-1 text-emerald-300">{f.soilMoisture9to27cm}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

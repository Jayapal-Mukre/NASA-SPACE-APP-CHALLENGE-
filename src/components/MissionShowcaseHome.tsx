import React from 'react';
import {
  Globe,
  Play,
  MapPin,
  Satellite,
  CloudRain,
  Sprout,
  Box,
  Bot,
  ShieldAlert,
  ArrowRight,
  Compass,
  Film,
  Layers,
  LayoutDashboard,
} from 'lucide-react';
import {
  ActiveWorkspace,
  AreaUnit,
  ClimateScenario,
  FarmParcel,
  NasaObservationBundle,
  RotationPlanResponse,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import { SimulatedImpactMetrics, hectaresToAcres } from '../utils/geoAndAgronomy';
import { HeroEarthCanvas } from './HeroEarthCanvas';
import { DemoWalkthroughPlayer } from './DemoWalkthroughPlayer';

interface MissionShowcaseHomeProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  onSelectFarm: (farm: FarmParcel) => void;
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  rotationPlan: RotationPlanResponse;
  onLaunchMissionDemo: () => void;
  onOpenDemoPage: () => void;
  onNavigate: (ws: ActiveWorkspace) => void;
  areaUnit?: AreaUnit;
  reducedMotion?: boolean;
  defaultNarrationVolume?: number;
  defaultMusicVolume?: number;
}

export const MissionShowcaseHome: React.FC<MissionShowcaseHomeProps> = ({
  farms,
  activeFarm,
  onSelectFarm,
  observations,
  soil,
  sentinel2Catalog,
  scenario,
  impact,
  rotationPlan,
  onLaunchMissionDemo,
  onOpenDemoPage,
  onNavigate,
  areaUnit = 'ha',
  reducedMotion = false,
  defaultNarrationVolume = 0.92,
  defaultMusicVolume = 0.24,
}) => {
  const topStrategy =
    rotationPlan.strategies.find((s) => s.id === rotationPlan.recommendedStrategyId) ||
    rotationPlan.strategies[0];
  const latestS2 = sentinel2Catalog?.scenes?.[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;

  const formatArea = (ha: number) =>
    areaUnit === 'acres' ? `${hectaresToAcres(ha)} ac` : `${ha} ha`;

  return (
    <div className="space-y-6">
      {/* FULL-SCREEN CINEMATIC 3D EARTH HOMEPAGE HERO */}
      <section className="relative min-h-[620px] lg:min-h-[680px] rounded-2xl border border-[#32D9FF]/20 overflow-hidden bg-[#050914] flex flex-col justify-between mission-glow-cyan">
        {/* Live Interactive CesiumJS 3D Earth Background */}
        <HeroEarthCanvas
          farms={farms}
          activeFarm={activeFarm}
          onSelectFarm={onSelectFarm}
          reducedMotion={reducedMotion}
        />

        {/* Atmospheric Gradient Scrims so hero copy retains >= 4.5:1 contrast */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050914]/92 via-[#050914]/62 to-[#050914]/35" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050914] via-[#050914]/80 to-transparent" />

        {/* Foreground Mission Control HUD Overlay */}
        <div className="relative z-10 p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1">
          {/* Left Hero Copy & Mission CTAs */}
          <div className="lg:col-span-7 space-y-5">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#32D9FF]">
              2026 NASA Space Apps Challenge · Earth Observation Mission Control
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-wider text-[#F4F8FF] leading-[1.02]">
                FIELD SHIFT
              </h1>
              <div className="font-display text-sm sm:text-lg font-semibold tracking-[0.14em] uppercase text-[#52E3A4]">
                Earth Intelligence for Resilient Farming
              </div>
            </div>

            <p className="text-sm sm:text-base text-[#F4F8FF]/85 leading-relaxed max-w-xl">
              Explore our planet. Understand changing conditions. Build more resilient farms. Turning Earth&apos;s data into smarter farming decisions across 3D terrain, high-resolution satellite boundaries, climate stress simulation, and AI crop rotation synthesis.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('operations')}
                className="flex items-center gap-2 px-5 py-3 min-h-[46px] rounded-xl bg-[#1769FF] text-[#F4F8FF] text-xs sm:text-sm font-bold tracking-wide hover:bg-[#32D9FF] hover:text-[#050914] transition-colors whitespace-nowrap shrink-0 shadow-lg shadow-[#1769FF]/30"
              >
                <Compass className="w-4 h-4" />
                <span>ENTER MISSION CONTROL</span>
              </button>

              <button
                type="button"
                onClick={onOpenDemoPage}
                className="flex items-center gap-2 px-5 py-3 min-h-[46px] rounded-xl bg-[#52E3A4] text-[#050914] text-xs sm:text-sm font-bold tracking-wide hover:bg-[#52E3A4]/90 transition-colors whitespace-nowrap shrink-0"
              >
                <Film className="w-4 h-4" />
                <span>WATCH MISSION BRIEFING</span>
              </button>

              <button
                type="button"
                onClick={onLaunchMissionDemo}
                className="flex items-center gap-2 px-4 py-3 min-h-[46px] rounded-xl mission-glass text-[#32D9FF] text-xs font-semibold hover:border-[#32D9FF]/60 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>GUIDED TOUR</span>
              </button>
            </div>
          </div>

          {/* Right: Interactive Farm Observation Beacons Panel */}
          <div className="lg:col-span-5 mission-glass rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-[#32D9FF]/15 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4F8FF]">
                <Globe className="w-4 h-4 text-[#32D9FF]" />
                <span>Global &amp; Karnataka Observation Sites</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('earth')}
                className="text-[11px] font-mono text-[#32D9FF] hover:underline flex items-center gap-1"
              >
                <span>Open Earth Explorer</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {farms.slice(0, 6).map((farm) => {
                const selected = farm.id === activeFarm.id;
                return (
                  <button
                    key={farm.id}
                    type="button"
                    onClick={() => onSelectFarm(farm)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                      selected
                        ? 'bg-[#52E3A4]/15 border-[#52E3A4]/70'
                        : 'bg-[#050914]/75 border-[#32D9FF]/15 hover:border-[#32D9FF]/45'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#F4F8FF] flex items-center gap-1.5 truncate">
                        <MapPin
                          className={`w-3.5 h-3.5 shrink-0 ${selected ? 'text-[#52E3A4]' : 'text-[#32D9FF]'}`}
                        />
                        <span className="truncate">{farm.name}</span>
                      </div>
                      <div className="text-[11px] text-[#8CA2BD] mt-0.5 truncate">
                        {farm.agroClimaticZone} · {farm.dominantCrops.slice(0, 2).join(', ')}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums text-[10px] text-[#32D9FF] shrink-0">
                      <div>{formatArea(farm.areaHectares)}</div>
                      <div className="text-[#8CA2BD]">
                        {farm.center.lat.toFixed(2)}°, {farm.center.lon.toFixed(2)}°
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] font-mono text-[#8CA2BD] border-t border-[#32D9FF]/15 pt-2 flex items-center justify-between gap-2">
              <span>Drag 3D Earth to inspect orbital tracks · Click pins to switch parcel</span>
            </div>
          </div>
        </div>

        {/* Bottom Honest System Telemetry & Observation Status Strip */}
        <div className="relative z-10 border-t border-[#32D9FF]/15 bg-[#050914]/85 backdrop-blur-md px-6 py-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
              Active Parcel
            </div>
            <div className="font-semibold text-[#F4F8FF] truncate mt-0.5">
              {activeFarm.name} · {formatArea(activeFarm.areaHectares)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
              NASA POWER ({powerMeta ? `${powerMeta.startDate} → ${powerMeta.endDate}` : '90d Window'})
            </div>
            <div className="font-mono tabular-nums font-semibold text-[#32D9FF] mt-0.5">
              {observations
                ? `${observations.summary.totalPrecip90dMm} mm · ${observations.summary.meanTempC} °C`
                : 'Synchronizing...'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
              Sentinel-2 L2A (10 m Optical)
            </div>
            <div className="font-mono tabular-nums font-semibold text-[#52E3A4] mt-0.5">
              {latestS2 ? `${latestS2.date} (${latestS2.cloudCoverPct}% cld)` : 'Catalog Ready'}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
              SoilGrids / Climate Stress (Sim.)
            </div>
            <div className="font-mono tabular-nums font-semibold text-[#FFB84D] mt-0.5">
              {soil ? `pH ${soil.phH2O} · ` : ''}Stress {impact.waterStressIndex}/100
            </div>
          </div>
        </div>
      </section>

      {/* NARRATED AUDIOVISUAL MISSION BRIEFING PLAYER */}
      <DemoWalkthroughPlayer
        farms={farms}
        activeFarm={activeFarm}
        observations={observations}
        soil={soil}
        sentinel2Catalog={sentinel2Catalog}
        scenario={scenario}
        impact={impact}
        rotationPlan={rotationPlan}
        onNavigate={onNavigate}
        onOpenDedicatedDemoPage={onOpenDemoPage}
        variant="embedded"
        defaultNarrationVolume={defaultNarrationVolume}
        defaultMusicVolume={defaultMusicVolume}
      />

      {/* MISSION CONTROL LABORATORIES GRID */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('earth')}
          className="text-left mission-panel hover:border-[#32D9FF]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#32D9FF]">
            <span className="flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              Earth Explorer (3D Globe)
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Interactive CesiumJS globe with 3D elevation DEM, GIBS overlays, and clickable global farm beacons.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('operations')}
          className="text-left mission-panel hover:border-[#52E3A4]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#52E3A4]">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Farm Operations &amp; Editor
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Draw, reshape, drag vertices, split crop zones, and compare Sentinel-2 passes with server persistence.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('satellite')}
          className="text-left mission-panel hover:border-[#32D9FF]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#32D9FF]">
            <span className="flex items-center gap-1.5">
              <Satellite className="w-4 h-4" />
              Satellite Intelligence
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            90-day NASA POWER meteorology, Open-Meteo 7-day forecast, and ISRIC SoilGrids v2.0 depth horizons.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('rotation-lab')}
          className="text-left mission-panel hover:border-[#52E3A4]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#52E3A4]">
            <span className="flex items-center gap-1.5">
              <Sprout className="w-4 h-4" />
              Crop Rotation Lab
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Top match: <span className="text-[#F4F8FF] font-medium">{topStrategy.name}</span> ({topStrategy.totalWaterDemandMm} mm water).
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('climate-sim')}
          className="text-left mission-panel hover:border-[#FFB84D]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#FFB84D]">
            <span className="flex items-center gap-1.5">
              <CloudRain className="w-4 h-4" />
              Climate Simulator
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Active: <span className="text-[#F4F8FF] font-medium">{scenario.label}</span> · ET₀ {impact.referenceEt0Mm} mm &amp; Stress {impact.waterStressIndex}/100.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('digital-twin')}
          className="text-left mission-panel hover:border-[#32D9FF]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#32D9FF]">
            <span className="flex items-center gap-1.5">
              <Box className="w-4 h-4" />
              3D Farm Digital Twin
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Interactive Three.js terrain, crop rows, water channels, and underground soil moisture cross-section.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('agronomist')}
          className="text-left mission-panel hover:border-[#52E3A4]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#52E3A4]">
            <span className="flex items-center gap-1.5">
              <Bot className="w-4 h-4" />
              AI Agronomist (EN/KN/HI)
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            Multilingual Gemini copilot grounded in live parcel boundaries, soil pH, and seasonal climate stress.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('command')}
          className="text-left mission-panel hover:border-[#32D9FF]/55 rounded-xl p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-[#F4F8FF]">
            <span className="flex items-center gap-1.5">
              <LayoutDashboard className="w-4 h-4 text-[#32D9FF]" />
              Command &amp; Science Audit
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <p className="text-xs text-[#8CA2BD] leading-relaxed">
            12-month farmer calendar, scenario benchmarks, PDF/CSV reports, and dataset resolution disclosures.
          </p>
        </button>
      </section>
    </div>
  );
};

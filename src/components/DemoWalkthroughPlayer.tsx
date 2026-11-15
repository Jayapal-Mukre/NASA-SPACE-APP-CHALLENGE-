import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Captions,
  Film,
  Settings2,
  MousePointer2,
  ArrowUpRight,
  Layers,
  Satellite,
  Sprout,
  CloudRain,
  Bot,
  LayoutDashboard,
  Edit3,
  Globe,
  Volume2,
  VolumeX,
  Music,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ActiveWorkspace,
  ClimateScenario,
  FarmParcel,
  NasaObservationBundle,
  RotationPlanResponse,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import { SimulatedImpactMetrics, hectaresToAcres } from '../utils/geoAndAgronomy';
import { DemoVideoConfig, loadDemoVideoConfig, saveDemoVideoConfig } from '../utils/farmStorage';
import {
  DEMO_SCENE_CHAPTERS,
  DEMO_TOTAL_DURATION_SEC,
  getActiveSubtitleText,
} from '../data/demoStoryboard';
import { DemoAudioEngine, NarrationAudioSource } from '../utils/demoAudioEngine';

export { DEMO_SCENE_CHAPTERS, DEMO_TOTAL_DURATION_SEC };

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

interface DemoWalkthroughPlayerProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  rotationPlan: RotationPlanResponse;
  onNavigate: (ws: ActiveWorkspace) => void;
  onOpenDedicatedDemoPage?: () => void;
  variant?: 'embedded' | 'dedicated';
  initialAutoPlay?: boolean;
  externalRestartNonce?: number;
  defaultNarrationVolume?: number;
  defaultMusicVolume?: number;
}

export const DemoWalkthroughPlayer: React.FC<DemoWalkthroughPlayerProps> = ({
  farms,
  activeFarm,
  observations,
  soil,
  sentinel2Catalog,
  impact,
  rotationPlan,
  onNavigate,
  onOpenDedicatedDemoPage,
  variant = 'embedded',
  initialAutoPlay = false,
  externalRestartNonce = 0,
  defaultNarrationVolume = 0.92,
  defaultMusicVolume = 0.24,
}) => {
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  const audioEngineRef = useRef<DemoAudioEngine | null>(null);
  const lastSpokenSceneRef = useRef<string | null>(null);

  const [hasStarted, setHasStarted] = useState(initialAutoPlay);
  const [isPlaying, setIsPlaying] = useState(initialAutoPlay);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(variant === 'dedicated');

  // Independent audio channel controls
  const [narrationVolume, setNarrationVolume] = useState(defaultNarrationVolume);
  const [narrationMuted, setNarrationMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(defaultMusicVolume);
  const [musicMuted, setMusicMuted] = useState(false);
  const [audioSource, setAudioSource] = useState<NarrationAudioSource>('loading');

  const [videoConfig, setVideoConfig] = useState<DemoVideoConfig>(() => loadDemoVideoConfig());
  const [showAdminSource, setShowAdminSource] = useState(false);
  const [draftMp4Url, setDraftMp4Url] = useState(() => loadDemoVideoConfig().mp4Url);
  const [draftNarrationUrl, setDraftNarrationUrl] = useState(
    () => loadDemoVideoConfig().narrationAudioUrl || ''
  );

  // Initialize Web Audio Engine once
  useEffect(() => {
    const engine = new DemoAudioEngine((src) => setAudioSource(src));
    engine.setNarrationVolume(narrationVolume);
    engine.setMusicVolume(musicVolume);
    audioEngineRef.current = engine;

    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioEngineRef.current?.setNarrationVolume(narrationVolume);
  }, [narrationVolume]);

  useEffect(() => {
    audioEngineRef.current?.setNarrationMuted(narrationMuted);
  }, [narrationMuted]);

  useEffect(() => {
    audioEngineRef.current?.setMusicVolume(musicVolume);
  }, [musicVolume]);

  useEffect(() => {
    audioEngineRef.current?.setMusicMuted(musicMuted);
  }, [musicMuted]);

  // Sync external Restart Demo trigger
  useEffect(() => {
    if (externalRestartNonce > 0) {
      lastSpokenSceneRef.current = null;
      setCurrentTimeSec(0);
      setHasStarted(true);
      setIsPlaying(true);
    }
  }, [externalRestartNonce]);

  const currentScene = useMemo(() => {
    return (
      DEMO_SCENE_CHAPTERS.find(
        (ch) => currentTimeSec >= ch.startSec && currentTimeSec < ch.endSec
      ) || DEMO_SCENE_CHAPTERS[DEMO_SCENE_CHAPTERS.length - 1]
    );
  }, [currentTimeSec]);

  const activeSubtitle = useMemo(() => getActiveSubtitleText(currentTimeSec), [currentTimeSec]);

  // Playback ticker (250 ms smooth cadence)
  useEffect(() => {
    if (!isPlaying || Boolean(videoConfig.mp4Url.trim())) return;
    const timer = window.setInterval(() => {
      setCurrentTimeSec((prev) => {
        const next = prev + 0.25;
        if (next >= DEMO_TOTAL_DURATION_SEC) {
          setIsPlaying(false);
          return DEMO_TOTAL_DURATION_SEC;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [isPlaying, videoConfig.mp4Url]);

  // Orchestrate Voice-Over Narration + Ambient Soundtrack on Play/Pause & Scene transitions
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine || Boolean(videoConfig.mp4Url.trim())) return;

    if (!isPlaying) {
      engine.stopNarration();
      engine.stopAmbientMusic();
      lastSpokenSceneRef.current = null;
      return;
    }

    engine.startAmbientMusic();
    // Pre-fetch upcoming scene WAV buffers silently
    engine.prewarmBrowserCache(DEMO_SCENE_CHAPTERS.map((s) => s.id));

    if (lastSpokenSceneRef.current !== currentScene.id) {
      const prevWasSet = lastSpokenSceneRef.current !== null;
      lastSpokenSceneRef.current = currentScene.id;
      if (prevWasSet) {
        engine.playTransitionChime();
      }
      const offsetWithinScene = Math.max(0, currentTimeSec - currentScene.startSec);
      engine.playSceneNarration(
        currentScene.id,
        offsetWithinScene,
        videoConfig.narrationAudioUrl
      );
    }
  }, [
    isPlaying,
    currentScene.id,
    videoConfig.mp4Url,
    videoConfig.narrationAudioUrl,
  ]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const sceneLocalProgress = useMemo(() => {
    const span = Math.max(1, currentScene.endSec - currentScene.startSec);
    return Math.min(1, Math.max(0, (currentTimeSec - currentScene.startSec) / span));
  }, [currentScene, currentTimeSec]);

  const handlePlayPause = () => {
    if (!hasStarted) setHasStarted(true);
    if (currentTimeSec >= DEMO_TOTAL_DURATION_SEC) {
      lastSpokenSceneRef.current = null;
      setCurrentTimeSec(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying((p) => !p);
  };

  const handleReplay = () => {
    lastSpokenSceneRef.current = null;
    setHasStarted(true);
    setCurrentTimeSec(0);
    setIsPlaying(true);
  };

  const jumpToScene = (idx: number, autoPlay = true) => {
    const clamped = Math.max(0, Math.min(DEMO_SCENE_CHAPTERS.length - 1, idx));
    const target = DEMO_SCENE_CHAPTERS[clamped];
    lastSpokenSceneRef.current = null;
    setHasStarted(true);
    setCurrentTimeSec(target.startSec + 0.05);
    if (autoPlay) setIsPlaying(true);
  };

  const toggleFullscreen = async () => {
    if (!playerWrapperRef.current) return;
    try {
      if (!document.fullscreenElement) await playerWrapperRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Ignored cleanly inside sandboxed iframes
    }
  };

  const handleSaveAdminSource = (e: React.FormEvent) => {
    e.preventDefault();
    const next: DemoVideoConfig = {
      mp4Url: draftMp4Url.trim(),
      narrationAudioUrl: draftNarrationUrl.trim(),
    };
    setVideoConfig(next);
    saveDemoVideoConfig(next);
    setShowAdminSource(false);
    lastSpokenSceneRef.current = null;
  };

  const latestS2 = sentinel2Catalog?.scenes?.[0];
  const strategies = rotationPlan.strategies;
  const topStrategy =
    strategies.find((s) => s.id === rotationPlan.recommendedStrategyId) || strategies[0];

  const vertexDragShift =
    currentScene.id === 'scene-3' ? Math.sin(sceneLocalProgress * Math.PI) * 14 : 0;
  const simulatedEditedAreaHa = Number(
    (activeFarm.areaHectares * (1 + (currentScene.id === 'scene-3' ? sceneLocalProgress * 0.14 : 0))).toFixed(2)
  );

  const animatedCursorX =
    currentScene.id === 'scene-3'
      ? 60 + sceneLocalProgress * 12
      : currentScene.cursorPos.xPct + Math.sin(sceneLocalProgress * Math.PI * 2) * 3;
  const animatedCursorY =
    currentScene.id === 'scene-3'
      ? 35 - sceneLocalProgress * 7
      : currentScene.cursorPos.yPct + Math.cos(sceneLocalProgress * Math.PI * 2) * 2;

  const progressPct = Math.min(100, Math.max(0, (currentTimeSec / DEMO_TOTAL_DURATION_SEC) * 100));

  const audioSourceBadge = useMemo(() => {
    if (videoConfig.mp4Url.trim()) return 'Configured MP4 Video Source';
    if (narrationMuted && musicMuted) return 'Audio Muted';
    if (audioSource === 'gemini-tts-wav') return 'Gemini Neural TTS Voice + Ambient Audio';
    if (audioSource === 'custom-audio') return 'Custom Narration Audio + Ambient Score';
    if (audioSource === 'browser-speech-fallback') return 'Browser Speech Synthesis + Ambient Audio';
    return 'Interactive Walkthrough · Voice + Ambient Audio';
  }, [videoConfig.mp4Url, narrationMuted, musicMuted, audioSource]);

  return (
    <section
      aria-labelledby="demo-showcase-heading"
      className="mission-panel rounded-2xl p-5 sm:p-6 lg:p-7 space-y-5"
    >
      {/* Section Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#32D9FF]/15 pb-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#32D9FF]">
            <Film className="w-3.5 h-3.5" />
            <span>MISSION BRIEFING · NARRATED PLATFORM WALKTHROUGH</span>
            <span className="text-[#8CA2BD]/50">·</span>
            <span className="text-[#52E3A4]">{audioSourceBadge}</span>
          </div>
          <h2 id="demo-showcase-heading" className="font-display text-xl sm:text-2xl font-bold text-[#F4F8FF]">
            FIELD SHIFT — Turning Earth&apos;s Data into Smarter Farming Decisions
          </h2>
          <p className="text-xs sm:text-sm text-[#8CA2BD] leading-relaxed">
            7-scene audiovisual walkthrough for <span className="text-[#F4F8FF] font-medium">{activeFarm.name}</span> featuring neural voice narration, ambient documentary underscore, telemetry chimes, synchronized WebVTT subtitles, and an expandable interactive transcript.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {variant === 'embedded' && onOpenDedicatedDemoPage && (
            <button
              type="button"
              onClick={onOpenDedicatedDemoPage}
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-[#32D9FF]/15 border border-[#32D9FF]/45 text-[#32D9FF] text-xs font-semibold hover:bg-[#32D9FF]/25 whitespace-nowrap"
            >
              <span>Open Full Briefing (/demo)</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAdminSource((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-[#050914] border border-[#32D9FF]/20 text-[#8CA2BD] text-xs font-medium hover:text-[#F4F8FF] hover:border-[#32D9FF]/50 whitespace-nowrap"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Media Source</span>
          </button>
        </div>
      </div>

      {/* Optional Media Override Drawer */}
      {showAdminSource && (
        <form
          onSubmit={handleSaveAdminSource}
          className="bg-[#050914] border border-[#32D9FF]/35 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs items-end"
        >
          <div className="md:col-span-5 space-y-1">
            <label htmlFor="admin-mp4-url" className="block font-medium text-[#F4F8FF]">
              Optional Pre-Rendered MP4 / WebM Video URL
            </label>
            <input
              id="admin-mp4-url"
              type="url"
              value={draftMp4Url}
              onChange={(e) => setDraftMp4Url(e.target.value)}
              placeholder="Leave blank to use live narrated walkthrough"
              className="w-full bg-[#091426] border border-[#32D9FF]/20 rounded-lg px-3 py-2 text-[#F4F8FF] placeholder:text-[#8CA2BD]/50"
            />
          </div>
          <div className="md:col-span-4 space-y-1">
            <label htmlFor="admin-audio-url" className="block font-medium text-[#F4F8FF]">
              Optional Custom Voice Narration MP3/WAV URL
            </label>
            <input
              id="admin-audio-url"
              type="url"
              value={draftNarrationUrl}
              onChange={(e) => setDraftNarrationUrl(e.target.value)}
              placeholder="Leave blank for built-in Gemini Neural TTS"
              className="w-full bg-[#091426] border border-[#32D9FF]/20 rounded-lg px-3 py-2 text-[#F4F8FF] placeholder:text-[#8CA2BD]/50"
            />
          </div>
          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftMp4Url('');
                setDraftNarrationUrl('');
                const reset: DemoVideoConfig = { mp4Url: '', narrationAudioUrl: '' };
                setVideoConfig(reset);
                saveDemoVideoConfig(reset);
                setShowAdminSource(false);
              }}
              className="px-3 py-2 rounded-lg border border-[#32D9FF]/25 text-[#8CA2BD] hover:text-[#F4F8FF]"
            >
              Reset Default
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#52E3A4] text-[#050914] font-semibold hover:bg-[#52E3A4]/90"
            >
              Apply
            </button>
          </div>
        </form>
      )}

      {/* 16:9 Media Viewport + 7-Scene Chapter Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: 16:9 Narrated Player */}
        <div
          ref={playerWrapperRef}
          className="lg:col-span-9 flex flex-col bg-[#050914] border border-[#32D9FF]/20 rounded-xl overflow-hidden"
        >
          <div className="relative w-full aspect-video bg-[#040811] overflow-hidden">
            {videoConfig.mp4Url.trim() ? (
              <video
                src={videoConfig.mp4Url}
                controls
                playsInline
                className="w-full h-full object-contain bg-black"
              >
                <track
                  kind="captions"
                  src="/api/demo/subtitles.vtt"
                  srcLang="en"
                  label="English Captions"
                  default
                />
                Your browser does not support HTML5 video playback.
              </video>
            ) : (
              <>
                {/* Live Visual Mission Canvas */}
                <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-between bg-[radial-gradient(circle_at_top_right,rgba(50,217,255,0.16),transparent_48%),radial-gradient(circle_at_bottom_left,rgba(82,227,164,0.14),transparent_52%)]">
                  {/* Top Mission HUD Bar */}
                  <div className="flex items-center justify-between gap-2 bg-[#091426]/90 border border-[#32D9FF]/20 rounded-lg px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 font-mono text-[#32D9FF] truncate">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-bold text-[#F4F8FF]">FIELD SHIFT</span>
                      <span className="text-[#8CA2BD]/60">/</span>
                      <span className="truncate">{currentScene.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-[10px]">
                      <span className="text-[#52E3A4]">{activeFarm.name}</span>
                      <button
                        type="button"
                        onClick={() => onNavigate(currentScene.workspaceTarget)}
                        className="px-2 py-0.5 rounded bg-[#1769FF]/25 border border-[#32D9FF]/50 text-[#32D9FF] hover:bg-[#32D9FF]/25"
                      >
                        Open Live Module →
                      </button>
                    </div>
                  </div>

                  {/* Scene Body */}
                  <div className="flex-1 my-3 grid grid-cols-12 gap-3 min-h-0">
                    {currentScene.id === 'scene-1' && (
                      <div className="col-span-12 flex flex-col justify-center items-center text-center px-4 space-y-3">
                        <div className="text-xs font-mono uppercase tracking-[0.2em] text-[#32D9FF]">
                          2026 NASA Space Apps Challenge · {farms.length} Active Parcels
                        </div>
                        <h3 className="font-display text-2xl sm:text-4xl font-bold text-[#F4F8FF] max-w-2xl leading-tight">
                          FIELD SHIFT — Earth Intelligence for Resilient Farming
                        </h3>
                        <p className="text-xs sm:text-sm text-[#52E3A4] font-medium">
                          &ldquo;Turning Earth&apos;s Data into Smarter Farming Decisions.&rdquo;
                        </p>
                        <div className="grid grid-cols-3 gap-3 max-w-xl w-full pt-2 text-left">
                          <div className="bg-[#091426]/90 border border-[#32D9FF]/20 rounded-lg p-3">
                            <div className="text-[10px] text-[#8CA2BD]">NASA POWER 90d Rain</div>
                            <div className="font-mono tabular-nums text-sm font-bold text-[#32D9FF] mt-0.5">
                              {observations ? `${observations.summary.totalPrecip90dMm} mm` : 'Synchronizing'}
                            </div>
                          </div>
                          <div className="bg-[#091426]/90 border border-[#32D9FF]/20 rounded-lg p-3">
                            <div className="text-[10px] text-[#8CA2BD]">SoilGrids pH / SOC</div>
                            <div className="font-mono tabular-nums text-sm font-bold text-[#52E3A4] mt-0.5">
                              {soil ? `${soil.phH2O} · ${soil.organicCarbonGKg} g/kg` : 'Loading'}
                            </div>
                          </div>
                          <div className="bg-[#091426]/90 border border-[#32D9FF]/20 rounded-lg p-3">
                            <div className="text-[10px] text-[#8CA2BD]">Sentinel-2 10 m</div>
                            <div className="font-mono tabular-nums text-sm font-bold text-[#F4F8FF] mt-0.5">
                              {latestS2 ? latestS2.date : 'Ready'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {currentScene.id === 'scene-2' && (
                      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                        <div className="sm:col-span-7 bg-[#091426] border border-[#32D9FF]/25 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
                          <div className="flex items-center justify-between text-xs font-mono text-[#32D9FF]">
                            <span className="flex items-center gap-1.5">
                              <Globe className="w-4 h-4" />
                              CesiumJS 3D Planetary Globe
                            </span>
                            <span className="text-[#52E3A4]">Elev {activeFarm.elevationMeters} m</span>
                          </div>
                          <div className="flex-1 flex items-center justify-center py-2">
                            {/* Stylized Orbital Planetary Sphere + Satellite Ring */}
                            <svg viewBox="0 0 220 140" className="w-full max-w-xs h-36">
                              <defs>
                                <radialGradient id="demoGlobeGrad" cx="42%" cy="38%" r="58%">
                                  <stop offset="0%" stopColor="#1769FF" stopOpacity="0.65" />
                                  <stop offset="65%" stopColor="#091426" stopOpacity="0.95" />
                                  <stop offset="100%" stopColor="#050914" stopOpacity="1" />
                                </radialGradient>
                              </defs>
                              <circle cx="110" cy="70" r="48" fill="url(#demoGlobeGrad)" stroke="#32D9FF" strokeWidth="1.5" strokeOpacity="0.7" />
                              <ellipse cx="110" cy="70" rx="84" ry="24" transform="rotate(-18 110 70)" fill="none" stroke="#32D9FF" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.55" />
                              <ellipse cx="110" cy="70" rx="76" ry="22" transform="rotate(24 110 70)" fill="none" stroke="#52E3A4" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.45" />
                              <circle cx={110 + Math.cos(sceneLocalProgress * Math.PI * 2) * 78} cy={70 + Math.sin(sceneLocalProgress * Math.PI * 2) * 20} r="4" fill="#32D9FF" />
                              <circle cx="126" cy="64" r="4.5" fill="#52E3A4" stroke="#050914" strokeWidth="1.5" />
                              <circle cx="88" cy="54" r="3" fill="#FFB84D" />
                              <circle cx="105" cy="82" r="3" fill="#32D9FF" />
                            </svg>
                          </div>
                          <div className="text-[11px] font-mono text-[#8CA2BD] flex justify-between">
                            <span>{activeFarm.agroClimaticZone}</span>
                            <span className="text-[#32D9FF]">{activeFarm.primarySoilType}</span>
                          </div>
                        </div>

                        <div className="sm:col-span-5 bg-[#091426] border border-[#32D9FF]/20 rounded-xl p-3.5 flex flex-col justify-between text-xs">
                          <div className="font-semibold text-[#32D9FF]">Global Agricultural Regions</div>
                          <div className="space-y-1.5">
                            {farms.slice(0, 4).map((f) => (
                              <div
                                key={f.id}
                                className={`p-2 rounded-lg border flex justify-between items-center text-[11px] ${
                                  f.id === activeFarm.id
                                    ? 'bg-[#52E3A4]/15 border-[#52E3A4]/60 text-[#F4F8FF]'
                                    : 'bg-[#050914] border-[#32D9FF]/10 text-[#8CA2BD]'
                                }`}
                              >
                                <span className="truncate font-medium">{f.name}</span>
                                <span className="font-mono text-[#32D9FF] shrink-0">{f.areaHectares} ha</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] font-mono text-[#8CA2BD]">
                            Click any beacon in Earth Explorer to inspect elevation &amp; soil horizons.
                          </div>
                        </div>
                      </div>
                    )}

                    {currentScene.id === 'scene-3' && (
                      <>
                        <div className="col-span-12 sm:col-span-8 bg-[#091426] border border-[#32D9FF]/25 rounded-xl relative overflow-hidden p-3 flex flex-col justify-between">
                          <div
                            className="absolute inset-0 opacity-25"
                            style={{
                              backgroundImage:
                                'linear-gradient(to right, rgba(50,217,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(50,217,255,0.16) 1px, transparent 1px)',
                              backgroundSize: '28px 28px',
                            }}
                          />
                          <div className="relative z-10 flex items-center justify-between text-[11px] font-mono">
                            <span className="text-[#52E3A4] flex items-center gap-1.5">
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Boundary Editor · Sentinel-2 NDVI &amp; Esri Overlay</span>
                            </span>
                            <span className="text-[#32D9FF] tabular-nums">
                              {simulatedEditedAreaHa} ha ({hectaresToAcres(simulatedEditedAreaHa)} ac)
                            </span>
                          </div>

                          <div className="relative z-10 flex-1 flex items-center justify-center">
                            <svg viewBox="0 0 220 120" className="w-full max-w-md h-full max-h-44">
                              <polygon
                                points={`38,24 ${145 + vertexDragShift},${20 - vertexDragShift * 0.4} 186,88 58,100`}
                                fill="rgba(50, 217, 255, 0.16)"
                                stroke="#32D9FF"
                                strokeWidth="2.5"
                              />
                              <polygon
                                points="46,32 108,28 112,92 60,94"
                                fill="rgba(82, 227, 164, 0.22)"
                                stroke="#52E3A4"
                                strokeWidth="1.5"
                                strokeDasharray="3 2"
                              />
                              <polygon
                                points={`112,28 ${143 + vertexDragShift * 0.8},${23 - vertexDragShift * 0.3} 178,84 116,91`}
                                fill="rgba(23, 105, 255, 0.22)"
                                stroke="#32D9FF"
                                strokeWidth="1.5"
                                strokeDasharray="3 2"
                              />
                              {[
                                [38, 24],
                                [145 + vertexDragShift, 20 - vertexDragShift * 0.4],
                                [186, 88],
                                [58, 100],
                              ].map(([vx, vy], i) => (
                                <rect
                                  key={i}
                                  x={vx - 4}
                                  y={vy - 4}
                                  width={8}
                                  height={8}
                                  rx={1.5}
                                  fill={i === 1 ? '#FFB84D' : '#52E3A4'}
                                  stroke="#050914"
                                  strokeWidth="1.5"
                                />
                              ))}
                              <circle
                                cx={165 + vertexDragShift * 0.5}
                                cy={54}
                                r={4.5}
                                fill="#32D9FF"
                                stroke="#050914"
                                strokeWidth="1.5"
                              />
                            </svg>
                          </div>

                          <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-[#8CA2BD]">
                            <span>
                              Centroid: {activeFarm.center.lat.toFixed(4)}°, {activeFarm.center.lon.toFixed(4)}°
                            </span>
                            <span className="text-[#52E3A4]">
                              Saved to Express JSON Store · {activeFarm.zones?.length || 2} Crop Zones
                            </span>
                          </div>
                        </div>

                        <div className="hidden sm:flex col-span-4 flex-col justify-between bg-[#091426] border border-[#32D9FF]/20 rounded-xl p-3 text-xs">
                          <div className="space-y-2">
                            <div className="font-semibold text-[#32D9FF] flex items-center gap-1.5">
                              <Satellite className="w-3.5 h-3.5" />
                              <span>Active Satellite Layers</span>
                            </div>
                            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-2 text-[11px]">
                              <div className="text-[#F4F8FF] font-medium">Sentinel-2 L2A NDVI</div>
                              <div className="font-mono text-[#52E3A4]">
                                10 m · {latestS2 ? latestS2.date : 'Clear scene ready'}
                              </div>
                            </div>
                            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-2 text-[11px]">
                              <div className="text-[#F4F8FF] font-medium">NASA SMAP Root Moisture</div>
                              <div className="font-mono text-[#32D9FF]">
                                {observations ? `${observations.summary.meanRootSoilWetnessPct}%` : '44%'} · 9 km L4
                              </div>
                            </div>
                            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-2 text-[11px]">
                              <div className="text-[#F4F8FF] font-medium">NASA GPM Precipitation</div>
                              <div className="font-mono text-[#FFB84D]">
                                {observations ? `${observations.summary.totalPrecip90dMm} mm` : '142 mm'} · 10 km
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] text-[#8CA2BD]">
                            Drag any cyan corner vertex to recalculate hectares live.
                          </div>
                        </div>
                      </>
                    )}

                    {currentScene.id === 'scene-4' && (
                      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3 items-stretch">
                        {strategies.slice(0, 3).map((st) => {
                          const isRec = st.id === topStrategy.id;
                          return (
                            <div
                              key={st.id}
                              className={`rounded-xl border p-3.5 flex flex-col justify-between ${
                                isRec
                                  ? 'bg-[#52E3A4]/12 border-[#52E3A4]/70'
                                  : 'bg-[#091426] border-[#32D9FF]/20'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between text-[11px] font-mono">
                                  <span className={isRec ? 'text-[#52E3A4] font-bold' : 'text-[#8CA2BD]'}>
                                    {st.categoryLabel || 'Strategy'}
                                  </span>
                                  <Sprout className="w-3.5 h-3.5 text-[#52E3A4]" />
                                </div>
                                <div className="text-sm font-semibold text-[#F4F8FF] mt-1">{st.name}</div>
                                <div className="text-[11px] text-[#8CA2BD] mt-1.5">
                                  {st.seasons.map((s) => s.crop.split('(')[0].trim()).join(' → ')}
                                </div>
                              </div>
                              <div className="pt-2 border-t border-[#32D9FF]/15 grid grid-cols-2 gap-1 font-mono text-[10px]">
                                <span className="text-[#32D9FF]">Water: {st.totalWaterDemandMm} mm</span>
                                <span className="text-[#52E3A4]">
                                  N: {st.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}
                                  {st.soilNitrogenDeltaKgHa} kg/ha
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {currentScene.id === 'scene-5' && (
                      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center bg-[#091426] border border-[#32D9FF]/20 rounded-xl p-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#FFB84D]">
                            <CloudRain className="w-4 h-4" />
                            <span>Climate Stress &amp; Drought Perturbation</span>
                          </div>
                          <div className="space-y-2 text-xs">
                            <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-2.5 flex justify-between">
                              <span className="text-[#8CA2BD]">Historical Baseline</span>
                              <span className="font-mono text-[#52E3A4]">Stress 28/100 · Optimal</span>
                            </div>
                            <div className="bg-[#FFB84D]/12 border border-[#FFB84D]/55 rounded-lg p-2.5 flex justify-between">
                              <span className="text-[#FFB84D] font-medium">Dry Monsoon (-28% Rain, +1.8°C)</span>
                              <span className="font-mono text-[#FFB84D]">
                                Stress {Math.max(54, impact.waterStressIndex)}/100
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-3.5 space-y-1.5 text-xs">
                          <div className="text-[#8CA2BD]">Simulated Water &amp; Crop Vulnerability</div>
                          <div className="font-mono text-lg font-bold text-[#32D9FF]">
                            ET₀ {impact.referenceEt0Mm} mm · Bal {impact.seasonalWaterBalanceMm} mm
                          </div>
                          <div className="text-[11px] text-[#8CA2BD]">
                            Pre-season scenario testing identifies high-risk crops before sowing commitments are made.
                          </div>
                        </div>
                      </div>
                    )}

                    {currentScene.id === 'scene-6' && (
                      <div className="col-span-12 bg-[#091426] border border-[#32D9FF]/20 rounded-xl p-4 flex flex-col justify-center space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[#52E3A4] font-semibold">
                            <Bot className="w-4 h-4" />
                            <span>FIELD SHIFT AI Agronomist Copilot</span>
                          </div>
                          <div className="flex gap-1.5 font-mono text-[10px]">
                            <span className="px-2 py-0.5 rounded bg-[#32D9FF]/20 text-[#32D9FF]">English</span>
                            <span className="px-2 py-0.5 rounded bg-[#52E3A4]/20 text-[#52E3A4]">ಕನ್ನಡ</span>
                            <span className="px-2 py-0.5 rounded bg-[#FFB84D]/20 text-[#FFB84D]">हिन्दी</span>
                          </div>
                        </div>
                        <div className="bg-[#050914] border border-[#32D9FF]/15 rounded-lg p-2.5 text-[#F4F8FF] max-w-xl">
                          <span className="text-[#32D9FF] font-mono text-[10px] mr-2">FARMER QUERY:</span>
                          &ldquo;Which Kharif-Rabi rotation safeguards yield in {activeFarm.district || activeFarm.region} under lower rainfall?&rdquo;
                        </div>
                        <div className="bg-[#52E3A4]/12 border border-[#52E3A4]/45 rounded-lg p-3 text-[#F4F8FF] leading-relaxed">
                          <span className="text-[#52E3A4] font-mono text-[10px] mr-2">EVIDENCE-GROUNDED ADVISORY:</span>
                          Adopt <span className="font-semibold">{topStrategy.name}</span>. Deep-rooted pulses fix{' '}
                          {topStrategy.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}
                          {topStrategy.soilNitrogenDeltaKgHa} kg/ha nitrogen while limiting water demand to{' '}
                          {topStrategy.totalWaterDemandMm} mm.
                        </div>
                      </div>
                    )}

                    {currentScene.id === 'scene-7' && (
                      <div className="col-span-12 flex flex-col justify-center items-center text-center space-y-3 px-4">
                        <div className="flex items-center gap-2 text-xs font-mono text-[#52E3A4]">
                          <LayoutDashboard className="w-4 h-4" />
                          <span>Farmer Command Center · 3D Digital Twin · Mission Reports</span>
                        </div>
                        <h3 className="font-display text-2xl sm:text-4xl font-bold text-[#F4F8FF] max-w-2xl">
                          FIELD SHIFT.
                        </h3>
                        <p className="text-sm sm:text-base text-[#32D9FF] font-medium">
                          Turning Earth&apos;s data into smarter farming decisions.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="h-6" />
                </div>

                {/* Guided Pointer Overlay */}
                {hasStarted && (
                  <div
                    className="pointer-events-none absolute z-20 transition-all duration-500 ease-out"
                    style={{
                      left: `${animatedCursorX}%`,
                      top: `${animatedCursorY}%`,
                    }}
                  >
                    <div className="relative">
                      <span className="absolute -inset-2 rounded-full border border-[#32D9FF]/70 opacity-75" />
                      <MousePointer2 className="w-5 h-5 text-white fill-[#32D9FF] drop-shadow-lg" />
                    </div>
                  </div>
                )}

                {/* Synchronized Caption Subtitles */}
                {captionsEnabled && hasStarted && (
                  <div className="pointer-events-none absolute bottom-3 left-4 right-4 z-20 flex justify-center">
                    <div className="bg-[#050914]/92 border border-[#32D9FF]/35 rounded-lg px-4 py-1.5 text-center max-w-2xl shadow-xl">
                      <p className="text-xs sm:text-sm font-medium text-[#F4F8FF]">{activeSubtitle}</p>
                    </div>
                  </div>
                )}

                {/* Poster Overlay Before Play */}
                {!hasStarted && (
                  <div className="absolute inset-0 z-30 bg-[#050914]/84 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-[#32D9FF]">
                      Narrated Mission Briefing · Duration {formatClock(DEMO_TOTAL_DURATION_SEC)} · 7 Scenes
                    </div>
                    <h3 className="font-display text-xl sm:text-3xl font-bold text-[#F4F8FF] max-w-xl leading-tight">
                      Turning Earth&apos;s Data into Smarter Farming Decisions
                    </h3>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className="flex items-center gap-2.5 px-6 py-3.5 min-h-[48px] rounded-xl bg-[#52E3A4] text-[#050914] text-sm font-bold hover:bg-[#52E3A4]/90 transition-transform hover:scale-[1.02] shadow-2xl"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      <span>Play Narrated Briefing (2:30)</span>
                    </button>
                    <p className="text-[11px] text-[#8CA2BD] max-w-md">
                      Includes spoken voice-over narration, ambient documentary music, transition SFX, and synchronized WebVTT subtitles.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Control Bar + Dual Audio Mixers */}
          {!videoConfig.mp4Url.trim() && (
            <div className="bg-[#091426] border-t border-[#32D9FF]/15 px-3.5 py-2.5 space-y-2.5">
              {/* Scrubber */}
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums text-[11px] text-[#32D9FF] w-10 shrink-0">
                  {formatClock(currentTimeSec)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={DEMO_TOTAL_DURATION_SEC}
                  step={0.5}
                  value={currentTimeSec}
                  onChange={(e) => {
                    lastSpokenSceneRef.current = null;
                    setHasStarted(true);
                    setCurrentTimeSec(Number(e.target.value));
                  }}
                  aria-label="Demo timeline scrubber"
                  className="flex-1 accent-[#52E3A4] cursor-pointer"
                />
                <span className="font-mono tabular-nums text-[11px] text-[#8CA2BD] w-10 text-right shrink-0">
                  {formatClock(DEMO_TOTAL_DURATION_SEC)}
                </span>
              </div>

              {/* Controls & Independent Audio Channels */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePlayPause}
                    aria-label={isPlaying ? 'Pause walkthrough' : 'Play walkthrough'}
                    className="flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg bg-[#52E3A4] text-[#050914] font-semibold hover:bg-[#52E3A4]/90"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>
                      {isPlaying ? 'Pause' : currentTimeSec >= DEMO_TOTAL_DURATION_SEC ? 'Replay' : 'Play'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={currentScene.index === 0}
                    onClick={() => jumpToScene(currentScene.index - 1)}
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[#32D9FF]/25 text-[#F4F8FF] hover:border-[#32D9FF] disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Prev</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentScene.index === DEMO_SCENE_CHAPTERS.length - 1}
                    onClick={() => jumpToScene(currentScene.index + 1)}
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[#32D9FF]/25 text-[#F4F8FF] hover:border-[#32D9FF] disabled:opacity-40"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={handleReplay}
                    title="Replay from start"
                    className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border border-[#32D9FF]/25 text-[#8CA2BD] hover:text-[#F4F8FF]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Replay</span>
                  </button>
                </div>

                {/* Independent Narration & Music Volume + Mute + CC + Fullscreen */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Narration Channel */}
                  <div className="flex items-center gap-1.5 bg-[#050914] border border-[#32D9FF]/20 rounded-lg px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setNarrationMuted((m) => !m)}
                      title={narrationMuted ? 'Unmute voice narration' : 'Mute voice narration'}
                      aria-label="Toggle narration audio mute"
                      className="text-[#32D9FF] hover:text-[#F4F8FF]"
                    >
                      {narrationMuted ? <VolumeX className="w-3.5 h-3.5 text-[#FFB84D]" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[10px] font-mono text-[#8CA2BD]">Voice</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={narrationMuted ? 0 : narrationVolume}
                      onChange={(e) => {
                        setNarrationMuted(false);
                        setNarrationVolume(Number(e.target.value));
                      }}
                      aria-label="Voice narration volume"
                      className="w-14 accent-[#32D9FF] cursor-pointer"
                    />
                  </div>

                  {/* Ambient Music & SFX Channel */}
                  <div className="flex items-center gap-1.5 bg-[#050914] border border-[#32D9FF]/20 rounded-lg px-2 py-1">
                    <button
                      type="button"
                      onClick={() => setMusicMuted((m) => !m)}
                      title={musicMuted ? 'Unmute ambient music & SFX' : 'Mute ambient music & SFX'}
                      aria-label="Toggle ambient music mute"
                      className="text-[#52E3A4] hover:text-[#F4F8FF]"
                    >
                      <Music className={`w-3.5 h-3.5 ${musicMuted ? 'opacity-40 text-[#8CA2BD]' : ''}`} />
                    </button>
                    <span className="text-[10px] font-mono text-[#8CA2BD]">Music</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={musicMuted ? 0 : musicVolume}
                      onChange={(e) => {
                        setMusicMuted(false);
                        setMusicVolume(Number(e.target.value));
                      }}
                      aria-label="Background music volume"
                      className="w-14 accent-[#52E3A4] cursor-pointer"
                    />
                  </div>

                  <span className="hidden xl:inline font-mono text-[11px] text-[#8CA2BD]">
                    {Math.round(progressPct)}% · {currentScene.index + 1}/{DEMO_SCENE_CHAPTERS.length}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCaptionsEnabled((v) => !v)}
                    aria-label="Toggle captions"
                    className={`flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg border text-xs ${
                      captionsEnabled
                        ? 'bg-[#32D9FF]/20 border-[#32D9FF]/60 text-[#32D9FF]'
                        : 'border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#F4F8FF]'
                    }`}
                  >
                    <Captions className="w-3.5 h-3.5" />
                    <span>CC</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    aria-label="Toggle demo fullscreen"
                    className="p-2 min-h-[36px] rounded-lg border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#F4F8FF]"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: 7 Interactive Storyboard Chapters */}
        <div className="lg:col-span-3 bg-[#050914] border border-[#32D9FF]/20 rounded-xl p-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 pb-1 border-b border-[#32D9FF]/15">
              <span className="text-xs font-semibold text-[#F4F8FF]">Briefing Chapters (7)</span>
              <span className="font-mono text-[10px] text-[#32D9FF]">2:30 Total</span>
            </div>
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {DEMO_SCENE_CHAPTERS.map((ch) => {
                const active = ch.id === currentScene.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => jumpToScene(ch.index)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      active
                        ? 'bg-[#52E3A4]/15 border-[#52E3A4]/60'
                        : 'bg-[#091426] border-[#32D9FF]/15 hover:border-[#32D9FF]/45'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className={active ? 'text-[#52E3A4] font-bold' : 'text-[#8CA2BD]'}>
                        {formatClock(ch.startSec)}–{formatClock(ch.endSec)}
                      </span>
                      <span className="text-[#32D9FF]">{ch.shortLabel}</span>
                    </div>
                    <div className="text-[11px] font-semibold text-[#F4F8FF] mt-0.5 truncate">
                      {ch.shortLabel}
                    </div>
                    <div className="text-[10px] text-[#8CA2BD] mt-0.5 line-clamp-2">
                      {ch.bulletSummary}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 mt-2 border-t border-[#32D9FF]/15 flex items-center justify-between gap-2 text-[11px]">
            <a
              href="/api/demo/subtitles.vtt"
              download="field-shift-briefing.vtt"
              className="text-[#32D9FF] hover:underline font-mono text-[10px]"
            >
              Download .VTT Captions
            </a>
            <button
              type="button"
              onClick={() => onNavigate(currentScene.workspaceTarget)}
              className="text-[#52E3A4] font-semibold hover:underline"
            >
              Try {currentScene.shortLabel} →
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Full Narration Transcript */}
      <div className="bg-[#050914] border border-[#32D9FF]/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTranscriptOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-[#F4F8FF] hover:bg-[#091426] transition-colors"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#32D9FF]" />
            <span>Full Narration Transcript &amp; Interactive Scene Jump</span>
          </span>
          {transcriptOpen ? <ChevronUp className="w-4 h-4 text-[#8CA2BD]" /> : <ChevronDown className="w-4 h-4 text-[#8CA2BD]" />}
        </button>

        {transcriptOpen && (
          <div className="border-t border-[#32D9FF]/15 p-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
            {DEMO_SCENE_CHAPTERS.map((ch) => {
              const active = ch.id === currentScene.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => jumpToScene(ch.index)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    active
                      ? 'bg-[#32D9FF]/12 border-[#32D9FF]/50'
                      : 'bg-[#091426] border-[#32D9FF]/15 hover:border-[#32D9FF]/40'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                    <span className="text-[#32D9FF] font-semibold">{ch.title}</span>
                    <span className="text-[#52E3A4]">Jump to {formatClock(ch.startSec)}</span>
                  </div>
                  <p className="text-[#F4F8FF] leading-relaxed">&ldquo;{ch.narrationScript}&rdquo;</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

import React, {
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  MapPin,
  RefreshCw,
  FileText,
  Menu,
  X,
  Play,
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Globe,
  Layers,
  Satellite,
  Sprout,
  CloudRain,
  Box,
  Bot,
  LayoutDashboard,
  Film,
  Compass,
  Bell,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  ActiveWorkspace,
  BasemapId,
  FarmParcel,
  ScientificOverlayId,
  UiExperienceMode,
} from './types/fieldShift';
import { calculateGeometryStats, hectaresToAcres } from './utils/geoAndAgronomy';
import {
  MissionUserSettings,
  loadMissionSettings,
  loadUiMode,
  saveMissionSettings,
  saveUiMode,
} from './utils/farmStorage';
import { SelectedFarmProvider, useSelectedFarm } from './context/SelectedFarmContext';
import { useBoundaryEditor } from './utils/useBoundaryEditor';
import { MissionShowcaseHome } from './components/MissionShowcaseHome';
import { GuidedMissionDemo, MISSION_DEMO_STEPS } from './components/GuidedMissionDemo';
import { FarmerCommandCenter } from './components/FarmerCommandCenter';
import { ScienceMethodologyCenter } from './components/ScienceMethodologyCenter';
import { EarthExplorer } from './components/EarthExplorer';
import { SatelliteMap } from './components/SatelliteMap';
import { BoundaryEditorToolbar } from './components/BoundaryEditorToolbar';
import { FarmManagementPanel } from './components/FarmManagementPanel';
import { FarmPropertiesPanel } from './components/FarmPropertiesPanel';
import { ActiveFarmBanner } from './components/ActiveFarmBanner';
import { DemoWalkthroughPlayer } from './components/DemoWalkthroughPlayer';
import { ObservationDashboard } from './components/ObservationDashboard';
import { SoilIntelligence } from './components/SoilIntelligence';
import { ClimateSimulator } from './components/ClimateSimulator';
import { CropRotationPanel } from './components/CropRotationPanel';
const FarmDigitalTwin = lazy(() =>
  import('./components/FarmDigitalTwin').then((m) => ({ default: m.FarmDigitalTwin }))
);
import { AgronomistAssistant } from './components/AgronomistAssistant';
import { AdvisoryReportModal } from './components/AdvisoryReportModal';

class WorkspaceErrorBoundary extends Component<
  { children: ReactNode; label: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode; label: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[WorkspaceErrorBoundary:${this.props.label}]`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-5 text-xs text-rose-200 space-y-2">
          <div className="font-semibold">Module Recovery Notice ({this.props.label})</div>
          <p className="text-[#8CA2BD]">{this.state.message || 'An unexpected rendering issue occurred.'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-3 py-1.5 rounded-lg bg-[#091426] border border-[#32D9FF]/30 text-[#F4F8FF] hover:border-[#32D9FF]"
          >
            Reload Module
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface NavDefinition {
  id: ActiveWorkspace;
  label: string;
  shortDesc: string;
  icon: React.ReactNode;
}

const MISSION_NAV_ITEMS: NavDefinition[] = [
  {
    id: 'overview',
    label: 'Mission Overview',
    shortDesc: '3D Earth Landing',
    icon: <Compass className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'earth',
    label: 'Earth Explorer',
    shortDesc: '3D Globe & Terrain',
    icon: <Globe className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'operations',
    label: 'Farm Operations',
    shortDesc: 'Map & Boundary Editor',
    icon: <Layers className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'satellite',
    label: 'Satellite Intelligence',
    shortDesc: 'NASA POWER & SoilGrids',
    icon: <Satellite className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'rotation-lab',
    label: 'Crop Rotation Lab',
    shortDesc: '4-Strategy AI Engine',
    icon: <Sprout className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'climate-sim',
    label: 'Climate Simulator',
    shortDesc: 'Drought & Stress Lab',
    icon: <CloudRain className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'digital-twin',
    label: '3D Farm Digital Twin',
    shortDesc: 'Three.js Subsurface Twin',
    icon: <Box className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'agronomist',
    label: 'AI Agronomist',
    shortDesc: 'EN / KN / HI Copilot',
    icon: <Bot className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'command',
    label: 'Farmer Command Center',
    shortDesc: '12-Month Calendar',
    icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'reports',
    label: 'Mission Reports',
    shortDesc: 'Advisory & Science Audit',
    icon: <FileText className="w-4 h-4 shrink-0" />,
  },
  {
    id: 'demo',
    label: 'Mission Briefing',
    shortDesc: 'Narrated Video (/demo)',
    icon: <Film className="w-4 h-4 shrink-0" />,
  },
];

function normalizeWorkspaceId(ws: ActiveWorkspace): ActiveWorkspace {
  if (ws === 'showcase') return 'overview';
  if (ws === 'map') return 'operations';
  if (ws === 'observations') return 'satellite';
  if (ws === 'rotation-twin') return 'rotation-lab';
  if (ws === 'methodology') return 'reports';
  return ws;
}

function getInitialWorkspace(): ActiveWorkspace {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/demo')) {
    return 'demo';
  }
  return 'overview';
}

function AppContent() {
  const {
    farms,
    activeFarm,
    persistence,
    selectFarmImmediate,
    createFarm,
    updateFarm,
    deleteFarm,
    observations,
    soil,
    sentinel2Catalog,
    obsLoading,
    soilLoading,
    sentinel2Loading,
    obsError,
    soilError,
    retryFarmDatasets,
    scenario,
    impact,
    savedScenarios,
    changeScenario,
    saveScenario,
    deleteScenario,
    farmerPriority,
    farmRotationInputs,
    rotationPlan,
    selectedStrategyId,
    generatingAi,
    aiError,
    setSelectedStrategyId,
    changeFarmerPriority,
    changeFarmInputs,
    generateAiRotation,
    agronomistLang,
    setAgronomistLang,
    agronomistMessages,
    addAgronomistMessage,
    clearAgronomistMessages,
  } = useSelectedFarm();

  const [rawWorkspace, setWorkspaceState] = useState<ActiveWorkspace>(() => getInitialWorkspace());
  const workspace = normalizeWorkspaceId(rawWorkspace);

  // Mission Control Shell Navigation & Drawers
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));

  const [settings, setSettings] = useState<MissionUserSettings>(() => loadMissionSettings());
  const [pendingAction, setPendingAction] = useState<{ label: string; execute: () => void } | null>(null);
  const [demoRestartNonce, setDemoRestartNonce] = useState(0);

  const [uiMode, setUiMode] = useState<UiExperienceMode>(() => loadUiMode());
  const [demoActive, setDemoActive] = useState(false);
  const [demoStepIndex, setDemoStepIndex] = useState(0);

  const [basemap, setBasemap] = useState<BasemapId>('esri-imagery');
  const [scientificOverlay, setScientificOverlay] = useState<ScientificOverlayId>('none');
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Live UTC Mission Control clock
  useEffect(() => {
    const id = window.setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const updateSettings = (patch: Partial<MissionUserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveMissionSettings(next);
      return next;
    });
  };

  // Browser URL history sync for /demo route
  const applyWorkspaceImmediate = useCallback((ws: ActiveWorkspace) => {
    const normalized = normalizeWorkspaceId(ws);
    setWorkspaceState(normalized);
    setNotificationsOpen(false);
    setSettingsOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = normalized === 'demo' ? '/demo' : '/';
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ workspace: normalized }, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setWorkspaceState(getInitialWorkspace());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const editor = useBoundaryEditor({
    activeFarm,
    onPersistUpdateFarm: updateFarm,
    onPersistCreateFarm: createFarm,
    persistence,
  });

  const handleChangeUiMode = (mode: UiExperienceMode) => {
    setUiMode(mode);
    saveUiMode(mode);
  };

  const handleRequestSelectFarm = useCallback(
    (farm: FarmParcel) => {
      if (farm.id === activeFarm.id) return;
      if (editor.hasUnsavedChanges) {
        setPendingAction({
          label: `Switch parcel from "${activeFarm.name}" to "${farm.name}"`,
          execute: () => selectFarmImmediate(farm),
        });
        return;
      }
      selectFarmImmediate(farm);
    },
    [activeFarm.id, activeFarm.name, editor.hasUnsavedChanges, selectFarmImmediate]
  );

  const handleRequestNavigate = useCallback(
    (nextWs: ActiveWorkspace) => {
      const target = normalizeWorkspaceId(nextWs);
      if (target === workspace) return;
      const isBothSpatialEditors =
        (workspace === 'operations' || workspace === 'earth') &&
        (target === 'operations' || target === 'earth');
      if (editor.hasUnsavedChanges && !isBothSpatialEditors) {
        setPendingAction({
          label: `Leave the boundary editor for ${
            MISSION_NAV_ITEMS.find((n) => n.id === target)?.label || target
          }`,
          execute: () => applyWorkspaceImmediate(target),
        });
        return;
      }
      applyWorkspaceImmediate(target);
    },
    [applyWorkspaceImmediate, editor.hasUnsavedChanges, workspace]
  );

  const handleDuplicateFarm = useCallback(
    async (farm: FarmParcel) => {
      const copy: FarmParcel = {
        ...farm,
        id: `farm-${Date.now()}`,
        name: `${farm.name} (Copy)`,
        boundaryStatus: 'Draft',
        updatedAt: new Date().toISOString(),
      };
      await createFarm(copy);
    },
    [createFarm]
  );

  const handleDeleteFarm = useCallback(
    async (farmId: string) => {
      await deleteFarm(farmId);
    },
    [deleteFarm]
  );

  const activeStrategy = useMemo(
    () => rotationPlan.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan.strategies[0],
    [rotationPlan, selectedStrategyId]
  );

  const handleCreateFarmFromCommandCenter = (newFarm: FarmParcel) => {
    createFarm(newFarm).catch(() => {});
  };

  const handleSelectCoordinates = async (lat: number, lon: number, label?: string, elevation?: number) => {
    const delta = 0.0025;
    const boundary: [number, number][] = [
      [lon - delta, lat + delta],
      [lon + delta, lat + delta],
      [lon + delta, lat - delta],
      [lon - delta, lat - delta],
      [lon - delta, lat + delta],
    ];
    const stats = calculateGeometryStats(boundary);
    const isKa = lat >= 11.5 && lat <= 18.6 && lon >= 74 && lon <= 78.6;
    const customParcel: FarmParcel = {
      id: `probed-${Date.now()}`,
      name: label || `Custom Parcel (${stats.center.lat.toFixed(2)}°, ${stats.center.lon.toFixed(2)}°)`,
      region: label || (isKa ? 'Karnataka, India' : 'Global Probed Location'),
      district: label || 'Needs farmer input',
      state: isKa ? 'Karnataka' : 'Needs farmer input',
      country: isKa ? 'India' : 'Global',
      isKarnatakaDemo: isKa,
      agroClimaticZone: 'Site-Specific Satellite Sample',
      elevationMeters: elevation ?? 420,
      areaHectares: stats.areaHectares,
      areaAcres: stats.areaAcres,
      perimeterMeters: stats.perimeterMeters,
      boundingBox: stats.boundingBox,
      geometryVersion: stats.geometryVersion,
      geometryType: 'Polygon',
      primarySoilType: 'Needs farmer input',
      dominantCrops: [],
      irrigationType: undefined,
      boundaryStatus: 'Draft',
      center: stats.center,
      boundary,
      zones: [],
      description: 'Custom field parcel sampled directly via FIELD SHIFT geospatial coordinates.',
      updatedAt: new Date().toISOString(),
    };
    try {
      await createFarm(customParcel);
    } catch {
      selectFarmImmediate(customParcel);
    }
  };

  const handleSelectDemoStep = (idx: number) => {
    const clamped = Math.max(0, Math.min(MISSION_DEMO_STEPS.length - 1, idx));
    setDemoStepIndex(clamped);
    applyWorkspaceImmediate(MISSION_DEMO_STEPS[clamped].workspace);
  };

  const handleLaunchDemo = () => {
    setDemoActive(true);
    handleSelectDemoStep(0);
  };

  const latestAssistantNote = [...agronomistMessages].reverse().find((m) => m.role === 'assistant')?.content;
  const latestS2 = sentinel2Catalog?.scenes?.[0];

  // Real system & telemetry alerts for the Notifications drawer
  const missionAlerts = useMemo(() => {
    const items: Array<{ id: string; level: 'info' | 'warn' | 'ok'; title: string; detail: string }> = [];
    if (editor.hasUnsavedChanges) {
      items.push({
        id: 'unsaved-boundary',
        level: 'warn',
        title: `Unsaved geometry edits on ${activeFarm.name}`,
        detail: 'Save changes in the Boundary Editor toolbar to persist to Express JSON store.',
      });
    }
    if (observations?.sourceStatus.nasaPower === 'fallback') {
      items.push({
        id: 'nasa-fallback',
        level: 'warn',
        title: 'NASA POWER Regional Climatology Fallback Active',
        detail: observations.sourceStatus.message || 'Upstream NASA POWER API timed out; showing baseline.',
      });
    } else if (observations) {
      items.push({
        id: 'nasa-live',
        level: 'ok',
        title: 'NASA POWER AG Daily Synchronized',
        detail: `${observations.sourceStatus.nasaPowerMeta?.validDays ?? 90} daily records (${observations.sourceStatus.nasaPowerMeta?.startDate} → ${observations.sourceStatus.nasaPowerMeta?.endDate}).`,
      });
    }
    if (impact.waterStressIndex >= 65) {
      items.push({
        id: 'stress-high',
        level: 'warn',
        title: `Elevated Simulated Water Stress (${impact.waterStressIndex}/100)`,
        detail: `Under "${scenario.label}", review drought-tolerant millet/pulse strategies.`,
      });
    }
    if (latestS2) {
      items.push({
        id: 's2-scene',
        level: 'info',
        title: `Copernicus Sentinel-2 L2A (${latestS2.date})`,
        detail: `${latestS2.cloudCoverPct}% cloud cover · MGRS Tile ${latestS2.mgrsTile} · 10 m resolution.`,
      });
    }
    return items;
  }, [editor.hasUnsavedChanges, activeFarm.name, observations, impact.waterStressIndex, scenario.label, latestS2]);

  const alertWarnCount = missionAlerts.filter((a) => a.level === 'warn').length;
  const activeNavDef = MISSION_NAV_ITEMS.find((n) => n.id === workspace) || MISSION_NAV_ITEMS[0];
  const showRightContextPanel = workspace !== 'overview' && workspace !== 'demo';

  const formatArea = (ha: number) =>
    settings.areaUnit === 'acres' ? `${hectaresToAcres(ha)} ac` : `${ha} ha`;

  return (
    <div
      className={`min-h-screen bg-[#050914] text-[#F4F8FF] flex flex-col ${
        settings.reducedMotion ? 'reduced-motion' : ''
      }`}
    >
      {/* AEROSPACE TOP COMMAND BAR (Single-row, clean 3-zone header) */}
      <header className="sticky top-0 z-40 h-14 bg-[#050914]/95 backdrop-blur-md border-b border-[#32D9FF]/18 px-3 lg:px-5 flex items-center justify-between gap-3 no-print">
        {/* Left: Sidebar Toggle & Brand */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="Toggle left mission navigation rail"
            className="hidden lg:flex p-1.5 rounded-lg border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#32D9FF] hover:border-[#32D9FF]/50"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden p-1.5 rounded-lg border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#F4F8FF]"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => handleRequestNavigate('overview')}
            className="flex items-center gap-2 text-left group whitespace-nowrap shrink-0"
          >
            <span className="font-display text-base sm:text-lg font-bold tracking-[0.14em] text-[#F4F8FF] group-hover:text-[#32D9FF] transition-colors">
              FIELD SHIFT
            </span>
          </button>

          <span className="hidden md:inline-block text-[#32D9FF]/30">/</span>
          <span className="hidden md:inline-block font-mono text-[11px] uppercase tracking-wider text-[#32D9FF] truncate">
            {activeNavDef.label}
          </span>
        </div>

        {/* Center: Active Farm Selector & Real Telemetry Sync Status */}
        <div className="hidden sm:flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 bg-[#091426] border border-[#32D9FF]/22 rounded-lg px-2.5 py-1">
            <MapPin className="w-3.5 h-3.5 text-[#52E3A4] shrink-0" />
            <select
              aria-label="Select active farm parcel"
              value={activeFarm.id}
              onChange={(e) => {
                const picked = farms.find((f) => f.id === e.target.value);
                if (picked) handleRequestSelectFarm(picked);
              }}
              className="bg-transparent text-xs font-medium text-[#F4F8FF] focus:outline-none max-w-[200px] lg:max-w-[260px] cursor-pointer"
            >
              {farms.map((f) => (
                <option key={f.id} value={f.id} className="bg-[#091426] text-[#F4F8FF]">
                  {f.name} ({formatArea(f.areaHectares)})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => retryFarmDatasets()}
            disabled={obsLoading}
            title="Re-fetch NASA POWER, Open-Meteo, Sentinel-2 & ISRIC SoilGrids"
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#091426] border border-[#32D9FF]/20 text-[11px] font-mono text-[#8CA2BD] hover:text-[#32D9FF] hover:border-[#32D9FF]/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 text-[#32D9FF] ${obsLoading ? 'animate-spin' : ''}`} />
            <span>
              {obsLoading
                ? 'Syncing...'
                : observations?.sourceStatus.nasaPower === 'live'
                  ? '● NASA Live'
                  : '▲ Baseline'}
            </span>
          </button>
        </div>

        {/* Right: Mission Clock, Notifications, Settings, Right Inspector Toggle, Briefing & Report */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#091426] border border-[#32D9FF]/15 font-mono tabular-nums text-[11px] text-[#8CA2BD]">
            <span className="text-[#32D9FF]">UTC</span>
            <span className="text-[#F4F8FF]">{utcClock}</span>
          </div>

          {/* Notifications Trigger */}
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((v) => !v);
              setSettingsOpen(false);
            }}
            aria-label="Mission notifications and telemetry status"
            className="relative p-2 rounded-lg bg-[#091426] border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#32D9FF] hover:border-[#32D9FF]/50"
          >
            <Bell className="w-4 h-4" />
            {alertWarnCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FFB84D] text-[#050914] font-mono text-[9px] font-bold flex items-center justify-center">
                {alertWarnCount}
              </span>
            )}
          </button>

          {/* Settings Trigger */}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((v) => !v);
              setNotificationsOpen(false);
            }}
            aria-label="Mission Control preferences and audio settings"
            className="p-2 rounded-lg bg-[#091426] border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#32D9FF] hover:border-[#32D9FF]/50"
          >
            <Settings className="w-4 h-4" />
          </button>

          {showRightContextPanel && (
            <button
              type="button"
              onClick={() => setRightPanelOpen((v) => !v)}
              aria-label="Toggle right contextual intelligence drawer"
              className="hidden xl:flex p-2 rounded-lg bg-[#091426] border border-[#32D9FF]/20 text-[#8CA2BD] hover:text-[#32D9FF] hover:border-[#32D9FF]/50"
            >
              {rightPanelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => handleRequestNavigate('demo')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
              workspace === 'demo'
                ? 'bg-[#32D9FF] text-[#050914] border-[#32D9FF]'
                : 'bg-[#091426] border-[#32D9FF]/30 text-[#32D9FF] hover:bg-[#32D9FF]/15'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Briefing</span>
          </button>

          <button
            type="button"
            onClick={() => setReportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg bg-[#52E3A4] text-[#050914] text-xs font-bold hover:bg-[#52E3A4]/90 transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Brief</span>
          </button>

          {/* Notifications Popover */}
          {notificationsOpen && (
            <div className="absolute right-0 top-12 w-80 sm:w-96 mission-glass rounded-xl p-4 shadow-2xl z-50 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-[#32D9FF]/15 pb-2">
                <span className="font-semibold text-[#F4F8FF]">Mission Telemetry &amp; Alerts</span>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-[#8CA2BD] hover:text-[#F4F8FF]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {missionAlerts.map((al) => (
                  <div
                    key={al.id}
                    className={`p-2.5 rounded-lg border ${
                      al.level === 'warn'
                        ? 'bg-[#FFB84D]/10 border-[#FFB84D]/40'
                        : al.level === 'ok'
                          ? 'bg-[#52E3A4]/10 border-[#52E3A4]/35'
                          : 'bg-[#050914] border-[#32D9FF]/20'
                    }`}
                  >
                    <div className="font-semibold text-[#F4F8FF]">{al.title}</div>
                    <div className="text-[11px] text-[#8CA2BD] mt-0.5 leading-snug">{al.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings Popover */}
          {settingsOpen && (
            <div className="absolute right-0 top-12 w-80 mission-glass rounded-xl p-4 shadow-2xl z-50 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-[#32D9FF]/15 pb-2">
                <span className="font-semibold text-[#F4F8FF]">Mission Control Preferences</span>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="text-[#8CA2BD] hover:text-[#F4F8FF]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-[#8CA2BD]">Area Measurement Unit</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['ha', 'acres'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => updateSettings({ areaUnit: unit })}
                      className={`py-1.5 rounded-lg border font-mono text-xs ${
                        settings.areaUnit === unit
                          ? 'bg-[#32D9FF]/20 border-[#32D9FF] text-[#32D9FF] font-semibold'
                          : 'bg-[#050914] border-[#32D9FF]/15 text-[#8CA2BD]'
                      }`}
                    >
                      {unit === 'ha' ? 'Hectares (ha)' : 'Acres (ac)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-mono text-[#8CA2BD]">Advisory Complexity Mode</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['farmer', 'researcher'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleChangeUiMode(m)}
                      className={`py-1.5 rounded-lg border text-xs capitalize ${
                        uiMode === m
                          ? 'bg-[#52E3A4]/20 border-[#52E3A4] text-[#52E3A4] font-semibold'
                          : 'bg-[#050914] border-[#32D9FF]/15 text-[#8CA2BD]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-[#F4F8FF]">Reduced Motion (Accessibility)</span>
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
                  className="accent-[#32D9FF]"
                />
              </label>

              <div className="space-y-1 pt-1 border-t border-[#32D9FF]/15">
                <div className="flex justify-between text-[11px] text-[#8CA2BD]">
                  <span>Default Narration Volume</span>
                  <span className="font-mono text-[#32D9FF]">{Math.round(settings.defaultNarrationVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.defaultNarrationVolume}
                  onChange={(e) => updateSettings({ defaultNarrationVolume: Number(e.target.value) })}
                  className="w-full accent-[#32D9FF]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#8CA2BD]">
                  <span>Default Ambient Score Volume</span>
                  <span className="font-mono text-[#52E3A4]">{Math.round(settings.defaultMusicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.defaultMusicVolume}
                  onChange={(e) => updateSettings({ defaultMusicVolume: Number(e.target.value) })}
                  className="w-full accent-[#52E3A4]"
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile / Tablet Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#091426]/98 border-b border-[#32D9FF]/20 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2 no-print z-30">
          {MISSION_NAV_ITEMS.map((item) => {
            const active = workspace === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  handleRequestNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium text-left border ${
                  active
                    ? 'bg-[#32D9FF]/18 text-[#32D9FF] border-[#32D9FF]/50'
                    : 'bg-[#050914] text-[#8CA2BD] border-[#32D9FF]/15 hover:text-[#F4F8FF]'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Unsaved Boundary Edits Confirmation Modal */}
      {pendingAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <div className="mission-panel border-[#FFB84D]/55 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#FFB84D] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#F4F8FF]">Unsaved Boundary Changes</h3>
                <p className="text-xs text-[#8CA2BD] leading-relaxed">
                  You have modified {activeFarm.name} without saving. Save changes before you{' '}
                  <span className="text-[#32D9FF] font-medium">{pendingAction.label}</span>?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-3.5 py-2 rounded-lg border border-[#32D9FF]/25 text-xs text-[#8CA2BD] hover:text-[#F4F8FF]"
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={() => {
                  const run = pendingAction.execute;
                  editor.cancelChanges();
                  setPendingAction(null);
                  run();
                }}
                className="px-3.5 py-2 rounded-lg bg-rose-500/20 border border-rose-500/50 text-xs font-semibold text-rose-200 hover:bg-rose-500/30"
              >
                Discard &amp; Continue
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const run = pendingAction.execute;
                    await editor.saveChanges();
                    setPendingAction(null);
                    run();
                  } catch {
                    setPendingAction(null);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#52E3A4] text-[#050914] text-xs font-bold hover:bg-[#52E3A4]/90"
              >
                Save &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guided 10-Step Mission Demonstration Bar */}
      <GuidedMissionDemo
        active={demoActive}
        stepIndex={demoStepIndex}
        onSelectStep={handleSelectDemoStep}
        onClose={() => setDemoActive(false)}
        onSelectFarm={handleRequestSelectFarm}
        onGenerateAiRotation={generateAiRotation}
        onChangeScenario={changeScenario}
        onOpenReportModal={() => setReportModalOpen(true)}
        generatingAi={generatingAi}
      />

      {/* MISSION CONTROL BODY: LEFT RAIL + CENTER CANVAS + RIGHT CONTEXTUAL PANEL */}
      <div className="flex-1 flex min-w-0">
        {/* COLLAPSIBLE LEFT NAVIGATION RAIL (Desktop) */}
        <aside
          className={`hidden lg:flex flex-col justify-between bg-[#060C1A] border-r border-[#32D9FF]/16 transition-all duration-200 shrink-0 no-print ${
            sidebarCollapsed ? 'w-16' : 'w-60'
          }`}
        >
          <div className="p-2.5 space-y-1 sticky top-14">
            {!sidebarCollapsed && (
              <div className="px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8CA2BD]/75">
                Mission Workspaces
              </div>
            )}
            {MISSION_NAV_ITEMS.map((item) => {
              const active = workspace === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => handleRequestNavigate(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors ${
                    active
                      ? 'bg-[#1769FF]/22 border-[#32D9FF]/55 text-[#F4F8FF]'
                      : 'border-transparent text-[#8CA2BD] hover:bg-[#091426] hover:text-[#F4F8FF]'
                  }`}
                >
                  <span className={active ? 'text-[#32D9FF]' : 'text-[#8CA2BD]'}>{item.icon}</span>
                  {!sidebarCollapsed && (
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      <div className="text-[10px] text-[#8CA2BD]/80 truncate">{item.shortDesc}</div>
                    </div>
                  )}
                </button>
              );
            })}

            {!sidebarCollapsed && (
              <div className="pt-3 mt-3 border-t border-[#32D9FF]/12 px-1">
                <button
                  type="button"
                  onClick={() => (demoActive ? setDemoActive(false) : handleLaunchDemo())}
                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    demoActive
                      ? 'bg-[#32D9FF]/20 border-[#32D9FF] text-[#32D9FF]'
                      : 'bg-[#091426] border-[#32D9FF]/25 text-[#52E3A4] hover:border-[#52E3A4]'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{demoActive ? 'Exit Guided Tour' : 'Launch Guided Tour'}</span>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER GEOSPATIAL CANVAS / ACTIVE LABORATORY */}
        <main className="flex-1 min-w-0 px-3 sm:px-5 lg:px-6 py-4 space-y-5">
          {workspace !== 'overview' && workspace !== 'demo' && (
            <ActiveFarmBanner moduleTitle={activeNavDef.label} areaUnit={settings.areaUnit} />
          )}

          {workspace === 'overview' && (
            <WorkspaceErrorBoundary label="MissionOverview">
              <MissionShowcaseHome
                farms={farms}
                activeFarm={activeFarm}
                onSelectFarm={handleRequestSelectFarm}
                observations={observations}
                soil={soil}
                sentinel2Catalog={sentinel2Catalog}
                scenario={scenario}
                impact={impact}
                rotationPlan={rotationPlan}
                onLaunchMissionDemo={handleLaunchDemo}
                onOpenDemoPage={() => handleRequestNavigate('demo')}
                onNavigate={handleRequestNavigate}
                areaUnit={settings.areaUnit}
                reducedMotion={settings.reducedMotion}
                defaultNarrationVolume={settings.defaultNarrationVolume}
                defaultMusicVolume={settings.defaultMusicVolume}
              />
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'demo' && (
            <WorkspaceErrorBoundary label="MissionBriefingDemo">
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mission-panel rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleRequestNavigate('operations')}
                      className="flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg bg-[#050914] border border-[#32D9FF]/30 text-xs font-semibold text-[#F4F8FF] hover:border-[#32D9FF]"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#32D9FF]" />
                      <span>Back to Mission Control</span>
                    </button>
                    <div className="text-xs text-[#8CA2BD]">
                      Dedicated Narrated Briefing (<span className="font-mono text-[#32D9FF]">/demo</span>)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDemoRestartNonce((n) => n + 1)}
                    className="flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg bg-[#52E3A4] text-[#050914] text-xs font-bold hover:bg-[#52E3A4]/90"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restart Briefing</span>
                  </button>
                </div>

                <DemoWalkthroughPlayer
                  farms={farms}
                  activeFarm={activeFarm}
                  observations={observations}
                  soil={soil}
                  sentinel2Catalog={sentinel2Catalog}
                  scenario={scenario}
                  impact={impact}
                  rotationPlan={rotationPlan}
                  onNavigate={handleRequestNavigate}
                  variant="dedicated"
                  initialAutoPlay
                  externalRestartNonce={demoRestartNonce}
                  defaultNarrationVolume={settings.defaultNarrationVolume}
                  defaultMusicVolume={settings.defaultMusicVolume}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'earth' && (
            <WorkspaceErrorBoundary label="EarthExplorer">
              <section className="space-y-4">
                <BoundaryEditorToolbar
                  editor={editor}
                  persistence={persistence}
                  viewLabel="3D Globe"
                />
                <EarthExplorer
                  farms={farms}
                  activeFarm={activeFarm}
                  editor={editor}
                  basemap={basemap}
                  onChangeBasemap={setBasemap}
                  overlay={scientificOverlay}
                  onChangeOverlay={setScientificOverlay}
                  sentinel2Catalog={sentinel2Catalog}
                  onSelectFarm={handleRequestSelectFarm}
                  onSelectCoordinates={(lat, lon) => handleSelectCoordinates(lat, lon)}
                  onOpenPrecisionMap={() => handleRequestNavigate('operations')}
                />
                <FarmPropertiesPanel areaUnit={settings.areaUnit} />
                <FarmManagementPanel
                  farms={farms}
                  activeFarm={activeFarm}
                  editor={editor}
                  persistence={persistence}
                  onSelectFarm={handleRequestSelectFarm}
                  onDuplicateFarm={handleDuplicateFarm}
                  onDeleteFarm={handleDeleteFarm}
                  onCreateNewFarmViaForm={async (f) => {
                    await createFarm(f);
                  }}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'operations' && (
            <WorkspaceErrorBoundary label="FarmOperations">
              <section className="space-y-4">
                <BoundaryEditorToolbar
                  editor={editor}
                  persistence={persistence}
                  viewLabel="2D Satellite Map"
                />
                <SatelliteMap
                  farms={farms}
                  activeFarm={activeFarm}
                  editor={editor}
                  basemap={basemap}
                  onChangeBasemap={setBasemap}
                  overlay={scientificOverlay}
                  onChangeOverlay={setScientificOverlay}
                  sentinel2Catalog={sentinel2Catalog}
                  sentinel2Loading={sentinel2Loading}
                  onSelectFarm={handleRequestSelectFarm}
                  onSelectSearchLocation={(lat, lon, label, elev) =>
                    handleSelectCoordinates(lat, lon, label, elev)
                  }
                  onOpenEarthGlobe={() => handleRequestNavigate('earth')}
                />
                <FarmPropertiesPanel areaUnit={settings.areaUnit} />
                <FarmManagementPanel
                  farms={farms}
                  activeFarm={activeFarm}
                  editor={editor}
                  persistence={persistence}
                  onSelectFarm={handleRequestSelectFarm}
                  onDuplicateFarm={handleDuplicateFarm}
                  onDeleteFarm={handleDeleteFarm}
                  onCreateNewFarmViaForm={async (f) => {
                    await createFarm(f);
                  }}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'satellite' && (
            <WorkspaceErrorBoundary label="SatelliteIntelligence">
              <section className="space-y-5">
                <ObservationDashboard
                  observations={observations}
                  loading={obsLoading}
                  error={obsError}
                  onRetry={() => retryFarmDatasets('nasaPower')}
                />
                <SoilIntelligence
                  soil={soil}
                  loading={soilLoading}
                  error={soilError}
                  onRetry={() => retryFarmDatasets('soil')}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'rotation-lab' && (
            <WorkspaceErrorBoundary label="CropRotationLab">
              <section className="space-y-5">
                <CropRotationPanel
                  farm={activeFarm}
                  soil={soil}
                  observations={observations}
                  scenario={scenario}
                  farmInputs={farmRotationInputs}
                  onChangeFarmInputs={changeFarmInputs}
                  plan={rotationPlan}
                  farmerPriority={farmerPriority}
                  onChangeFarmerPriority={changeFarmerPriority}
                  selectedStrategyId={selectedStrategyId}
                  onSelectStrategy={setSelectedStrategyId}
                  onGenerateAiPlan={generateAiRotation}
                  generating={generatingAi}
                  aiError={aiError}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'climate-sim' && (
            <WorkspaceErrorBoundary label="ClimateSimulator">
              <section className="space-y-5">
                <ClimateSimulator
                  scenario={scenario}
                  onChangeScenario={changeScenario}
                  observations={observations}
                  farm={activeFarm}
                  soil={soil}
                  strategies={rotationPlan.strategies}
                  farmInputs={farmRotationInputs}
                  farmerPriority={farmerPriority}
                  onSaveScenario={saveScenario}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'digital-twin' && (
            <WorkspaceErrorBoundary label="3DFarmDigitalTwin">
              <section className="space-y-5">
                <Suspense
                  fallback={
                    <div className="w-full h-[580px] lg:h-[660px] rounded-xl border border-[#32D9FF]/20 bg-[#091426] flex items-center justify-center text-xs font-mono text-[#8CA2BD]">
                      Initializing Three.js 3D Agricultural Digital Twin...
                    </div>
                  }
                >
                  <FarmDigitalTwin
                    farm={activeFarm}
                    soil={soil}
                    strategy={activeStrategy}
                    scenario={scenario}
                    impact={impact}
                    observations={observations}
                    sentinel2Catalog={sentinel2Catalog}
                  />
                </Suspense>
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'agronomist' && (
            <WorkspaceErrorBoundary label="AIAgronomist">
              <section className="space-y-5">
                <AgronomistAssistant
                  farm={activeFarm}
                  observations={observations}
                  soil={soil}
                  scenario={scenario}
                  impact={impact}
                  sentinel2Catalog={sentinel2Catalog}
                  rotationPlan={rotationPlan}
                  selectedStrategyId={selectedStrategyId}
                  farmInputs={farmRotationInputs}
                  farmerPriority={farmerPriority}
                  uiMode={uiMode}
                  language={agronomistLang}
                  onChangeLanguage={setAgronomistLang}
                  messages={agronomistMessages}
                  onAddMessage={addAgronomistMessage}
                  onClearMessages={clearAgronomistMessages}
                  onOpenReportModal={() => setReportModalOpen(true)}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'command' && (
            <WorkspaceErrorBoundary label="FarmerCommandCenter">
              <FarmerCommandCenter
                farms={farms}
                activeFarm={activeFarm}
                onSelectFarm={handleRequestSelectFarm}
                onCreateFarm={handleCreateFarmFromCommandCenter}
                observations={observations}
                soil={soil}
                sentinel2Catalog={sentinel2Catalog}
                scenario={scenario}
                impact={impact}
                rotationPlan={rotationPlan}
                selectedStrategyId={selectedStrategyId}
                onSelectStrategy={setSelectedStrategyId}
                farmInputs={farmRotationInputs}
                onChangeFarmInputs={changeFarmInputs}
                savedScenarios={savedScenarios}
                onLoadScenario={changeScenario}
                onDeleteScenario={deleteScenario}
                uiMode={uiMode}
                onChangeUiMode={handleChangeUiMode}
                onNavigate={handleRequestNavigate}
                onOpenReportModal={() => setReportModalOpen(true)}
              />
            </WorkspaceErrorBoundary>
          )}

          {workspace === 'reports' && (
            <WorkspaceErrorBoundary label="MissionReportsAndScience">
              <section className="space-y-5">
                <div className="mission-panel rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-[#52E3A4]">
                      Mission Reports &amp; Advisory Export
                    </div>
                    <h2 className="font-display text-xl font-bold text-[#F4F8FF]">
                      Farm Resilience Advisory Brief — {activeFarm.name}
                    </h2>
                    <p className="text-xs text-[#8CA2BD]">
                      Compile parcel boundaries, NASA POWER 90-day observations, SoilGrids horizons, climate stress scenario, and Crop Rotation recommendations into printable PDF, CSV, JSON, or HTML formats.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReportModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#52E3A4] text-[#050914] text-xs font-bold hover:bg-[#52E3A4]/90 shrink-0"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Open Advisory Export Modal</span>
                  </button>
                </div>

                <ScienceMethodologyCenter
                  observations={observations}
                  soil={soil}
                  sentinel2Catalog={sentinel2Catalog}
                  uiMode={uiMode}
                  onChangeUiMode={handleChangeUiMode}
                />
              </section>
            </WorkspaceErrorBoundary>
          )}
        </main>

        {/* COLLAPSIBLE RIGHT CONTEXTUAL INTELLIGENCE PANEL */}
        {showRightContextPanel && rightPanelOpen && (
          <aside className="hidden xl:flex flex-col w-80 bg-[#060C1A] border-l border-[#32D9FF]/16 p-4 space-y-4 shrink-0 no-print overflow-y-auto max-h-[calc(100vh-3.5rem)] sticky top-14">
            <div className="flex items-center justify-between border-b border-[#32D9FF]/15 pb-2.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#32D9FF]">
                Contextual Intelligence
              </span>
              <span className="font-mono text-[10px] text-[#52E3A4]">
                {activeFarm.boundaryStatus || 'Verified'}
              </span>
            </div>

            <FarmPropertiesPanel compact areaUnit={settings.areaUnit} />

            {/* NASA & Soil Snapshot */}
            <div className="bg-[#091426] border border-[#32D9FF]/18 rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
                Observed Telemetry
              </div>
              <div className="space-y-1.5 font-mono tabular-nums text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#8CA2BD]">90d Air Temp</span>
                  <span className="text-[#F4F8FF]">{observations ? `${observations.summary.meanTempC} °C` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8CA2BD]">90d Rainfall</span>
                  <span className="text-[#32D9FF]">{observations ? `${observations.summary.totalPrecip90dMm} mm` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8CA2BD]">SMAP Root Wetness</span>
                  <span className="text-[#52E3A4]">{observations ? `${observations.summary.meanRootSoilWetnessPct}%` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8CA2BD]">Soil pH / SOC</span>
                  <span className="text-[#F4F8FF]">{soil ? `${soil.phH2O} · ${soil.organicCarbonGKg} g/kg` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8CA2BD]">Sentinel-2 Pass</span>
                  <span className="text-[#32D9FF]">{latestS2 ? latestS2.date : 'Unavailable'}</span>
                </div>
              </div>
            </div>

            {/* Active Strategy & Climate Stress */}
            <div className="bg-[#091426] border border-[#32D9FF]/18 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8CA2BD]">
                  Advisory Synthesis
                </span>
                <span className="font-mono text-[10px] text-[#FFB84D]">
                  Stress {impact.waterStressIndex}/100
                </span>
              </div>
              <div className="font-semibold text-[#52E3A4]">{activeStrategy.name}</div>
              <div className="text-[11px] text-[#8CA2BD] leading-relaxed">
                {activeStrategy.seasons.map((s) => s.crop.split('(')[0].trim()).join(' → ')}
              </div>
              <div className="pt-2 space-y-1.5">
                <button
                  type="button"
                  disabled={generatingAi || !observations || !soil}
                  onClick={generateAiRotation}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#1769FF] text-[#F4F8FF] text-xs font-semibold hover:bg-[#32D9FF] hover:text-[#050914] transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{generatingAi ? 'Running Gemini Engine...' : 'Run AI Rotation'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestNavigate('reports')}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#050914] border border-[#32D9FF]/25 text-xs text-[#8CA2BD] hover:text-[#F4F8FF]"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#52E3A4]" />
                  <span>Data Sources &amp; Reports</span>
                </button>
              </div>
            </div>

            <div className="mt-auto text-[10px] font-mono text-[#8CA2BD] flex items-center gap-1.5 pt-2 border-t border-[#32D9FF]/12">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#52E3A4] shrink-0" />
              <span>
                {persistence.source === 'server-json-store' ? 'Persisted: Express Store' : 'Demo Local Cache'}
              </span>
            </div>
          </aside>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#32D9FF]/14 px-4 lg:px-6 py-3 text-[11px] text-[#8CA2BD] flex flex-wrap items-center justify-between gap-3 bg-[#050914] no-print">
        <span>FIELD SHIFT · Turning Earth&apos;s Data into Smarter Farming Decisions · 2026 NASA Space Apps Challenge</span>
        <span className="font-mono text-[10px]">
          Esri &amp; Sentinel-2 L2A · NASA POWER &amp; GIBS · Open-Meteo · ISRIC SoilGrids · Three.js · Gemini
        </span>
      </footer>

      <AdvisoryReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        payload={{
          farm: activeFarm,
          observations,
          soil,
          scenario,
          impact,
          rotationPlan,
          selectedStrategyId,
          agronomistSummary: latestAssistantNote,
          sentinel2Catalog,
          farmInputs: farmRotationInputs,
          farmerPriority,
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <SelectedFarmProvider>
      <AppContent />
    </SelectedFarmProvider>
  );
}

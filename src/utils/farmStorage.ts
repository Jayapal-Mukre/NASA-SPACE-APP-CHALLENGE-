import {
  FarmParcel,
  FarmRotationInputs,
  SavedScenarioSnapshot,
  UiExperienceMode,
} from '../types/fieldShift';
import { DEMONSTRATION_FARMS } from '../data/farms';

const STORAGE_KEYS = {
  FARMS: 'fieldshift.savedFarms.v1',
  ACTIVE_FARM_ID: 'fieldshift.activeFarmId.v1',
  FARM_INPUTS_BY_ID: 'fieldshift.farmInputsById.v1',
  SCENARIOS: 'fieldshift.savedScenarios.v1',
  UI_MODE: 'fieldshift.uiMode.v1',
};

export function loadSavedFarms(): FarmParcel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FARMS);
    if (!raw) return DEMONSTRATION_FARMS;
    const parsed = JSON.parse(raw) as FarmParcel[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEMONSTRATION_FARMS;
    // Merge missing default Karnataka demo farms if not present
    const existingIds = new Set(parsed.map((f) => f.id));
    const merged = [...parsed];
    for (const demo of DEMONSTRATION_FARMS) {
      if (!existingIds.has(demo.id)) merged.push(demo);
    }
    return merged;
  } catch {
    return DEMONSTRATION_FARMS;
  }
}

export function saveFarmsToStorage(farms: FarmParcel[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FARMS, JSON.stringify(farms));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadActiveFarmId(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_FARM_ID) || DEMONSTRATION_FARMS[0].id;
  } catch {
    return DEMONSTRATION_FARMS[0].id;
  }
}

export function saveActiveFarmId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_FARM_ID, id);
  } catch {
    // Ignore
  }
}

export function loadFarmInputsMap(): Record<string, FarmRotationInputs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FARM_INPUTS_BY_ID);
    return raw ? (JSON.parse(raw) as Record<string, FarmRotationInputs>) : {};
  } catch {
    return {};
  }
}

export function saveFarmInputsForId(farmId: string, inputs: FarmRotationInputs): void {
  try {
    const current = loadFarmInputsMap();
    current[farmId] = inputs;
    localStorage.setItem(STORAGE_KEYS.FARM_INPUTS_BY_ID, JSON.stringify(current));
  } catch {
    // Ignore
  }
}

export function loadSavedScenarios(): SavedScenarioSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SCENARIOS);
    return raw ? (JSON.parse(raw) as SavedScenarioSnapshot[]) : [];
  } catch {
    return [];
  }
}

export function saveScenarioSnapshot(snapshot: SavedScenarioSnapshot): SavedScenarioSnapshot[] {
  const existing = loadSavedScenarios().filter((s) => s.id !== snapshot.id);
  const next = [snapshot, ...existing].slice(0, 12);
  try {
    localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function deleteScenarioSnapshot(id: string): SavedScenarioSnapshot[] {
  const next = loadSavedScenarios().filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.SCENARIOS, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function loadUiMode(): UiExperienceMode {
  try {
    const m = localStorage.getItem(STORAGE_KEYS.UI_MODE);
    return m === 'researcher' ? 'researcher' : 'farmer';
  } catch {
    return 'farmer';
  }
}

export function saveUiMode(mode: UiExperienceMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.UI_MODE, mode);
  } catch {
    // Ignore
  }
}

export interface DemoVideoConfig {
  mp4Url: string;
  narrationAudioUrl?: string;
  title?: string;
}

const DEMO_VIDEO_KEY = 'fieldshift.demoVideoConfig.v1';
const SETTINGS_KEY = 'fieldshift.missionSettings.v1';

export interface MissionUserSettings {
  areaUnit: 'ha' | 'acres';
  reducedMotion: boolean;
  defaultNarrationVolume: number;
  defaultMusicVolume: number;
}

export function loadMissionSettings(): MissionUserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { areaUnit: 'ha', reducedMotion: false, defaultNarrationVolume: 0.9, defaultMusicVolume: 0.25 };
    }
    const p = JSON.parse(raw) as Partial<MissionUserSettings>;
    return {
      areaUnit: p.areaUnit === 'acres' ? 'acres' : 'ha',
      reducedMotion: Boolean(p.reducedMotion),
      defaultNarrationVolume: typeof p.defaultNarrationVolume === 'number' ? p.defaultNarrationVolume : 0.9,
      defaultMusicVolume: typeof p.defaultMusicVolume === 'number' ? p.defaultMusicVolume : 0.25,
    };
  } catch {
    return { areaUnit: 'ha', reducedMotion: false, defaultNarrationVolume: 0.9, defaultMusicVolume: 0.25 };
  }
}

export function saveMissionSettings(settings: MissionUserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function loadDemoVideoConfig(): DemoVideoConfig {
  try {
    const raw = localStorage.getItem(DEMO_VIDEO_KEY);
    if (!raw) return { mp4Url: '', narrationAudioUrl: '' };
    const parsed = JSON.parse(raw) as DemoVideoConfig;
    return {
      mp4Url: typeof parsed?.mp4Url === 'string' ? parsed.mp4Url : '',
      narrationAudioUrl: typeof parsed?.narrationAudioUrl === 'string' ? parsed.narrationAudioUrl : '',
      title: parsed?.title,
    };
  } catch {
    return { mp4Url: '', narrationAudioUrl: '' };
  }
}

export function saveDemoVideoConfig(cfg: DemoVideoConfig): void {
  try {
    localStorage.setItem(DEMO_VIDEO_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore
  }
}

export async function fetchFarmsFromServer(): Promise<{
  farms: FarmParcel[];
  persistenceSource: 'server-json-store' | 'demo-local-fallback';
}> {
  const res = await fetch('/api/farms');
  const data = (await res.json()) as { farms?: FarmParcel[]; error?: string };
  if (!res.ok || !Array.isArray(data.farms)) {
    throw new Error(data.error || 'Failed to load persisted farms from server.');
  }
  saveFarmsToStorage(data.farms);
  return { farms: data.farms, persistenceSource: 'server-json-store' };
}

export async function createFarmOnServer(farm: FarmParcel): Promise<{
  farm: FarmParcel;
  farms: FarmParcel[];
}> {
  const res = await fetch('/api/farms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(farm),
  });
  const data = (await res.json()) as { farm?: FarmParcel; farms?: FarmParcel[]; error?: string };
  if (!res.ok || !data.farm || !Array.isArray(data.farms)) {
    throw new Error(data.error || 'Server rejected new farm geometry.');
  }
  saveFarmsToStorage(data.farms);
  return { farm: data.farm, farms: data.farms };
}

export async function updateFarmOnServer(farm: FarmParcel): Promise<{
  farm: FarmParcel;
  farms: FarmParcel[];
}> {
  const res = await fetch(`/api/farms/${encodeURIComponent(farm.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(farm),
  });
  const data = (await res.json()) as { farm?: FarmParcel; farms?: FarmParcel[]; error?: string };
  if (!res.ok || !data.farm || !Array.isArray(data.farms)) {
    throw new Error(data.error || 'Server failed to save farm changes.');
  }
  saveFarmsToStorage(data.farms);
  return { farm: data.farm, farms: data.farms };
}

export async function patchFarmOnServer(
  farmId: string,
  patch: Partial<FarmParcel>
): Promise<{
  farm: FarmParcel;
  farms: FarmParcel[];
}> {
  const res = await fetch(`/api/farms/${encodeURIComponent(farmId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as { farm?: FarmParcel; farms?: FarmParcel[]; error?: string };
  if (!res.ok || !data.farm || !Array.isArray(data.farms)) {
    throw new Error(data.error || 'Server failed to update farm properties.');
  }
  saveFarmsToStorage(data.farms);
  return { farm: data.farm, farms: data.farms };
}

export async function deleteFarmOnServer(farmId: string): Promise<{
  deletedId: string;
  farms: FarmParcel[];
}> {
  const res = await fetch(`/api/farms/${encodeURIComponent(farmId)}`, {
    method: 'DELETE',
  });
  const data = (await res.json()) as { deletedId?: string; farms?: FarmParcel[]; error?: string };
  if (!res.ok || !Array.isArray(data.farms)) {
    throw new Error(data.error || 'Server failed to delete farm.');
  }
  saveFarmsToStorage(data.farms);
  return { deletedId: data.deletedId || farmId, farms: data.farms };
}

export function buildFarmDatasetCacheKey(
  dataset: string,
  farmId: string,
  geometryVersion: string,
  paramsKey = 'default'
): string {
  return `${dataset}::${farmId}::${geometryVersion}::${paramsKey}`;
}

export async function fetchWithAbort<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}


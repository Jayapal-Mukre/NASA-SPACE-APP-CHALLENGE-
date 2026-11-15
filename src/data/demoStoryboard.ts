export interface DemoSubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface DemoSceneDefinition {
  id: 'scene-1' | 'scene-2' | 'scene-3' | 'scene-4' | 'scene-5' | 'scene-6' | 'scene-7';
  index: number;
  startSec: number;
  endSec: number;
  title: string;
  shortLabel: string;
  workspaceTarget:
    | 'overview'
    | 'earth'
    | 'operations'
    | 'satellite'
    | 'rotation-lab'
    | 'climate-sim'
    | 'digital-twin'
    | 'agronomist'
    | 'command';
  narrationScript: string;
  bulletSummary: string;
  cursorPos: { xPct: number; yPct: number };
  subtitles: DemoSubtitleCue[];
}

export const DEMO_TOTAL_DURATION_SEC = 150; // 2:30 curated mission walkthrough

export const DEMO_SCENE_CHAPTERS: DemoSceneDefinition[] = [
  {
    id: 'scene-1',
    index: 0,
    startSec: 0,
    endSec: 15,
    title: 'Scene 1 · Introduction (0:00–0:15)',
    shortLabel: 'Introduction',
    workspaceTarget: 'overview',
    narrationScript:
      "Welcome to FIELD SHIFT. Turning Earth's data into smarter farming decisions.",
    bulletSummary:
      'Mission launch from orbital Earth intelligence to parcel-scale climate resilience.',
    cursorPos: { xPct: 50, yPct: 52 },
    subtitles: [
      {
        startSec: 0,
        endSec: 6,
        text: 'Welcome to FIELD SHIFT.',
      },
      {
        startSec: 6,
        endSec: 15,
        text: "Turning Earth's data into smarter farming decisions.",
      },
    ],
  },
  {
    id: 'scene-2',
    index: 1,
    startSec: 15,
    endSec: 38,
    title: 'Scene 2 · Earth Explorer (0:15–0:38)',
    shortLabel: 'Earth Explorer',
    workspaceTarget: 'earth',
    narrationScript:
      'Starting from orbit, FIELD SHIFT maps real agricultural regions around the world, revealing terrain, elevation, soil types, and environmental conditions across our 3D Earth Explorer.',
    bulletSummary:
      'Interactive CesiumJS 3D globe with global parcels, terrain DEM, and orbital context.',
    cursorPos: { xPct: 48, yPct: 46 },
    subtitles: [
      {
        startSec: 15,
        endSec: 26,
        text: 'Starting from orbit, FIELD SHIFT maps real agricultural regions around the world,',
      },
      {
        startSec: 26,
        endSec: 38,
        text: 'revealing terrain, elevation, soil types, and environmental conditions across our 3D Earth Explorer.',
      },
    ],
  },
  {
    id: 'scene-3',
    index: 2,
    startSec: 38,
    endSec: 65,
    title: 'Scene 3 · Satellite Intelligence & Precision Mapping (0:38–1:05)',
    shortLabel: 'Satellite Intel',
    workspaceTarget: 'operations',
    narrationScript:
      'Zooming into individual farms, farmers and planners can draw or edit precise parcel boundaries and overlay Sentinel-2 vegetation health, soil moisture, and precipitation data.',
    bulletSummary:
      'Draggable vertices, sub-zone partitioning, Esri/Sentinel-2 imagery, SMAP & GPM layers.',
    cursorPos: { xPct: 60, yPct: 40 },
    subtitles: [
      {
        startSec: 38,
        endSec: 51,
        text: 'Zooming into individual farms, farmers and planners can draw or edit precise parcel boundaries',
      },
      {
        startSec: 51,
        endSec: 65,
        text: 'and overlay Sentinel-2 vegetation health, soil moisture, and precipitation data.',
      },
    ],
  },
  {
    id: 'scene-4',
    index: 3,
    startSec: 65,
    endSec: 92,
    title: 'Scene 4 · Crop Rotation Lab (1:05–1:32)',
    shortLabel: 'Crop Rotation',
    workspaceTarget: 'rotation-lab',
    narrationScript:
      "Using multi-source NASA Earth intelligence, FIELD SHIFT's Crop Rotation Lab compares strategies across water efficiency, nitrogen balance, soil organic carbon, and drought resilience.",
    bulletSummary:
      'Explainable 4-strategy agronomic comparison grounded in SoilGrids pH and NASA telemetry.',
    cursorPos: { xPct: 55, yPct: 54 },
    subtitles: [
      {
        startSec: 65,
        endSec: 78,
        text: "Using multi-source NASA Earth intelligence, FIELD SHIFT's Crop Rotation Lab compares strategies",
      },
      {
        startSec: 78,
        endSec: 92,
        text: 'across water efficiency, nitrogen balance, soil organic carbon, and drought resilience.',
      },
    ],
  },
  {
    id: 'scene-5',
    index: 4,
    startSec: 92,
    endSec: 115,
    title: 'Scene 5 · Climate Simulator (1:32–1:55)',
    shortLabel: 'Climate Sim',
    workspaceTarget: 'climate-sim',
    narrationScript:
      'With the Climate Simulator, decision-makers can test rainfall drops, temperature spikes, and drought stress before planting begins.',
    bulletSummary:
      'ET0 water-balance perturbation, dry-spell delay modeling, and vulnerability matrix.',
    cursorPos: { xPct: 66, yPct: 48 },
    subtitles: [
      {
        startSec: 92,
        endSec: 103,
        text: 'With the Climate Simulator, decision-makers can test rainfall drops,',
      },
      {
        startSec: 103,
        endSec: 115,
        text: 'temperature spikes, and drought stress before planting begins.',
      },
    ],
  },
  {
    id: 'scene-6',
    index: 5,
    startSec: 115,
    endSec: 135,
    title: 'Scene 6 · AI Agronomist Copilot (1:55–2:15)',
    shortLabel: 'AI Agronomist',
    workspaceTarget: 'agronomist',
    narrationScript:
      'And with the AI Agronomist Copilot, farmers receive personalized, data-backed guidance in English, Kannada, or Hindi.',
    bulletSummary:
      'Multilingual Gemini copilot separating verified NASA observations from modeled estimates.',
    cursorPos: { xPct: 44, yPct: 60 },
    subtitles: [
      {
        startSec: 115,
        endSec: 125,
        text: 'And with the AI Agronomist Copilot, farmers receive personalized,',
      },
      {
        startSec: 125,
        endSec: 135,
        text: 'data-backed guidance in English, Kannada, or Hindi.',
      },
    ],
  },
  {
    id: 'scene-7',
    index: 6,
    startSec: 135,
    endSec: 150,
    title: 'Scene 7 · Conclusion & Command Center (2:15–2:30)',
    shortLabel: 'Conclusion',
    workspaceTarget: 'command',
    narrationScript:
      "FIELD SHIFT. Turning Earth's data into smarter farming decisions.",
    bulletSummary:
      'Unified Farmer Command Center, 3D Digital Twin, 12-month calendar & PDF/CSV reports.',
    cursorPos: { xPct: 50, yPct: 50 },
    subtitles: [
      {
        startSec: 135,
        endSec: 141,
        text: 'FIELD SHIFT.',
      },
      {
        startSec: 141,
        endSec: 150,
        text: "Turning Earth's data into smarter farming decisions.",
      },
    ],
  },
];

function toVttTimestamp(sec: number): string {
  const wholeMs = Math.max(0, Math.round(sec * 1000));
  const hrs = Math.floor(wholeMs / 3600000);
  const mins = Math.floor((wholeMs % 3600000) / 60000);
  const secs = Math.floor((wholeMs % 60000) / 1000);
  const ms = wholeMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function buildDemoWebVtt(): string {
  const lines: string[] = ['WEBVTT', ''];
  let cueNumber = 1;
  for (const scene of DEMO_SCENE_CHAPTERS) {
    for (const cue of scene.subtitles) {
      lines.push(String(cueNumber++));
      lines.push(`${toVttTimestamp(cue.startSec)} --> ${toVttTimestamp(cue.endSec)}`);
      lines.push(cue.text);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function getActiveSubtitleText(timeSec: number): string {
  for (const scene of DEMO_SCENE_CHAPTERS) {
    for (const cue of scene.subtitles) {
      if (timeSec >= cue.startSec && timeSec < cue.endSec) {
        return cue.text;
      }
    }
  }
  return DEMO_SCENE_CHAPTERS[DEMO_SCENE_CHAPTERS.length - 1].subtitles.slice(-1)[0].text;
}

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { DEMO_SCENE_CHAPTERS, DEMO_TOTAL_DURATION_SEC, buildDemoWebVtt } from './src/data/demoStoryboard';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json({ limit: '2mb' }));

// Simple in-memory TTL cache for NASA POWER / SoilGrids / Open-Meteo responses
interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}
const apiCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const hit = apiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    apiCache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached<T>(key: string, data: T, ttlMs = 15 * 60 * 1000) {
  apiCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 45000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithGeminiFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseMimeType?: string;
    responseSchema?: unknown;
    fastStructured?: boolean;
  }
): Promise<{ text: string; modelUsed: string }> {
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> =
    params.fastStructured
      ? [
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 28000 },
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 32000 },
        ]
      : [
          { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 18000 },
          { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 22000 },
        ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const config: Record<string, unknown> = {
        abortSignal: AbortSignal.timeout(attempt.timeoutMs),
        thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
        systemInstruction: params.systemInstruction,
      };
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.responseSchema) config.responseSchema = params.responseSchema;

      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config,
      });
      return { text: (response.text ?? '').trim(), modelUsed: attempt.model };
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] ${attempt.model} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastError;
}

function formatYyyymmdd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function formatIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// Estimate NDVI proxy from solar radiation, root-zone soil wetness, and thermal optimality
// Clearly flagged in UI as an estimated hydro-thermal vegetation index when optical MODIS point API is unavailable
function estimateVegetationIndex(
  rootWetness01: number,
  tempC: number,
  solarMj: number,
  precipMm: number
): number {
  const moistureFactor = Math.min(1, Math.max(0.12, rootWetness01 * 1.25));
  const thermalOptimal = Math.exp(-Math.pow((tempC - 26) / 14, 2));
  const lightFactor = Math.min(1, Math.max(0.25, solarMj / 22));
  const rainBoost = Math.min(0.12, precipMm * 0.005);
  const raw = 0.16 + 0.62 * (0.55 * moistureFactor + 0.3 * thermalOptimal + 0.15 * lightFactor) + rainBoost;
  return Number(Math.min(0.88, Math.max(0.14, raw)).toFixed(3));
}

function estimateEt0(tempC: number, solarMj: number, humidityPct: number, windMs: number): number {
  // Hargreaves-Samani / FAO-56 simplified daily reference ET0 approximation (mm/day)
  const radEq = solarMj * 0.408; // MJ/m2/day to mm/day equivalent
  const vpdProxy = Math.max(0.1, (1 - humidityPct / 100) * (1 + windMs * 0.12));
  const et0 = Math.max(1.1, 0.0135 * (tempC + 17.78) * radEq * 0.42 + vpdProxy * 1.45);
  return Number(et0.toFixed(2));
}

function buildFallbackObservations(lat: number, lon: number, reason: string) {
  const absLat = Math.abs(lat);
  const baseTemp = 30 - absLat * 0.36;
  const isMonsoonBelt = lat > 8 && lat < 28 && lon > 70 && lon < 90;
  const now = new Date();
  const dailySeries = [];

  for (let i = 89; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 86400000);
    const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
    const seasonalWave = Math.sin(((dayOfYear - 90) / 365) * Math.PI * 2);
    const tempC = Number((baseTemp + seasonalWave * 4.5 + Math.sin(i * 0.4) * 1.1).toFixed(1));
    const precipMm = isMonsoonBelt
      ? Number(Math.max(0, Math.sin(i * 0.33) * 12 + (i % 7 === 0 ? 14 : 1.5)).toFixed(1))
      : Number(Math.max(0, Math.sin(i * 0.25) * 6 + (i % 9 === 0 ? 8 : 0.8)).toFixed(1));
    const rootWet = Math.min(0.82, Math.max(0.24, 0.42 + precipMm * 0.012 + Math.cos(i * 0.15) * 0.08));
    const topWet = Math.min(0.85, Math.max(0.18, rootWet - 0.04 + precipMm * 0.015));
    const solarMj = Number((17.5 + Math.cos(i * 0.2) * 3.2 - precipMm * 0.15).toFixed(1));
    const humidityPct = Number(Math.min(92, Math.max(32, 56 + precipMm * 1.4)).toFixed(0));
    const windMs = Number((2.2 + Math.abs(Math.sin(i * 0.5)) * 1.8).toFixed(1));
    dailySeries.push({
      date: dt.toISOString().slice(0, 10),
      tempC,
      tempMaxC: Number((tempC + 5.2).toFixed(1)),
      tempMinC: Number((tempC - 4.8).toFixed(1)),
      precipMm,
      soilWetnessTopPct: Number((topWet * 100).toFixed(1)),
      soilWetnessRootPct: Number((rootWet * 100).toFixed(1)),
      solarIrradianceMj: solarMj,
      humidityPct,
      windMs,
      estimatedNdvi: estimateVegetationIndex(rootWet, tempC, solarMj, precipMm),
      estimatedEt0Mm: estimateEt0(tempC, solarMj, humidityPct, windMs),
    });
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyClimatology = months.map((month, idx) => {
    const monsoonPeak = isMonsoonBelt && idx >= 5 && idx <= 9 ? (idx === 6 || idx === 7 ? 165 : 110) : 38;
    return {
      month,
      tempC: Number((baseTemp + Math.sin(((idx - 3) / 12) * Math.PI * 2) * 4.5).toFixed(1)),
      precipMm: Number((monsoonPeak + Math.cos(idx) * 12).toFixed(1)),
      solarMj: Number((18.5 + Math.cos(((idx - 4) / 12) * Math.PI * 2) * 3.4).toFixed(1)),
    };
  });

  const forecast7d = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(now.getTime() + (i + 1) * 86400000);
    return {
      date: dt.toISOString().slice(0, 10),
      tempMaxC: Number((baseTemp + 5.4 + Math.sin(i) * 1.2).toFixed(1)),
      tempMinC: Number((baseTemp - 4.5 + Math.cos(i) * 0.9).toFixed(1)),
      precipMm: Number((i % 3 === 0 ? 4.8 : 0.4).toFixed(1)),
      soilMoisture0to1cm: 24.5,
      soilMoisture3to9cm: 27.8,
      soilMoisture9to27cm: 30.2,
      soilTemp0cm: Number((baseTemp + 1.2).toFixed(1)),
    };
  });

  const n = dailySeries.length;
  const sum = dailySeries.reduce(
    (acc, d) => ({
      temp: acc.temp + d.tempC,
      maxT: Math.max(acc.maxT, d.tempMaxC),
      minT: Math.min(acc.minT, d.tempMinC),
      precip: acc.precip + d.precipMm,
      top: acc.top + d.soilWetnessTopPct,
      root: acc.root + d.soilWetnessRootPct,
      solar: acc.solar + d.solarIrradianceMj,
      hum: acc.hum + d.humidityPct,
      ndvi: acc.ndvi + d.estimatedNdvi,
      et0: acc.et0 + d.estimatedEt0Mm,
    }),
    { temp: 0, maxT: -99, minT: 99, precip: 0, top: 0, root: 0, solar: 0, hum: 0, ndvi: 0, et0: 0 }
  );

  return {
    location: { lat, lon },
    fetchedAt: new Date().toISOString(),
    sourceStatus: {
      nasaPower: 'fallback' as const,
      openMeteo: 'fallback' as const,
      message: reason,
    },
    summary: {
      meanTempC: Number((sum.temp / n).toFixed(1)),
      maxTempC: Number(sum.maxT.toFixed(1)),
      minTempC: Number(sum.minT.toFixed(1)),
      totalPrecip90dMm: Number(sum.precip.toFixed(1)),
      meanSurfaceSoilWetnessPct: Number((sum.top / n).toFixed(1)),
      meanRootSoilWetnessPct: Number((sum.root / n).toFixed(1)),
      meanSolarMj: Number((sum.solar / n).toFixed(1)),
      meanHumidityPct: Number((sum.hum / n).toFixed(0)),
      estimatedNdvi: Number((sum.ndvi / n).toFixed(3)),
      aridityIndex: Number((sum.precip / Math.max(1, sum.et0)).toFixed(2)),
    },
    dailySeries,
    monthlyClimatology,
    forecast7d,
  };
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// =========================================================================
// PERSISTENT FARM & ZONE GEOMETRY STORE (/api/farms)
// =========================================================================
const EARTH_RADIUS_M = 6378137;
const FARMS_STORE_PATH = path.resolve(process.cwd(), 'data/farms-store.json');

interface ServerFarmZone {
  id: string;
  name: string;
  cropType: string;
  soilType: string;
  irrigationType: string;
  areaHectares: number;
  perimeterMeters: number;
  areaPctOfFarm: number;
  center: { lat: number; lon: number };
  color: string;
  boundary: [number, number][];
  updatedAt: string;
}

interface ServerFarmParcel {
  id: string;
  name: string;
  region: string;
  district?: string;
  state?: string;
  country: string;
  isKarnatakaDemo: boolean;
  agroClimaticZone: string;
  elevationMeters: number;
  areaHectares: number;
  areaAcres?: number;
  perimeterMeters?: number;
  boundingBox?: [number, number, number, number];
  geometryVersion?: string;
  geometryType?: 'Polygon' | 'MultiPolygon';
  polygons?: [number, number][][];
  primarySoilType: string;
  dominantCrops: string[];
  irrigationType?: string;
  plantingInfo?: string;
  boundaryStatus?: 'Verified' | 'Draft' | 'Modified';
  center: { lat: number; lon: number };
  boundary: [number, number][];
  zones?: ServerFarmZone[];
  description: string;
  updatedAt?: string;
}

const DEFAULT_SEED_FARMS: ServerFarmParcel[] = [
  {
    id: 'mandya-cauvery',
    name: 'Mandya Cauvery Basin Demo',
    region: 'Mandya, Karnataka',
    district: 'Mandya',
    state: 'Karnataka',
    country: 'India',
    isKarnatakaDemo: true,
    agroClimaticZone: 'Southern Dry Zone (Zone 6)',
    elevationMeters: 678,
    areaHectares: 21.84,
    primarySoilType: 'Red Sandy Loam (Alfisols)',
    dominantCrops: ['Paddy', 'Sugarcane', 'Finger Millet', 'Cowpea'],
    irrigationType: 'canal-surface',
    boundaryStatus: 'Verified',
    center: { lat: 12.5218, lon: 76.8951 },
    boundary: [
      [76.8926, 12.5236],
      [76.8974, 12.5238],
      [76.8978, 12.5201],
      [76.8924, 12.5198],
      [76.8926, 12.5236],
    ],
    zones: [
      {
        id: 'mandya-zone-north',
        name: 'Zone A · Upper Millet Block',
        cropType: 'Finger Millet + Pigeon Pea',
        soilType: 'Red Sandy Loam',
        irrigationType: 'protective-tank',
        areaHectares: 9.24,
        perimeterMeters: 1226,
        areaPctOfFarm: 42.3,
        center: { lat: 12.5227, lon: 76.8951 },
        color: '#10b981',
        boundary: [
          [76.8928, 12.5235],
          [76.8972, 12.5236],
          [76.8973, 12.5219],
          [76.8927, 12.5218],
          [76.8928, 12.5235],
        ],
        updatedAt: '2026-11-14T00:00:00.000Z',
      },
      {
        id: 'mandya-zone-south',
        name: 'Zone B · Canal Lowland Block',
        cropType: 'Paddy + Cowpea Relay',
        soilType: 'Alluvial Clay Loam',
        irrigationType: 'canal-surface',
        areaHectares: 9.86,
        perimeterMeters: 1284,
        areaPctOfFarm: 45.1,
        center: { lat: 12.5208, lon: 76.8951 },
        color: '#06b6d4',
        boundary: [
          [76.8927, 12.5216],
          [76.8974, 12.5217],
          [76.8976, 12.5202],
          [76.8926, 12.52],
          [76.8927, 12.5216],
        ],
        updatedAt: '2026-11-14T00:00:00.000Z',
      },
    ],
    description:
      'Canal-command basin transitioning from high-water sugarcane monoculture toward diversified millet-legume rotations for groundwater resilience.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'dharwad-transition',
    name: 'Dharwad Transitional Tract',
    region: 'Dharwad, Karnataka',
    district: 'Dharwad',
    state: 'Karnataka',
    country: 'India',
    isKarnatakaDemo: true,
    agroClimaticZone: 'Northern Transition Zone (Zone 8)',
    elevationMeters: 751,
    areaHectares: 32.16,
    primarySoilType: 'Deep Black Vertisol',
    dominantCrops: ['Soybean', 'Sorghum', 'Chickpea', 'Cotton'],
    irrigationType: 'protective-tank',
    boundaryStatus: 'Verified',
    center: { lat: 15.4589, lon: 75.0078 },
    boundary: [
      [75.0049, 15.4611],
      [75.0108, 15.4613],
      [75.0112, 15.4567],
      [75.0051, 15.4565],
      [75.0049, 15.4611],
    ],
    zones: [],
    description:
      'Rainfed and protective-irrigation black cotton soil corridor ideal for Kharif oilseed-pulse relays and Rabi sorghum moisture conservation.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'raichur-krishna',
    name: 'Raichur Krishna Command',
    region: 'Raichur, Karnataka',
    district: 'Raichur',
    state: 'Karnataka',
    country: 'India',
    isKarnatakaDemo: true,
    agroClimaticZone: 'North Eastern Dry Zone (Zone 2)',
    elevationMeters: 407,
    areaHectares: 35.42,
    primarySoilType: 'Medium-Deep Vertisol',
    dominantCrops: ['Pigeon Pea', 'Cotton', 'Pearl Millet', 'Sunflower'],
    irrigationType: 'canal-surface',
    boundaryStatus: 'Verified',
    center: { lat: 16.212, lon: 77.3439 },
    boundary: [
      [77.3408, 16.2145],
      [77.3472, 16.2143],
      [77.3469, 16.2096],
      [77.3405, 16.2098],
      [77.3408, 16.2145],
    ],
    zones: [],
    description:
      'Heat-stressed semi-arid Krishna doab tract where deep-rooted pigeon pea and drought-tolerant millets stabilize yield under variable monsoons.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'hassan-malnad',
    name: 'Hassan Malnad Foothills',
    region: 'Hassan, Karnataka',
    district: 'Hassan',
    state: 'Karnataka',
    country: 'India',
    isKarnatakaDemo: true,
    agroClimaticZone: 'Southern Transition Zone (Zone 7)',
    elevationMeters: 972,
    areaHectares: 20.14,
    primarySoilType: 'Lateritic Red Clay Loam',
    dominantCrops: ['Finger Millet (Ragi)', 'Maize', 'Potato', 'Horse Gram'],
    irrigationType: 'rainfed',
    boundaryStatus: 'Verified',
    center: { lat: 13.0033, lon: 76.1004 },
    boundary: [
      [76.0981, 13.0051],
      [76.1027, 13.0052],
      [76.1029, 13.0016],
      [76.0982, 13.0014],
      [76.0981, 13.0051],
    ],
    zones: [],
    description:
      'Elevated plateau receiving bimodal showers; prime showcase for ragi-pulse intercropping and soil organic carbon restoration.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'kalaburagi-tur',
    name: 'Kalaburagi Tur Bowl',
    region: 'Kalaburagi, Karnataka',
    district: 'Kalaburagi',
    state: 'Karnataka',
    country: 'India',
    isKarnatakaDemo: true,
    agroClimaticZone: 'North Eastern Dry Zone (Zone 2)',
    elevationMeters: 454,
    areaHectares: 34.48,
    primarySoilType: 'Shallow-Medium Black Vertisol',
    dominantCrops: ['Red Gram (Tur)', 'Black Gram', 'Green Gram', 'Safflower'],
    irrigationType: 'rainfed',
    boundaryStatus: 'Verified',
    center: { lat: 17.3297, lon: 76.8343 },
    boundary: [
      [76.8312, 17.3321],
      [76.8374, 17.3322],
      [76.8376, 17.3274],
      [76.8313, 17.3272],
      [76.8312, 17.3321],
    ],
    zones: [],
    description:
      'India’s premier pulse-producing dryland corridor testing nitrogen-fixing multi-pulse sequences against mid-season dry spells.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'iowa-ames-global',
    name: 'Ames Corn-Soybean Benchmark',
    region: 'Iowa, United States',
    district: 'Story County',
    state: 'Iowa',
    country: 'USA',
    isKarnatakaDemo: false,
    agroClimaticZone: 'Temperate Continental Mollisol Belt',
    elevationMeters: 287,
    areaHectares: 60.86,
    primarySoilType: 'Clarion-Nicollet Mollisol Loam',
    dominantCrops: ['Maize', 'Soybean', 'Cereal Rye Cover', 'Oats'],
    irrigationType: 'rainfed',
    boundaryStatus: 'Verified',
    center: { lat: 42.0308, lon: -93.6319 },
    boundary: [
      [-93.6368, 42.0342],
      [-93.6271, 42.0342],
      [-93.6271, 42.0274],
      [-93.6368, 42.0274],
      [-93.6368, 42.0342],
    ],
    zones: [],
    description:
      'Global Midwest benchmark evaluating winter rye cover crops and extended 3-crop rotations for nitrate retention and carbon sequestration.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
  {
    id: 'nakuru-rift-global',
    name: 'Nakuru Highland Plot',
    region: 'Rift Valley, Kenya',
    district: 'Nakuru',
    state: 'Rift Valley',
    country: 'Kenya',
    isKarnatakaDemo: false,
    agroClimaticZone: 'Tropical Highland Sub-Humid',
    elevationMeters: 1850,
    areaHectares: 20.69,
    primarySoilType: 'Volcanic Andosol Clay Loam',
    dominantCrops: ['Maize', 'Common Bean', 'Wheat', 'Lablab Cover'],
    irrigationType: 'rainfed',
    boundaryStatus: 'Verified',
    center: { lat: -0.3031, lon: 36.08 },
    boundary: [
      [36.0778, -0.3012],
      [36.0822, -0.3012],
      [36.0822, -0.305],
      [36.0778, -0.305],
      [36.0778, -0.3012],
    ],
    zones: [],
    description:
      'East African highland volcanic soil benchmark testing cereal-legume strip rotations for rainfall variability resilience.',
    updatedAt: '2026-11-14T00:00:00.000Z',
  },
];

function srvOpenVertices(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const cleaned: [number, number][] = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const lon = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.abs(prev[0] - lon) > 1e-8 || Math.abs(prev[1] - lat) > 1e-8) {
      cleaned.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
    }
  }
  if (
    cleaned.length > 1 &&
    Math.abs(cleaned[0][0] - cleaned[cleaned.length - 1][0]) <= 1e-7 &&
    Math.abs(cleaned[0][1] - cleaned[cleaned.length - 1][1]) <= 1e-7
  ) {
    cleaned.pop();
  }
  return cleaned;
}

function srvOrientation(p: [number, number], q: [number, number], r: [number, number]): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

function srvOnSeg(p: [number, number], q: [number, number], r: [number, number]): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-12 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-12 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-12 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-12
  );
}

function srvSegIntersect(
  p1: [number, number],
  q1: [number, number],
  p2: [number, number],
  q2: [number, number]
): boolean {
  const o1 = srvOrientation(p1, q1, p2);
  const o2 = srvOrientation(p1, q1, q2);
  const o3 = srvOrientation(p2, q2, p1);
  const o4 = srvOrientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && srvOnSeg(p1, p2, q1)) return true;
  if (o2 === 0 && srvOnSeg(p1, q2, q1)) return true;
  if (o3 === 0 && srvOnSeg(p2, p1, q2)) return true;
  if (o4 === 0 && srvOnSeg(p2, q1, q2)) return true;
  return false;
}

function srvRingAreaHa(closed: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const [lon1, lat1] = closed[i];
    const [lon2, lat2] = closed[i + 1];
    total +=
      (((lon2 - lon1) * Math.PI) / 180) *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  const areaSqM = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return Number((areaSqM / 10000).toFixed(2));
}

function srvRingPerimeterM(closed: [number, number][]): number {
  let p = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const [lon1, lat1] = closed[i];
    const [lon2, lat2] = closed[i + 1];
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    p += 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(p);
}

function srvCentroid(open: [number, number][]): { lat: number; lon: number } {
  if (open.length === 0) return { lat: 0, lon: 0 };
  if (open.length < 3) {
    const sum = open.reduce((acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }), { lon: 0, lat: 0 });
    return {
      lat: Number((sum.lat / open.length).toFixed(5)),
      lon: Number((sum.lon / open.length).toFixed(5)),
    };
  }
  let signedArea2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < open.length; i++) {
    const [x0, y0] = open[i];
    const [x1, y1] = open[(i + 1) % open.length];
    const cross = x0 * y1 - x1 * y0;
    signedArea2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(signedArea2) < 1e-14) {
    const sum = open.reduce((acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }), { lon: 0, lat: 0 });
    return {
      lat: Number((sum.lat / open.length).toFixed(5)),
      lon: Number((sum.lon / open.length).toFixed(5)),
    };
  }
  return {
    lat: Number((cy / (3 * signedArea2)).toFixed(5)),
    lon: Number((cx / (3 * signedArea2)).toFixed(5)),
  };
}

function srvBoundingBox(coords: [number, number][]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    Number(minLon.toFixed(6)),
    Number(minLat.toFixed(6)),
    Number(maxLon.toFixed(6)),
    Number(maxLat.toFixed(6)),
  ];
}

function srvGeometryVersion(
  boundary: [number, number][],
  zones?: Array<{ boundary: [number, number][] }>
): string {
  const ringStr = boundary.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const zoneStr = (zones || [])
    .map((z) => z.boundary.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(','))
    .join('|');
  const payload = `${ringStr}#${zoneStr}`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `gv-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function srvValidateRing(coords: unknown):
  | {
      ok: true;
      closed: [number, number][];
      areaHa: number;
      areaAcres: number;
      perimeterM: number;
      center: { lat: number; lon: number };
      boundingBox: [number, number, number, number];
    }
  | { ok: false; error: string } {
  const open = srvOpenVertices(coords);
  if (open.length < 3) {
    return { ok: false, error: 'Polygon must contain at least 3 distinct vertices.' };
  }
  for (const [lon, lat] of open) {
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { ok: false, error: 'Polygon coordinates out of WGS84 bounds.' };
    }
  }
  for (let i = 0; i < open.length; i++) {
    const a1 = open[i];
    const a2 = open[(i + 1) % open.length];
    for (let j = i + 1; j < open.length; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === open.length - 1)) continue;
      if (srvSegIntersect(a1, a2, open[j], open[(j + 1) % open.length])) {
        return { ok: false, error: 'Self-intersecting polygon edges are not allowed.' };
      }
    }
  }
  const closed: [number, number][] = [...open, [open[0][0], open[0][1]]];
  const areaHa = srvRingAreaHa(closed);
  if (areaHa < 0.01) {
    return { ok: false, error: 'Polygon area must be at least 0.01 ha.' };
  }
  const perimeterM = srvRingPerimeterM(closed);
  return {
    ok: true,
    closed,
    areaHa,
    areaAcres: Number((areaHa * 2.47105).toFixed(2)),
    perimeterM,
    center: srvCentroid(open),
    boundingBox: srvBoundingBox(closed),
  };
}

function enrichFarmDerivedFields(farm: ServerFarmParcel): ServerFarmParcel {
  const check = srvValidateRing(farm.boundary);
  const closed = check.ok ? check.closed : farm.boundary;
  const areaHa = check.ok ? check.areaHa : farm.areaHectares;
  const areaAcres = Number((areaHa * 2.47105).toFixed(2));
  const perimeterMeters = check.ok ? check.perimeterM : farm.perimeterMeters ?? 0;
  const boundingBox = check.ok ? check.boundingBox : farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const center = check.ok ? check.center : farm.center;
  const zones = (farm.zones || []).map((z) => {
    const zCheck = srvValidateRing(z.boundary);
    if (!zCheck.ok) return z;
    return {
      ...z,
      boundary: zCheck.closed,
      areaHectares: zCheck.areaHa,
      perimeterMeters: zCheck.perimeterM,
      areaPctOfFarm: Number(Math.min(100, (zCheck.areaHa / Math.max(0.01, areaHa)) * 100).toFixed(1)),
      center: zCheck.center,
    };
  });
  const geometryVersion = srvGeometryVersion(closed, zones);
  return {
    ...farm,
    boundary: closed,
    areaHectares: areaHa,
    areaAcres,
    perimeterMeters,
    boundingBox,
    center,
    geometryVersion,
    zones,
  };
}

function normalizeAndValidateFarmPayload(
  raw: unknown,
  existingId?: string
): { ok: true; farm: ServerFarmParcel } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid JSON farm payload.' };
  }
  const body = raw as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2) {
    return { ok: false, error: 'Farm name must be at least 2 characters.' };
  }

  // Support either Polygon ring (`boundary`) or GeoJSON Polygon/MultiPolygon (`geometry` or `polygons`)
  let primaryRingInput: unknown = body.boundary;
  let geometryType: 'Polygon' | 'MultiPolygon' = body.geometryType === 'MultiPolygon' ? 'MultiPolygon' : 'Polygon';
  let multiRingsRaw: unknown[] | null = null;

  if (body.geometry && typeof body.geometry === 'object') {
    const geom = body.geometry as { type?: string; coordinates?: unknown };
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      primaryRingInput = geom.coordinates[0];
      geometryType = 'Polygon';
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      geometryType = 'MultiPolygon';
      multiRingsRaw = geom.coordinates.map((poly) => (Array.isArray(poly) ? poly[0] : []));
      primaryRingInput = multiRingsRaw[0];
    }
  } else if (Array.isArray(body.polygons) && body.polygons.length > 0) {
    geometryType = 'MultiPolygon';
    multiRingsRaw = body.polygons;
    if (!primaryRingInput) primaryRingInput = multiRingsRaw[0];
  }

  const ringCheck = srvValidateRing(primaryRingInput);
  if (!ringCheck.ok) {
    return { ok: false, error: `Farm boundary error: ${ringCheck.error}` };
  }

  let closedPolygons: [number, number][][] | undefined;
  let totalAreaHa = ringCheck.areaHa;
  let totalPerimeterM = ringCheck.perimeterM;
  let farmCenter = ringCheck.center;
  let farmBbox = ringCheck.boundingBox;

  if (geometryType === 'MultiPolygon' && multiRingsRaw && multiRingsRaw.length > 0) {
    const validatedParts: [number, number][][] = [];
    let sumArea = 0;
    let sumPerim = 0;
    let wLat = 0;
    let wLon = 0;
    const allPts: [number, number][] = [];
    for (let i = 0; i < multiRingsRaw.length; i++) {
      const partCheck = srvValidateRing(multiRingsRaw[i]);
      if (!partCheck.ok) {
        return { ok: false, error: `Farm MultiPolygon part ${i + 1} error: ${partCheck.error}` };
      }
      validatedParts.push(partCheck.closed);
      sumArea += partCheck.areaHa;
      sumPerim += partCheck.perimeterM;
      wLat += partCheck.center.lat * partCheck.areaHa;
      wLon += partCheck.center.lon * partCheck.areaHa;
      allPts.push(...partCheck.closed);
    }
    closedPolygons = validatedParts;
    totalAreaHa = Number(sumArea.toFixed(2));
    totalPerimeterM = Math.round(sumPerim);
    farmCenter = {
      lat: Number((wLat / Math.max(0.01, sumArea)).toFixed(5)),
      lon: Number((wLon / Math.max(0.01, sumArea)).toFixed(5)),
    };
    farmBbox = srvBoundingBox(allPts);
  }

  const nowIso = new Date().toISOString();
  const zonesRaw = Array.isArray(body.zones) ? body.zones : [];
  const zones: ServerFarmZone[] = [];

  for (let i = 0; i < zonesRaw.length; i++) {
    const z = zonesRaw[i] as Record<string, unknown>;
    const zName = typeof z?.name === 'string' && z.name.trim() ? z.name.trim() : `Zone ${i + 1}`;
    const zCheck = srvValidateRing(z?.boundary);
    if (!zCheck.ok) {
      return { ok: false, error: `Zone "${zName}" boundary error: ${zCheck.error}` };
    }
    const zId =
      typeof z?.id === 'string' && z.id.trim() ? z.id.trim() : `zone-${Date.now()}-${i + 1}`;
    zones.push({
      id: zId,
      name: zName,
      cropType: typeof z?.cropType === 'string' && z.cropType.trim() ? z.cropType.trim() : 'Needs farmer input',
      soilType:
        typeof z?.soilType === 'string' && z.soilType.trim()
          ? z.soilType.trim()
          : typeof body.primarySoilType === 'string' && body.primarySoilType.trim()
            ? body.primarySoilType.trim()
            : 'Needs farmer input',
      irrigationType:
        typeof z?.irrigationType === 'string' && z.irrigationType.trim()
          ? z.irrigationType.trim()
          : typeof body.irrigationType === 'string' && body.irrigationType.trim()
            ? body.irrigationType.trim()
            : 'rainfed',
      areaHectares: zCheck.areaHa,
      perimeterMeters: zCheck.perimeterM,
      areaPctOfFarm: Number(Math.min(100, (zCheck.areaHa / Math.max(0.01, totalAreaHa)) * 100).toFixed(1)),
      center: zCheck.center,
      color: typeof z?.color === 'string' && z.color.trim() ? z.color.trim() : '#10b981',
      boundary: zCheck.closed,
      updatedAt: nowIso,
    });
  }

  const id = existingId || (typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `farm-${Date.now()}`);
  const district = typeof body.district === 'string' ? body.district.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const region =
    typeof body.region === 'string' && body.region.trim()
      ? body.region.trim()
      : [district, state].filter(Boolean).join(', ') || 'Custom Region';

  const crops = Array.isArray(body.dominantCrops)
    ? body.dominantCrops.map((c) => String(c).trim()).filter(Boolean)
    : [];

  const farm: ServerFarmParcel = {
    id,
    name,
    region,
    district: district || region.split(',')[0]?.trim() || 'Needs farmer input',
    state: state || region.split(',')[1]?.trim() || 'Needs farmer input',
    country: typeof body.country === 'string' && body.country.trim() ? body.country.trim() : 'India',
    isKarnatakaDemo:
      typeof body.isKarnatakaDemo === 'boolean'
        ? body.isKarnatakaDemo
        : farmCenter.lat >= 11.5 &&
          farmCenter.lat <= 18.6 &&
          farmCenter.lon >= 74 &&
          farmCenter.lon <= 78.6,
    agroClimaticZone:
      typeof body.agroClimaticZone === 'string' && body.agroClimaticZone.trim()
        ? body.agroClimaticZone.trim()
        : 'Site-Specific Parcel',
    elevationMeters: Number.isFinite(Number(body.elevationMeters)) ? Number(body.elevationMeters) : 520,
    areaHectares: totalAreaHa,
    areaAcres: Number((totalAreaHa * 2.47105).toFixed(2)),
    perimeterMeters: totalPerimeterM,
    boundingBox: farmBbox,
    geometryVersion: srvGeometryVersion(ringCheck.closed, zones),
    geometryType,
    ...(closedPolygons ? { polygons: closedPolygons } : {}),
    primarySoilType:
      typeof body.primarySoilType === 'string' && body.primarySoilType.trim()
        ? body.primarySoilType.trim()
        : 'Needs farmer input',
    dominantCrops: crops,
    irrigationType:
      typeof body.irrigationType === 'string' && body.irrigationType.trim()
        ? body.irrigationType.trim()
        : undefined,
    plantingInfo:
      typeof body.plantingInfo === 'string' && body.plantingInfo.trim()
        ? body.plantingInfo.trim()
        : undefined,
    boundaryStatus:
      body.boundaryStatus === 'Draft' || body.boundaryStatus === 'Verified' || body.boundaryStatus === 'Modified'
        ? body.boundaryStatus
        : 'Verified',
    center: farmCenter,
    boundary: ringCheck.closed,
    zones,
    description:
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : `Persisted farm parcel (${region}).`,
    updatedAt: nowIso,
  };

  return { ok: true, farm };
}

function ensureFarmsStoreInitialized(): ServerFarmParcel[] {
  const dir = path.dirname(FARMS_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(FARMS_STORE_PATH)) {
    const enrichedSeeds = DEFAULT_SEED_FARMS.map(enrichFarmDerivedFields);
    fs.writeFileSync(FARMS_STORE_PATH, JSON.stringify(enrichedSeeds, null, 2), 'utf8');
    return enrichedSeeds;
  }
  try {
    const raw = fs.readFileSync(FARMS_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ServerFarmParcel[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map(enrichFarmDerivedFields);
    }
  } catch {
    // Re-seed if corrupted
  }
  const enrichedSeeds = DEFAULT_SEED_FARMS.map(enrichFarmDerivedFields);
  fs.writeFileSync(FARMS_STORE_PATH, JSON.stringify(enrichedSeeds, null, 2), 'utf8');
  return enrichedSeeds;
}

function writeFarmsStore(farms: ServerFarmParcel[]): void {
  const dir = path.dirname(FARMS_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(FARMS_STORE_PATH, JSON.stringify(farms.map(enrichFarmDerivedFields), null, 2), 'utf8');
}

function buildFarmPropertiesResponse(farm: ServerFarmParcel) {
  const enriched = enrichFarmDerivedFields(farm);
  return {
    farmId: enriched.id,
    geometryVersion: enriched.geometryVersion || srvGeometryVersion(enriched.boundary, enriched.zones),
    queryLocation: {
      lat: enriched.center.lat,
      lon: enriched.center.lon,
      boundingBox: enriched.boundingBox || srvBoundingBox(enriched.boundary),
    },
    dataset: 'farm-properties',
    observationDate: enriched.updatedAt || new Date().toISOString(),
    units: 'ha, acres, meters, WGS84 degrees',
    source: 'Express Farm Geometry Store',
    resolution: 'Parcel polygon geometry',
    classification: 'Observed' as const,
    retrievalStatus: 'available' as const,
    data: {
      identification: {
        farmId: enriched.id,
        farmName: enriched.name,
        district: enriched.district || 'Not available',
        state: enriched.state || 'Not available',
        country: enriched.country,
        boundaryStatus: enriched.boundaryStatus || 'Verified',
      },
      geographic: {
        areaHectares: enriched.areaHectares,
        areaAcres: enriched.areaAcres ?? Number((enriched.areaHectares * 2.47105).toFixed(2)),
        perimeterMeters: enriched.perimeterMeters ?? 0,
        centroid: enriched.center,
        boundingBox: enriched.boundingBox ?? srvBoundingBox(enriched.boundary),
        vertexCount: Math.max(0, enriched.boundary.length - 1),
        geometryType: enriched.geometryType || 'Polygon',
      },
      agricultural: {
        cropTypes: enriched.dominantCrops.length > 0 ? enriched.dominantCrops : ['Needs farmer input'],
        soilType: enriched.primarySoilType || 'Needs farmer input',
        irrigationType: enriched.irrigationType || 'Needs farmer input',
        plantingInfo: enriched.plantingInfo || 'Needs farmer input',
        zones: (enriched.zones || []).map((z) => ({
          id: z.id,
          name: z.name,
          areaHectares: z.areaHectares,
          areaPctOfFarm: z.areaPctOfFarm,
          cropType: z.cropType,
          irrigationType: z.irrigationType,
        })),
      },
    },
  };
}

app.get('/api/farms', (_req, res) => {
  try {
    const farms = ensureFarmsStoreInitialized();
    res.json({
      farms,
      persistenceSource: 'server-json-store',
      storageLabel: 'Express JSON Store (data/farms-store.json)',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to load farms store.' });
  }
});

app.get('/api/farms/:id', (req, res) => {
  try {
    const farms = ensureFarmsStoreInitialized();
    const found = farms.find((f) => f.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
      return;
    }
    res.json({
      farm: found,
      properties: buildFarmPropertiesResponse(found),
      persistenceSource: 'server-json-store',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to read farm.' });
  }
});

app.get('/api/farms/:id/properties', (req, res) => {
  try {
    const farms = ensureFarmsStoreInitialized();
    const found = farms.find((f) => f.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
      return;
    }
    res.json(buildFarmPropertiesResponse(found));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to compute farm properties.' });
  }
});

app.post('/api/farms', (req, res) => {
  try {
    const check = normalizeAndValidateFarmPayload(req.body);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    const farms = ensureFarmsStoreInitialized();
    const duplicate = farms.some((f) => f.id === check.farm.id);
    const farmToSave = duplicate ? { ...check.farm, id: `${check.farm.id}-${Date.now()}` } : check.farm;
    const next = [farmToSave, ...farms];
    writeFarmsStore(next);
    res.status(201).json({
      farm: farmToSave,
      properties: buildFarmPropertiesResponse(farmToSave),
      farms: next,
      persistenceSource: 'server-json-store',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to save new farm.' });
  }
});

app.put('/api/farms/:id', (req, res) => {
  try {
    const targetId = req.params.id;
    const farms = ensureFarmsStoreInitialized();
    const idx = farms.findIndex((f) => f.id === targetId);
    const check = normalizeAndValidateFarmPayload({ ...req.body, id: targetId }, targetId);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    let next: ServerFarmParcel[];
    if (idx === -1) {
      next = [check.farm, ...farms];
    } else {
      next = farms.map((f) => (f.id === targetId ? check.farm : f));
    }
    writeFarmsStore(next);
    res.json({
      farm: check.farm,
      properties: buildFarmPropertiesResponse(check.farm),
      farms: next,
      persistenceSource: 'server-json-store',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to update farm.' });
  }
});

app.patch('/api/farms/:id', (req, res) => {
  try {
    const targetId = req.params.id;
    const farms = ensureFarmsStoreInitialized();
    const existing = farms.find((f) => f.id === targetId);
    if (!existing) {
      res.status(404).json({ error: `Farm "${targetId}" not found.` });
      return;
    }
    const merged = {
      ...existing,
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      id: targetId,
    };
    const check = normalizeAndValidateFarmPayload(merged, targetId);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    const next = farms.map((f) => (f.id === targetId ? check.farm : f));
    writeFarmsStore(next);
    res.json({
      farm: check.farm,
      properties: buildFarmPropertiesResponse(check.farm),
      farms: next,
      persistenceSource: 'server-json-store',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to patch farm.' });
  }
});

app.delete('/api/farms/:id', (req, res) => {
  try {
    const targetId = req.params.id;
    const farms = ensureFarmsStoreInitialized();
    const exists = farms.some((f) => f.id === targetId);
    if (!exists) {
      res.status(404).json({ error: `Farm "${targetId}" not found.` });
      return;
    }
    if (farms.length <= 1) {
      res.status(400).json({ error: 'Cannot delete the last remaining farm parcel.' });
      return;
    }
    const next = farms.filter((f) => f.id !== targetId);
    writeFarmsStore(next);
    res.json({ deletedId: targetId, farms: next, persistenceSource: 'server-json-store' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to delete farm.' });
  }
});

async function fetchNasaPowerObservations(lat: number, lon: number) {
  const cacheKey = `power:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<ReturnType<typeof buildFallbackObservations>>(cacheKey);
  if (cached) {
    return cached;
  }

  // NASA POWER daily data lags ~3-4 days behind UTC today
  const endDate = new Date(Date.now() - 4 * 86400000);
  const startDate = new Date(endDate.getTime() - 89 * 86400000);
  const startStr = formatYyyymmdd(startDate);
  const endStr = formatYyyymmdd(endDate);

  const powerDailyUrl =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETTOP,GWETROOT,ALLSKY_SFC_SW_DWN,RH2M,WS2M` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=${startStr}&end=${endStr}&format=JSON`;

  const powerClimUrl =
    `https://power.larc.nasa.gov/api/temporal/climatology/point` +
    `?parameters=T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN` +
    `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&format=JSON`;

  const openMeteoUrl =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&hourly=soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_temperature_0cm` +
    `&forecast_days=7&timezone=auto`;

  let nasaPowerStatus: 'live' | 'fallback' = 'live';
  let openMeteoStatus: 'live' | 'fallback' = 'live';
  const statusNotes: string[] = [];

  try {
    const [powerDailyRes, powerClimRes, openMeteoRes] = await Promise.allSettled([
      fetch(powerDailyUrl, { signal: AbortSignal.timeout(9000) }),
      fetch(powerClimUrl, { signal: AbortSignal.timeout(9000) }),
      fetch(openMeteoUrl, { signal: AbortSignal.timeout(6000) }),
    ]);

    const dailySeries: Array<{
      date: string;
      tempC: number;
      tempMaxC: number;
      tempMinC: number;
      precipMm: number;
      soilWetnessTopPct: number;
      soilWetnessRootPct: number;
      solarIrradianceMj: number;
      humidityPct: number;
      windMs: number;
      estimatedNdvi: number;
      estimatedEt0Mm: number;
    }> = [];

    let missingFillPoints = 0;

    if (powerDailyRes.status === 'fulfilled' && powerDailyRes.value.ok) {
      const json = (await powerDailyRes.value.json()) as {
        properties?: { parameter?: Record<string, Record<string, number>> };
      };
      const params = json.properties?.parameter;
      if (params && params.T2M) {
        const keys = Object.keys(params.T2M).sort();
        const lastValid: Record<string, number> = {
          T2M: 26,
          T2M_MAX: 31,
          T2M_MIN: 21,
          PRECTOTCORR: 0,
          GWETTOP: 0.45,
          GWETROOT: 0.5,
          ALLSKY_SFC_SW_DWN: 18,
          RH2M: 55,
          WS2M: 2.2,
        };

        for (const k of keys) {
          const rawTemp = params.T2M?.[k];
          if (rawTemp === undefined || rawTemp <= -900) {
            continue;
          }

          const readParam = (name: string) => {
            const v = params[name]?.[k];
            if (v !== undefined && v > -900) {
              lastValid[name] = v;
              return v;
            }
            missingFillPoints++;
            return lastValid[name];
          };

          const tempC = Number(readParam('T2M').toFixed(1));
          const tempMaxC = Number(readParam('T2M_MAX').toFixed(1));
          const tempMinC = Number(readParam('T2M_MIN').toFixed(1));
          const precipMm = Number(Math.max(0, readParam('PRECTOTCORR')).toFixed(2));
          const top01 = Math.min(1, Math.max(0.02, readParam('GWETTOP')));
          const root01 = Math.min(1, Math.max(0.05, readParam('GWETROOT')));
          const solarMj = Number(Math.max(1, readParam('ALLSKY_SFC_SW_DWN')).toFixed(2));
          const humidityPct = Number(Math.min(100, Math.max(5, readParam('RH2M'))).toFixed(0));
          const windMs = Number(Math.max(0.1, readParam('WS2M')).toFixed(1));

          dailySeries.push({
            date: formatIsoDate(k),
            tempC,
            tempMaxC,
            tempMinC,
            precipMm,
            soilWetnessTopPct: Number((top01 * 100).toFixed(1)),
            soilWetnessRootPct: Number((root01 * 100).toFixed(1)),
            solarIrradianceMj: solarMj,
            humidityPct,
            windMs,
            estimatedNdvi: estimateVegetationIndex(root01, tempC, solarMj, precipMm),
            estimatedEt0Mm: estimateEt0(tempC, solarMj, humidityPct, windMs),
          });
        }
      }
    }

    if (dailySeries.length === 0) {
      nasaPowerStatus = 'fallback';
      statusNotes.push('NASA POWER daily endpoint did not respond in time; using regional climatology fallback.');
      return buildFallbackObservations(lat, lon, statusNotes.join(' '));
    }

    const monthKeys = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let monthlyClimatology: Array<{ month: string; tempC: number; precipMm: number; solarMj: number }> = [];

    if (powerClimRes.status === 'fulfilled' && powerClimRes.value.ok) {
      const cJson = (await powerClimRes.value.json()) as {
        properties?: { parameter?: Record<string, Record<string, number>> };
      };
      const cParams = cJson.properties?.parameter;
      if (cParams?.T2M) {
        monthlyClimatology = monthKeys.map((mk, i) => {
          const t = cParams.T2M?.[mk];
          const pDaily = cParams.PRECTOTCORR?.[mk];
          const s = cParams.ALLSKY_SFC_SW_DWN?.[mk];
          return {
            month: monthLabels[i],
            tempC: Number((t !== undefined && t > -900 ? t : 25).toFixed(1)),
            precipMm: Number(((pDaily !== undefined && pDaily > -900 ? pDaily : 2) * 30.4).toFixed(1)),
            solarMj: Number((s !== undefined && s > -900 ? s : 18).toFixed(1)),
          };
        });
      }
    }
    if (monthlyClimatology.length === 0) {
      monthlyClimatology = buildFallbackObservations(lat, lon, '').monthlyClimatology;
    }

    let forecast7d: Array<{
      date: string;
      tempMaxC: number;
      tempMinC: number;
      precipMm: number;
      soilMoisture0to1cm: number;
      soilMoisture3to9cm: number;
      soilMoisture9to27cm: number;
      soilTemp0cm: number;
    }> = [];

    if (openMeteoRes.status === 'fulfilled' && openMeteoRes.value.ok) {
      const om = (await openMeteoRes.value.json()) as {
        daily?: {
          time: string[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          precipitation_sum: number[];
        };
        hourly?: {
          soil_moisture_0_to_1cm?: number[];
          soil_moisture_3_to_9cm?: number[];
          soil_moisture_9_to_27cm?: number[];
          soil_temperature_0cm?: number[];
        };
      };
      if (om.daily?.time) {
        forecast7d = om.daily.time.map((date, idx) => {
          const hourIdx = Math.min((om.hourly?.soil_moisture_0_to_1cm?.length || 1) - 1, idx * 24 + 12);
          const sm0 = om.hourly?.soil_moisture_0_to_1cm?.[hourIdx] ?? 0.24;
          const sm3 = om.hourly?.soil_moisture_3_to_9cm?.[hourIdx] ?? 0.27;
          const sm9 = om.hourly?.soil_moisture_9_to_27cm?.[hourIdx] ?? 0.3;
          const st0 = om.hourly?.soil_temperature_0cm?.[hourIdx] ?? om.daily!.temperature_2m_max[idx] - 2;
          return {
            date,
            tempMaxC: Number((om.daily!.temperature_2m_max[idx] ?? 30).toFixed(1)),
            tempMinC: Number((om.daily!.temperature_2m_min[idx] ?? 20).toFixed(1)),
            precipMm: Number((om.daily!.precipitation_sum[idx] ?? 0).toFixed(1)),
            soilMoisture0to1cm: Number((sm0 * 100).toFixed(1)),
            soilMoisture3to9cm: Number((sm3 * 100).toFixed(1)),
            soilMoisture9to27cm: Number((sm9 * 100).toFixed(1)),
            soilTemp0cm: Number(st0.toFixed(1)),
          };
        });
      }
    }

    if (forecast7d.length === 0) {
      openMeteoStatus = 'fallback';
      statusNotes.push('Open-Meteo 7-day forecast unavailable; using baseline projection.');
      forecast7d = buildFallbackObservations(lat, lon, '').forecast7d;
    }

    const n = dailySeries.length;
    const totals = dailySeries.reduce(
      (acc, d) => ({
        temp: acc.temp + d.tempC,
        maxT: Math.max(acc.maxT, d.tempMaxC),
        minT: Math.min(acc.minT, d.tempMinC),
        precip: acc.precip + d.precipMm,
        top: acc.top + d.soilWetnessTopPct,
        root: acc.root + d.soilWetnessRootPct,
        solar: acc.solar + d.solarIrradianceMj,
        hum: acc.hum + d.humidityPct,
        ndvi: acc.ndvi + d.estimatedNdvi,
        et0: acc.et0 + d.estimatedEt0Mm,
      }),
      { temp: 0, maxT: -99, minT: 99, precip: 0, top: 0, root: 0, solar: 0, hum: 0, ndvi: 0, et0: 0 }
    );

    const payload = {
      location: { lat, lon },
      fetchedAt: new Date().toISOString(),
      sourceStatus: {
        nasaPower: nasaPowerStatus,
        openMeteo: openMeteoStatus,
        nasaPowerMeta: {
          product: 'NASA POWER AG Daily v2.x',
          startDate: dailySeries[0]?.date || startStr,
          endDate: dailySeries[dailySeries.length - 1]?.date || endStr,
          validDays: dailySeries.length,
          missingFillPoints,
        },
        message: statusNotes.length ? statusNotes.join(' ') : undefined,
      },
      summary: {
        meanTempC: Number((totals.temp / n).toFixed(1)),
        maxTempC: Number(totals.maxT.toFixed(1)),
        minTempC: Number(totals.minT.toFixed(1)),
        totalPrecip90dMm: Number(totals.precip.toFixed(1)),
        meanSurfaceSoilWetnessPct: Number((totals.top / n).toFixed(1)),
        meanRootSoilWetnessPct: Number((totals.root / n).toFixed(1)),
        meanSolarMj: Number((totals.solar / n).toFixed(1)),
        meanHumidityPct: Number((totals.hum / n).toFixed(0)),
        estimatedNdvi: Number((totals.ndvi / n).toFixed(3)),
        aridityIndex: Number((totals.precip / Math.max(1, totals.et0)).toFixed(2)),
      },
      dailySeries,
      monthlyClimatology,
      forecast7d,
    };

    setCached(cacheKey, payload);
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach NASA POWER API.';
    return buildFallbackObservations(lat, lon, message);
  }
}

// NASA POWER + Open-Meteo real Earth observation endpoint
app.get('/api/nasa/power', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid lat/lon coordinates.' });
    return;
  }
  const payload = await fetchNasaPowerObservations(lat, lon);
  res.json(payload);
});

// SoilGrids ISRIC v2.0 + Regional Agro-Ecological Baseline Fallback
function estimateRegionalSoil(lat: number, lon: number) {
  // Distinguish Karnataka Vertisol vs Alfisol / Lateritic vs Global Mollisol / Andosol
  const inNorthKarnataka = lat >= 14.5 && lat <= 18.5 && lon >= 74.0 && lon <= 78.0;
  const inSouthKarnataka = lat >= 11.5 && lat < 14.5 && lon >= 74.5 && lon <= 78.2;
  const inUSMidwest = lat >= 38 && lat <= 46 && lon >= -98 && lon <= -84;

  let clayPct = 28;
  let sandPct = 42;
  let siltPct = 30;
  let phH2O = 6.7;
  let organicCarbonGKg = 8.4;
  let nitrogenGKg = 0.92;
  let cecCmolKg = 21.5;
  let bulkDensityKgDm3 = 1.38;
  let textureClass = 'Clay Loam';
  let amendmentNotes = [
    'Maintain 30% crop residue cover after harvest to limit topsoil evaporative loss.',
    'Incorporate green gram or cowpea haulms pre-monsoon to elevate labile organic carbon.',
  ];

  if (inNorthKarnataka) {
    clayPct = 48;
    sandPct = 24;
    siltPct = 28;
    phH2O = 7.9;
    organicCarbonGKg = 5.8;
    nitrogenGKg = 0.68;
    cecCmolKg = 38.4;
    bulkDensityKgDm3 = 1.31;
    textureClass = 'Black Vertisol (Clay)';
    amendmentNotes = [
      'Deep Vertisol exhibits strong shrink-swell cracking; use ridge-and-furrow sowing to improve infiltration.',
      'Slightly alkaline pH (7.9): apply elemental sulfur or gypsum with farmyard manure to unlock zinc and phosphorus.',
      'Rotate deep-rooted pigeon pea or safflower every 2nd year to break subsoil compaction.',
    ];
  } else if (inSouthKarnataka) {
    clayPct = 24;
    sandPct = 54;
    siltPct = 22;
    phH2O = 6.3;
    organicCarbonGKg = 7.1;
    nitrogenGKg = 0.81;
    cecCmolKg = 14.8;
    bulkDensityKgDm3 = 1.46;
    textureClass = 'Red Sandy Clay Loam (Alfisol)';
    amendmentNotes = [
      'Low cation exchange capacity (14.8 cmol/kg) requires split nitrogen dosing rather than single basal applications.',
      'Use tank silt and composted pressmud / bio-char to raise water-holding capacity in the 0–15 cm root zone.',
      'Alternate cereals with short-duration cowpea or horse gram to build topsoil nitrogen naturally.',
    ];
  } else if (inUSMidwest) {
    clayPct = 26;
    sandPct = 30;
    siltPct = 44;
    phH2O = 6.5;
    organicCarbonGKg = 24.5;
    nitrogenGKg = 2.1;
    cecCmolKg = 24.2;
    bulkDensityKgDm3 = 1.24;
    textureClass = 'Silt Loam (Mollisol)';
    amendmentNotes = [
      'High organic carbon Mollisol responds well to winter cereal rye cover crops to capture residual nitrate.',
      'Adopt no-till strip planting to preserve aggregate stability across freeze-thaw cycles.',
    ];
  }

  return {
    location: { lat, lon },
    source: 'Regional Agro-Ecological Baseline (Estimated)' as const,
    textureClass,
    sandPct,
    siltPct,
    clayPct,
    phH2O,
    organicCarbonGKg,
    nitrogenGKg,
    cecCmolKg,
    bulkDensityKgDm3,
    waterHoldingCapacityMmM: Number((110 + clayPct * 1.65 + organicCarbonGKg * 1.4).toFixed(0)),
    depthLayers: [
      { depth: '0–5 cm', moisturePct: Number((22 + clayPct * 0.25).toFixed(1)), organicCarbonGKg, ph: phH2O },
      {
        depth: '5–15 cm',
        moisturePct: Number((25 + clayPct * 0.28).toFixed(1)),
        organicCarbonGKg: Number((organicCarbonGKg * 0.84).toFixed(1)),
        ph: Number((phH2O + 0.1).toFixed(1)),
      },
      {
        depth: '15–30 cm',
        moisturePct: Number((28 + clayPct * 0.3).toFixed(1)),
        organicCarbonGKg: Number((organicCarbonGKg * 0.62).toFixed(1)),
        ph: Number((phH2O + 0.2).toFixed(1)),
      },
    ],
    amendmentNotes,
  };
}

function classifyUsdaTexture(sand: number, silt: number, clay: number): string {
  if (clay >= 40) return 'Clay';
  if (clay >= 27 && sand < 45) return 'Clay Loam';
  if (silt >= 50 && clay < 27) return 'Silt Loam';
  if (sand >= 52 && clay < 20) return 'Sandy Loam';
  if (clay >= 20 && sand >= 45) return 'Sandy Clay Loam';
  return 'Loam';
}

async function fetchSoilProfileForLocation(lat: number, lon: number) {
  const cacheKey = `soil:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<ReturnType<typeof estimateRegionalSoil>>(cacheKey);
  if (cached) {
    return cached;
  }

  const coreUrl =
    `https://rest.isric.org/soilgrids/v2.0/properties/query` +
    `?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
    `&property=clay&property=sand&property=silt&property=soc&property=phh2o` +
    `&depth=0-5cm&value=mean`;

  try {
    const sgRes = await fetch(coreUrl, { signal: AbortSignal.timeout(15000) });
    if (!sgRes.ok) {
      return estimateRegionalSoil(lat, lon);
    }

    type SoilGridsJson = {
      properties?: {
        layers?: Array<{
          name: string;
          depths: Array<{ label: string; values: { mean: number | null } }>;
        }>;
      };
    };

    const json = (await sgRes.json()) as SoilGridsJson;
    const layers = json.properties?.layers;
    if (!layers || layers.length === 0) {
      return estimateRegionalSoil(lat, lon);
    }

    const extraLayers: NonNullable<NonNullable<SoilGridsJson['properties']>['layers']> = [];

    const readLayer = (
      sourceLayers: typeof layers,
      propName: string,
      depthLabel: string
    ): number | null => {
      const layer = sourceLayers.find((l) => l.name === propName);
      const depth = layer?.depths.find((d) => d.label === depthLabel);
      return depth?.values?.mean ?? null;
    };

    const clayRaw = readLayer(layers, 'clay', '0-5cm');
    const sandRaw = readLayer(layers, 'sand', '0-5cm');
    const siltRaw = readLayer(layers, 'silt', '0-5cm');
    const phRaw = readLayer(layers, 'phh2o', '0-5cm');
    const socRaw = readLayer(layers, 'soc', '0-5cm');

    if (clayRaw === null || sandRaw === null || siltRaw === null) {
      return estimateRegionalSoil(lat, lon);
    }

    const clayPct = Number((clayRaw / 10).toFixed(1));
    const sandPct = Number((sandRaw / 10).toFixed(1));
    const siltPct = Number((siltRaw / 10).toFixed(1));
    const phH2O = Number(((phRaw ?? 68) / 10).toFixed(1));
    const organicCarbonGKg = Number(((socRaw ?? 85) / 10).toFixed(1));

    const nRaw = readLayer(extraLayers, 'nitrogen', '0-5cm');
    const cecRaw = readLayer(extraLayers, 'cec', '0-5cm');
    const bdodRaw = readLayer(extraLayers, 'bdod', '0-5cm');

    const nitrogenGKg = Number(
      (nRaw !== null ? nRaw / 100 : Math.max(0.35, organicCarbonGKg * 0.095)).toFixed(2)
    );
    const cecCmolKg = Number(
      (cecRaw !== null ? cecRaw / 10 : Math.max(8, clayPct * 0.55 + organicCarbonGKg * 0.35)).toFixed(1)
    );
    const bulkDensityKgDm3 = Number(
      (bdodRaw !== null ? bdodRaw / 100 : Math.max(1.12, 1.52 - organicCarbonGKg * 0.012)).toFixed(2)
    );

    const ph30Raw = readLayer(extraLayers, 'phh2o', '15-30cm');
    const soc30Raw = readLayer(extraLayers, 'soc', '15-30cm');
    const ph30 = Number((ph30Raw !== null ? ph30Raw / 10 : Math.min(8.6, phH2O + 0.15)).toFixed(1));
    const ph15 = Number(((phH2O + ph30) / 2).toFixed(1));
    const soc30 = Number((soc30Raw !== null ? soc30Raw / 10 : organicCarbonGKg * 0.62).toFixed(1));
    const soc15 = Number(((organicCarbonGKg + soc30) / 2).toFixed(1));

    const textureClass = classifyUsdaTexture(sandPct, siltPct, clayPct);
    const notes: string[] = [];
    if (organicCarbonGKg < 10) {
      notes.push('Topsoil organic carbon is below 10 g/kg; prioritize legume cover crops and residue retention.');
    } else {
      notes.push('Healthy soil organic carbon reservoir supports microbial nutrient cycling and moisture retention.');
    }
    if (phH2O > 7.6) {
      notes.push(`Alkaline soil reaction (pH ${phH2O}); pair organic compost with micronutrient chelated zinc/iron.`);
    } else if (phH2O < 5.8) {
      notes.push(`Moderately acidic soil reaction (pH ${phH2O}); consider agricultural lime application before pulses.`);
    } else {
      notes.push(`Optimal near-neutral pH (${phH2O}) favors broad availability of N, P, K, and rhizobia nodulation.`);
    }

    const result = {
      location: { lat, lon },
      source: 'ISRIC SoilGrids v2.0 (Measured)' as const,
      textureClass,
      sandPct,
      siltPct,
      clayPct,
      phH2O,
      organicCarbonGKg,
      nitrogenGKg,
      cecCmolKg,
      bulkDensityKgDm3,
      waterHoldingCapacityMmM: Number((105 + clayPct * 1.6 + organicCarbonGKg * 1.3).toFixed(0)),
      depthLayers: [
        { depth: '0–5 cm', moisturePct: Number((22 + clayPct * 0.25).toFixed(1)), organicCarbonGKg, ph: phH2O },
        { depth: '5–15 cm', moisturePct: Number((25 + clayPct * 0.27).toFixed(1)), organicCarbonGKg: soc15, ph: ph15 },
        { depth: '15–30 cm', moisturePct: Number((28 + clayPct * 0.29).toFixed(1)), organicCarbonGKg: soc30, ph: ph30 },
      ],
      amendmentNotes: notes,
    };

    setCached(cacheKey, result, 30 * 60 * 1000);
    return result;
  } catch {
    return estimateRegionalSoil(lat, lon);
  }
}

app.get('/api/soil/profile', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Invalid lat/lon coordinates.' });
    return;
  }
  const result = await fetchSoilProfileForLocation(lat, lon);
  res.json(result);
});

// Global Geocoding Search via Open-Meteo Geocoding API
app.get('/api/geocode', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query || query.length < 2) {
    res.json({ results: [] });
    return;
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const geoRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!geoRes.ok) {
      res.status(502).json({ error: 'Geocoding service unavailable.' });
      return;
    }
    const json = (await geoRes.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        elevation?: number;
        country?: string;
        admin1?: string;
      }>;
    };
    res.json({
      results: (json.results || []).map((r) => ({
        id: String(r.id),
        name: r.name,
        region: [r.admin1, r.country].filter(Boolean).join(', '),
        country: r.country || '',
        lat: r.latitude,
        lon: r.longitude,
        elevation: r.elevation ?? 450,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Geocoding failed' });
  }
});

function parseBboxQueryParam(raw: unknown): [number, number, number, number] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon < -180 || maxLon > 180 || minLat < -90 || maxLat > 90 || minLon > maxLon || minLat > maxLat) {
    return null;
  }
  return [
    Number(minLon.toFixed(6)),
    Number(minLat.toFixed(6)),
    Number(maxLon.toFixed(6)),
    Number(maxLat.toFixed(6)),
  ];
}

async function fetchSentinel2ScenesForLocation(
  lat: number,
  lon: number,
  bbox?: [number, number, number, number] | null
) {
  const bboxKey = bbox ? bbox.map((n) => n.toFixed(3)).join(',') : 'point';
  const cacheKey = `s2:${lat.toFixed(2)},${lon.toFixed(2)}:${bboxKey}`;
  const cached = getCached<{
    available: boolean;
    provider: string;
    resolutionMeters: number;
    queryBbox: [number, number, number, number] | null;
    scenes: Array<{
      id: string;
      date: string;
      datetime: string;
      cloudCoverPct: number;
      platform: string;
      mgrsTile: string;
      trueColorTileUrl: string;
      ndviTileUrl: string;
    }>;
    message?: string;
  }>(cacheKey);
  if (cached) return cached;

  const intersectsGeometry = bbox
    ? {
        type: 'Polygon',
        coordinates: [
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[1]],
            [bbox[2], bbox[3]],
            [bbox[0], bbox[3]],
            [bbox[0], bbox[1]],
          ],
        ],
      }
    : { type: 'Point', coordinates: [lon, lat] };

  const queryStac = async (maxCloud: number) => {
    const r = await fetch('https://planetarycomputer.microsoft.com/api/stac/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        intersects: intersectsGeometry,
        query: { 'eo:cloud_cover': { lt: maxCloud } },
        sortby: [{ field: 'properties.datetime', direction: 'desc' }],
        limit: 12,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      features?: Array<{
        id: string;
        properties?: {
          datetime?: string;
          'eo:cloud_cover'?: number;
          platform?: string;
          's2:mgrs_tile'?: string;
        };
      }>;
    };
    return data.features || [];
  };

  try {
    let features = await queryStac(30);
    if (features.length === 0) {
      features = await queryStac(80);
    }

    const byDate = new Map<string, (typeof features)[number]>();
    for (const f of features) {
      const dt = f.properties?.datetime || '';
      const date = dt.slice(0, 10);
      if (!date) continue;
      const existing = byDate.get(date);
      const cloud = f.properties?.['eo:cloud_cover'] ?? 100;
      const existingCloud = existing?.properties?.['eo:cloud_cover'] ?? 100;
      if (!existing || cloud < existingCloud) {
        byDate.set(date, f);
      }
    }

    const scenes = Array.from(byDate.values())
      .sort((a, b) => (b.properties?.datetime || '').localeCompare(a.properties?.datetime || ''))
      .slice(0, 6)
      .map((f) => {
        const dt = f.properties?.datetime || '';
        const itemEncoded = encodeURIComponent(f.id);
        return {
          id: f.id,
          date: dt.slice(0, 10),
          datetime: dt,
          cloudCoverPct: Number((f.properties?.['eo:cloud_cover'] ?? 0).toFixed(1)),
          platform: f.properties?.platform || 'Sentinel-2 L2A',
          mgrsTile: f.properties?.['s2:mgrs_tile'] || f.id.split('_').find((p) => /^T\d{2}[A-Z]{3}$/.test(p)) || 'MGRS',
          trueColorTileUrl: `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}.png?collection=sentinel-2-l2a&item=${itemEncoded}&assets=visual&asset_bidx=visual%7C1%2C2%2C3`,
          ndviTileUrl: `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}.png?collection=sentinel-2-l2a&item=${itemEncoded}&expression=(B08-B04)%2F(B08%2BB04)&asset_as_band=true&colormap_name=rdylgn&rescale=-0.2%2C0.85`,
        };
      });

    const payload = {
      available: scenes.length > 0,
      provider: 'Copernicus Sentinel-2 Level-2A via Microsoft Planetary Computer',
      resolutionMeters: 10,
      queryBbox: bbox ?? null,
      scenes,
      message:
        scenes.length === 0
          ? 'No low-cloud Sentinel-2 L2A scenes available recently for this parcel bounding box.'
          : undefined,
    };

    setCached(cacheKey, payload, 30 * 60 * 1000);
    return payload;
  } catch (err) {
    return {
      available: false,
      provider: 'Copernicus Sentinel-2 Level-2A via Microsoft Planetary Computer',
      resolutionMeters: 10,
      queryBbox: bbox ?? null,
      scenes: [],
      message: err instanceof Error ? err.message : 'Unable to reach Sentinel-2 STAC catalog.',
    };
  }
}

// Sentinel-2 L2A (10m) Official STAC + Tile Integration via Microsoft Planetary Computer
app.get('/api/satellite/sentinel2', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid lat/lon coordinates.' });
    return;
  }
  const bbox = parseBboxQueryParam(req.query.bbox);
  const payload = await fetchSentinel2ScenesForLocation(lat, lon, bbox);
  res.json(payload);
});

async function assembleFarmObservationsBundle(farm: ServerFarmParcel) {
  const bbox = farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const gv = farm.geometryVersion || srvGeometryVersion(farm.boundary, farm.zones);
  const [powerSettled, soilSettled, s2Settled] = await Promise.allSettled([
    fetchNasaPowerObservations(farm.center.lat, farm.center.lon),
    fetchSoilProfileForLocation(farm.center.lat, farm.center.lon),
    fetchSentinel2ScenesForLocation(farm.center.lat, farm.center.lon, bbox),
  ]);

  const observations = powerSettled.status === 'fulfilled' ? powerSettled.value : null;
  const soil = soilSettled.status === 'fulfilled' ? soilSettled.value : null;
  const sentinel2 = s2Settled.status === 'fulfilled' ? s2Settled.value : null;

  return {
    farmId: farm.id,
    geometryVersion: gv,
    queryLocation: { lat: farm.center.lat, lon: farm.center.lon, boundingBox: bbox },
    dataset: 'farm-observations-bundle',
    observationDate:
      (observations?.sourceStatus?.nasaPower === 'live'
        ? observations.sourceStatus.nasaPowerMeta?.endDate
        : null) || new Date().toISOString().slice(0, 10),
    units: '°C, mm, %, MJ/m2/d, g/kg, pH',
    source: 'NASA POWER + Open-Meteo + Sentinel-2 L2A + ISRIC SoilGrids + GIBS (MODIS/SMAP/GPM)',
    resolution: 'Multi-resolution (10 m Sentinel-2, 250 m SoilGrids/MODIS, 9 km SMAP, 10 km GPM, 55 km POWER)',
    classification: observations?.sourceStatus?.nasaPower === 'live' ? ('Observed' as const) : ('Estimated' as const),
    retrievalStatus: observations && soil ? ('available' as const) : ('partial' as const),
    limitations: {
      smap: 'NASA SMAP L4 (9 km / ~8,100 ha cell) captures regional watershed soil moisture, not individual parcel boundaries.',
      gpm: 'NASA GPM IMERG (10 km) reflects regional convective rainfall rates; local rain-gauge verification advised.',
      modis: 'NASA MODIS (250 m) blends multi-field reflectance across smallholders.',
    },
    data: {
      observations,
      soil,
      sentinel2,
      modisMeta: {
        productId: 'MODIS_Terra_NDVI_8Day',
        resolution: '250 m',
        cadence: '8-day composite',
        classification: 'Observed',
      },
      smapMeta: {
        productId: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
        resolution: '9 km (~8,100 ha)',
        cadence: '3-Hourly / Daily assimilated',
        classification: 'Modeled',
      },
      gpmMeta: {
        productId: 'IMERG_Precipitation_Rate',
        resolution: '10 km',
        cadence: 'Near-Real-Time / Daily',
        classification: 'Observed',
      },
    },
  };
}

// Farm-Scoped Data API Endpoints (Part 11): Observations, Analytics, Rotation, Climate, Advisory Context
app.get('/api/farms/:id/observations', async (req, res) => {
  const farms = ensureFarmsStoreInitialized();
  const farm = farms.find((f) => f.id === req.params.id);
  if (!farm) {
    res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
    return;
  }
  const bundle = await assembleFarmObservationsBundle(farm);
  res.json(bundle);
});

app.get('/api/farms/:id/analytics', async (req, res) => {
  const farms = ensureFarmsStoreInitialized();
  const farm = farms.find((f) => f.id === req.params.id);
  if (!farm) {
    res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
    return;
  }
  const bbox = farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const gv = farm.geometryVersion || srvGeometryVersion(farm.boundary, farm.zones);
  const obsResp = await assembleFarmObservationsBundle(farm);
  const obs = obsResp.data.observations;
  const meanTemp = obs?.summary?.meanTempC ?? null;
  const rain90d = obs?.summary?.totalPrecip90dMm ?? null;
  const rootWetness = obs?.summary?.meanRootSoilWetnessPct ?? null;

  res.json({
    farmId: farm.id,
    geometryVersion: gv,
    queryLocation: { lat: farm.center.lat, lon: farm.center.lon, boundingBox: bbox },
    dataset: 'farm-analytics',
    observationDate:
      obs?.sourceStatus?.nasaPower === 'live' ? obs.sourceStatus.nasaPowerMeta?.endDate || null : null,
    units: 'ha, °C, mm, %',
    source: 'FIELD SHIFT Server Analytics Engine',
    resolution: 'Parcel polygon + 55 km climate + 250 m soil',
    classification: 'Modeled',
    retrievalStatus: obs ? 'available' : 'unavailable',
    data: {
      properties: buildFarmPropertiesResponse(farm).data,
      summaryMetrics: {
        meanTempC: meanTemp,
        totalPrecip90dMm: rain90d,
        meanRootSoilWetnessPct: rootWetness,
        aridityIndex: obs?.summary?.aridityIndex ?? null,
        estimatedNdviProxy: obs?.summary?.estimatedNdvi ?? null,
      },
      observations: obs,
      soil: obsResp.data.soil ?? null,
      sentinel2: obsResp.data.sentinel2 ?? null,
    },
  });
});

app.get('/api/farms/:id/climate', async (req, res) => {
  const farms = ensureFarmsStoreInitialized();
  const farm = farms.find((f) => f.id === req.params.id);
  if (!farm) {
    res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
    return;
  }
  const gv = farm.geometryVersion || srvGeometryVersion(farm.boundary, farm.zones);
  const bbox = farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const power = await fetchNasaPowerObservations(farm.center.lat, farm.center.lon);
  res.json({
    farmId: farm.id,
    geometryVersion: gv,
    queryLocation: { lat: farm.center.lat, lon: farm.center.lon, boundingBox: bbox },
    dataset: 'farm-climate-baseline',
    observationDate:
      power?.sourceStatus?.nasaPower === 'live' ? power.sourceStatus.nasaPowerMeta?.endDate || null : null,
    units: '°C, mm, %',
    source: power?.sourceStatus?.nasaPower === 'live' ? 'NASA POWER L2 Daily + Open-Meteo' : 'Regional Climatology Fallback',
    resolution: '0.5° × 0.625° (~55 km grid)',
    classification: power?.sourceStatus?.nasaPower === 'live' ? 'Observed' : 'Estimated',
    retrievalStatus: power ? 'available' : 'unavailable',
    data: {
      farmName: farm.name,
      summary: power?.summary ?? null,
      monthlyClimatology: power?.monthlyClimatology ?? [],
      forecast7d: power?.forecast7d ?? [],
    },
  });
});

app.get('/api/farms/:id/rotation', async (req, res) => {
  const farms = ensureFarmsStoreInitialized();
  const farm = farms.find((f) => f.id === req.params.id);
  if (!farm) {
    res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
    return;
  }
  const gv = farm.geometryVersion || srvGeometryVersion(farm.boundary, farm.zones);
  const bbox = farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const obsBundle = await assembleFarmObservationsBundle(farm);
  const missingInputs: string[] = [];
  if (!farm.dominantCrops || farm.dominantCrops.length === 0) missingInputs.push('Existing crop type / sequence');
  if (!farm.irrigationType) missingInputs.push('Irrigation availability');
  if (!farm.primarySoilType || farm.primarySoilType === 'Needs farmer input') missingInputs.push('Local soil classification');

  res.json({
    farmId: farm.id,
    geometryVersion: gv,
    queryLocation: { lat: farm.center.lat, lon: farm.center.lon, boundingBox: bbox },
    dataset: 'farm-rotation-context',
    observationDate: obsBundle.observationDate ?? null,
    units: 'mm, kg/ha, t C/ha/yr',
    source: 'FIELD SHIFT Rotation Readiness Endpoint',
    resolution: 'Parcel-level constraints + regional telemetry',
    classification: 'Modeled',
    retrievalStatus: 'available',
    data: {
      farm,
      soil: obsBundle.data.soil ?? null,
      observationsSummary: obsBundle.data.observations?.summary ?? null,
      missingInputs,
    },
  });
});

app.get('/api/farms/:id/advisory-context', async (req, res) => {
  const farms = ensureFarmsStoreInitialized();
  const farm = farms.find((f) => f.id === req.params.id);
  if (!farm) {
    res.status(404).json({ error: `Farm "${req.params.id}" not found.` });
    return;
  }
  const gv = farm.geometryVersion || srvGeometryVersion(farm.boundary, farm.zones);
  const bbox = farm.boundingBox ?? srvBoundingBox(farm.boundary);
  const obsBundle = await assembleFarmObservationsBundle(farm);
  res.json({
    farmId: farm.id,
    geometryVersion: gv,
    queryLocation: { lat: farm.center.lat, lon: farm.center.lon, boundingBox: bbox },
    dataset: 'farm-advisory-context',
    observationDate: obsBundle.observationDate ?? null,
    units: 'Mixed scientific units',
    source: 'Unified Farm Context Assembler',
    resolution: 'Multi-source farm-bound context',
    classification: 'Observed',
    retrievalStatus: obsBundle.retrievalStatus || 'available',
    data: {
      farm,
      properties: buildFarmPropertiesResponse(farm).data,
      observations: obsBundle.data.observations ?? null,
      soil: obsBundle.data.soil ?? null,
      sentinel2: obsBundle.data.sentinel2 ?? null,
    },
  });
});

// Gemini API: AI-Powered 4-Strategy Explainable Crop Rotation Intelligence Engine
app.post('/api/ai/rotation', async (req, res) => {
  try {
    const {
      farmName,
      region,
      agroClimaticZone,
      areaHectares,
      farmerPriority,
      observationsSummary,
      soilProfile,
      climateScenario,
      simulatedImpact,
      farmInputs,
    } = req.body || {};

    if (!observationsSummary || !soilProfile) {
      res.status(400).json({ error: 'Missing farm observations or soil profile context.' });
      return;
    }

    const ai = getGeminiClient();
    const priority = farmerPriority || 'drought-resilience';
    const effectivePh = farmInputs?.soilTestOverrideEnabled
      ? farmInputs.customPhH2O
      : soilProfile.phH2O;
    const effectiveSoc = farmInputs?.soilTestOverrideEnabled
      ? farmInputs.customOrganicCarbonGKg
      : soilProfile.organicCarbonGKg;

    const prompt = `Design exactly 4 contrasting, agronomically rigorous 4-season crop rotation strategies tailored to the farm's NASA observations, soil profile, farm constraints, and farmer priority.

FARM & FIELD CONSTRAINTS:
- Parcel: ${farmName} (${region}) | Zone: ${agroClimaticZone} | Area: ${areaHectares} ha
- Primary Farmer Priority: ${priority}
- Existing Crop Sequence: ${farmInputs?.existingCropSequence || 'Regional mixed baseline'}
- Irrigation Availability: ${farmInputs?.irrigationAvailability || 'protective-tank'} (${farmInputs?.waterConstraintNote || 'Standard seasonal water constraint'})
- Planting Season Focus: ${farmInputs?.plantingSeason || 'Full Annual Cycle'}
- Equipment Availability: ${farmInputs?.equipmentAvailability || 'shared-tractor'}
- Market Preference: ${farmInputs?.marketPreference || 'pulse-oilseed-value'}
- Climate Scenario: ${climateScenario?.label || 'Historical Baseline'} (Temp ${climateScenario?.tempDeltaC ?? 0}°C, Rain ${climateScenario?.precipChangePct ?? 0}%, Irrigation Eff ${climateScenario?.irrigationEfficiencyPct ?? 45}%)
- Simulated Stress: Water Stress ${simulatedImpact?.waterStressIndex ?? 'N/A'}/100, Simulated 90d Rain ${simulatedImpact?.simulatedPrecip90dMm ?? 'N/A'} mm, Heat Days >=35C: ${simulatedImpact?.heatStressDays ?? 'N/A'} d

NASA POWER 90-DAY OBSERVATIONS (MEASURED):
- Mean Temp: ${observationsSummary.meanTempC}°C (Range: ${observationsSummary.minTempC}°C to ${observationsSummary.maxTempC}°C)
- 90d Rain: ${observationsSummary.totalPrecip90dMm} mm | Surface Wetness: ${observationsSummary.meanSurfaceSoilWetnessPct}% | Root Wetness: ${observationsSummary.meanRootSoilWetnessPct}%
- Solar: ${observationsSummary.meanSolarMj} MJ/m²/d | Aridity Index: ${observationsSummary.aridityIndex}

SOIL PROFILE (${farmInputs?.soilTestOverrideEnabled ? 'Farmer Soil Test Override + ISRIC Baseline' : soilProfile.source}):
- Texture: ${soilProfile.textureClass} (Sand ${soilProfile.sandPct}%, Silt ${soilProfile.siltPct}%, Clay ${soilProfile.clayPct}%)
- Effective pH: ${effectivePh} | Organic Carbon: ${effectiveSoc} g/kg | Nitrogen: ${soilProfile.nitrogenGKg} g/kg (${farmInputs?.soilTestOverrideEnabled ? farmInputs.customNitrogenStatus : 'ISRIC baseline'}) | CEC: ${soilProfile.cecCmolKg} cmol/kg

REQUIRED 4 STRATEGIES (return these exact 4 IDs in order):
1. "current-practice" — Mirrors existing farm crop sequence (${farmInputs?.existingCropSequence || 'baseline'}) as the empirical benchmark.
2. "climate-resilient" — Water-conserving, drought-buffered rotation using locally suited millets/sorghum/chickpea/pigeon pea/cowpea.
3. "carbon-regenerative" — Soil-regenerative rotation with rhizobial legumes, green manure covers, deep taproot subsoil breakers (e.g., safflower/pigeon pea), and residue retention.
4. "precision-commercial" — Balanced commercial diversification (e.g., groundnut, maize, oilseed, or drip horticulture paired with restorative pulses) respecting irrigation & equipment constraints.

STRICT SCIENTIFIC RULES:
- Each of the 4 strategies MUST contain exactly 4 sequential seasons (Kharif Year 1, Rabi Year 1, Zaid / Summer, Kharif Year 2) whose seasonal waterNeedMm values sum to totalWaterDemandMm.
- Validate hard constraints: do NOT mark water-heavy commercial crops "High" suitability if irrigationAvailability is "rainfed" or drought scenario drops rain -20%.
- Do NOT invent arbitrary 0-100 AI scores or guarantee income/yields.
- Clearly distinguish empirical NASA/soil evidence from modeled estimates (N fixation kg/ha, water mm, carbon t/ha/yr) and qualitative agronomic ratings.
- Keep each text field crisp (<=14 words per season field) so all 4 strategies x 4 seasons return rapidly.`;

    const { text, modelUsed } = await generateWithGeminiFallback(ai, {
      contents: prompt,
      fastStructured: true,
      systemInstruction:
        'You are an agricultural systems scientist and NASA Earth observation agronomist. Output valid, concise JSON matching the schema. Separate observed evidence from modeled estimates and never fabricate arbitrary efficiency scores or yield guarantees.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          agroDiagnosis: {
            type: Type.STRING,
            description: '2-3 sentence scientific diagnosis of farm water, thermal, pH, and constraint status.',
          },
          recommendedStrategyId: {
            type: Type.STRING,
            description: 'One of: current-practice, climate-resilient, carbon-regenerative, precision-commercial',
          },
          strategies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                categoryLabel: { type: Type.STRING },
                focus: { type: Type.STRING },
                suitabilityRating: {
                  type: Type.STRING,
                  description: 'High, Moderate, or Constrained',
                },
                summary: { type: Type.STRING },
                totalWaterDemandMm: { type: Type.NUMBER },
                waterBalanceNote: { type: Type.STRING },
                soilNitrogenDeltaKgHa: { type: Type.NUMBER },
                carbonSequestrationTHaYr: { type: Type.NUMBER },
                soilImprovementMechanism: { type: Type.STRING },
                risksAndUncertainties: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                agronomicAnalysis: {
                  type: Type.OBJECT,
                  properties: {
                    waterRequirementNote: { type: Type.STRING },
                    nitrogenFixationKgHa: { type: Type.NUMBER },
                    nutrientCyclingNote: { type: Type.STRING },
                    organicMatterContribution: { type: Type.STRING },
                    soilCoverPct: { type: Type.NUMBER },
                    erosionProtection: { type: Type.STRING },
                    rootDepthDiversity: { type: Type.STRING },
                    pestCycleInterruption: { type: Type.STRING },
                    growingSeasonSuitability: { type: Type.STRING },
                    marketSuitability: { type: Type.STRING },
                    equipmentRequirements: { type: Type.STRING },
                  },
                  required: [
                    'waterRequirementNote',
                    'nitrogenFixationKgHa',
                    'nutrientCyclingNote',
                    'organicMatterContribution',
                    'soilCoverPct',
                    'erosionProtection',
                    'rootDepthDiversity',
                    'pestCycleInterruption',
                    'growingSeasonSuitability',
                    'marketSuitability',
                    'equipmentRequirements',
                  ],
                },
                explainability: {
                  type: Type.OBJECT,
                  properties: {
                    whyRecommended: { type: Type.STRING },
                    evidenceBasis: { type: Type.ARRAY, items: { type: Type.STRING } },
                    modelingAssumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    additionalInfoRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    'whyRecommended',
                    'evidenceBasis',
                    'modelingAssumptions',
                    'additionalInfoRequired',
                  ],
                },
                seasons: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      season: { type: Type.STRING },
                      plantingWindow: { type: Type.STRING },
                      crop: { type: Type.STRING },
                      botanicalOrRole: { type: Type.STRING },
                      durationDays: { type: Type.INTEGER },
                      waterNeedMm: { type: Type.NUMBER },
                      nitrogenImpactKgHa: { type: Type.NUMBER },
                      notes: { type: Type.STRING },
                      whySelected: { type: Type.STRING },
                      environmentalEvidence: { type: Type.STRING },
                      soilBenefit: { type: Type.STRING },
                      rootDepthClass: { type: Type.STRING },
                      equipmentNeed: { type: Type.STRING },
                      riskNote: { type: Type.STRING },
                    },
                    required: [
                      'season',
                      'plantingWindow',
                      'crop',
                      'botanicalOrRole',
                      'durationDays',
                      'waterNeedMm',
                      'nitrogenImpactKgHa',
                      'notes',
                      'whySelected',
                      'environmentalEvidence',
                      'soilBenefit',
                      'rootDepthClass',
                      'equipmentNeed',
                      'riskNote',
                    ],
                  },
                },
              },
              required: [
                'id',
                'name',
                'categoryLabel',
                'focus',
                'suitabilityRating',
                'summary',
                'totalWaterDemandMm',
                'waterBalanceNote',
                'soilNitrogenDeltaKgHa',
                'carbonSequestrationTHaYr',
                'soilImprovementMechanism',
                'risksAndUncertainties',
                'agronomicAnalysis',
                'explainability',
                'seasons',
              ],
            },
          },
        },
        required: ['agroDiagnosis', 'recommendedStrategyId', 'strategies'],
      },
    });

    const parsed = JSON.parse(text || '{}');
    const normalizedStrategies = Array.isArray(parsed.strategies)
      ? parsed.strategies.map((s: Record<string, unknown>) => ({
          ...s,
          suitabilityRating:
            s.suitabilityRating === 'High' ||
            s.suitabilityRating === 'Moderate' ||
            s.suitabilityRating === 'Constrained'
              ? s.suitabilityRating
              : 'Moderate',
          risksAndUncertainties: Array.isArray(s.risksAndUncertainties) ? s.risksAndUncertainties : [],
          seasons: Array.isArray(s.seasons) ? s.seasons : [],
        }))
      : [];

    res.json({
      generatedAt: new Date().toISOString(),
      model: modelUsed,
      farmerPriority: priority,
      agroDiagnosis: parsed.agroDiagnosis || 'AI rotation synthesis completed.',
      recommendedStrategyId:
        parsed.recommendedStrategyId || normalizedStrategies[0]?.id || 'climate-resilient',
      strategies: normalizedStrategies,
    });
  } catch (err) {
    console.error('[Gemini /api/ai/rotation]', err);
    const message = err instanceof Error ? err.message : 'Gemini rotation generation failed.';
    res.status(500).json({ error: message });
  }
});

// Gemini API: FIELD SHIFT AI Agronomist 2.0 (Multilingual Evidence-Based Farm Copilot)
app.post('/api/ai/agronomist', async (req, res) => {
  try {
    const { question, history, context, language = 'en', mode = 'farmer' } = req.body || {};
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question text is required.' });
      return;
    }

    const ai = getGeminiClient();
    const langInstruction =
      language === 'kn'
        ? 'Respond in natural, clear, respectful Kannada (ಕನ್ನಡ) suitable for Karnataka farmers, keeping scientific metric units (°C, mm, kg/ha, pH) legible.'
        : language === 'hi'
          ? 'Respond in natural, clear, farmer-friendly Hindi (हिन्दी), keeping scientific metric units (°C, mm, kg/ha, pH) legible.'
          : 'Respond in clear, structured English.';

    const toneInstruction =
      mode === 'researcher'
        ? 'Provide technical depth including spatial resolutions, dataset identifiers, model assumptions, and boundary uncertainties.'
        : 'Keep explanations practical, clear, and accessible for farmers while strictly separating facts from estimates.';

    const rotationSummaryText = Array.isArray(context?.rotationStrategies)
      ? context.rotationStrategies
          .map(
            (s: { id: string; name: string; suitabilityRating: string; totalWaterDemandMm: number; soilNitrogenDeltaKgHa: number }) =>
              `  * ${s.name} [${s.id}]: ${s.suitabilityRating} suitability, ${s.totalWaterDemandMm} mm water, Net N ${s.soilNitrogenDeltaKgHa >= 0 ? '+' : ''}${s.soilNitrogenDeltaKgHa} kg/ha`
          )
          .join('\n')
      : 'No rotation summary attached.';

    const systemContext = `You are FIELD SHIFT AI — YOUR FARM INTELLIGENCE COPILOT.
You integrate NASA Earth observations, Copernicus Sentinel-2 metadata, ISRIC SoilGrids, climate stress simulations, and the FIELD SHIFT Crop Rotation Engine.

LANGUAGE & AUDIENCE:
- ${langInstruction}
- ${toneInstruction}

STRUCTURED ACTIVE FARM CONTEXT:
- Farm: ${context?.farmName || 'Selected Parcel'} (${context?.region || 'Unknown'}, Lat ${context?.lat?.toFixed?.(4) ?? 'N/A'}, Lon ${context?.lon?.toFixed?.(4) ?? 'N/A'})
- Area: ${context?.areaHectares ?? 'N/A'} ha | Zone: ${context?.agroClimaticZone || 'N/A'} | Boundary Vertices: ${context?.boundaryVertexCount ?? 'N/A'}
- NASA POWER L2 (0.5°×0.625° grid, ${context?.powerDateWindow || '90-day window'}): Mean Air Temp ${context?.meanTempC ?? 'N/A'}°C, 90d Rainfall ${context?.totalPrecip90dMm ?? 'N/A'} mm, Root-Zone Soil Wetness ${context?.meanRootSoilWetnessPct ?? 'N/A'}%, Hydro-Thermal NDVI Proxy (Modeled) ${context?.estimatedNdvi ?? 'N/A'}
- Copernicus Sentinel-2 L2A (10 m): ${context?.sentinel2LatestDate ? `Latest clear scene ${context.sentinel2LatestDate} (${context.sentinel2CloudPct ?? '?'}% cloud)` : 'No recent clear optical scene cached'}
- Soil Profile (${context?.soilSource || 'Baseline'}): ${context?.textureClass || 'N/A'}, pH ${context?.phH2O ?? 'N/A'}, Organic Carbon ${context?.organicCarbonGKg ?? 'N/A'} g/kg | Missing field lab tests: Available N/P/K ppm and site infiltration rate (satellites CANNOT measure exact NPK ppm).
- Farm Constraints & Priority: Priority=${context?.farmerPriority || 'drought-resilience'}, Existing Crops="${context?.existingCropSequence || 'N/A'}", Irrigation=${context?.irrigationAvailability || 'N/A'}, Equipment=${context?.equipmentAvailability || 'N/A'}
- Climate Simulator (${context?.scenarioLabel || 'Historical Baseline'}): Air Temp ${context?.tempDeltaC >= 0 ? '+' : ''}${context?.tempDeltaC ?? 0}°C, Rain ${context?.precipChangePct >= 0 ? '+' : ''}${context?.precipChangePct ?? 0}%, Irrigation Eff ${context?.irrigationEfficiencyPct ?? 45}%, Monsoon Delay +${context?.monsoonOnsetDelayDays ?? 0}d, Dry Spell ${context?.drySpellDurationDays ?? 4}d, Simulated Stress ${context?.waterStressIndex ?? 'N/A'}/100
- Crop Rotation Engine Output (Recommended: ${context?.recommendedStrategyName || 'Climate-Resilient'}):
${rotationSummaryText}

MANDATORY SCIENTIFIC INTEGRITY & STRUCTURE:
1. NEVER fabricate NASA measurements, never invent soil NPK ppm values, never treat 2-m air temperature as land surface temperature, and NEVER claim NASA SMAP (9 km) or GPM (10 km) resolves an individual small farm field.
2. NEVER override the Crop Rotation Engine's agronomic constraints or guarantee crop yields/profits.
3. Explicitly structure every answer cleanly with short headings separating:
   - Observed Data (cite dataset, date/window, resolution, units)
   - Derived / Modeled Estimates & Hypothetical Scenario Effects
   - Practical Agronomic Recommendation & Rotation Reasoning
   - Missing Information & Local Verification Needed
Keep responses concise (180–280 words).`;

    const historyText = Array.isArray(history)
      ? history
          .slice(-6)
          .map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Farmer/User' : 'Copilot'}: ${m.content}`)
          .join('\n')
      : '';

    const fullPrompt = historyText ? `${historyText}\nFarmer/User: ${question}` : question;

    const { text } = await generateWithGeminiFallback(ai, {
      contents: fullPrompt,
      systemInstruction: systemContext,
      fastStructured: true,
    });

    res.json({
      reply: text || 'Unable to generate agronomist guidance at this moment.',
      timestamp: new Date().toISOString(),
      language,
    });
  } catch (err) {
    console.error('[Gemini /api/ai/agronomist]', err);
    const message = err instanceof Error ? err.message : 'AI Agronomist request failed.';
    res.status(500).json({ error: message });
  }
});

// =========================================================================
// DEMO WALKTHROUGH NARRATION AUDIO (Gemini 3.8 TTS WAV) & WEBVTT SUBTITLES
// =========================================================================
const DEMO_AUDIO_DIR = path.resolve(process.cwd(), 'data/demo-audio');
const pendingSceneTts = new Map<string, Promise<Buffer>>();

function ensureWavFormat(buf: Buffer): Buffer {
  // Gemini unary generateContent returns a full 44-byte RIFF WAV file; wrap raw L16 24kHz mono PCM only if missing RIFF
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return buf;
  }
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + buf.length, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(buf.length, 40);
  return Buffer.concat([header, buf]);
}

async function getOrSynthesizeSceneWav(sceneId: string): Promise<Buffer> {
  const scene = DEMO_SCENE_CHAPTERS.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Unknown demo scene "${sceneId}".`);
  }

  if (!fs.existsSync(DEMO_AUDIO_DIR)) {
    fs.mkdirSync(DEMO_AUDIO_DIR, { recursive: true });
  }

  const filePath = path.join(DEMO_AUDIO_DIR, `${scene.id}.wav`);
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath);
    if (existing.length > 64) {
      return existing;
    }
  }

  const inflight = pendingSceneTts.get(scene.id);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
    }

    const attempts: Array<{
      label: string;
      apiVersion?: string;
      model: string;
      text: string;
      useMetadata: boolean;
      useSpeechConfig: boolean;
    }> = [
      { label: 'v1beta-lite-tts-voice', apiVersion: 'v1beta', model: 'gemini-3.8-flash-lite-tts', text: scene.narrationScript, useMetadata: false, useSpeechConfig: true },
      { label: 'v1beta-lite-tts-audio', apiVersion: 'v1beta', model: 'gemini-3.8-flash-lite-tts', text: scene.narrationScript, useMetadata: false, useSpeechConfig: false },
      { label: 'v1beta-25-flash-tts', apiVersion: 'v1beta', model: 'gemini-2.5-flash-preview-tts', text: scene.narrationScript, useMetadata: false, useSpeechConfig: true },
      { label: 'v1alpha-lite-tts-audio', apiVersion: 'v1alpha', model: 'gemini-3.8-flash-lite-tts', text: scene.narrationScript, useMetadata: false, useSpeechConfig: false },
      { label: 'default-lite-tts-audio', model: 'gemini-3.8-flash-lite-tts', text: scene.narrationScript, useMetadata: false, useSpeechConfig: false },
    ];

    const attemptErrors: string[] = [];
    for (const attempt of attempts) {
      try {
        const client = new GoogleGenAI({
          apiKey,
          ...(attempt.apiVersion ? { apiVersion: attempt.apiVersion } : {}),
          httpOptions: {
            timeout: 30000,
            headers: { 'User-Agent': 'aistudio-build' },
          },
        });
        const part: Record<string, unknown> = attempt.useMetadata
          ? {
              text: attempt.text,
              speechMetadata: {
                style: 'Calm, authoritative, inspiring NASA science documentary narrator',
              },
            }
          : { text: attempt.text };

        const config: Record<string, unknown> = {
          abortSignal: AbortSignal.timeout(30000),
          responseModalities: ['AUDIO'],
        };
        if (attempt.useSpeechConfig) {
          config.speechConfig = {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          };
        }

        const response = await client.models.generateContent({
          model: attempt.model,
          contents: [{ role: 'user', parts: [part] }],
          config,
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => p.inlineData?.data);
        const b64 = audioPart?.inlineData?.data;
        if (!b64) {
          throw new Error(`empty audio payload (parts=${parts.length}, finish=${response.candidates?.[0]?.finishReason || 'unknown'})`);
        }
        const wavBuf = ensureWavFormat(Buffer.from(b64, 'base64'));
        fs.writeFileSync(filePath, wavBuf);
        return wavBuf;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attemptErrors.push(`${attempt.label}: ${msg.slice(0, 180)}`);
      }
    }

    throw new Error(attemptErrors.join(' || ') || 'All Gemini TTS attempts failed.');
  })();

  pendingSceneTts.set(scene.id, task);
  try {
    return await task;
  } finally {
    pendingSceneTts.delete(scene.id);
  }
}

app.get('/api/demo/subtitles.vtt', (_req, res) => {
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buildDemoWebVtt());
});

app.get('/api/demo/manifest', (_req, res) => {
  const scenes = DEMO_SCENE_CHAPTERS.map((s) => {
    const wavPath = path.join(DEMO_AUDIO_DIR, `${s.id}.wav`);
    return {
      id: s.id,
      index: s.index,
      startSec: s.startSec,
      endSec: s.endSec,
      title: s.title,
      shortLabel: s.shortLabel,
      audioUrl: `/api/demo/audio/${s.id}`,
      cachedWav: fs.existsSync(wavPath),
    };
  });
  res.json({
    totalDurationSec: DEMO_TOTAL_DURATION_SEC,
    subtitlesUrl: '/api/demo/subtitles.vtt',
    geminiTtsConfigured: Boolean(process.env.GEMINI_API_KEY),
    scenes,
  });
});

app.get('/api/demo/audio/:sceneId', async (req, res) => {
  const { sceneId } = req.params;
  const scene = DEMO_SCENE_CHAPTERS.find((s) => s.id === sceneId);
  if (!scene) {
    res.status(404).json({ error: `Demo scene "${sceneId}" not found.` });
    return;
  }

  try {
    const wav = await getOrSynthesizeSceneWav(scene.id);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(wav);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'TTS audio generation unavailable.';
    console.warn(`[Demo TTS ${scene.id}]`, msg);
    res.status(503).json({
      error: msg,
      fallbackMode: 'web-speech-synthesis',
    });
  }
});

app.post('/api/demo/prewarm', async (_req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ ok: false, error: 'GEMINI_API_KEY not configured.', cachedCount: 0 });
    return;
  }
  const results: Array<{ id: string; ok: boolean }> = [];
  for (const s of DEMO_SCENE_CHAPTERS) {
    try {
      await getOrSynthesizeSceneWav(s.id);
      results.push({ id: s.id, ok: true });
    } catch {
      results.push({ id: s.id, ok: false });
    }
  }
  res.json({
    ok: results.some((r) => r.ok),
    cachedCount: results.filter((r) => r.ok).length,
    results,
  });
});

async function startServer() {
  // Serve CesiumJS static Workers, Assets, ThirdParty, and Widgets CSS
  const cesiumBuildDir = path.resolve(process.cwd(), 'node_modules/cesium/Build/Cesium');
  if (fs.existsSync(cesiumBuildDir)) {
    app.use('/cesium', express.static(cesiumBuildDir));
  }

  // Serve MapLibre GL JS self-contained module worker without Vite client HMR injection
  const maplibreDistDir = path.resolve(process.cwd(), 'node_modules/maplibre-gl/dist');
  if (fs.existsSync(maplibreDistDir)) {
    app.use('/maplibre', express.static(maplibreDistDir));
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FIELD SHIFT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

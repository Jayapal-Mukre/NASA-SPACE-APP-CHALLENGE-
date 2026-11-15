import { ClimateScenario, GibsLayerId, NasaObservationBundle } from '../types/fieldShift';

const EARTH_RADIUS_M = 6378137;

export function calculatePolygonAreaHectares(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  const ring =
    coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]];

  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    const radLon1 = (lon1 * Math.PI) / 180;
    const radLat1 = (lat1 * Math.PI) / 180;
    const radLon2 = (lon2 * Math.PI) / 180;
    const radLat2 = (lat2 * Math.PI) / 180;
    total += (radLon2 - radLon1) * (2 + Math.sin(radLat1) + Math.sin(radLat2));
  }
  const areaSqM = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return Number((areaSqM / 10000).toFixed(2));
}

export function calculatePolygonPerimeterMeters(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    perimeter += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  return Math.round(perimeter);
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getPolygonCentroid(coords: [number, number][]): { lat: number; lon: number } {
  if (coords.length === 0) return { lat: 12.5218, lon: 76.8951 };
  const open = getOpenVertices(coords);
  if (open.length === 0) return { lat: 12.5218, lon: 76.8951 };
  if (open.length < 3) {
    const sum = open.reduce((acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }), { lon: 0, lat: 0 });
    return {
      lat: Number((sum.lat / open.length).toFixed(5)),
      lon: Number((sum.lon / open.length).toFixed(5)),
    };
  }

  // Area-weighted planar shoelace centroid (reliable for irregular/dense vertices)
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

export function computePolygonBounds(
  coords: [number, number][]
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
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
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

export function computeBoundingBoxTuple(
  coords: [number, number][]
): [number, number, number, number] | null {
  const b = computePolygonBounds(coords);
  if (!b) return null;
  return [
    Number(b[0][0].toFixed(6)),
    Number(b[0][1].toFixed(6)),
    Number(b[1][0].toFixed(6)),
    Number(b[1][1].toFixed(6)),
  ];
}

export function computeGeometryVersion(
  boundary: [number, number][],
  zones?: Array<{ boundary: [number, number][] }>
): string {
  const ringStr = ensureClosedRing(boundary)
    .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
    .join(';');
  const zoneStr = (zones || [])
    .map((z) =>
      ensureClosedRing(z.boundary)
        .map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
        .join(',')
    )
    .join('|');
  const payload = `${ringStr}#${zoneStr}`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `gv-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const ZONE_COLORS = [
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#a855f7', // violet
  '#ec4899', // pink
  '#84cc16', // lime
];

export function hectaresToAcres(hectares: number): number {
  return Number((hectares * 2.47105).toFixed(2));
}

export function getOpenVertices(coords: [number, number][]): [number, number][] {
  if (!Array.isArray(coords) || coords.length === 0) return [];
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

export function ensureClosedRing(coords: [number, number][]): [number, number][] {
  const open = getOpenVertices(coords);
  if (open.length === 0) return [];
  return [...open, [open[0][0], open[0][1]]];
}

function orientation(p: [number, number], q: [number, number], r: [number, number]): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-12) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p: [number, number], q: [number, number], r: [number, number]): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) + 1e-12 &&
    q[0] >= Math.min(p[0], r[0]) - 1e-12 &&
    q[1] <= Math.max(p[1], r[1]) + 1e-12 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-12
  );
}

export function segmentsIntersect(
  p1: [number, number],
  q1: [number, number],
  p2: [number, number],
  q2: [number, number]
): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

export function polygonsSelfIntersect(coords: [number, number][]): boolean {
  const open = getOpenVertices(coords);
  const n = open.length;
  if (n < 3) return false;
  if (n === 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = open[i];
    const a2 = open[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges sharing a vertex
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = open[j];
      const b2 = open[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

export function validatePolygonRing(coords: [number, number][]): {
  valid: boolean;
  reason?: string;
  closedRing: [number, number][];
} {
  const open = getOpenVertices(coords);
  if (open.length < 3) {
    return { valid: false, reason: 'Polygon requires at least 3 distinct vertices.', closedRing: [] };
  }
  for (const [lon, lat] of open) {
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { valid: false, reason: 'Coordinates must be valid WGS84 [lon, lat] degrees.', closedRing: [] };
    }
  }
  const closedRing = ensureClosedRing(open);
  if (polygonsSelfIntersect(closedRing)) {
    return {
      valid: false,
      reason: 'Boundary edges cross each other (self-intersecting polygon). Adjust vertices so edges do not cross.',
      closedRing,
    };
  }
  const area = calculatePolygonAreaHectares(closedRing);
  if (area < 0.01) {
    return {
      valid: false,
      reason: 'Polygon area is too small (< 0.01 ha). Place vertices further apart.',
      closedRing,
    };
  }
  return { valid: true, closedRing };
}

function pointToSegmentDistSq(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): { distSq: number; projected: [number, number] } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-16) return { distSq: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2, projected: a };
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const proj: [number, number] = [Number((a[0] + t * dx).toFixed(6)), Number((a[1] + t * dy).toFixed(6))];
  const distSq = (p[0] - proj[0]) ** 2 + (p[1] - proj[1]) ** 2;
  return { distSq, projected: proj };
}

/**
 * Finds the best edge index i (after vertex i) to insert a new point along the boundary.
 */
export function findNearestEdgeIndex(
  coords: [number, number][],
  point: [number, number]
): { insertIndex: number; projectedPoint: [number, number]; distanceDeg: number } {
  const open = getOpenVertices(coords);
  if (open.length < 2) {
    return { insertIndex: open.length, projectedPoint: point, distanceDeg: 0 };
  }
  let bestIdx = 0;
  let bestDistSq = Infinity;
  let bestProj: [number, number] = point;
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const { distSq, projected } = pointToSegmentDistSq(point, a, b);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = i + 1;
      bestProj = projected;
    }
  }
  return {
    insertIndex: bestIdx,
    projectedPoint: bestProj,
    distanceDeg: Math.sqrt(bestDistSq),
  };
}

export function translateRing(
  coords: [number, number][],
  deltaLon: number,
  deltaLat: number
): [number, number][] {
  const open = getOpenVertices(coords);
  const shifted = open.map(([lon, lat]) => [
    Number(Math.max(-180, Math.min(180, lon + deltaLon)).toFixed(6)),
    Number(Math.max(-89.9, Math.min(89.9, lat + deltaLat)).toFixed(6)),
  ]) as [number, number][];
  return ensureClosedRing(shifted);
}

export function isPointInRing(point: [number, number], coords: [number, number][]): boolean {
  const open = getOpenVertices(coords);
  if (open.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = open.length - 1; i < open.length; j = i++) {
    const [xi, yi] = open[i];
    const [xj, yj] = open[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-16) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function calculateGeometryStats(
  coords: [number, number][],
  zones?: Array<{ boundary: [number, number][] }>
) {
  const closed = ensureClosedRing(coords);
  const areaHectares = calculatePolygonAreaHectares(closed);
  const areaAcres = hectaresToAcres(areaHectares);
  const perimeterMeters = calculatePolygonPerimeterMeters(closed);
  const center = getPolygonCentroid(closed);
  const boundingBox = computeBoundingBoxTuple(closed) ?? undefined;
  const geometryVersion = computeGeometryVersion(closed, zones);
  const open = getOpenVertices(closed);
  return {
    closedRing: closed,
    vertexCount: open.length,
    areaHectares,
    areaAcres,
    perimeterMeters,
    center,
    boundingBox,
    geometryVersion,
  };
}

export function validateMultiPolygon(rings: [number, number][][]): {
  valid: boolean;
  reason?: string;
  closedRings: [number, number][][];
  areaHectares: number;
  areaAcres: number;
  perimeterMeters: number;
  center: { lat: number; lon: number };
  boundingBox: [number, number, number, number] | null;
} {
  if (!Array.isArray(rings) || rings.length === 0) {
    return {
      valid: false,
      reason: 'MultiPolygon must contain at least one polygon ring.',
      closedRings: [],
      areaHectares: 0,
      areaAcres: 0,
      perimeterMeters: 0,
      center: { lat: 0, lon: 0 },
      boundingBox: null,
    };
  }

  const closedRings: [number, number][][] = [];
  let totalArea = 0;
  let totalPerimeter = 0;
  let weightedLat = 0;
  let weightedLon = 0;
  const allPts: [number, number][] = [];

  for (let i = 0; i < rings.length; i++) {
    const check = validatePolygonRing(rings[i]);
    if (!check.valid) {
      return {
        valid: false,
        reason: `Part ${i + 1}: ${check.reason}`,
        closedRings: [],
        areaHectares: 0,
        areaAcres: 0,
        perimeterMeters: 0,
        center: { lat: 0, lon: 0 },
        boundingBox: null,
      };
    }
    closedRings.push(check.closedRing);
    const partArea = calculatePolygonAreaHectares(check.closedRing);
    const partPerim = calculatePolygonPerimeterMeters(check.closedRing);
    const partCenter = getPolygonCentroid(check.closedRing);
    totalArea += partArea;
    totalPerimeter += partPerim;
    weightedLat += partCenter.lat * partArea;
    weightedLon += partCenter.lon * partArea;
    allPts.push(...check.closedRing);
  }

  const areaHectares = Number(totalArea.toFixed(2));
  return {
    valid: true,
    closedRings,
    areaHectares,
    areaAcres: hectaresToAcres(areaHectares),
    perimeterMeters: Math.round(totalPerimeter),
    center: {
      lat: Number((weightedLat / Math.max(0.01, totalArea)).toFixed(5)),
      lon: Number((weightedLon / Math.max(0.01, totalArea)).toFixed(5)),
    },
    boundingBox: computeBoundingBoxTuple(allPts),
  };
}

export function createDefaultSubZoneBoundary(
  parentBoundary: [number, number][],
  zoneIndex: number
): [number, number][] {
  const bounds = computePolygonBounds(parentBoundary);
  if (!bounds) {
    return [
      [76.894, 12.523],
      [76.896, 12.523],
      [76.896, 12.521],
      [76.894, 12.521],
      [76.894, 12.523],
    ];
  }
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  const w = maxLon - minLon;
  const h = maxLat - minLat;
  const padX = w * 0.12;
  const padY = h * 0.12;
  const halfX = minLon + w * 0.5;
  const halfY = minLat + h * 0.5;
  const slot = zoneIndex % 4;
  let x1 = minLon + padX;
  let x2 = halfX - w * 0.03;
  let y1 = minLat + padY;
  let y2 = halfY - h * 0.03;
  if (slot === 1) {
    x1 = halfX + w * 0.03;
    x2 = maxLon - padX;
    y1 = halfY + h * 0.03;
    y2 = maxLat - padY;
  } else if (slot === 2) {
    x1 = minLon + padX;
    x2 = halfX - w * 0.03;
    y1 = halfY + h * 0.03;
    y2 = maxLat - padY;
  } else if (slot === 3) {
    x1 = halfX + w * 0.03;
    x2 = maxLon - padX;
    y1 = minLat + padY;
    y2 = halfY - h * 0.03;
  }
  return ensureClosedRing([
    [x1, y2],
    [x2, y2],
    [x2, y1],
    [x1, y1],
  ]);
}

export function buildFarmGeoJson(farm: {
  id: string;
  name: string;
  boundary: [number, number][];
  zones?: Array<{ id: string; name: string; boundary: [number, number][] }>;
}) {
  const farmRing = ensureClosedRing(farm.boundary);
  const zoneRings = (farm.zones || [])
    .map((z) => ensureClosedRing(z.boundary))
    .filter((r) => r.length >= 4);

  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        id: farm.id,
        properties: { kind: 'farm', id: farm.id, name: farm.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [farmRing],
        },
      },
      ...(zoneRings.length > 0
        ? [
            {
              type: 'Feature' as const,
              id: `${farm.id}-zones`,
              properties: { kind: 'farm-zones', farmId: farm.id, zoneCount: zoneRings.length },
              geometry: {
                type: 'MultiPolygon' as const,
                coordinates: zoneRings.map((ring) => [ring]),
              },
            },
          ]
        : []),
    ],
  };
}

export interface GibsTileConfig {
  url: string;
  productId: string;
  label: string;
  attribution: string;
  cadence: string;
  resolution: string;
  description: string;
  limitation: string;
  category: 'basemap' | 'scientific';
  maxZoom: number;
  legend: {
    unit: string;
    stops: { color: string; label: string }[];
  };
}

export const ESRI_HIGH_RES_BASEMAP = {
  id: 'esri-imagery' as const,
  label: 'High-Resolution Satellite Imagery',
  shortLabel: 'Esri High-Res Satellite',
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  labelsUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  source: 'Esri World Imagery (Maxar, Earthstar Geographics, GIS Community)',
  attribution: 'Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, AeroGRID, IGN, GIS User Community',
  resolution: '0.3 m – 1.0 m (regional mosaic)',
  observationDate: 'Multi-date mosaic (2020–2025)',
  limitation: 'Visual reference basemap (NOT live NASA telemetry); acquisition dates vary by tile.',
  maxZoom: 18,
  category: 'basemap' as const,
};

export const TERRAIN_ELEVATION_LAYER = {
  id: 'terrain-hillshade' as const,
  label: 'Terrain & Elevation Relief',
  shortLabel: 'Terrain & Elevation',
  hillshadeUrl: 'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
  terrariumDemUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  cesiumTerrainUrl: 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer',
  source: 'AWS Open Data Terrarium DEM & Esri World Hillshade',
  attribution: 'Terrain: Mapzen/AWS Terrarium (SRTM/ASTER/GMTED); Hillshade: Esri, Airbus DS, USGS',
  resolution: '~30 m global DEM',
  observationDate: 'Static topographic baseline',
  limitation: 'Digital elevation model captures terrain slope/aspect, not canopy height.',
  maxZoom: 15,
  category: 'scientific' as const,
};

export const SENTINEL2_NDVI_LEGEND = {
  unit: 'NDVI (B08/B04)',
  stops: [
    { color: '#a50026', label: '-0.2 Water/Bare' },
    { color: '#fdae61', label: '0.2 Sparse' },
    { color: '#a6d96a', label: '0.5 Moderate' },
    { color: '#006837', label: '0.85 Dense' },
  ],
};

// Verified real NASA EOSDIS GIBS WMTS EPSG:3857 tile layers
export function getGibsTileConfig(layerId: GibsLayerId): GibsTileConfig | null {
  const d = new Date(Date.now() - 4 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);

  if (layerId === 'true-color') {
    return {
      url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${dateStr}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      productId: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      label: 'NASA MODIS Terra True Color',
      attribution: 'NASA EOSDIS GIBS / Terra MODIS',
      cadence: `Daily (${dateStr})`,
      resolution: '250 m native',
      description: 'Daily synoptic optical surface reflectance',
      limitation: 'Coarse 250 m pixels suited for regional/cloud overview; not field-boundary sharp.',
      category: 'basemap',
      maxZoom: 9,
      legend: {
        unit: 'Optical RGB',
        stops: [
          { color: '#14532d', label: 'Dense Canopy' },
          { color: '#a16207', label: 'Dry Soil / Fallow' },
          { color: '#e2e8f0', label: 'Cloud Cover' },
        ],
      },
    };
  }
  if (layerId === 'ndvi') {
    return {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
      productId: 'MODIS_Terra_NDVI_8Day',
      label: 'NASA MODIS Vegetation (NDVI)',
      attribution: 'NASA EOSDIS GIBS / MODIS Terra 8-Day',
      cadence: 'Latest 8-Day Composite',
      resolution: '250 m native',
      description: 'Normalized Difference Vegetation Index',
      limitation: '250 m footprint averages across multiple smallholder plots.',
      category: 'scientific',
      maxZoom: 9,
      legend: {
        unit: 'NDVI',
        stops: [
          { color: '#78350f', label: '< 0.1 Bare' },
          { color: '#ca8a04', label: '0.3 Sparse' },
          { color: '#22c55e', label: '0.6 Moderate' },
          { color: '#065f46', label: '0.8+ Dense' },
        ],
      },
    };
  }
  if (layerId === 'soil-moisture') {
    return {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
      productId: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
      label: 'NASA SMAP L4 Root-Zone Soil Moisture',
      attribution: 'NASA EOSDIS GIBS / SMAP L4',
      cadence: 'Latest 3-Hourly / Daily',
      resolution: '9 km native',
      description: 'Assimilated root-zone soil moisture (0–100 cm)',
      limitation: '9 km grid cell (~8,100 ha) reflects watershed moisture, not individual small fields.',
      category: 'scientific',
      maxZoom: 6,
      legend: {
        unit: 'm³/m³',
        stops: [
          { color: '#b45309', label: '0.05 Dry' },
          { color: '#eab308', label: '0.18 Moderate' },
          { color: '#06b6d4', label: '0.32 Moist' },
          { color: '#1d4ed8', label: '0.45+ Wet' },
        ],
      },
    };
  }
  if (layerId === 'precipitation') {
    return {
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
      productId: 'IMERG_Precipitation_Rate',
      label: 'NASA GPM IMERG Precipitation Rate',
      attribution: 'NASA EOSDIS GIBS / GPM IMERG',
      cadence: 'Latest Near-Real-Time',
      resolution: '10 km native',
      description: 'Multi-satellite merged surface precipitation',
      limitation: '10 km synoptic rainfall grid; convective storms smaller than 10 km are smoothed.',
      category: 'scientific',
      maxZoom: 6,
      legend: {
        unit: 'mm/hr',
        stops: [
          { color: '#0ea5e9', label: '0.5 Light' },
          { color: '#22c55e', label: '5 Moderate' },
          { color: '#eab308', label: '15 Heavy' },
          { color: '#ef4444', label: '35+ Extreme' },
        ],
      },
    };
  }
  return null;
}

export const CLIMATE_PRESETS: ClimateScenario[] = [
  {
    presetId: 'baseline',
    label: 'Historical Baseline',
    tempDeltaC: 0,
    precipChangePct: 0,
    irrigationEfficiencyPct: 45,
    monsoonOnsetDelayDays: 0,
    drySpellDurationDays: 4,
    plantingDateShiftDays: 0,
    isHypothetical: false,
    projectionNote: 'Unperturbed 90-day NASA POWER historical meteorology baseline.',
  },
  {
    presetId: 'reduced-monsoon',
    label: 'Reduced Monsoon Rainfall',
    tempDeltaC: 0.9,
    precipChangePct: -28,
    irrigationEfficiencyPct: 45,
    monsoonOnsetDelayDays: 7,
    drySpellDurationDays: 16,
    plantingDateShiftDays: 7,
    isHypothetical: true,
    projectionNote: 'Hypothetical -28% monsoon deficit simulation (user-defined stress test).',
  },
  {
    presetId: 'extreme-monsoon',
    label: 'Extreme Rainfall',
    tempDeltaC: 1.2,
    precipChangePct: 36,
    irrigationEfficiencyPct: 40,
    monsoonOnsetDelayDays: 0,
    drySpellDurationDays: 3,
    plantingDateShiftDays: 0,
    isHypothetical: true,
    projectionNote: 'Hypothetical cloudburst / +36% extreme precipitation runoff stress test.',
  },
  {
    presetId: 'heat-stress',
    label: 'Heat Stress',
    tempDeltaC: 3.1,
    precipChangePct: -8,
    irrigationEfficiencyPct: 45,
    monsoonOnsetDelayDays: 5,
    drySpellDurationDays: 12,
    plantingDateShiftDays: -7,
    isHypothetical: true,
    projectionNote: 'Hypothetical +3.1°C thermal anomaly testing flowering-stage heat exposure.',
  },
  {
    presetId: 'delayed-monsoon',
    label: 'Delayed Monsoon',
    tempDeltaC: 1.1,
    precipChangePct: -18,
    irrigationEfficiencyPct: 45,
    monsoonOnsetDelayDays: 24,
    drySpellDurationDays: 18,
    plantingDateShiftDays: 21,
    isHypothetical: true,
    projectionNote: 'Hypothetical 24-day monsoon onset delay shifting sowing into July.',
  },
  {
    presetId: 'reduced-irrigation',
    label: 'Reduced Irrigation',
    tempDeltaC: 0.6,
    precipChangePct: -10,
    irrigationEfficiencyPct: 15,
    monsoonOnsetDelayDays: 4,
    drySpellDurationDays: 10,
    plantingDateShiftDays: 0,
    isHypothetical: true,
    projectionNote: 'Hypothetical canal/borewell rationing reducing effective irrigation to 15%.',
  },
  {
    presetId: 'combined-stress',
    label: 'Combined Climate Stress',
    tempDeltaC: 2.6,
    precipChangePct: -32,
    irrigationEfficiencyPct: 25,
    monsoonOnsetDelayDays: 18,
    drySpellDurationDays: 22,
    plantingDateShiftDays: 14,
    isHypothetical: true,
    projectionNote: 'Hypothetical compound heat + drought + low-irrigation stress scenario.',
  },
  {
    presetId: 'ssp2-2040',
    label: 'Hypothetical 2040 Climate',
    tempDeltaC: 1.8,
    precipChangePct: -12,
    irrigationEfficiencyPct: 70,
    monsoonOnsetDelayDays: 10,
    drySpellDurationDays: 14,
    plantingDateShiftDays: 7,
    isHypothetical: true,
    projectionNote:
      'Hypothetical scenario inspired by IPCC AR6 SSP2-4.5 mid-century regional anomaly envelope (NOT an official NASA forecast).',
  },
];

export interface SimulatedImpactMetrics {
  simulatedTempC: number;
  simulatedPrecip90dMm: number;
  simulatedRootMoisturePct: number;
  waterStressIndex: number; // 0 (none) to 100 (severe)
  heatStressDays: number;
  projectedYieldRetentionPct: number;
  irrigationDemandMm: number;
  referenceEt0Mm: number;
  cropWaterRequirementMm: number;
  seasonalWaterBalanceMm: number;
  historicalRainVariabilityCvPct: number;
  droughtExposureDays: number;
  extremePrecipDays: number;
  vegetationStressIdx: number; // 0 (healthy) to 100 (stressed)
  growingSuitabilityStatus: 'Favorable' | 'Moderate Stress' | 'Severe Deficit';
}

export function computeScenarioImpact(
  obs: NasaObservationBundle | null,
  scenario: ClimateScenario
): SimulatedImpactMetrics {
  const baseTemp = obs?.summary.meanTempC ?? 27.2;
  const basePrecip = obs?.summary.totalPrecip90dMm ?? 210;
  const baseRoot = obs?.summary.meanRootSoilWetnessPct ?? 48;
  const daily = obs?.dailySeries ?? [];

  const onsetDelay = scenario.monsoonOnsetDelayDays ?? 0;
  const drySpellDays = scenario.drySpellDurationDays ?? 4;
  const plantingShift = scenario.plantingDateShiftDays ?? 0;

  const simulatedTempC = Number((baseTemp + scenario.tempDeltaC).toFixed(1));
  // Delayed onset reduces effective 90-day seasonal rainfall capture modestly
  const onsetRainFactor = Math.max(0.75, 1 - onsetDelay * 0.006);
  const simulatedPrecip90dMm = Number(
    Math.max(0, basePrecip * (1 + scenario.precipChangePct / 100) * onsetRainFactor).toFixed(1)
  );

  const evapPenalty = scenario.tempDeltaC * 3.8 + Math.max(0, drySpellDays - 6) * 0.35;
  const precipBonus = (scenario.precipChangePct / 100) * 18;
  const irrigationBuffer = ((scenario.irrigationEfficiencyPct - 45) / 45) * 10;

  const simulatedRootMoisturePct = Number(
    Math.min(92, Math.max(10, baseRoot - evapPenalty + precipBonus + irrigationBuffer)).toFixed(1)
  );

  // FAO-56 / Hargreaves 90d ET0 scaling with temperature anomaly (+~4.2% per +1°C VPD shift)
  const baseEt0Sum =
    daily.length > 0 ? daily.reduce((acc, d) => acc + d.estimatedEt0Mm, 0) : 340;
  const referenceEt0Mm = Number(
    Math.max(180, baseEt0Sum * (1 + scenario.tempDeltaC * 0.042)).toFixed(0)
  );
  // Composite seasonal crop coefficient (Kc ~ 0.94 across vegetative-reproductive stages)
  const cropWaterRequirementMm = Number((referenceEt0Mm * 0.94 + Math.abs(plantingShift) * 1.1).toFixed(0));
  const effectiveRain = simulatedPrecip90dMm * 0.72;
  const seasonalWaterBalanceMm = Number((effectiveRain - cropWaterRequirementMm).toFixed(0));

  const moistureDeficit = Math.max(0, 48 - simulatedRootMoisturePct) * 1.55;
  const waterloggingPenalty = Math.max(0, simulatedRootMoisturePct - 78) * 1.4;
  const thermalPenalty = Math.max(0, simulatedTempC - 29) * 4.8;
  const drySpellPenalty = Math.max(0, drySpellDays - 8) * 1.1 + Math.max(0, onsetDelay - 10) * 0.55;
  const balanceDeficitPenalty = Math.max(0, -seasonalWaterBalanceMm) * 0.22;
  const irrigationScarcityPenalty = Math.max(0, 40 - scenario.irrigationEfficiencyPct) * 0.35;
  const waterStressIndex = Number(
    Math.min(
      98,
      Math.max(
        6,
        moistureDeficit +
          waterloggingPenalty +
          thermalPenalty +
          drySpellPenalty +
          balanceDeficitPenalty +
          irrigationScarcityPenalty
      )
    ).toFixed(0)
  );

  const heatStressDays =
    daily.length > 0
      ? daily.filter((d) => d.tempMaxC + scenario.tempDeltaC >= 35).length
      : Math.round(Math.max(0, (simulatedTempC + 5 - 35) * 8));

  const extremePrecipDays =
    daily.length > 0
      ? daily.filter((d) => d.precipMm * (1 + scenario.precipChangePct / 100) >= 35).length
      : Math.round(Math.max(0, scenario.precipChangePct > 20 ? (scenario.precipChangePct - 15) / 5 : 0));

  const netDeficit = Math.max(0, cropWaterRequirementMm - effectiveRain);
  const irrigationDemandMm = Number(
    (netDeficit / Math.max(0.25, scenario.irrigationEfficiencyPct / 100)).toFixed(0)
  );

  // Historical rainfall coefficient of variation (%) from daily NASA POWER series
  let historicalRainVariabilityCvPct = 148;
  if (daily.length > 4) {
    const meanP = daily.reduce((a, b) => a + b.precipMm, 0) / daily.length;
    if (meanP > 0.05) {
      const variance = daily.reduce((a, b) => a + Math.pow(b.precipMm - meanP, 2), 0) / daily.length;
      historicalRainVariabilityCvPct = Number(Math.min(350, (Math.sqrt(variance) / meanP) * 100).toFixed(0));
    }
  }

  const droughtExposureDays =
    daily.length > 0
      ? Math.min(
          90,
          daily.filter((d) => d.precipMm * (1 + scenario.precipChangePct / 100) < 1.0).length +
            Math.round(Math.max(0, drySpellDays - 6) * 0.4)
        )
      : Math.min(90, Math.round(35 + Math.max(0, -scenario.precipChangePct) * 0.7 + drySpellDays * 0.5));

  const vegetationStressIdx = Number(
    Math.min(96, Math.max(5, waterStressIndex * 0.68 + heatStressDays * 0.9)).toFixed(0)
  );

  const projectedYieldRetentionPct = Number(
    Math.min(
      108,
      Math.max(38, 100 - waterStressIndex * 0.42 + (scenario.irrigationEfficiencyPct - 45) * 0.14 - onsetDelay * 0.22)
    ).toFixed(1)
  );

  const growingSuitabilityStatus: SimulatedImpactMetrics['growingSuitabilityStatus'] =
    waterStressIndex >= 65 ? 'Severe Deficit' : waterStressIndex >= 38 ? 'Moderate Stress' : 'Favorable';

  return {
    simulatedTempC,
    simulatedPrecip90dMm,
    simulatedRootMoisturePct,
    waterStressIndex,
    heatStressDays,
    projectedYieldRetentionPct,
    irrigationDemandMm,
    referenceEt0Mm,
    cropWaterRequirementMm,
    seasonalWaterBalanceMm,
    historicalRainVariabilityCvPct,
    droughtExposureDays,
    extremePrecipDays,
    vegetationStressIdx,
    growingSuitabilityStatus,
  };
}

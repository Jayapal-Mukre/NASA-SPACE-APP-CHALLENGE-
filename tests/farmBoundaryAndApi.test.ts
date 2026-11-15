import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGeometryStats,
  computeBoundingBoxTuple,
  computeGeometryVersion,
  createDefaultSubZoneBoundary,
  ensureClosedRing,
  findNearestEdgeIndex,
  getOpenVertices,
  hectaresToAcres,
  isPointInRing,
  polygonsSelfIntersect,
  translateRing,
  validateMultiPolygon,
  validatePolygonRing,
} from '../src/utils/geoAndAgronomy.ts';
import { buildFarmDatasetCacheKey } from '../src/utils/farmStorage.ts';
import { DEMONSTRATION_FARMS } from '../src/data/farms.ts';
import {
  DEMO_SCENE_CHAPTERS,
  DEMO_TOTAL_DURATION_SEC,
  buildDemoWebVtt,
} from '../src/data/demoStoryboard.ts';

const BASE_RING: [number, number][] = [
  [76.893, 12.5236],
  [76.8975, 12.5236],
  [76.8975, 12.5198],
  [76.893, 12.5198],
  [76.893, 12.5236],
];

test('Test 1 & 9: Geodesic area, acres, perimeter, and centroid accuracy', () => {
  const stats = calculateGeometryStats(BASE_RING);
  // ~490m x ~420m => ~20.5 ha
  assert.ok(stats.areaHectares > 18 && stats.areaHectares < 23, `Unexpected area: ${stats.areaHectares}`);
  assert.equal(stats.areaAcres, hectaresToAcres(stats.areaHectares));
  assert.ok(stats.perimeterMeters > 1600 && stats.perimeterMeters < 2000);
  assert.equal(stats.vertexCount, 4);
  assert.ok(Math.abs(stats.center.lat - 12.5217) < 0.001);
  assert.ok(Math.abs(stats.center.lon - 76.89525) < 0.001);
});

test('Test 2: Reshaping vertex updates area & centroid cleanly', () => {
  const open = getOpenVertices(BASE_RING);
  const expanded = open.map((p, i) => (i === 1 ? [76.9005, 12.5245] as [number, number] : p));
  const check = validatePolygonRing(expanded);
  assert.equal(check.valid, true);
  const before = calculateGeometryStats(BASE_RING);
  const after = calculateGeometryStats(check.closedRing);
  assert.ok(after.areaHectares > before.areaHectares, 'Expanded corner must increase hectares');
});

test('Test 3: Inserting a vertex on an edge splits segment cleanly', () => {
  const midPt: [number, number] = [76.89525, 12.5236];
  const { insertIndex, projectedPoint } = findNearestEdgeIndex(BASE_RING, midPt);
  assert.equal(insertIndex, 1);
  const open = getOpenVertices(BASE_RING);
  const next = [...open.slice(0, insertIndex), projectedPoint, ...open.slice(insertIndex)];
  const check = validatePolygonRing(next);
  assert.equal(check.valid, true);
  assert.equal(getOpenVertices(check.closedRing).length, 5);
});

test('Test 4: Deleting vertex preserves >= 3 minimum corner constraint', () => {
  const open = getOpenVertices(BASE_RING); // 4 vertices
  const threeCorners = open.slice(0, 3);
  const validThree = validatePolygonRing(threeCorners);
  assert.equal(validThree.valid, true);

  const twoCorners = open.slice(0, 2);
  const invalidTwo = validatePolygonRing(twoCorners);
  assert.equal(invalidTwo.valid, false);
  assert.match(invalidTwo.reason || '', /at least 3/i);
});

test('Test 5: Moving complete polygon shifts centroid while preserving area & interior test', () => {
  const moved = translateRing(BASE_RING, 0.01, -0.005);
  const origStats = calculateGeometryStats(BASE_RING);
  const movedStats = calculateGeometryStats(moved);
  assert.ok(Math.abs(origStats.areaHectares - movedStats.areaHectares) < 0.05);
  assert.ok(Math.abs(movedStats.center.lon - (origStats.center.lon + 0.01)) < 1e-4);
  assert.equal(isPointInRing([movedStats.center.lon, movedStats.center.lat], moved), true);
  assert.equal(isPointInRing([origStats.center.lon, origStats.center.lat], moved), false);
});

test('Test 6: Bow-tie self-intersecting polygons are rejected', () => {
  const bowtie: [number, number][] = [
    [76.89, 12.52],
    [76.90, 12.53],
    [76.90, 12.52],
    [76.89, 12.53],
  ];
  assert.equal(polygonsSelfIntersect(bowtie), true);
  const check = validatePolygonRing(bowtie);
  assert.equal(check.valid, false);
  assert.match(check.reason || '', /cross each other/i);
});

test('Test 10: Sub-zone creation calculates valid zone geometry inside parent farm', () => {
  const parent = DEMONSTRATION_FARMS[0];
  const zRing = createDefaultSubZoneBoundary(parent.boundary, 0);
  const zCheck = validatePolygonRing(zRing);
  assert.equal(zCheck.valid, true);
  const zStats = calculateGeometryStats(zCheck.closedRing);
  assert.ok(zStats.areaHectares > 0 && zStats.areaHectares < parent.areaHectares);
});

test('Test 12-13: Demo walkthrough covers 7 complete narrated scenes across 150s (2:30) with WebVTT cues', () => {
  assert.equal(DEMO_TOTAL_DURATION_SEC, 150);
  assert.equal(DEMO_SCENE_CHAPTERS.length, 7);
  assert.equal(DEMO_SCENE_CHAPTERS[0].startSec, 0);
  assert.equal(DEMO_SCENE_CHAPTERS[6].endSec, 150);
  for (const scene of DEMO_SCENE_CHAPTERS) {
    assert.ok(scene.narrationScript.length > 20, `${scene.id} missing narrationScript`);
    assert.ok(scene.subtitles.length >= 2, `${scene.id} missing subtitle cues`);
  }
  const vtt = buildDemoWebVtt();
  assert.ok(vtt.startsWith('WEBVTT'));
  assert.match(vtt, /Welcome to FIELD SHIFT/);
  assert.match(vtt, /Turning Earth's data into smarter farming decisions/);
});

test('Test 7, 8, 11, 14: Backend /api/farms CRUD, persistence & /demo SPA route against live server', async (t) => {
  const baseUrl = process.env.TEST_SERVER_URL || 'http://127.0.0.1:3000';
  let serverReachable = true;
  try {
    const ping = await fetch(`${baseUrl}/api/farms`, { signal: AbortSignal.timeout(2500) });
    if (!ping.ok) serverReachable = false;
  } catch {
    serverReachable = false;
  }

  if (!serverReachable) {
    t.skip(`Live dev server not reachable at ${baseUrl}; skipping live HTTP assertions.`);
    return;
  }

  // Verify /demo SPA route returns HTTP 200 HTML
  const demoHtmlRes = await fetch(`${baseUrl}/demo`);
  assert.equal(demoHtmlRes.status, 200);
  const demoHtml = await demoHtmlRes.text();
  assert.match(demoHtml, /<div id="root"/i);

  // Verify WebVTT subtitles & Demo Audio Manifest
  const vttRes = await fetch(`${baseUrl}/api/demo/subtitles.vtt`);
  assert.equal(vttRes.status, 200);
  assert.match(vttRes.headers.get('content-type') || '', /text\/vtt/i);
  const vttBody = await vttRes.text();
  assert.ok(vttBody.startsWith('WEBVTT'));
  assert.match(vttBody, /AI Agronomist Copilot/);

  const manifestRes = await fetch(`${baseUrl}/api/demo/manifest`);
  assert.equal(manifestRes.status, 200);
  const manifestJson = (await manifestRes.json()) as {
    totalDurationSec: number;
    scenes: Array<{ id: string; audioUrl: string }>;
  };
  assert.equal(manifestJson.totalDurationSec, 150);
  assert.equal(manifestJson.scenes.length, 7);

  // Verify /api/demo/audio/scene-1 returns WAV audio (or honest 503 speechSynthesis fallback when GEMINI_API_KEY is unset)
  const audioRes = await fetch(`${baseUrl}/api/demo/audio/scene-1`);
  assert.ok(audioRes.status === 200 || audioRes.status === 503, `Unexpected audio status: ${audioRes.status}`);
  if (audioRes.status === 200) {
    assert.match(audioRes.headers.get('content-type') || '', /audio\/wav/i);
    const bytes = new Uint8Array(await audioRes.arrayBuffer());
    assert.ok(bytes.length > 44);
    assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), 'RIFF');
  } else {
    const errJson = (await audioRes.json()) as { fallbackMode?: string };
    assert.equal(errJson.fallbackMode, 'web-speech-synthesis');
  }

  // Read initial farms
  const listRes = await fetch(`${baseUrl}/api/farms`);
  assert.equal(listRes.status, 200);
  const listData = (await listRes.json()) as { farms: typeof DEMONSTRATION_FARMS; persistenceSource: string };
  assert.equal(listData.persistenceSource, 'server-json-store');
  assert.ok(listData.farms.length >= 7);

  // Reject self-intersecting payload (HTTP 400)
  const badRes = await fetch(`${baseUrl}/api/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Invalid Self Crossing',
      boundary: [
        [76.89, 12.52],
        [76.90, 12.53],
        [76.90, 12.52],
        [76.89, 12.53],
      ],
    }),
  });
  assert.equal(badRes.status, 400);

  // POST create new farm with 2 zones
  const tempId = `test-farm-${Date.now()}`;
  const zoneBoundary = ensureClosedRing([
    [76.8935, 12.523],
    [76.8955, 12.523],
    [76.8955, 12.521],
    [76.8935, 12.521],
  ]);
  const createRes = await fetch(`${baseUrl}/api/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: tempId,
      name: 'Automated Verification Parcel',
      district: 'Mandya',
      state: 'Karnataka',
      primarySoilType: 'Red Sandy Loam',
      dominantCrops: ['Finger Millet', 'Chickpea'],
      irrigationType: 'rainfed',
      boundary: BASE_RING,
      zones: [
        {
          id: `${tempId}-z1`,
          name: 'Zone A North',
          cropType: 'Finger Millet',
          soilType: 'Red Sandy Loam',
          irrigationType: 'rainfed',
          color: '#10b981',
          boundary: zoneBoundary,
        },
      ],
    }),
  });
  assert.equal(createRes.status, 201);
  const createdData = (await createRes.json()) as { farm: (typeof DEMONSTRATION_FARMS)[number] };
  assert.equal(createdData.farm.id, tempId);
  assert.ok(createdData.farm.areaHectares > 18);
  assert.equal(createdData.farm.zones?.length, 1);

  // PUT update boundary & rename farm
  const updatedBoundary = translateRing(BASE_RING, 0.002, 0.001);
  const updateRes = await fetch(`${baseUrl}/api/farms/${tempId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...createdData.farm,
      name: 'Automated Verification Parcel (Updated)',
      boundaryStatus: 'Verified',
      boundary: updatedBoundary,
    }),
  });
  assert.equal(updateRes.status, 200);

  // Verify persistence on re-fetch
  const refetchRes = await fetch(`${baseUrl}/api/farms`);
  const refetchData = (await refetchRes.json()) as { farms: typeof DEMONSTRATION_FARMS };
  const found = refetchData.farms.find((f) => f.id === tempId);
  assert.ok(found, 'Updated farm must remain persisted in backend JSON store');
  assert.equal(found?.name, 'Automated Verification Parcel (Updated)');
  assert.equal(found?.zones?.length, 1);

  // Verify farm-scoped GET, properties, PATCH, observations, analytics, climate, rotation, and advisory-context
  const getOneRes = await fetch(`${baseUrl}/api/farms/${tempId}`);
  assert.equal(getOneRes.status, 200);
  const getOneJson = (await getOneRes.json()) as { farm: typeof createdData.farm };
  assert.equal(getOneJson.farm.id, tempId);
  assert.ok(getOneJson.farm.geometryVersion);
  assert.ok(Array.isArray(getOneJson.farm.boundingBox) && getOneJson.farm.boundingBox.length === 4);

  const propsRes = await fetch(`${baseUrl}/api/farms/${tempId}/properties`);
  assert.equal(propsRes.status, 200);
  const propsJson = (await propsRes.json()) as {
    farmId: string;
    geometryVersion: string;
    data: {
      identification: { farmId: string; farmName: string };
      geographic: { areaHectares: number; areaAcres: number; perimeterMeters: number };
    };
  };
  assert.equal(propsJson.farmId, tempId);
  assert.equal(propsJson.data.identification.farmId, tempId);
  assert.ok(propsJson.data.geographic.areaHectares > 18);
  assert.ok(propsJson.data.geographic.areaAcres > 40);
  assert.ok(propsJson.data.geographic.perimeterMeters > 1600);

  const patchRes = await fetch(`${baseUrl}/api/farms/${tempId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dominantCrops: ['Sorghum', 'Chickpea'],
      plantingInfo: 'Rabi Oct 10 sowing',
    }),
  });
  assert.equal(patchRes.status, 200);
  const patchJson = (await patchRes.json()) as { farm: typeof createdData.farm };
  assert.deepEqual(patchJson.farm.dominantCrops, ['Sorghum', 'Chickpea']);
  assert.equal(patchJson.farm.plantingInfo, 'Rabi Oct 10 sowing');

  const obsRes = await fetch(`${baseUrl}/api/farms/${tempId}/observations`);
  assert.equal(obsRes.status, 200);
  const obsJson = (await obsRes.json()) as {
    farmId: string;
    data: { observations: unknown; soil: unknown; sentinel2: unknown };
  };
  assert.equal(obsJson.farmId, tempId);
  assert.ok(obsJson.data.observations && obsJson.data.soil && obsJson.data.sentinel2);

  const analyticsRes = await fetch(`${baseUrl}/api/farms/${tempId}/analytics`);
  assert.equal(analyticsRes.status, 200);
  const analyticsJson = (await analyticsRes.json()) as {
    farmId: string;
    data: { properties: { geographic: { areaHectares: number } } };
  };
  assert.equal(analyticsJson.farmId, tempId);
  assert.ok(analyticsJson.data.properties.geographic.areaHectares > 18);

  const climateRes = await fetch(`${baseUrl}/api/farms/${tempId}/climate`);
  assert.equal(climateRes.status, 200);
  const climateJson = (await climateRes.json()) as {
    farmId: string;
    data: { summary: unknown; monthlyClimatology: unknown[] };
  };
  assert.equal(climateJson.farmId, tempId);
  assert.ok(climateJson.data.summary && climateJson.data.monthlyClimatology.length > 0);

  const rotationRes = await fetch(`${baseUrl}/api/farms/${tempId}/rotation`);
  assert.equal(rotationRes.status, 200);
  const rotationJson = (await rotationRes.json()) as {
    farmId: string;
    data: { farm: { id: string }; soil: unknown };
  };
  assert.equal(rotationJson.farmId, tempId);
  assert.equal(rotationJson.data.farm.id, tempId);

  const advRes = await fetch(`${baseUrl}/api/farms/${tempId}/advisory-context`);
  assert.equal(advRes.status, 200);
  const advJson = (await advRes.json()) as {
    farmId: string;
    data: { farm: { name: string } };
  };
  assert.equal(advJson.farmId, tempId);
  assert.ok(advJson.data.farm.name);

  // Verify Sentinel-2 bbox query parameter
  const s2BboxRes = await fetch(`${baseUrl}/api/satellite/sentinel2?lat=12.5217&lon=76.8952&bbox=76.893,12.5198,76.8975,12.5236`);
  assert.equal(s2BboxRes.status, 200);
  const s2BboxJson = (await s2BboxRes.json()) as { queryBbox?: number[] };
  assert.ok(Array.isArray(s2BboxJson.queryBbox) && s2BboxJson.queryBbox.length === 4);

  // Verify newly drawn farm with no agricultural metadata does not fabricate crops/soil
  const emptyFarmId = `empty-farm-${Date.now()}`;
  const emptyCreateRes = await fetch(`${baseUrl}/api/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: emptyFarmId,
      name: 'Fresh Drawn Plot',
      boundary: BASE_RING,
    }),
  });
  assert.equal(emptyCreateRes.status, 201);
  const emptyCreated = (await emptyCreateRes.json()) as { farm: typeof createdData.farm };
  assert.equal(emptyCreated.farm.primarySoilType, 'Needs farmer input');
  assert.deepEqual(emptyCreated.farm.dominantCrops, []);

  // Clean up test parcels so seed state remains tidy
  const delEmptyRes = await fetch(`${baseUrl}/api/farms/${emptyFarmId}`, { method: 'DELETE' });
  assert.equal(delEmptyRes.status, 200);
  const delRes = await fetch(`${baseUrl}/api/farms/${tempId}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);
});

test('Test 15: MultiPolygon stats, geometryVersion cache invalidation & boundingBox tuple', () => {
  const partA = BASE_RING;
  const partB = translateRing(BASE_RING, 0.01, 0);
  const multiCheck = validateMultiPolygon([partA, partB]);
  assert.equal(multiCheck.valid, true);
  assert.ok(multiCheck.areaHectares > 36 && multiCheck.areaHectares < 46);
  assert.equal(multiCheck.closedRings.length, 2);

  const bbox = computeBoundingBoxTuple(BASE_RING);
  assert.deepEqual(bbox, [76.893, 12.5198, 76.8975, 12.5236]);

  const gv1 = computeGeometryVersion(BASE_RING);
  const modified = translateRing(BASE_RING, 0.001, 0);
  const gv2 = computeGeometryVersion(modified);
  assert.notEqual(gv1, gv2);

  const k1 = buildFarmDatasetCacheKey('observations', 'farm-a', gv1, '12.52,76.89');
  const k2 = buildFarmDatasetCacheKey('observations', 'farm-a', gv2, '12.52,76.89');
  const k3 = buildFarmDatasetCacheKey('observations', 'farm-b', gv1, '12.52,76.89');
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
});

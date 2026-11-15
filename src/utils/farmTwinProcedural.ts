import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CropSpeciesId } from './farmTwinSimulation';

/**
 * Generates a procedural albedo + normal map pair for soil surfaces (Vertisol vs Alfisol),
 * reflecting furrow tillage ridges, clods, and moisture darkening.
 */
export function createSoilSurfaceMaps(
  moisturePct: number,
  isVertisol: boolean,
  maxAnisotropy: number
): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d');

  const wet = Math.min(1, Math.max(0, moisturePct / 100));

  if (actx && bctx) {
    // Vertisol: deep charcoal-brown; Alfisol: rich red-ochre sandy loam
    const r = isVertisol ? 64 - wet * 24 : 138 - wet * 42;
    const g = isVertisol ? 54 - wet * 20 : 80 - wet * 26;
    const b = isVertisol ? 45 - wet * 16 : 52 - wet * 17;

    actx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    actx.fillRect(0, 0, size, size);

    bctx.fillStyle = 'rgb(128,128,255)';
    bctx.fillRect(0, 0, size, size);

    // Plowed row ridges & moisture streaks
    for (let y = 0; y < size; y += 16) {
      actx.fillStyle = 'rgba(0,0,0,0.18)';
      actx.fillRect(0, y, size, 4);
      actx.fillStyle = 'rgba(255,228,196,0.06)';
      actx.fillRect(0, y + 5, size, 3);

      // Normal map wave across Z (green channel tilt)
      bctx.fillStyle = 'rgb(128, 175, 240)';
      bctx.fillRect(0, y, size, 5);
      bctx.fillStyle = 'rgb(128, 82, 240)';
      bctx.fillRect(0, y + 6, size, 5);
    }

    // Soil aggregates / clods & Vertisol micro-cracks
    for (let i = 0; i < 1400; i++) {
      const x = (i * 73 + (i % 7) * 19) % size;
      const y = (i * 139 + (i % 5) * 11) % size;
      const w = (i % 3) + 1;
      actx.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,0.16)' : 'rgba(255,220,185,0.06)';
      actx.fillRect(x, y, w, w);

      const nx = i % 2 === 0 ? 148 : 108;
      const ny = i % 3 === 0 ? 146 : 112;
      bctx.fillStyle = `rgb(${nx}, ${ny}, 240)`;
      bctx.fillRect(x, y, w, w);
    }

    if (isVertisol && wet < 0.38) {
      actx.strokeStyle = 'rgba(14,10,8,0.48)';
      actx.lineWidth = 1.2;
      for (let k = 0; k < 22; k++) {
        const sx = (k * 47) % size;
        const sy = (k * 89) % size;
        actx.beginPath();
        actx.moveTo(sx, sy);
        actx.lineTo((sx + 18) % size, (sy + 14) % size);
        actx.lineTo((sx + 28) % size, (sy + 4) % size);
        actx.stroke();
      }
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(bumpCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(4, 4);
  normalMap.anisotropy = maxAnisotropy;

  return { map, normalMap };
}

/**
 * Generates an underground soil profile strata texture displaying Topsoil (organic matter),
 * Compaction Zone (plow pan), and Subsoil mineral horizon + moisture gradient.
 */
export function createSoilProfileStrataTexture(params: {
  topMoisturePct: number;
  subMoisturePct: number;
  organicCarbonGKg: number;
  isVertisol: boolean;
  maxAnisotropy: number;
}): THREE.CanvasTexture {
  const { topMoisturePct, subMoisturePct, organicCarbonGKg, isVertisol, maxAnisotropy } = params;
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const omDarken = Math.min(26, organicCarbonGKg * 1.6);
    const topWet = Math.min(1, topMoisturePct / 100);
    const subWet = Math.min(1, subMoisturePct / 100);

    // Topsoil (0..72px): Organic-rich plow layer
    const topGrad = ctx.createLinearGradient(0, 0, 0, 76);
    if (isVertisol) {
      topGrad.addColorStop(0, `rgb(${Math.round(52 - omDarken * 0.5)}, ${Math.round(42 - omDarken * 0.4)}, 36)`);
      topGrad.addColorStop(1, `rgb(${Math.round(62 - topWet * 15)}, 50, 42)`);
    } else {
      topGrad.addColorStop(0, `rgb(${Math.round(115 - omDarken)}, ${Math.round(68 - omDarken * 0.6)}, 44)`);
      topGrad.addColorStop(1, `rgb(${Math.round(128 - topWet * 22)}, 75, 48)`);
    }
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 76);

    // Compaction / Plow-Pan Band (76..106px)
    ctx.fillStyle = isVertisol ? 'rgb(42, 36, 33)' : 'rgb(96, 56, 38)';
    ctx.fillRect(0, 76, w, 30);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.fillRect(0, 76, w, 30);

    // Subsoil Mineral Horizon (106..256px)
    const subGrad = ctx.createLinearGradient(0, 106, 0, h);
    if (isVertisol) {
      subGrad.addColorStop(0, `rgb(${Math.round(68 - subWet * 14)}, 58, 48)`);
      subGrad.addColorStop(1, `rgb(${Math.round(50 - subWet * 12)}, 44, 38)`);
    } else {
      subGrad.addColorStop(0, `rgb(${Math.round(145 - subWet * 24)}, 86, 52)`);
      subGrad.addColorStop(1, `rgb(${Math.round(118 - subWet * 20)}, 76, 54)`);
    }
    ctx.fillStyle = subGrad;
    ctx.fillRect(0, 106, w, h - 106);

    // Moisture saturation glow overlay on pore zones
    const moistAlpha = Math.min(0.32, (topWet * 0.5 + subWet * 0.5) * 0.34);
    const moistGrad = ctx.createLinearGradient(0, 0, 0, h);
    moistGrad.addColorStop(0, `rgba(6, 182, 212, ${moistAlpha.toFixed(2)})`);
    moistGrad.addColorStop(0.35, `rgba(14, 165, 233, ${(moistAlpha * 0.6).toFixed(2)})`);
    moistGrad.addColorStop(1, `rgba(37, 99, 235, ${(moistAlpha * 0.95).toFixed(2)})`);
    ctx.fillStyle = moistGrad;
    ctx.fillRect(0, 0, w, h);

    // Organic carbon humic flecks in topsoil & mineral pebbles in subsoil
    for (let i = 0; i < 650; i++) {
      const px = (i * 97) % w;
      const py = (i * 53) % h;
      if (py < 74) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(20,16,12,0.42)' : 'rgba(132,204,22,0.12)';
        ctx.fillRect(px, py, 3, 2);
      } else if (py > 112) {
        ctx.fillStyle = i % 4 === 0 ? 'rgba(226,232,240,0.16)' : 'rgba(0,0,0,0.14)';
        ctx.fillRect(px, py, 4, 3);
      }
    }

    // Crisp horizon boundary hairlines
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 76);
    ctx.lineTo(w, 76);
    ctx.moveTo(0, 106);
    ctx.lineTo(w, 106);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Helper to prepare any geometry for merging with RGB vertex color attribute.
 */
function tagGeometryColor(geo: THREE.BufferGeometry, r: number, g: number, b: number): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (!nonIdx.attributes.normal) nonIdx.computeVertexNormals();
  if (!nonIdx.attributes.uv) {
    const count = nonIdx.attributes.position.count;
    nonIdx.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  const count = nonIdx.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  nonIdx.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return nonIdx;
}

/**
 * Builds an optimized botanical merged geometry for a specific crop species and growth stage.
 * Single draw call per InstancedMesh plot while preserving stems, arching leaves, and heads/pods.
 */
export function buildCropSpeciesGeometry(species: CropSpeciesId, stageIndex: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const disposable: THREE.BufferGeometry[] = [];
  const pushPart = (raw: THREE.BufferGeometry, r: number, g: number, b: number) => {
    disposable.push(raw);
    parts.push(tagGeometryColor(raw, r, g, b));
  };

  if (stageIndex === 0) {
    // Seed Preparation: furrow mound + seed marker node
    const mound = new THREE.ConeGeometry(0.14, 0.08, 6);
    mound.translate(0, 0.04, 0);
    pushPart(mound, 0.72, 0.56, 0.42);
  } else if (stageIndex === 1) {
    // Germination: twin emerging cotyledon/coleoptile blades
    for (let i = 0; i < 2; i++) {
      const leaf = new THREE.ConeGeometry(0.05, 0.24, 5);
      leaf.translate(0, 0.12, 0);
      leaf.rotateZ(i === 0 ? 0.35 : -0.35);
      pushPart(leaf, 0.92, 0.98, 0.85);
    }
  } else if (species === 'jowar' || species === 'maize') {
    const leafCount = species === 'maize' ? 6 : 5;
    const stalkH = species === 'maize' ? 1.05 : 0.95;
    const stalk = new THREE.CylinderGeometry(0.025, 0.042, stalkH, 6);
    stalk.translate(0, stalkH * 0.5, 0);
    pushPart(stalk, 0.85, 0.95, 0.82);

    for (let i = 0; i < leafCount; i++) {
      const angle = (i * Math.PI * 2) / leafCount + (i % 2) * 0.4;
      const yPos = 0.22 + (i / leafCount) * (stalkH * 0.68);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, yPos, 0),
        new THREE.Vector3(Math.cos(angle) * 0.18, yPos + 0.12, Math.sin(angle) * 0.18),
        new THREE.Vector3(Math.cos(angle) * 0.36, yPos + 0.02, Math.sin(angle) * 0.36),
      ]);
      const blade = new THREE.TubeGeometry(curve, 5, 0.032, 4, false);
      pushPart(blade, 0.94, 1.0, 0.92);
    }

    // Flowering / Grain / Harvest reproductive heads
    if (stageIndex >= 3) {
      if (species === 'jowar') {
        const panicle = new THREE.ConeGeometry(0.09, 0.24, 7);
        panicle.translate(0, stalkH + 0.1, 0);
        pushPart(panicle, 1.0, 0.88, 0.56);
      } else {
        // Maize tassel + husked cob
        const tassel = new THREE.ConeGeometry(0.06, 0.2, 5);
        tassel.translate(0, stalkH + 0.09, 0);
        pushPart(tassel, 1.0, 0.86, 0.48);

        if (stageIndex >= 4) {
          const cob = new THREE.CapsuleGeometry(0.048, 0.14, 4, 6);
          cob.rotateZ(-0.45);
          cob.translate(0.08, stalkH * 0.56, 0.03);
          pushPart(cob, 1.0, 0.82, 0.34);
        }
      }
    }
  } else if (species === 'pigeon-pea') {
    // Woody branching shrub canopy
    const stem = new THREE.CylinderGeometry(0.024, 0.042, 0.72, 6);
    stem.translate(0, 0.36, 0);
    pushPart(stem, 0.78, 0.72, 0.56);

    for (let b = 0; b < 5; b++) {
      const a = (b * Math.PI * 2) / 5;
      const crown = new THREE.DodecahedronGeometry(0.16, 0);
      crown.scale(1.1, 0.85, 1.1);
      crown.translate(Math.cos(a) * 0.16, 0.58 + (b % 2) * 0.14, Math.sin(a) * 0.16);
      pushPart(crown, 0.94, 0.98, 0.92);

      if (stageIndex >= 3) {
        const raceme = new THREE.SphereGeometry(0.045, 5, 5);
        raceme.translate(Math.cos(a) * 0.22, 0.74 + (b % 2) * 0.1, Math.sin(a) * 0.22);
        pushPart(raceme, 1.0, 0.86, 0.25);
      }
    }
  } else {
    // Chickpea or Groundnut: bushy multi-tuft legume canopy
    const tuftCount = species === 'groundnut' ? 5 : 4;
    const spread = species === 'groundnut' ? 0.2 : 0.14;
    const tuftH = species === 'groundnut' ? 0.18 : 0.28;
    for (let t = 0; t < tuftCount; t++) {
      const a = (t * Math.PI * 2) / tuftCount;
      const dist = t === 0 ? 0 : spread;
      const cluster = new THREE.DodecahedronGeometry(species === 'groundnut' ? 0.14 : 0.12, 0);
      cluster.scale(1.15, tuftH / 0.14, 1.15);
      cluster.translate(Math.cos(a) * dist, tuftH * 0.75, Math.sin(a) * dist);
      pushPart(cluster, 0.93, 1.0, 0.91);
    }
    if (stageIndex >= 3) {
      const blossom = new THREE.SphereGeometry(0.036, 5, 5);
      blossom.translate(0.05, tuftH * 1.4, 0.04);
      pushPart(blossom, species === 'groundnut' ? 1.0 : 0.98, 0.88, 0.42);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  disposable.forEach((d) => d.dispose());
  return merged || new THREE.BoxGeometry(0.1, 0.2, 0.1);
}

/**
 * Builds normalized local-meter polygon coordinates from active farm boundary lat/lon ring.
 * Keeps footprint centered cleanly inside [-10.8, 10.8] meters on the digital twin stage.
 */
export function normalizeBoundaryToLocalRing(boundary: [number, number][]): THREE.Vector2[] {
  if (boundary.length < 3) {
    return [
      new THREE.Vector2(-10.5, -10.5),
      new THREE.Vector2(10.5, -10.5),
      new THREE.Vector2(10.5, 10.5),
      new THREE.Vector2(-10.5, 10.5),
    ];
  }
  const unique =
    boundary[0][0] === boundary[boundary.length - 1][0] && boundary[0][1] === boundary[boundary.length - 1][1]
      ? boundary.slice(0, -1)
      : boundary;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [lon, lat] of unique) {
    if (lon < minX) minX = lon;
    if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(1e-6, maxX - minX, maxY - minY);
  const scale = 21.0 / span;

  return unique.map(([lon, lat]) => new THREE.Vector2((lon - cx) * scale, -(lat - cy) * scale));
}

/**
 * Builds a LOD agroforestry tree (composite trunk + multi-branch crown at near distance,
 * simplified silhouette at far distance). Bottom-center pivot at y=0.
 */
export function createAgroforestryTreeLOD(
  trunkMat: THREE.Material,
  crownMat: THREE.Material,
  castShadow: boolean
): THREE.LOD {
  const lod = new THREE.LOD();

  // High detail group (5 parts)
  const highGroup = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.19, 1.5, 8), trunkMat);
  trunk.position.y = 0.75;
  trunk.castShadow = castShadow;
  highGroup.add(trunk);

  const offsets: [number, number, number, number][] = [
    [0, 2.05, 0, 0.85],
    [0.45, 1.82, 0.25, 0.6],
    [-0.42, 1.86, -0.2, 0.62],
    [0.12, 2.38, -0.28, 0.55],
  ];
  offsets.forEach(([x, y, z, r]) => {
    const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), crownMat);
    canopy.position.set(x, y, z);
    canopy.castShadow = castShadow;
    highGroup.add(canopy);
  });

  // Low detail group (2 parts)
  const lowGroup = new THREE.Group();
  const lowTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 5), trunkMat);
  lowTrunk.position.y = 0.7;
  lowGroup.add(lowTrunk);
  const lowCrown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), crownMat);
  lowCrown.position.y = 2.0;
  lowGroup.add(lowCrown);

  lod.addLevel(highGroup, 0);
  lod.addLevel(lowGroup, 36);
  return lod;
}

/**
 * Builds 3D subsurface root geometry bundles matching species architecture and modeled root depth.
 */
export function buildSubsurfaceRootSystem(
  architecture: CropSpeciesId,
  depthMeters: number,
  rootMat: THREE.Material,
  noduleMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const plantXs = [-6.8, -3.4, 0, 3.4, 6.8];

  plantXs.forEach((px, pIdx) => {
    const isTaproot = architecture === 'pigeon-pea' || architecture === 'chickpea';
    const mainDepth = Math.max(0.25, depthMeters);

    if (isTaproot) {
      // Deep central taproot + lateral rootlets
      const tapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, 0, 0.08),
        new THREE.Vector3(px + (pIdx % 2 === 0 ? 0.06 : -0.06), -mainDepth * 0.45, 0.1),
        new THREE.Vector3(px, -mainDepth, 0.08),
      ]);
      const tapGeo = new THREE.TubeGeometry(tapCurve, 10, architecture === 'pigeon-pea' ? 0.042 : 0.028, 6, false);
      group.add(new THREE.Mesh(tapGeo, rootMat));

      for (let b = 0; b < 5; b++) {
        const startY = -mainDepth * (0.18 + b * 0.16);
        const dir = b % 2 === 0 ? 1 : -1;
        const latCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, startY, 0.08),
          new THREE.Vector3(px + dir * 0.42, startY - 0.12, 0.1),
          new THREE.Vector3(px + dir * 0.78, startY - 0.24, 0.08),
        ]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(latCurve, 6, 0.015, 5, false), rootMat));

        // Nitrogen-fixing rhizobia nodules for legumes
        const nodule = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), noduleMat);
        nodule.position.set(px + dir * 0.32, startY - 0.08, 0.11);
        group.add(nodule);
      }
    } else {
      // Fibrous / Brace / Pegging branching root mat
      const strands = architecture === 'groundnut' ? 4 : 6;
      for (let s = 0; s < strands; s++) {
        const spread = (s - (strands - 1) / 2) * 0.24;
        const reachY = mainDepth * (0.65 + (s % 2) * 0.35);
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(px, 0, 0.08),
          new THREE.Vector3(px + spread * 0.65, -reachY * 0.45, 0.1),
          new THREE.Vector3(px + spread * 1.15, -reachY, 0.08),
        ]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.018, 5, false), rootMat));
      }
    }
  });

  return group;
}

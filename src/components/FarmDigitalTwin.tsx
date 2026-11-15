import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  CloudRain,
  Droplets,
  Eye,
  GitCompare,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sprout,
  Sun,
} from 'lucide-react';
import {
  ClimateScenario,
  FarmParcel,
  NasaObservationBundle,
  RotationStrategy,
  Sentinel2CatalogResponse,
  SoilProfile,
} from '../types/fieldShift';
import { SimulatedImpactMetrics } from '../utils/geoAndAgronomy';
import {
  CROP_SPECIES_LIBRARY,
  CropSpeciesId,
  GROWTH_STAGES,
  computeTwinBiophysicalState,
} from '../utils/farmTwinSimulation';
import {
  buildCropSpeciesGeometry,
  buildSubsurfaceRootSystem,
  createAgroforestryTreeLOD,
  createSoilProfileStrataTexture,
  createSoilSurfaceMaps,
  normalizeBoundaryToLocalRing,
} from '../utils/farmTwinProcedural';

interface FarmDigitalTwinProps {
  farm: FarmParcel;
  soil: SoilProfile | null;
  strategy: RotationStrategy;
  scenario: ClimateScenario;
  impact: SimulatedImpactMetrics;
  observations?: NasaObservationBundle | null;
  sentinel2Catalog?: Sentinel2CatalogResponse | null;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export const FarmDigitalTwin: React.FC<FarmDigitalTwinProps> = ({
  farm,
  soil,
  strategy,
  scenario,
  impact,
  observations = null,
  sentinel2Catalog = null,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [growthProgress, setGrowthProgress] = useState(0.64); // Flowering midpoint
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [speciesOverride, setSpeciesOverride] = useState<CropSpeciesId | 'auto'>('auto');

  const [soilCutaway, setSoilCutaway] = useState(true);
  const [irrigationActive, setIrrigationActive] = useState(true);
  const [rainActive, setRainActive] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState(false);

  const [selectedPlotIdx, setSelectedPlotIdx] = useState(0);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState<string | null>(null);

  const biophysical = useMemo(
    () =>
      computeTwinBiophysicalState({
        farm,
        soil,
        observations,
        sentinel2Catalog,
        strategy,
        scenario,
        impact,
        activeSeasonIdx,
        growthProgress,
        speciesOverride,
        irrigationActive,
        rainActive,
        compareBaselineMode: compareBaseline,
      }),
    [
      farm,
      soil,
      observations,
      sentinel2Catalog,
      strategy,
      scenario,
      impact,
      activeSeasonIdx,
      growthProgress,
      speciesOverride,
      irrigationActive,
      rainActive,
      compareBaseline,
    ]
  );

  // Baseline reference for Before / After delta display
  const baselineSnapshot = useMemo(
    () =>
      computeTwinBiophysicalState({
        farm,
        soil,
        observations,
        sentinel2Catalog,
        strategy,
        scenario,
        impact,
        activeSeasonIdx,
        growthProgress,
        speciesOverride,
        irrigationActive,
        rainActive,
        compareBaselineMode: true,
      }),
    [
      farm,
      soil,
      observations,
      sentinel2Catalog,
      strategy,
      scenario,
      impact,
      activeSeasonIdx,
      growthProgress,
      speciesOverride,
      irrigationActive,
      rainActive,
    ]
  );

  const stateRef = useRef({
    biophysical,
    farm,
    soil,
    strategy,
    scenario,
    activeSeasonIdx,
    growthProgress,
    speciesOverride,
    soilCutaway,
    irrigationActive,
    rainActive,
  });
  stateRef.current = {
    biophysical,
    farm,
    soil,
    strategy,
    scenario,
    activeSeasonIdx,
    growthProgress,
    speciesOverride,
    soilCutaway,
    irrigationActive,
    rainActive,
  };

  const sceneApiRef = useRef<{
    syncDynamicWorld: () => void;
    setCameraPreset: (preset: 'overview' | 'top' | 'side' | 'cutaway') => void;
  } | null>(null);

  // Auto-advance seasonal growth timeline when playing
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = window.setInterval(() => {
      setGrowthProgress((prev) => {
        const next = prev + 0.02;
        return next > 1.0 ? 0.05 : Number(next.toFixed(2));
      });
    }, 180);
    return () => window.clearInterval(timer);
  }, [isPlayingTimeline]);

  // Listen to fullscreen transitions
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      window.dispatchEvent(new Event('resize'));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Initialize Three.js PBR Agricultural Digital Twin
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const webglProbe = (() => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { supported: false, software: true };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return {
          supported: true,
          software: /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu),
        };
      } catch {
        return { supported: false, software: true };
      }
    })();

    if (!webglProbe.supported) {
      setWebglUnavailable('WebGL 3D rendering is unavailable on this device; displaying schematic twin.');
      return;
    }

    const isSoftwareGl = webglProbe.software;
    const width = container.clientWidth || 960;
    const height = container.clientHeight || 560;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable('Unable to initialize 3D WebGL context; displaying schematic twin.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable('WebGL context paused by browser GPU driver.');
    };
    const onContextRestored = () => {
      setWebglUnavailable(null);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x091322);
    scene.fog = new THREE.FogExp2(0x091322, 0.011);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 240);
    camera.position.set(22, 14.5, 24);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.06;
    controls.minDistance = 7;
    controls.maxDistance = 62;
    controls.target.set(0, 0.2, 0);

    // 3-Point Sunlight + Atmospheric Sky/Ground Rig
    const hemiLight = new THREE.HemisphereLight(0xa5d8ff, 0x3b281c, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3d6, 1.9);
    keyLight.position.set(22, 28, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    const sd = 24;
    keyLight.shadow.camera.left = -sd;
    keyLight.shadow.camera.right = sd;
    keyLight.shadow.camera.top = sd;
    keyLight.shadow.camera.bottom = -sd;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.42);
    rimLight.position.set(-18, 11, -20);
    scene.add(rimLight);

    // Rolling Surrounding Landscape Terrain (prevents floating void)
    const landscapeGeo = new THREE.PlaneGeometry(160, 160, 40, 40);
    landscapeGeo.rotateX(-Math.PI / 2);
    const lPos = landscapeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lPos.count; i++) {
      const vx = lPos.getX(i);
      const vz = lPos.getZ(i);
      const dist = Math.hypot(vx, vz);
      const hillMask = Math.max(0, (dist - 18) / 36);
      const elev =
        hillMask *
        (Math.sin(vx * 0.09) * 1.4 + Math.cos(vz * 0.08) * 1.2 + Math.sin((vx + vz) * 0.05) * 0.9);
      lPos.setY(i, -0.25 + elev);
    }
    landscapeGeo.computeVertexNormals();
    const landscapeMat = new THREE.MeshStandardMaterial({
      color: 0x132030,
      roughness: 0.94,
      metalness: 0.04,
    });
    const landscapeMesh = new THREE.Mesh(landscapeGeo, landscapeMat);
    landscapeMesh.receiveShadow = true;
    scene.add(landscapeMesh);

    // Subtle Neighboring Agricultural Fields beyond parcel perimeter
    const neighborMat = new THREE.MeshStandardMaterial({ color: 0x1a2c38, roughness: 0.92, metalness: 0.02 });
    const neighborCoords: [number, number, number, number][] = [
      [-28, -14, 18, 18],
      [29, -12, 18, 20],
      [-28, 16, 18, 18],
      [29, 17, 18, 18],
    ];
    const neighborGeos: THREE.BufferGeometry[] = [];
    neighborCoords.forEach(([nx, nz, nw, nd]) => {
      const g = new THREE.BoxGeometry(nw, 0.14, nd);
      neighborGeos.push(g);
      const m = new THREE.Mesh(g, neighborMat);
      m.position.set(nx, -0.18, nz);
      m.receiveShadow = true;
      scene.add(m);
    });

    // Farm Sub-Terrain Monolith & Interactive Soil Cross-Section (0m down to -2.0m)
    const monolithGroup = new THREE.Group();
    scene.add(monolithGroup);

    const soilSidesMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.02,
    });
    const strataDepth = 2.0;
    const soilMonolithGeo = new THREE.BoxGeometry(21.4, strataDepth, 21.4);
    const soilMonolith = new THREE.Mesh(soilMonolithGeo, soilSidesMat);
    soilMonolith.position.y = -strataDepth / 2 + 0.02;
    soilMonolith.receiveShadow = true;
    monolithGroup.add(soilMonolith);

    // Compaction / Plow-Pan Highlight Ribbon on Front Cross-Section Face
    const compactionMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.85,
      transparent: true,
      opacity: 0.32,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const compactionBandGeo = new THREE.PlaneGeometry(21.42, 0.2);
    const compactionBand = new THREE.Mesh(compactionBandGeo, compactionMat);
    compactionBand.position.set(0, -0.45, 10.72);
    monolithGroup.add(compactionBand);

    // Underground Root Systems Group (rebuilt per species/stage)
    const rootsGroup = new THREE.Group();
    rootsGroup.position.set(0, 0.06, 10.66);
    monolithGroup.add(rootsGroup);

    // Animated Soil Water Infiltration & Percolation Droplets inside Cross-Section
    const infilCount = 140;
    const infilPositions = new Float32Array(infilCount * 3);
    for (let i = 0; i < infilCount; i++) {
      infilPositions[i * 3] = (Math.random() - 0.5) * 19.4;
      infilPositions[i * 3 + 1] = -Math.random() * 1.85;
      infilPositions[i * 3 + 2] = 10.78;
    }
    const infilGeo = new THREE.BufferGeometry();
    infilGeo.setAttribute('position', new THREE.BufferAttribute(infilPositions, 3));
    const infilMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.16,
      transparent: true,
      opacity: 0.85,
    });
    const infilPoints = new THREE.Points(infilGeo, infilMat);
    monolithGroup.add(infilPoints);

    // Farm Parcel Boundary Outline (Driven by farm.boundary polygon)
    const boundaryGroup = new THREE.Group();
    scene.add(boundaryGroup);

    // Farm Pathways (Central cross bunds & compacted gravel strips)
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x786350, roughness: 0.94, metalness: 0.04 });
    const pathNS = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 21.2), pathMat);
    pathNS.position.set(0, 0.08, 0);
    pathNS.receiveShadow = true;
    scene.add(pathNS);
    const pathEW = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.08, 1.15), pathMat);
    pathEW.position.set(0, 0.08, 0);
    pathEW.receiveShadow = true;
    scene.add(pathEW);

    // 4 Interactive Agricultural Plots
    const plotGroup = new THREE.Group();
    scene.add(plotGroup);
    const plotOffsets: [number, number][] = [
      [-5.3, -5.3],
      [5.3, -5.3],
      [-5.3, 5.3],
      [5.3, 5.3],
    ];
    const plotMeshes: THREE.Mesh[] = [];
    const plotBorders: THREE.LineSegments[] = [];
    const cropInstancedMeshes: THREE.InstancedMesh[] = [];
    const mulchInstancedMeshes: THREE.InstancedMesh[] = [];
    const dripPipeMeshes: THREE.Mesh[] = [];

    const plotSoilMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.04,
    });
    const plotBoxGeo = new THREE.BoxGeometry(9.1, 0.14, 9.1);
    const plotBorderGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(9.2, 0.18, 9.2));
    const mulchStripGeo = new THREE.BoxGeometry(8.2, 0.03, 0.34);
    const mulchMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.9, metalness: 0.02 });
    const dripPipeGeo = new THREE.CylinderGeometry(0.025, 0.025, 8.2, 6);
    dripPipeGeo.rotateZ(Math.PI / 2);
    const dripPipeMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.35, metalness: 0.45 });

    plotOffsets.forEach(([px, pz], idx) => {
      const plotMesh = new THREE.Mesh(plotBoxGeo, plotSoilMat);
      plotMesh.position.set(px, 0.09, pz);
      plotMesh.receiveShadow = true;
      plotMesh.userData = { plotIndex: idx };
      plotGroup.add(plotMesh);
      plotMeshes.push(plotMesh);

      const bMat = new THREE.LineBasicMaterial({ color: idx === 0 ? 0x22d3ee : 0x334155 });
      const border = new THREE.LineSegments(plotBorderGeo, bMat);
      border.position.set(px, 0.1, pz);
      plotGroup.add(border);
      plotBorders.push(border);

      // Ground cover / crop residue mulch strips (7 rows per plot)
      const mulchInst = new THREE.InstancedMesh(mulchStripGeo, mulchMat, 7);
      for (let r = 0; r < 7; r++) {
        _dummy.position.set(px, 0.17, pz + (r - 3) * 1.15);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(1, 1, 1);
        _dummy.updateMatrix();
        mulchInst.setMatrixAt(r, _dummy.matrix);
      }
      mulchInst.instanceMatrix.needsUpdate = true;
      mulchInst.computeBoundingSphere();
      plotGroup.add(mulchInst);
      mulchInstancedMeshes.push(mulchInst);

      // Drip irrigation lateral tubes along rows
      const dripInst = new THREE.Group();
      for (let r = 0; r < 4; r++) {
        const pipe = new THREE.Mesh(dripPipeGeo, dripPipeMat);
        pipe.position.set(px, 0.18, pz + (r - 1.5) * 2.1);
        dripInst.add(pipe);
        dripPipeMeshes.push(pipe);
      }
      plotGroup.add(dripInst);
    });

    // Excavated Water Reservoir (Farm Pond) on East Edge
    const pondGroup = new THREE.Group();
    pondGroup.position.set(14.8, 0.0, 4.5);
    const bermMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9, metalness: 0.08 });
    const pondShellShape = new THREE.Shape();
    pondShellShape.moveTo(-2.8, -3.6);
    pondShellShape.lineTo(2.8, -3.6);
    pondShellShape.lineTo(2.8, 3.6);
    pondShellShape.lineTo(-2.8, 3.6);
    pondShellShape.closePath();
    const pondHole = new THREE.Path();
    pondHole.moveTo(-2.1, -2.9);
    pondHole.lineTo(2.1, -2.9);
    pondHole.lineTo(2.1, 2.9);
    pondHole.lineTo(-2.1, 2.9);
    pondHole.closePath();
    pondShellShape.holes.push(pondHole);
    const bermGeo = new THREE.ExtrudeGeometry(pondShellShape, {
      depth: 0.55,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.12,
      bevelSegments: 2,
    });
    bermGeo.rotateX(-Math.PI / 2);
    const bermMesh = new THREE.Mesh(bermGeo, bermMat);
    bermMesh.position.y = -0.15;
    bermMesh.castShadow = !isSoftwareGl;
    bermMesh.receiveShadow = true;
    pondGroup.add(bermMesh);

    const pondLinerGeo = new THREE.BoxGeometry(4.4, 0.12, 6.0);
    const pondLinerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });
    const pondLiner = new THREE.Mesh(pondLinerGeo, pondLinerMat);
    pondLiner.position.y = -0.14;
    pondGroup.add(pondLiner);

    const pondWaterGeo = new THREE.PlaneGeometry(4.15, 5.75, 16, 16);
    pondWaterGeo.rotateX(-Math.PI / 2);
    const pondWaterMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      roughness: 0.14,
      metalness: 0.1,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.86,
    });
    const pondWater = new THREE.Mesh(pondWaterGeo, pondWaterMat);
    pondWater.position.y = 0.25;
    pondGroup.add(pondWater);
    scene.add(pondGroup);

    // Main Concrete Irrigation Feeder Channel + Animated Water Stream
    const canalGroup = new THREE.Group();
    const canalWallMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82, metalness: 0.1 });
    const canalWallL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 21.8), canalWallMat);
    canalWallL.position.set(11.1, 0.1, 0);
    canalGroup.add(canalWallL);
    const canalWallR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 21.8), canalWallMat);
    canalWallR.position.set(11.8, 0.1, 0);
    canalGroup.add(canalWallR);
    const canalBed = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 21.8), canalWallMat);
    canalBed.position.set(11.45, -0.04, 0);
    canalGroup.add(canalBed);

    const canalStreamMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.28,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.82,
    });
    const canalStream = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 21.6), canalStreamMat);
    canalStream.position.set(11.45, 0.08, 0);
    canalGroup.add(canalStream);

    // Connector intake pipe from pond to feeder canal
    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(13.2, 0.2, 4.5),
      new THREE.Vector3(12.2, 0.26, 4.5),
      new THREE.Vector3(11.45, 0.18, 4.5),
    ]);
    const intakePipe = new THREE.Mesh(
      new THREE.TubeGeometry(intakeCurve, 12, 0.11, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x0e7490, metalness: 0.55, roughness: 0.35 })
    );
    canalGroup.add(intakePipe);
    scene.add(canalGroup);

    // Composite Agro-Telemetry Weather Station & Solar Pump Hub (North-West Corner)
    const stationGroup = new THREE.Group();
    stationGroup.position.set(-12.4, 0.0, -10.8);
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.24 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.55, roughness: 0.42 });
    const solarPanelMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.72,
      roughness: 0.18,
      clearcoat: 0.9,
    });

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 16), housingMat);
    pad.position.y = 0.08;
    stationGroup.add(pad);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.4, 12), steelMat);
    mast.position.y = 2.2;
    mast.castShadow = !isSoftwareGl;
    stationGroup.add(mast);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 8), steelMat);
      strut.position.set(Math.cos(a) * 0.35, 0.65, Math.sin(a) * 0.35);
      strut.rotation.z = Math.cos(a) * 0.42;
      strut.rotation.x = -Math.sin(a) * 0.42;
      stationGroup.add(strut);
    }
    const loggerBox = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.42), housingMat);
    loggerBox.position.set(0.28, 2.0, 0);
    stationGroup.add(loggerBox);
    const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.8), solarPanelMat);
    solarPanel.position.set(0, 3.25, 0.38);
    solarPanel.rotation.x = 0.52;
    stationGroup.add(solarPanel);

    const anemometerGroup = new THREE.Group();
    anemometerGroup.position.set(0, 4.5, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.48, 6), steelMat);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = a;
      arm.position.set(Math.cos(a) * 0.24, 0, -Math.sin(a) * 0.24);
      anemometerGroup.add(arm);
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8, 0, Math.PI), steelMat);
      cup.position.set(Math.cos(a) * 0.48, 0, -Math.sin(a) * 0.48);
      anemometerGroup.add(cup);
    }
    stationGroup.add(anemometerGroup);
    scene.add(stationGroup);

    // Perimeter Agroforestry Windbreak Trees using THREE.LOD
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
    const treeCrownMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.82 });
    const treeLODs: THREE.LOD[] = [];
    const treeLocations: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const span = (i - 2.5) * 4.2;
      treeLocations.push([span, -13.6, 0.9 + (i % 3) * 0.14]);
      treeLocations.push([-13.8, span, 0.95 + (i % 2) * 0.18]);
      treeLocations.push([19.2, span, 1.0 + (i % 3) * 0.15]);
    }
    treeLocations.forEach(([tx, tz, scale], idx) => {
      const lod = createAgroforestryTreeLOD(treeTrunkMat, treeCrownMat, !isSoftwareGl);
      lod.position.set(tx, -0.12, tz);
      lod.scale.setScalar(scale);
      lod.rotation.y = (idx * 1.17) % Math.PI;
      scene.add(lod);
      treeLODs.push(lod);
    });

    // Rainfall & Drip Irrigation Emitter Droplets
    const rainCount = 460;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 24;
      rainPositions[i * 3 + 1] = Math.random() * 14 + 0.3;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.14, transparent: true, opacity: 0.72 });
    const rainPoints = new THREE.Points(rainGeo, rainMat);
    rainPoints.visible = false;
    scene.add(rainPoints);

    // Track disposable dynamic textures/materials
    let curSoilMap: THREE.CanvasTexture | null = null;
    let curSoilNormal: THREE.CanvasTexture | null = null;
    let curStrataTex: THREE.CanvasTexture | null = null;
    const rootMat = new THREE.MeshStandardMaterial({ color: 0xd6b88d, roughness: 0.86 });
    const noduleMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.7 });

    const syncDynamicWorld = () => {
      const {
        biophysical: bio,
        farm: curFarm,
        strategy: curStrat,
        scenario: curScen,
        activeSeasonIdx: sIdx,
        growthProgress: gp,
        speciesOverride: spOver,
        soilCutaway: cutawayOn,
        irrigationActive: irrigOn,
        rainActive: rainOn,
      } = stateRef.current;

      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      // 1. Update Soil Surface Albedo + Normal Maps
      if (curSoilMap) curSoilMap.dispose();
      if (curSoilNormal) curSoilNormal.dispose();
      const maps = createSoilSurfaceMaps(bio.modeledTopsoilMoisturePct, bio.isVertisol, maxAniso);
      curSoilMap = maps.map;
      curSoilNormal = maps.normalMap;
      plotSoilMat.map = curSoilMap;
      plotSoilMat.normalMap = curSoilNormal;
      plotSoilMat.normalScale.set(0.75, 0.75);
      plotSoilMat.needsUpdate = true;

      // 2. Update Underground Soil Cross-Section Strata & Visibility
      monolithGroup.visible = cutawayOn;
      if (curStrataTex) curStrataTex.dispose();
      curStrataTex = createSoilProfileStrataTexture({
        topMoisturePct: bio.modeledTopsoilMoisturePct,
        subMoisturePct: bio.modeledSubsoilMoisturePct,
        organicCarbonGKg: bio.modeledOrganicCarbonGKg,
        isVertisol: bio.isVertisol,
        maxAnisotropy: maxAniso,
      });
      soilSidesMat.map = curStrataTex;
      soilSidesMat.needsUpdate = true;

      // Rebuild subsurface roots
      while (rootsGroup.children.length > 0) {
        const child = rootsGroup.children[0];
        rootsGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      }
      const rootDepthM = Math.max(0.25, (bio.modeledRootDepthCm / 180) * 1.85);
      const builtRoots = buildSubsurfaceRootSystem(bio.species.id, rootDepthM, rootMat, noduleMat);
      rootsGroup.add(builtRoots);

      // 3. Update Farm Boundary Polygon Line from actual farm.boundary
      while (boundaryGroup.children.length > 0) {
        const child = boundaryGroup.children[0];
        boundaryGroup.remove(child);
        if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      }
      const ring2d = normalizeBoundaryToLocalRing(curFarm.boundary);
      const pts3d = [...ring2d, ring2d[0]].map((p) => new THREE.Vector3(p.x, 0.16, p.y));
      const bGeo = new THREE.BufferGeometry().setFromPoints(pts3d);
      const bMat = new THREE.LineBasicMaterial({ color: 0x34d399 });
      boundaryGroup.add(new THREE.Line(bGeo, bMat));

      // 4. Update Reservoir Level, Irrigation Channel & Drip Laterals
      const pondY = -0.05 + (bio.modeledPondLevelPct / 100) * 0.42;
      pondWater.position.y = pondY;
      canalStream.visible = irrigOn || rainOn;
      dripPipeMeshes.forEach((p) => {
        p.visible = irrigOn;
      });
      infilPoints.visible = cutawayOn && (irrigOn || rainOn || bio.modeledTopsoilMoisturePct > 28);
      rainPoints.visible = rainOn;

      // 5. Atmospheric Temperature / Stress Sky & Sunlight Modulation
      const heatFactor = Math.max(0, Math.min(1, curScen.tempDeltaC / 3.5));
      keyLight.color.setHex(0xfff3d6).lerp(new THREE.Color(0xfdba74), heatFactor * 0.45);
      keyLight.intensity = rainOn ? 1.25 : 1.85 + heatFactor * 0.25;
      const bgHex = rainOn ? 0x0a1424 : heatFactor > 0.4 ? 0x101420 : 0x091322;
      (scene.background as THREE.Color).setHex(bgHex);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(bgHex);
      }

      // 6. Update Ground Cover Mulch Density
      const coverScaleZ = Math.max(0.15, bio.modeledGroundCoverPct / 100);
      mulchInstancedMeshes.forEach((m) => {
        m.visible = bio.modeledGroundCoverPct > 12;
        m.scale.set(1, 1, coverScaleZ);
      });

      // 7. Rebuild Species-Specific Crop Rows Across 4 Plots
      cropInstancedMeshes.forEach((m) => {
        plotGroup.remove(m);
        m.geometry.dispose();
        if (m.material instanceof THREE.Material) m.material.dispose();
      });
      cropInstancedMeshes.length = 0;

      plotOffsets.forEach(([px, pz], plotIdx) => {
        const plotSeason = curStrat.seasons[(sIdx + plotIdx) % curStrat.seasons.length];
        const plotSpeciesId: CropSpeciesId =
          spOver === 'auto'
            ? plotIdx === selectedPlotIdx
              ? bio.species.id
              : (() => {
                  const n = (plotSeason?.crop || '').toLowerCase();
                  if (n.includes('maize')) return 'maize';
                  if (n.includes('pigeon') || n.includes('tur')) return 'pigeon-pea';
                  if (n.includes('chickpea') || n.includes('gram') || n.includes('cowpea') || n.includes('soy')) return 'chickpea';
                  if (n.includes('groundnut') || n.includes('sunflower') || n.includes('safflower')) return 'groundnut';
                  return 'jowar';
                })()
            : spOver;

        const spec = CROP_SPECIES_LIBRARY[plotSpeciesId];
        const cropGeo = buildCropSpeciesGeometry(plotSpeciesId, bio.stage.index);
        const cropMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 0.68,
          metalness: 0.04,
        });

        const rows = 7;
        const cols = 10;
        const total = rows * cols;
        const inst = new THREE.InstancedMesh(cropGeo, cropMat, total);
        inst.castShadow = !isSoftwareGl && bio.stage.index >= 2;
        inst.receiveShadow = true;

        // Height & vigor scale driven by growth stage + climate water stress
        const stageHeightNorm = bio.stage.index === 0 ? 0.55 : bio.stage.index === 1 ? 0.65 : 0.35 + gp * 0.75;
        const heightScale =
          (bio.stage.index <= 1 ? stageHeightNorm : spec.maxHeightM * stageHeightNorm) *
          (0.62 + bio.modeledCanopyVigor * 0.42);
        const spreadScale = 0.72 + gp * 0.42;

        // Foliage health -> stress -> harvest senescence tint
        const healthyC = new THREE.Color(spec.healthyColorHex);
        const stressC = new THREE.Color(spec.stressedColorHex);
        const harvestC = new THREE.Color(spec.harvestColorHex);
        const basePlantColor = healthyC.clone().lerp(stressC, Math.max(0, 1 - bio.modeledCanopyVigor));
        if (bio.stage.index === 5) {
          basePlantColor.lerp(harvestC, 0.78);
        } else if (bio.stage.index === 4) {
          basePlantColor.lerp(harvestC, 0.25);
        }

        let i = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = px + (c - (cols - 1) / 2) * 0.84;
            const z = pz + (r - (rows - 1) / 2) * 1.15;
            const jitterX = (((r * 17 + c * 11) % 9) - 4) * 0.015;
            const jitterZ = (((r * 7 + c * 13) % 9) - 4) * 0.012;
            const heightVar = 0.9 + ((r * 3 + c * 5) % 4) * 0.06;

            _dummy.position.set(x + jitterX, 0.16, z + jitterZ);
            _dummy.rotation.set(0, ((r * 1.3 + c * 0.7) % Math.PI) * 2, 0);
            _dummy.scale.set(spreadScale, heightScale * heightVar, spreadScale);
            _dummy.updateMatrix();
            inst.setMatrixAt(i, _dummy.matrix);

            _color.copy(basePlantColor);
            if ((r + c) % 3 === 0) _color.offsetHSL(0.012, 0, 0.03);
            else if ((r + c) % 4 === 0) _color.offsetHSL(-0.01, 0, -0.025);
            inst.setColorAt(i, _color);
            i++;
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere();
        plotGroup.add(inst);
        cropInstancedMeshes.push(inst);
      });
    };

    syncDynamicWorld();

    // Smooth Camera Presets (Overview, Top, Side, Soil Cutaway)
    let camTargetPos: THREE.Vector3 | null = null;
    let camTargetLook: THREE.Vector3 | null = null;

    const setCameraPreset = (preset: 'overview' | 'top' | 'side' | 'cutaway') => {
      if (preset === 'overview') {
        camTargetPos = new THREE.Vector3(22, 14.5, 24);
        camTargetLook = new THREE.Vector3(0, 0.2, 0);
      } else if (preset === 'top') {
        camTargetPos = new THREE.Vector3(0.01, 32, 0.01);
        camTargetLook = new THREE.Vector3(0, 0, 0);
      } else if (preset === 'side') {
        camTargetPos = new THREE.Vector3(0, 4.2, 27);
        camTargetLook = new THREE.Vector3(0, 0.1, 0);
      } else {
        // Focused angled close-up on the Soil Cross-Section & Root Zone
        camTargetPos = new THREE.Vector3(7.5, 2.2, 20.5);
        camTargetLook = new THREE.Vector3(0, -0.85, 10.6);
      }
    };

    controls.addEventListener('start', () => {
      camTargetPos = null;
      camTargetLook = null;
    });

    // Plot Raycaster Selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(plotMeshes, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.plotIndex as number;
        setSelectedPlotIdx(idx);
        plotBorders.forEach((b, i) => {
          (b.material as THREE.LineBasicMaterial).color.setHex(i === idx ? 0x22d3ee : 0x334155);
        });
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    sceneApiRef.current = { syncDynamicWorld, setCameraPreset };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(0.1, clock.getDelta());
      const elapsed = clock.getElapsedTime();

      anemometerGroup.rotation.y += delta * 2.6;

      // Water surface ripple shimmer
      pondWater.rotation.z = Math.sin(elapsed * 0.9) * 0.004;
      if (canalStream.visible) {
        canalStreamMat.emissiveIntensity = 0.24 + Math.sin(elapsed * 4.0) * 0.08;
      }

      // Animate soil water infiltration droplets downward (slowing near compaction zone)
      if (infilPoints.visible) {
        const iPos = infilGeo.attributes.position as THREE.BufferAttribute;
        const speedMult = stateRef.current.irrigationActive || stateRef.current.rainActive ? 1.15 : 0.45;
        for (let i = 0; i < infilCount; i++) {
          let y = iPos.getY(i);
          const inPlowPan = y < -0.32 && y > -0.58;
          const rate = (inPlowPan ? 0.28 : 0.72) * speedMult;
          y -= delta * rate;
          if (y < -1.9) y = -0.04;
          iPos.setY(i, y);
        }
        iPos.needsUpdate = true;
      }

      // Animate rainfall particles
      if (rainPoints.visible) {
        const rPos = rainGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rainCount; i++) {
          let y = rPos.getY(i) - delta * 12;
          if (y < 0.2) y = 14;
          rPos.setY(i, y);
        }
        rPos.needsUpdate = true;
      }

      // Update LODs relative to active camera
      treeLODs.forEach((lod) => lod.update(camera));

      // Smooth damped camera preset flights
      if (camTargetPos && camTargetLook) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetPos.x, 5.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetPos.y, 5.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camTargetPos.z, 5.5, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, camTargetLook.x, 5.5, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, camTargetLook.y, 5.5, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, camTargetLook.z, 5.5, delta);
        if (camera.position.distanceTo(camTargetPos) < 0.14) {
          camTargetPos = null;
          camTargetLook = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      cropInstancedMeshes.forEach((m) => {
        m.geometry.dispose();
        if (m.material instanceof THREE.Material) m.material.dispose();
      });
      if (curSoilMap) curSoilMap.dispose();
      if (curSoilNormal) curSoilNormal.dispose();
      if (curStrataTex) curStrataTex.dispose();
      landscapeGeo.dispose();
      landscapeMat.dispose();
      neighborGeos.forEach((g) => g.dispose());
      neighborMat.dispose();
      soilMonolithGeo.dispose();
      soilSidesMat.dispose();
      compactionBandGeo.dispose();
      compactionMat.dispose();
      infilGeo.dispose();
      infilMat.dispose();
      plotBoxGeo.dispose();
      plotBorderGeo.dispose();
      mulchStripGeo.dispose();
      mulchMat.dispose();
      dripPipeGeo.dispose();
      dripPipeMat.dispose();
      bermGeo.dispose();
      bermMat.dispose();
      pondLinerGeo.dispose();
      pondLinerMat.dispose();
      pondWaterGeo.dispose();
      pondWaterMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      rootMat.dispose();
      noduleMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Re-sync 3D farm scene whenever live farm/climate/soil/crop/cutaway state changes
  useEffect(() => {
    sceneApiRef.current?.syncDynamicWorld();
  }, [biophysical, soilCutaway, irrigationActive, rainActive, selectedPlotIdx]);

  const toggleFullscreen = async () => {
    if (!wrapperRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await wrapperRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if iframe restricts fullscreen API
    }
  };

  const inspectedSeason = strategy.seasons[(activeSeasonIdx + selectedPlotIdx) % strategy.seasons.length];

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-[580px] lg:h-[660px] rounded-xl overflow-hidden border border-[#32D9FF]/20 bg-[#050914]"
    >
      {/* Isolated WebGL Canvas or Mobile/No-WebGL Schematic Fallback */}
      {!webglUnavailable ? (
        <div ref={mountRef} className="w-full h-full" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#070d19] text-center space-y-4">
          <Sprout className="w-9 h-9 text-emerald-400" />
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-semibold text-slate-100">
              2D Schematic Digital Twin Fallback
            </h3>
            <p className="text-xs text-slate-400">{webglUnavailable}</p>
          </div>
          <svg viewBox="0 0 420 180" className="w-full max-w-lg rounded-lg border border-slate-800 bg-[#0a101d]">
            <rect x="0" y="0" width="420" height="72" fill="#0e1b2d" />
            <rect x="0" y="72" width="420" height="32" fill="#4e3424" />
            <rect x="0" y="104" width="420" height="16" fill="#7c5222" opacity="0.65" />
            <rect x="0" y="120" width="420" height="60" fill="#3a271c" />
            <text x="14" y="92" fill="#e2e8f0" fontSize="11">
              Topsoil ({biophysical.modeledTopsoilMoisturePct}% moisture · {biophysical.modeledOrganicCarbonGKg} g/kg SOC)
            </text>
            <text x="14" y="116" fill="#fcd34d" fontSize="10">
              Modeled Compaction Zone (~{biophysical.modeledCompactionDepthCm} cm)
            </text>
            <text x="14" y="144" fill="#cbd5e1" fontSize="11">
              Subsoil ({biophysical.modeledSubsoilMoisturePct}% moisture · Root depth {biophysical.modeledRootDepthCm} cm)
            </text>
          </svg>
        </div>
      )}

      {/* TOP-LEFT SCIENTIFIC TELEMETRY & PROVENANCE READOUT (Solid rgba surface, no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 bg-[#050914]/94 border border-[#32D9FF]/25 rounded-xl px-3.5 py-2.5 max-w-[330px] space-y-1.5">
        <div className="text-[11px] font-mono text-[#32D9FF]">
          3D Agricultural Digital Twin · {compareBaseline ? 'Historical Baseline' : scenario.label}
        </div>
        <div className="text-sm font-semibold text-slate-100 truncate">
          Plot 0{selectedPlotIdx + 1}: {biophysical.species.label}
        </div>
        <div className="text-[11px] text-slate-300">
          Stage: <span className="text-emerald-300 font-medium">{biophysical.stage.label}</span> ({biophysical.stage.rangeLabel}) ·{' '}
          {inspectedSeason?.season}
        </div>

        {/* Observed Climate & Satellite Context vs Modeled Simulation Outputs */}
        <div className="border-t border-slate-800 pt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono tabular-nums">
          <div className="text-slate-400">
            NASA 90d: <span className="text-slate-200">{biophysical.observedMeanTempC ?? '—'}°C / {biophysical.observedRain90dMm ?? '—'}mm</span>
          </div>
          <div className="text-slate-400">
            Sentinel-2: <span className="text-slate-200">{biophysical.sentinel2SceneDate || 'N/A'}</span>
          </div>
          <div className="text-slate-400">
            Canopy (Mod): <span className={biophysical.modeledWaterStressIndex > 55 ? 'text-amber-300' : 'text-emerald-300'}>
              {Math.round(biophysical.modeledCanopyVigor * 100)}% vigor
            </span>
          </div>
          <div className="text-slate-400">
            Cover (Mod): <span className="text-cyan-300">{biophysical.modeledGroundCoverPct}%</span>
          </div>
          <div className="text-slate-400">
            Stress (Mod): <span className={biophysical.modeledWaterStressIndex > 55 ? 'text-rose-300' : 'text-slate-200'}>
              {biophysical.modeledWaterStressIndex}/100
            </span>
          </div>
          <div className="text-slate-400">
            Pond (Mod): <span className="text-cyan-300">{biophysical.modeledPondLevelPct}%</span>
          </div>
        </div>

        {/* Soil Cross-Section Legend when Cutaway Enabled */}
        {soilCutaway && (
          <div className="border-t border-slate-800 pt-1.5 space-y-1 text-[10px]">
            <div className="font-semibold text-amber-300">
              Modeled Soil Cross-Section ({soil?.source.includes('ISRIC') ? 'ISRIC-Anchored' : 'Estimated'})
            </div>
            <div className="font-mono tabular-nums text-slate-300">
              Topsoil {biophysical.modeledTopsoilMoisturePct}% · Subsoil {biophysical.modeledSubsoilMoisturePct}% · Infil {biophysical.modeledInfiltrationMmHr} mm/h
            </div>
            <div className="font-mono tabular-nums text-slate-300">
              Root Depth: {biophysical.modeledRootDepthCm} cm · Compaction Pan: ~{biophysical.modeledCompactionDepthCm} cm
            </div>
          </div>
        )}

        <div className="text-[9px] text-slate-500 leading-snug pt-0.5">
          Satellite inputs provide field/regional context, not plant-level measurements. Canopy, root depth, and stress values are biophysical model outputs.
        </div>
      </div>

      {/* TOP-RIGHT COMPARE, FULLSCREEN & CAMERA PRESET BUTTONS */}
      <div className="absolute top-3 right-3 flex flex-wrap justify-end items-center gap-1.5 max-w-[46%]">
        <button
          type="button"
          onClick={() => setCompareBaseline((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium border whitespace-nowrap transition-colors ${
            compareBaseline
              ? 'bg-amber-500 text-slate-950 border-amber-400'
              : 'bg-[#05080f]/92 text-slate-200 border-slate-700 hover:border-cyan-500/60'
          }`}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>{compareBaseline ? 'Showing Baseline (Before)' : 'Compare Before / After'}</span>
        </button>

        {compareBaseline && (
          <div className="bg-[#05080f]/94 border border-amber-500/40 rounded-lg px-2.5 py-1.5 text-[10px] font-mono tabular-nums text-amber-200 whitespace-nowrap">
            Scenario Δ Stress: {impact.waterStressIndex - baselineSnapshot.modeledWaterStressIndex >= 0 ? '+' : ''}
            {impact.waterStressIndex - baselineSnapshot.modeledWaterStressIndex}
          </div>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle 3D digital twin fullscreen"
          className="p-2 min-h-[34px] rounded-lg bg-[#05080f]/92 border border-slate-700 text-slate-200 hover:text-cyan-300"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* COLLAPSIBLE BOTTOM SCIENTIFIC CONTROL DOCK */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[96%] max-w-5xl flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-[#050914]/95 border border-b-0 border-[#32D9FF]/25 text-[11px] font-medium text-[#8CA2BD] hover:text-[#F4F8FF]"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show Twin Controls' : 'Hide Controls'}</span>
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#050914]/95 border border-[#32D9FF]/25 rounded-xl px-3.5 py-2.5 space-y-2.5">
            {/* Row 1: 6-Stage Seasonal Timeline + Play/Pause + Crop Species + Season Phase */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Timeline Scrubber + Stage Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingTimeline((v) => !v)}
                  aria-label={isPlayingTimeline ? 'Pause seasonal growth' : 'Play seasonal growth'}
                  className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                >
                  {isPlayingTimeline ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <input
                  type="range"
                  min={0.05}
                  max={1.0}
                  step={0.02}
                  value={growthProgress}
                  onChange={(e) => {
                    setIsPlayingTimeline(false);
                    setGrowthProgress(Number(e.target.value));
                  }}
                  aria-label="Seasonal crop growth stage scrubber"
                  className="w-24 sm:w-28 accent-emerald-400"
                />
                <div className="flex items-center gap-1 overflow-x-auto">
                  {GROWTH_STAGES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setIsPlayingTimeline(false);
                        setGrowthProgress(st.progress);
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                        biophysical.stage.id === st.id
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'bg-[#0a101d] text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      {st.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Crop Species & Season Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={speciesOverride}
                  onChange={(e) => setSpeciesOverride(e.target.value as CropSpeciesId | 'auto')}
                  aria-label="Select crop species model"
                  className="bg-[#0a101d] border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-100"
                >
                  <option value="auto">Crop: Auto ({inspectedSeason?.crop || 'Rotation'})</option>
                  <option value="jowar">Jowar (Sorghum)</option>
                  <option value="maize">Maize</option>
                  <option value="chickpea">Chickpea</option>
                  <option value="pigeon-pea">Pigeon Pea (Tur)</option>
                  <option value="groundnut">Groundnut</option>
                </select>

                <div className="flex items-center gap-0.5 bg-[#0a101d] border border-slate-800 rounded-lg p-0.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSeasonIdx(idx)}
                      className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap ${
                        activeSeasonIdx === idx
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      S{idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Camera Presets + Soil Cutaway + Irrigation + Rain */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/90 pt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => sceneApiRef.current?.setCameraPreset('overview')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0a101d] border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-500/60 whitespace-nowrap"
                >
                  <Eye className="w-3 h-3 text-cyan-400" />
                  <span>3D Orbit</span>
                </button>
                <button
                  type="button"
                  onClick={() => sceneApiRef.current?.setCameraPreset('top')}
                  className="px-2.5 py-1 rounded-lg bg-[#0a101d] border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-500/60 whitespace-nowrap"
                >
                  Top View
                </button>
                <button
                  type="button"
                  onClick={() => sceneApiRef.current?.setCameraPreset('side')}
                  className="px-2.5 py-1 rounded-lg bg-[#0a101d] border border-slate-700 text-[11px] text-slate-200 hover:border-cyan-500/60 whitespace-nowrap"
                >
                  Side View
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!soilCutaway) setSoilCutaway(true);
                    sceneApiRef.current?.setCameraPreset('cutaway');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#0a101d] border border-slate-700 text-[11px] text-amber-300 hover:border-amber-500/60 whitespace-nowrap"
                >
                  Inspect Soil &amp; Roots
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSoilCutaway((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition-colors ${
                    soilCutaway
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-[#0a101d] text-slate-300 border-slate-700'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>Soil Cutaway</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIrrigationActive((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition-colors ${
                    irrigationActive
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                      : 'bg-[#0a101d] text-slate-300 border-slate-700'
                  }`}
                >
                  <Droplets className="w-3 h-3" />
                  <span>Irrigation</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRainActive((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition-colors ${
                    rainActive
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                      : 'bg-[#0a101d] text-slate-300 border-slate-700'
                  }`}
                >
                  <CloudRain className="w-3 h-3" />
                  <span>{rainActive ? 'Rain Active' : 'Simulate Rain'}</span>
                </button>

                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 pl-1">
                  <Sun className="w-3 h-3 text-amber-400" />
                  {farm.areaHectares} ha
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

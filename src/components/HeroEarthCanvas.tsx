import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { Globe } from 'lucide-react';
import { FarmParcel } from '../types/fieldShift';
import { ESRI_HIGH_RES_BASEMAP } from '../utils/geoAndAgronomy';

interface HeroEarthCanvasProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  onSelectFarm: (farm: FarmParcel) => void;
  reducedMotion?: boolean;
}

const ORBIT_DEFS = [
  {
    id: 'sentinel-2a',
    label: 'SENTINEL-2A · 10 m Optical (Ref. Orbit)',
    inclinationDeg: 98.6,
    raanDeg: 42,
    altMeters: 786_000,
    speedRadPerSec: 0.09,
    color: '#32D9FF',
    phaseRad: 0.4,
  },
  {
    id: 'nasa-smap',
    label: 'NASA SMAP · 9 km Moisture (Ref. Orbit)',
    inclinationDeg: 98.1,
    raanDeg: 118,
    altMeters: 685_000,
    speedRadPerSec: 0.075,
    color: '#52E3A4',
    phaseRad: 2.1,
  },
  {
    id: 'nasa-gpm',
    label: 'NASA GPM · 10 km Precip (Ref. Orbit)',
    inclinationDeg: 65.0,
    raanDeg: 205,
    altMeters: 460_000,
    speedRadPerSec: 0.11,
    color: '#FFB84D',
    phaseRad: 4.0,
  },
];

function computeOrbitPointLonLat(
  uRad: number,
  inclinationDeg: number,
  raanDeg: number
): { lon: number; lat: number } {
  const inc = (inclinationDeg * Math.PI) / 180;
  const raan = (raanDeg * Math.PI) / 180;
  const xOrb = Math.cos(uRad);
  const yOrb = Math.sin(uRad);
  const x = Math.cos(raan) * xOrb - Math.sin(raan) * Math.cos(inc) * yOrb;
  const y = Math.sin(raan) * xOrb + Math.cos(raan) * Math.cos(inc) * yOrb;
  const z = Math.sin(inc) * yOrb;
  const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  return { lon, lat };
}

export const HeroEarthCanvas: React.FC<HeroEarthCanvasProps> = ({
  farms,
  activeFarm,
  onSelectFarm,
  reducedMotion = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const userInteractingRef = useRef(false);
  const farmsRef = useRef(farms);
  const onSelectFarmRef = useRef(onSelectFarm);
  const reducedMotionRef = useRef(reducedMotion);
  farmsRef.current = farms;
  onSelectFarmRef.current = onSelectFarm;
  reducedMotionRef.current = reducedMotion;

  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';

    let disposed = false;
    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;
    let rafId = 0;
    let initRafId = 0;
    let orbitSimTimeSec = 0;
    let lastFrameMs = performance.now();

    const initViewer = () => {
      if (disposed || viewerRef.current || !containerRef.current) return;
      const host = containerRef.current;
      if (host.clientWidth < 2 || host.clientHeight < 2) return;

      try {
        viewer = new Cesium.Viewer(host, {
          animation: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          vrButton: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          selectionIndicator: false,
          timeline: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          baseLayer: false,
          creditContainer: document.createElement('div'),
          requestRenderMode: false,
          useDefaultRenderLoop: false,
          showRenderLoopErrors: false,
        });

        const esriSatellite = new Cesium.UrlTemplateImageryProvider({
          url: ESRI_HIGH_RES_BASEMAP.url,
          maximumLevel: 14,
          credit: ESRI_HIGH_RES_BASEMAP.attribution,
        });
        viewer.imageryLayers.addImageryProvider(esriSatellite);

        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#050914');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#081326');
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.enableLighting = false;
        if (viewer.scene.skyAtmosphere) {
          viewer.scene.skyAtmosphere.hueShift = -0.04;
          viewer.scene.skyAtmosphere.saturationShift = 0.16;
          viewer.scene.skyAtmosphere.brightnessShift = 0.08;
        }

        // Add subtle reference satellite orbit paths + animated satellite markers
        ORBIT_DEFS.forEach((orb) => {
          const pts: number[] = [];
          for (let step = 0; step <= 90; step++) {
            const u = (step / 90) * Math.PI * 2;
            const { lon, lat } = computeOrbitPointLonLat(u, orb.inclinationDeg, orb.raanDeg);
            pts.push(lon, lat, orb.altMeters);
          }
          viewer!.entities.add({
            id: `hero-orbit-ring-${orb.id}`,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights(pts),
              width: 1.4,
              material: Cesium.Color.fromCssColorString(orb.color).withAlpha(0.32),
            },
          });

          const startPos = computeOrbitPointLonLat(orb.phaseRad, orb.inclinationDeg, orb.raanDeg);
          viewer!.entities.add({
            id: `hero-sat-${orb.id}`,
            position: Cesium.Cartesian3.fromDegrees(startPos.lon, startPos.lat, orb.altMeters),
            point: {
              pixelSize: 7,
              color: Cesium.Color.fromCssColorString(orb.color),
              outlineColor: Cesium.Color.fromCssColorString('#050914'),
              outlineWidth: 2,
            },
            label: {
              text: orb.label.split('·')[0].trim(),
              font: '600 10px "JetBrains Mono", monospace',
              fillColor: Cesium.Color.fromCssColorString(orb.color),
              outlineColor: Cesium.Color.fromCssColorString('#050914'),
              outlineWidth: 3,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cesium.Cartesian2(0, -14),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 32_000_000),
            },
          });
        });

        // Position camera showcasing Karnataka / Afro-Eurasian agricultural arc shifted slightly right so left hero copy stays uncluttered
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(58.0, 14.5, 13_800_000),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-87),
            roll: 0,
          },
        });

        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(() => {
          userInteractingRef.current = true;
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
        handler.setInputAction(() => {
          window.setTimeout(() => {
            userInteractingRef.current = false;
          }, 3500);
        }, Cesium.ScreenSpaceEventType.LEFT_UP);

        handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          const picked = viewer.scene.pick(click.position);
          if (Cesium.defined(picked) && typeof picked.id?.id === 'string') {
            const idStr = picked.id.id as string;
            if (idStr.startsWith('hero-farm-')) {
              const fid = idStr.replace('hero-farm-', '');
              const match = farmsRef.current.find((f) => f.id === fid);
              if (match) onSelectFarmRef.current(match);
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;

        const renderFrame = (nowMs: number) => {
          if (disposed || !viewer || viewer.isDestroyed()) return;
          const dt = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
          lastFrameMs = nowMs;

          const prefersReduced =
            reducedMotionRef.current ||
            (typeof window !== 'undefined' &&
              window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

          if (!prefersReduced) {
            orbitSimTimeSec += dt;
            if (!userInteractingRef.current) {
              viewer.scene.camera.rotateRight(0.038 * dt);
            }
            ORBIT_DEFS.forEach((orb) => {
              const ent = viewer?.entities.getById(`hero-sat-${orb.id}`);
              if (ent) {
                const u = orb.phaseRad + orbitSimTimeSec * orb.speedRadPerSec;
                const { lon, lat } = computeOrbitPointLonLat(u, orb.inclinationDeg, orb.raanDeg);
                ent.position = new Cesium.ConstantPositionProperty(
                  Cesium.Cartesian3.fromDegrees(lon, lat, orb.altMeters)
                );
              }
            });
          }

          const currentHost = containerRef.current;
          if (currentHost && currentHost.clientWidth >= 2 && currentHost.clientHeight >= 2) {
            const canvas = viewer.canvas;
            if (canvas && canvas.clientWidth >= 2 && canvas.clientHeight >= 2) {
              try {
                viewer.resize();
                if (
                  canvas.width > 0 &&
                  canvas.height > 0 &&
                  viewer.scene.drawingBufferWidth > 0 &&
                  viewer.scene.drawingBufferHeight > 0
                ) {
                  viewer.render();
                } else {
                  viewer.clock.tick();
                }
              } catch {
                // Ignore transient 0-size viewport resize frames
              }
            }
          }
          rafId = window.requestAnimationFrame(renderFrame);
        };
        rafId = window.requestAnimationFrame(renderFrame);
      } catch {
        setFallbackMode(true);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const rect = entries[0]?.contentRect;
      if (rect && rect.width >= 2 && rect.height >= 2) {
        if (!viewerRef.current) initViewer();
        else if (!viewerRef.current.isDestroyed()) viewerRef.current.resize();
      }
    });
    resizeObserver.observe(container);

    if (container.clientWidth >= 2 && container.clientHeight >= 2) initViewer();
    else initRafId = window.requestAnimationFrame(() => initViewer());

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (initRafId) window.cancelAnimationFrame(initRafId);
      resizeObserver.disconnect();
      if (handler && !handler.isDestroyed()) handler.destroy();
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Sync farm observation beacon markers
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const toRemove: string[] = [];
    viewer.entities.values.forEach((ent) => {
      if (ent.id.startsWith('hero-farm-')) toRemove.push(ent.id);
    });
    toRemove.forEach((id) => viewer.entities.removeById(id));

    farms.forEach((farm) => {
      const isActive = farm.id === activeFarm.id;
      viewer.entities.add({
        id: `hero-farm-${farm.id}`,
        position: Cesium.Cartesian3.fromDegrees(farm.center.lon, farm.center.lat, 8_000),
        point: {
          pixelSize: isActive ? 13 : 8,
          color: Cesium.Color.fromCssColorString(isActive ? '#52E3A4' : '#32D9FF'),
          outlineColor: Cesium.Color.fromCssColorString('#050914'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: isActive ? `▶ ${farm.name}` : farm.district || farm.name,
          font: isActive
            ? '600 12px "Chakra Petch", sans-serif'
            : '500 10px "Plus Jakarta Sans", sans-serif',
          fillColor: Cesium.Color.fromCssColorString(isActive ? '#52E3A4' : '#F4F8FF'),
          outlineColor: Cesium.Color.fromCssColorString('#050914'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 18_500_000),
        },
      });
    });
  }, [farms, activeFarm.id]);

  if (fallbackMode) {
    return (
      <div className="absolute inset-0 bg-[#050914] flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-center opacity-40">
          <Globe className="w-24 h-24 text-[#32D9FF]" />
          <span className="font-mono text-xs text-[#8CA2BD]">3D Planetary Canvas Initializing</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-label="Interactive 3D Earth with orbital reference tracks and farm observation beacons"
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
};

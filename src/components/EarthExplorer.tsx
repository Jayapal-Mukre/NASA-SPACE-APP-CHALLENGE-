import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import {
  Globe,
  Layers,
  Compass,
  Crosshair,
  Sun,
  Eye,
  AlertTriangle,
  Plus,
  Minus,
  Mountain,
  Map as MapIcon,
  Info,
} from 'lucide-react';
import {
  BasemapId,
  FarmParcel,
  GibsLayerId,
  ScientificOverlayId,
  Sentinel2CatalogResponse,
} from '../types/fieldShift';
import {
  ESRI_HIGH_RES_BASEMAP,
  SENTINEL2_NDVI_LEGEND,
  TERRAIN_ELEVATION_LAYER,
  calculateGeometryStats,
  ensureClosedRing,
  getGibsTileConfig,
  isPointInRing,
} from '../utils/geoAndAgronomy';
import { BoundaryEditorController } from '../utils/useBoundaryEditor';

interface EarthExplorerProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  editor: BoundaryEditorController;
  basemap: BasemapId;
  onChangeBasemap: (basemap: BasemapId) => void;
  overlay: ScientificOverlayId;
  onChangeOverlay: (overlay: ScientificOverlayId) => void;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  onSelectFarm: (farm: FarmParcel) => void;
  onSelectCoordinates: (lat: number, lon: number, label?: string) => void;
  onOpenPrecisionMap?: () => void;
}

function pickGlobeLonLat(
  viewer: Cesium.Viewer,
  screenPos: Cesium.Cartesian2
): [number, number] | null {
  const ray = viewer.camera.getPickRay(screenPos);
  let cartesian: Cesium.Cartesian3 | undefined;
  if (ray) {
    cartesian = viewer.scene.globe.pick(ray, viewer.scene);
  }
  if (!cartesian) {
    cartesian = viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid);
  }
  if (!cartesian) return null;
  const carto = Cesium.Cartographic.fromCartesian(cartesian);
  return [
    Number(Cesium.Math.toDegrees(carto.longitude).toFixed(6)),
    Number(Cesium.Math.toDegrees(carto.latitude).toFixed(6)),
  ];
}

export const EarthExplorer: React.FC<EarthExplorerProps> = ({
  farms,
  activeFarm,
  editor,
  basemap,
  onChangeBasemap,
  overlay,
  onChangeOverlay,
  sentinel2Catalog,
  onSelectFarm,
  onSelectCoordinates,
  onOpenPrecisionMap,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const basemapLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const overlayLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const labelLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const dynamicEntitiesRef = useRef<string[]>([]);

  const onSelectFarmRef = useRef(onSelectFarm);
  const onSelectCoordinatesRef = useRef(onSelectCoordinates);
  const farmsRef = useRef(farms);
  const editorRef = useRef(editor);

  const dragVertexIdxRef = useRef<number | null>(null);
  const moveOriginRef = useRef<[number, number] | null>(null);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [tileNotice, setTileNotice] = useState<string | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [inspectMode, setInspectMode] = useState(false);
  const [sunLighting, setSunLighting] = useState(false);
  const [nadirView, setNadirView] = useState(false);
  const [terrainEnabled, setTerrainEnabled] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.76);
  const inspectModeRef = useRef(inspectMode);

  onSelectFarmRef.current = onSelectFarm;
  onSelectCoordinatesRef.current = onSelectCoordinates;
  farmsRef.current = farms;
  editorRef.current = editor;
  inspectModeRef.current = inspectMode;

  const latestScene = sentinel2Catalog?.scenes?.[0] ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';

    let disposed = false;
    let viewer: Cesium.Viewer | null = null;
    let handler: Cesium.ScreenSpaceEventHandler | null = null;
    let rafId = 0;
    let initRafId = 0;
    let renderErrorRemove: Cesium.Event.RemoveCallback | null = null;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setTileNotice('WebGL context paused; waiting to restore 3D Earth renderer.');
    };

    const handleContextRestored = () => {
      setTileNotice(null);
      if (viewer && !viewer.isDestroyed()) {
        viewer.resize();
      }
    };

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

        viewer.canvas.addEventListener('webglcontextlost', handleContextLost);
        viewer.canvas.addEventListener('webglcontextrestored', handleContextRestored);

        renderErrorRemove = viewer.scene.renderError.addEventListener((_scene, err) => {
          const msg = err instanceof Error ? err.message : String(err ?? '');
          if (
            msg.includes('Expected width to be greater than 0') ||
            msg.includes('Expected height to be greater than 0')
          ) {
            return;
          }
          setWebglError(msg || '3D WebGL Earth rendering encountered an error.');
        });

        const esriSatellite = new Cesium.UrlTemplateImageryProvider({
          url: ESRI_HIGH_RES_BASEMAP.url,
          maximumLevel: ESRI_HIGH_RES_BASEMAP.maxZoom,
          credit: ESRI_HIGH_RES_BASEMAP.attribution,
        });
        esriSatellite.errorEvent.addEventListener(() => {
          setTileNotice('High-resolution imagery tile delay detected; check network access.');
        });
        viewer.imageryLayers.addImageryProvider(esriSatellite);

        const referenceLabels = new Cesium.UrlTemplateImageryProvider({
          url: ESRI_HIGH_RES_BASEMAP.labelsUrl,
          maximumLevel: 16,
        });
        const labelLayer = viewer.imageryLayers.addImageryProvider(referenceLabels);
        labelLayer.alpha = 0.72;
        labelLayerRef.current = labelLayer;

        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#05080f');
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#08101e');
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.globe.depthTestAgainstTerrain = true;

        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

        // Disable Cesium default double-click entity zoom while editing/drawing
        handler.setInputAction(() => {
          // Intentionally absorbed when not probing
        }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

        handler.setInputAction((down: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          const ed = editorRef.current;

          if (ed.editorTool === 'edit') {
            const picked = viewer.scene.pick(down.position);
            if (Cesium.defined(picked) && typeof picked.id?.id === 'string') {
              const idStr = picked.id.id as string;
              if (idStr.startsWith('edit-vertex-')) {
                const idx = Number(idStr.replace('edit-vertex-', ''));
                if (Number.isInteger(idx)) {
                  dragVertexIdxRef.current = idx;
                  viewer.scene.screenSpaceCameraController.enableInputs = false;
                  ed.beginHistoryCheckpoint();
                  ed.setSelectedVertexIdx(idx);
                  return;
                }
              }
            }
          }

          if (ed.editorTool === 'move') {
            const pt = pickGlobeLonLat(viewer, down.position);
            if (pt && isPointInRing(pt, ed.activeRing)) {
              moveOriginRef.current = pt;
              viewer.scene.screenSpaceCameraController.enableInputs = false;
              ed.beginHistoryCheckpoint();
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

        handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          const pt = pickGlobeLonLat(viewer, movement.endPosition);
          if (pt) {
            setHoverCoords({ lat: Number(pt[1].toFixed(4)), lon: Number(pt[0].toFixed(4)) });
          } else {
            setHoverCoords(null);
          }

          if (dragVertexIdxRef.current !== null && pt) {
            editorRef.current.updateActiveVertex(dragVertexIdxRef.current, pt, false);
          } else if (moveOriginRef.current && pt) {
            const [origLon, origLat] = moveOriginRef.current;
            editorRef.current.moveActivePolygonByDelta(pt[0] - origLon, pt[1] - origLat, false);
          }
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        handler.setInputAction((up: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          if (dragVertexIdxRef.current !== null) {
            const pt = pickGlobeLonLat(viewer, up.position);
            if (pt) {
              editorRef.current.updateActiveVertex(dragVertexIdxRef.current, pt, true);
            }
            dragVertexIdxRef.current = null;
            viewer.scene.screenSpaceCameraController.enableInputs = true;
          }
          if (moveOriginRef.current) {
            const pt = pickGlobeLonLat(viewer, up.position);
            const [origLon, origLat] = moveOriginRef.current;
            moveOriginRef.current = null;
            viewer.scene.screenSpaceCameraController.enableInputs = true;
            if (pt) {
              editorRef.current.moveActivePolygonByDelta(pt[0] - origLon, pt[1] - origLat, true);
            } else {
              editorRef.current.moveActivePolygonByDelta(0, 0, true);
            }
          }
        }, Cesium.ScreenSpaceEventType.LEFT_UP);

        handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
          if (!viewer || viewer.isDestroyed()) return;
          const ed = editorRef.current;
          const pt = pickGlobeLonLat(viewer, click.position);

          if (ed.editorTool === 'draw-farm' || ed.editorTool === 'draw-zone') {
            if (pt) ed.addDrawPoint(pt);
            return;
          }
          if (ed.editorTool === 'add-vertex') {
            if (pt) ed.insertVertexAtPoint(pt, true);
            return;
          }
          if (ed.editorTool === 'delete-vertex') {
            const picked = viewer.scene.pick(click.position);
            if (Cesium.defined(picked) && typeof picked.id?.id === 'string') {
              const idStr = picked.id.id as string;
              if (idStr.startsWith('edit-vertex-')) {
                const idx = Number(idStr.replace('edit-vertex-', ''));
                if (Number.isInteger(idx)) ed.deleteVertexAtIndex(idx);
              }
            }
            return;
          }

          if (ed.editorTool === 'select') {
            const picked = viewer.scene.pick(click.position);
            if (Cesium.defined(picked) && typeof picked.id?.id === 'string') {
              const idStr = picked.id.id as string;
              if (idStr.startsWith('farm-pin-') || idStr.startsWith('farm-poly-')) {
                const farmId = idStr.replace('farm-pin-', '').replace('farm-poly-', '');
                const found = farmsRef.current.find((f) => f.id === farmId);
                if (found) {
                  onSelectFarmRef.current(found);
                  return;
                }
              }
              if (idStr.startsWith('zone-poly-')) {
                const zid = idStr.replace('zone-poly-', '');
                ed.setEditingTarget({ type: 'zone', zoneId: zid });
                return;
              }
            }
          }

          if (inspectModeRef.current && pt) {
            onSelectCoordinatesRef.current(Number(pt[1].toFixed(4)), Number(pt[0].toFixed(4)));
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;
        setViewerReady(true);

        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(activeFarm.center.lon, activeFarm.center.lat, 12500),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-52),
            roll: 0,
          },
          duration: 1.4,
        });

        const renderFrame = () => {
          if (disposed || !viewer || viewer.isDestroyed()) return;
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
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (
                  !msg.includes('Expected width to be greater than 0') &&
                  !msg.includes('Expected height to be greater than 0')
                ) {
                  setWebglError(msg || 'Unable to render 3D WebGL Earth Explorer.');
                  return;
                }
              }
            }
          }
          rafId = window.requestAnimationFrame(renderFrame);
        };
        rafId = window.requestAnimationFrame(renderFrame);
      } catch (err) {
        setWebglError(err instanceof Error ? err.message : 'Unable to initialize 3D WebGL Earth Explorer.');
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const entry = entries[0];
      const w = entry?.contentRect?.width ?? container.clientWidth;
      const h = entry?.contentRect?.height ?? container.clientHeight;
      if (w >= 2 && h >= 2) {
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
      if (renderErrorRemove) {
        renderErrorRemove();
        renderErrorRemove = null;
      }
      if (handler && !handler.isDestroyed()) handler.destroy();
      if (viewer && !viewer.isDestroyed()) {
        viewer.canvas.removeEventListener('webglcontextlost', handleContextLost);
        viewer.canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        viewer.destroy();
      }
      viewerRef.current = null;
      basemapLayerRef.current = null;
      overlayLayerRef.current = null;
      labelLayerRef.current = null;
      setViewerReady(false);
    };
  }, []);

  // Load or toggle real 3D ArcGIS WorldElevation3D Terrain
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    let cancelled = false;
    if (!terrainEnabled) {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
      return;
    }

    Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_ELEVATION_LAYER.cesiumTerrainUrl)
      .then((provider) => {
        if (!cancelled && viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.terrainProvider = provider;
        }
      })
      .catch(() => {
        if (!cancelled && viewerRef.current && !viewerRef.current.isDestroyed()) {
          viewerRef.current.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [terrainEnabled, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.globe.enableLighting = sunLighting;
  }, [sunLighting, viewerReady]);

  // Synchronize ALL farm pins/polygons, active draftFarm, zones, vertex handles & draw preview
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    for (const id of dynamicEntitiesRef.current) {
      const e = viewer.entities.getById(id);
      if (e) viewer.entities.remove(e);
    }
    const createdIds: string[] = [];
    const register = (entity: Cesium.Entity.ConstructorOptions & { id: string }) => {
      viewer.entities.add(entity);
      createdIds.push(entity.id);
    };

    // 1. All farms (pins + polygons)
    farms.forEach((f) => {
      const isCurrent = f.id === editor.draftFarm.id;
      const ring = ensureClosedRing(isCurrent ? editor.draftFarm.boundary : f.boundary);
      const center = isCurrent ? editor.draftFarm.center : f.center;

      register({
        id: `farm-pin-${f.id}`,
        position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 0),
        point: {
          pixelSize: isCurrent ? 12 : 9,
          color: isCurrent
            ? Cesium.Color.fromCssColorString('#34d399')
            : Cesium.Color.fromCssColorString('#06b6d4'),
          outlineColor: Cesium.Color.fromCssColorString('#05080f'),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: isCurrent ? editor.draftFarm.name : f.name,
          font: '600 12px "Plus Jakarta Sans", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#f8fafc'),
          outlineColor: Cesium.Color.fromCssColorString('#05080f'),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6_500_000),
        },
      });

      if (ring.length >= 4) {
        const flat: number[] = [];
        ring.forEach(([lon, lat]) => flat.push(lon, lat));
        register({
          id: `farm-poly-${f.id}`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
            material: isCurrent
              ? Cesium.Color.fromCssColorString(editor.validationError ? '#f43f5e' : '#06b6d4').withAlpha(0.24)
              : Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.14),
          },
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: isCurrent ? 3.5 : 1.8,
            material: Cesium.Color.fromCssColorString(
              editor.validationError && isCurrent
                ? '#f43f5e'
                : isCurrent
                  ? '#32D9FF'
                  : '#52E3A4'
            ),
            clampToGround: true,
          },
        });
      }
    });

    // 2. Child zones of active draftFarm
    (editor.draftFarm.zones || []).forEach((z) => {
      const zRing = ensureClosedRing(z.boundary);
      if (zRing.length < 4) return;
      const flat: number[] = [];
      zRing.forEach(([lon, lat]) => flat.push(lon, lat));
      const isSelected = editor.editingTarget.type === 'zone' && editor.editingTarget.zoneId === z.id;
      register({
        id: `zone-poly-${z.id}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
          material: Cesium.Color.fromCssColorString(z.color).withAlpha(isSelected ? 0.36 : 0.2),
        },
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(flat),
          width: isSelected ? 3.2 : 1.8,
          material: Cesium.Color.fromCssColorString(isSelected ? '#FFB84D' : z.color),
          clampToGround: true,
        },
      });
    });

    // 3. Corner vertex handles when editing or deleting vertices
    if (
      editor.editorTool === 'edit' ||
      editor.editorTool === 'delete-vertex' ||
      editor.editorTool === 'add-vertex'
    ) {
      editor.openVertices.forEach(([lon, lat], idx) => {
        const isSel = editor.selectedVertexIdx === idx;
        const isDel = editor.editorTool === 'delete-vertex';
        register({
          id: `edit-vertex-${idx}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          point: {
            pixelSize: isSel ? 13 : 10,
            color: Cesium.Color.fromCssColorString(
              isDel ? '#f43f5e' : isSel ? '#FFB84D' : '#52E3A4'
            ),
            outlineColor: Cesium.Color.fromCssColorString('#050914'),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });
    }

    // 4. Draft drawing points/polygon preview
    if (editor.editorTool === 'draw-farm' || editor.editorTool === 'draw-zone') {
      editor.drawPoints.forEach(([lon, lat], idx) => {
        register({
          id: `draw-pt-${idx}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString('#fbbf24'),
            outlineColor: Cesium.Color.fromCssColorString('#05080f'),
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      });
      if (editor.drawPoints.length >= 2) {
        const linePts =
          editor.drawPoints.length >= 3
            ? [...editor.drawPoints, editor.drawPoints[0]]
            : editor.drawPoints;
        const flat: number[] = [];
        linePts.forEach(([lon, lat]) => flat.push(lon, lat));
        register({
          id: 'draw-preview-line',
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(flat),
            width: 3,
            material: Cesium.Color.fromCssColorString('#fbbf24'),
            clampToGround: true,
          },
        });
        if (editor.drawPoints.length >= 3) {
          register({
            id: 'draw-preview-poly',
            polygon: {
              hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
              material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.24),
            },
          });
        }
      }
    }

    dynamicEntitiesRef.current = createdIds;
  }, [
    viewerReady,
    farms,
    editor.draftFarm,
    editor.editingTarget,
    editor.editorTool,
    editor.openVertices,
    editor.selectedVertexIdx,
    editor.drawPoints,
    editor.validationError,
  ]);

  // Camera flight when switching activeFarm.id or clicking Reset View
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(activeFarm.center.lon, activeFarm.center.lat, 5500),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(nadirView ? -88 : -54),
        roll: 0,
      },
      duration: 1.2,
    });
  }, [activeFarm.id, editor.resetViewNonce, viewerReady]);

  // Update visual basemap & scientific overlay layers cleanly below labels
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    setTileNotice(null);

    if (basemapLayerRef.current) {
      viewer.imageryLayers.remove(basemapLayerRef.current, true);
      basemapLayerRef.current = null;
    }
    if (overlayLayerRef.current) {
      viewer.imageryLayers.remove(overlayLayerRef.current, true);
      overlayLayerRef.current = null;
    }

    const insertIdx = labelLayerRef.current
      ? viewer.imageryLayers.indexOf(labelLayerRef.current)
      : viewer.imageryLayers.length;

    let baseAddedOffset = 0;
    if (basemap === 'sentinel2-true-color' && latestScene) {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: latestScene.trueColorTileUrl,
        maximumLevel: 14,
        credit: 'Copernicus Sentinel-2 L2A / Planetary Computer',
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, Math.max(1, insertIdx));
      layer.alpha = 0.94;
      basemapLayerRef.current = layer;
      baseAddedOffset = 1;
    } else if (basemap === 'modis-true-color') {
      const cfg = getGibsTileConfig('true-color');
      if (cfg) {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: cfg.url,
          maximumLevel: cfg.maxZoom,
          credit: cfg.attribution,
        });
        const layer = viewer.imageryLayers.addImageryProvider(provider, Math.max(1, insertIdx));
        layer.alpha = 0.92;
        basemapLayerRef.current = layer;
        baseAddedOffset = 1;
      }
    } else if (basemap === 'terrain-hillshade') {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: TERRAIN_ELEVATION_LAYER.hillshadeUrl,
        maximumLevel: TERRAIN_ELEVATION_LAYER.maxZoom,
        credit: TERRAIN_ELEVATION_LAYER.attribution,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, Math.max(1, insertIdx));
      layer.alpha = 0.88;
      basemapLayerRef.current = layer;
      baseAddedOffset = 1;
    }

    const overlayIdx = Math.max(1, insertIdx + baseAddedOffset);
    if (overlay === 'sentinel2-ndvi' && latestScene) {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: latestScene.ndviTileUrl,
        maximumLevel: 14,
        credit: 'Copernicus Sentinel-2 L2A NDVI / Planetary Computer',
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, overlayIdx);
      layer.alpha = overlayOpacity;
      overlayLayerRef.current = layer;
    } else if (overlay === 'terrain-hillshade') {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: TERRAIN_ELEVATION_LAYER.hillshadeUrl,
        maximumLevel: TERRAIN_ELEVATION_LAYER.maxZoom,
        credit: TERRAIN_ELEVATION_LAYER.attribution,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, overlayIdx);
      layer.alpha = overlayOpacity;
      overlayLayerRef.current = layer;
    } else if (overlay !== 'none' && overlay !== 'sentinel2-ndvi') {
      const cfg = getGibsTileConfig(overlay as GibsLayerId);
      if (cfg) {
        const provider = new Cesium.UrlTemplateImageryProvider({
          url: cfg.url,
          maximumLevel: cfg.maxZoom,
          credit: cfg.attribution,
        });
        provider.errorEvent.addEventListener(() => {
          setTileNotice(`NASA GIBS (${cfg.productId}) tile outside zoom/coverage window.`);
        });
        const layer = viewer.imageryLayers.addImageryProvider(provider, overlayIdx);
        layer.alpha = overlayOpacity;
        overlayLayerRef.current = layer;
      }
    }
  }, [basemap, overlay, latestScene?.id, viewerReady]);

  useEffect(() => {
    if (overlayLayerRef.current) {
      overlayLayerRef.current.alpha = overlayOpacity;
    }
  }, [overlayOpacity]);

  const flyToPreset = (preset: 'global' | 'karnataka' | 'district' | 'parcel') => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    if (preset === 'global') {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(editor.draftFarm.center.lon, editor.draftFarm.center.lat, 9_500_000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-89), roll: 0 },
        duration: 1.5,
      });
    } else if (preset === 'karnataka') {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(76.4, 14.9, 1_350_000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-82), roll: 0 },
        duration: 1.4,
      });
    } else if (preset === 'district') {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(editor.draftFarm.center.lon, editor.draftFarm.center.lat, 75_000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(nadirView ? -88 : -58), roll: 0 },
        duration: 1.3,
      });
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(editor.draftFarm.center.lon, editor.draftFarm.center.lat, 3_200),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(nadirView ? -88 : -48), roll: 0 },
        duration: 1.2,
      });
    }
  };

  const togglePitchMode = () => {
    const next = !nadirView;
    setNadirView(next);
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(editor.draftFarm.center.lon, editor.draftFarm.center.lat, 5_500),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(next ? -88 : -50), roll: 0 },
      duration: 1.0,
    });
  };

  const adjustZoom = (zoomIn: boolean) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const height = viewer.camera.positionCartographic.height;
    const step = Math.max(350, height * 0.35);
    if (zoomIn) viewer.camera.zoomIn(step);
    else viewer.camera.zoomOut(step);
  };

  const activeLayerMeta = useMemo(() => {
    if (overlay === 'sentinel2-ndvi') {
      return {
        label: 'Vegetation Analysis · Sentinel-2 NDVI',
        resolution: '10 m native',
        cadence: latestScene ? `${latestScene.date} · ${latestScene.cloudCoverPct}% cloud` : 'Querying scene',
        limitation: 'Requires cloud-free optical pass; 10 m pixel grid.',
        legend: SENTINEL2_NDVI_LEGEND,
      };
    }
    if (overlay === 'ndvi' || overlay === 'soil-moisture' || overlay === 'precipitation') {
      const cfg = getGibsTileConfig(overlay);
      if (cfg) {
        return {
          label: cfg.label,
          resolution: cfg.resolution,
          cadence: cfg.cadence,
          limitation: cfg.limitation,
          legend: cfg.legend,
        };
      }
    }
    if (overlay === 'terrain-hillshade' || basemap === 'terrain-hillshade') {
      return {
        label: TERRAIN_ELEVATION_LAYER.label,
        resolution: TERRAIN_ELEVATION_LAYER.resolution,
        cadence: TERRAIN_ELEVATION_LAYER.observationDate,
        limitation: TERRAIN_ELEVATION_LAYER.limitation,
      };
    }
    if (basemap === 'sentinel2-true-color') {
      return {
        label: 'Copernicus Sentinel-2 L2A True Colour',
        resolution: '10 m native',
        cadence: latestScene ? `${latestScene.date} · ${latestScene.cloudCoverPct}% cloud` : 'Scene lookup',
        limitation: '10 m regional optical pass; individual plants are sub-pixel.',
      };
    }
    if (basemap === 'modis-true-color') {
      const cfg = getGibsTileConfig('true-color')!;
      return {
        label: cfg.label,
        resolution: cfg.resolution,
        cadence: cfg.cadence,
        limitation: cfg.limitation,
        legend: cfg.legend,
      };
    }
    return {
      label: ESRI_HIGH_RES_BASEMAP.label,
      resolution: ESRI_HIGH_RES_BASEMAP.resolution,
      cadence: ESRI_HIGH_RES_BASEMAP.observationDate,
      limitation: ESRI_HIGH_RES_BASEMAP.limitation,
    };
  }, [basemap, overlay, latestScene]);

  const activeStats = calculateGeometryStats(editor.activeRing);
  const cursorClass =
    inspectMode || editor.editorTool === 'draw-farm' || editor.editorTool === 'draw-zone' || editor.editorTool === 'add-vertex'
      ? 'cursor-crosshair'
      : 'cursor-grab active:cursor-grabbing';

  return (
    <div className="relative w-full h-[600px] lg:h-[680px] min-h-[520px] min-w-0 rounded-xl overflow-hidden border border-[#32D9FF]/20 bg-[#050914]">
      <div ref={containerRef} className={`w-full h-full min-h-[520px] ${cursorClass}`} />

      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070b14] p-6 text-center">
          <Globe className="w-10 h-10 text-cyan-400 mb-3" />
          <p className="text-sm font-medium text-slate-200">3D Globe Renderer Unavailable</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">{webglError}</p>
        </div>
      )}

      {/* Top-Left Telemetry & Layer Disclosure HUD */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5 mission-glass rounded-xl px-3.5 py-2.5 max-w-[300px] sm:max-w-xs shadow-xl">
        <div className="flex items-center gap-2 text-xs text-[#32D9FF] font-medium">
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">CesiumJS 3D Earth · {terrainEnabled ? '3D DEM' : 'Ellipsoid'}</span>
        </div>
        <div className="text-sm font-semibold text-slate-100 truncate">{editor.draftFarm.name}</div>
        <div className="text-[11px] font-mono tabular-nums text-slate-300">
          {activeStats.center.lat.toFixed(4)}° N, {activeStats.center.lon.toFixed(4)}° E · {activeStats.areaHectares} ha ({activeStats.areaAcres} ac)
        </div>

        <div className="border-t border-slate-800/90 pt-1.5 mt-0.5 space-y-1">
          <div className="text-[11px] text-emerald-300 font-medium truncate">{activeLayerMeta.label}</div>
          <div className="text-[10px] font-mono text-slate-300">
            Res {activeLayerMeta.resolution} · {activeLayerMeta.cadence}
          </div>
          {activeLayerMeta.legend && (
            <div className="flex items-center gap-1 pt-0.5">
              {activeLayerMeta.legend.stops.map((stop) => (
                <div key={stop.label} className="flex-1 flex flex-col gap-0.5">
                  <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: stop.color }} />
                  <span className="text-[9px] font-mono text-slate-300 truncate">{stop.label}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-start gap-1 text-[10px] text-slate-400 leading-snug pt-0.5">
            <Info className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
            <span>{activeLayerMeta.limitation}</span>
          </div>
        </div>

        {tileNotice && (
          <div className="flex items-center gap-1.5 text-[10px] text-amber-300 pt-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{tileNotice}</span>
          </div>
        )}
      </div>

      {/* Top-Right Scale Navigation Presets & Camera Controls */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 max-w-[60%] sm:max-w-none">
        <div className="flex flex-wrap justify-end items-center gap-1 mission-glass rounded-lg p-1 shadow-xl">
          {[
            { id: 'global' as const, label: 'Global Earth' },
            { id: 'karnataka' as const, label: 'Karnataka' },
            { id: 'district' as const, label: 'District' },
            { id: 'parcel' as const, label: 'Farm Parcel' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => flyToPreset(preset.id)}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-200 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-end items-center gap-1.5">
          <button
            type="button"
            onClick={() => setInspectMode((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium border backdrop-blur-md transition-colors whitespace-nowrap shrink-0 ${
              inspectMode
                ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                : 'bg-[#05080f]/86 text-slate-200 border-slate-700/80 hover:border-cyan-500/60'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{inspectMode ? 'Click Globe' : 'Probe Point'}</span>
          </button>

          <button
            type="button"
            onClick={togglePitchMode}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium bg-[#05080f]/86 backdrop-blur-md text-slate-200 border border-slate-700/80 hover:border-cyan-500/60 whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>{nadirView ? '3D Oblique' : 'Nadir View'}</span>
          </button>

          <button
            type="button"
            onClick={() => setTerrainEnabled((v) => !v)}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium border backdrop-blur-md whitespace-nowrap shrink-0 ${
              terrainEnabled
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-[#05080f]/86 text-slate-300 border-slate-700/80'
            }`}
          >
            <Mountain className="w-3.5 h-3.5" />
            <span>3D Terrain</span>
          </button>

          <button
            type="button"
            onClick={() => setSunLighting((v) => !v)}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium border backdrop-blur-md whitespace-nowrap shrink-0 ${
              sunLighting
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                : 'bg-[#05080f]/86 text-slate-200 border-slate-700/80 hover:border-amber-500/50'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>Solar</span>
          </button>

          {onOpenPrecisionMap && (
            <button
              type="button"
              onClick={onOpenPrecisionMap}
              className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 whitespace-nowrap shrink-0"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Precision Map</span>
            </button>
          )}

          <div className="flex items-center rounded-lg overflow-hidden border border-slate-700/80 bg-[#05080f]/86 backdrop-blur-md">
            <button
              type="button"
              onClick={() => adjustZoom(true)}
              aria-label="Zoom in globe"
              className="p-2 min-h-[34px] text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 border-r border-slate-700/80"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(false)}
              aria-label="Zoom out globe"
              className="p-2 min-h-[34px] text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Aligned Layer Controls & Live Cursor Coordinates */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl mission-glass max-w-full shadow-xl">
          <div className="flex items-center gap-1.5 px-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] text-slate-400 whitespace-nowrap">Basemap:</span>
            <select
              value={basemap}
              onChange={(e) => onChangeBasemap(e.target.value as BasemapId)}
              aria-label="Select 3D globe basemap"
              className="bg-[#0A101D] border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-100"
            >
              <option value="esri-imagery">Esri High-Res (0.3–1 m)</option>
              <option value="sentinel2-true-color">Sentinel-2 True Color (10 m)</option>
              <option value="modis-true-color">NASA MODIS True Color (250 m)</option>
              <option value="terrain-hillshade">Terrain &amp; Hillshade (30 m)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-1.5 border-l border-slate-800">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">Overlay:</span>
            <select
              value={overlay}
              onChange={(e) => onChangeOverlay(e.target.value as ScientificOverlayId)}
              aria-label="Select 3D globe scientific overlay"
              className="bg-[#0A101D] border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-100"
            >
              <option value="none">None (Sharp Basemap)</option>
              <option value="sentinel2-ndvi">Sentinel-2 NDVI (10 m)</option>
              <option value="ndvi">NASA MODIS NDVI (250 m)</option>
              <option value="soil-moisture">NASA SMAP Soil Moisture (9 km)</option>
              <option value="precipitation">NASA GPM Precipitation (10 km)</option>
              <option value="terrain-hillshade">Terrain Hillshade (30 m)</option>
            </select>
          </div>

          {overlay !== 'none' && (
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              aria-label="3D overlay opacity"
              className="w-16 accent-emerald-400 mr-1"
            />
          )}
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#05080f]/90 backdrop-blur-md border border-slate-700/80 text-[11px] font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          {hoverCoords ? (
            <span>
              Cursor: {hoverCoords.lat.toFixed(4)}°, {hoverCoords.lon.toFixed(4)}°
            </span>
          ) : (
            <span>Drag to orbit · Scroll to zoom</span>
          )}
        </div>
      </div>
    </div>
  );
};

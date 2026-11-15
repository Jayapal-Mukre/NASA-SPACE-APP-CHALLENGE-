import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Search,
  Layers,
  MapPin,
  Plus,
  Minus,
  Compass,
  Maximize2,
  Minimize2,
  Mountain,
  SlidersHorizontal,
  GitCompare,
  Globe,
  ChevronDown,
  ChevronUp,
  LocateFixed,
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
  calculatePolygonAreaHectares,
  calculatePolygonPerimeterMeters,
  computePolygonBounds,
  ensureClosedRing,
  getGibsTileConfig,
  isPointInRing,
} from '../utils/geoAndAgronomy';
import { BoundaryEditorController } from '../utils/useBoundaryEditor';

const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';
maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

interface GeocodeResult {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  elevation: number;
}

interface SatelliteMapProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  editor: BoundaryEditorController;
  basemap: BasemapId;
  onChangeBasemap: (basemap: BasemapId) => void;
  overlay: ScientificOverlayId;
  onChangeOverlay: (overlay: ScientificOverlayId) => void;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  sentinel2Loading?: boolean;
  onSelectFarm: (farm: FarmParcel) => void;
  onSelectSearchLocation: (lat: number, lon: number, label: string, elevation?: number) => void;
  onOpenEarthGlobe?: () => void;
}

interface DatasetCardMeta {
  title: string;
  resolution: string;
  dateLabel: string;
  source: string;
  availability: string;
  limitation: string;
  legend?: { unit: string; stops: { color: string; label: string }[] };
}

export const SatelliteMap: React.FC<SatelliteMapProps> = ({
  farms,
  activeFarm,
  editor,
  basemap,
  onChangeBasemap,
  overlay,
  onChangeOverlay,
  sentinel2Catalog,
  sentinel2Loading = false,
  onSelectFarm,
  onSelectSearchLocation,
  onOpenEarthGlobe,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const compareContainerRef = useRef<HTMLDivElement | null>(null);
  const compareMapRef = useRef<maplibregl.Map | null>(null);

  const vertexMarkersRef = useRef<maplibregl.Marker[]>([]);
  const midpointMarkersRef = useRef<maplibregl.Marker[]>([]);

  const [layerDrawerOpen, setLayerDrawerOpen] = useState(true);
  const [basemapOpacity, setBasemapOpacity] = useState(1);
  const [overlayOpacity, setOverlayOpacity] = useState(0.76);
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0);

  const [is3DView, setIs3DView] = useState(false);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bearingDeg, setBearingDeg] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(15.4);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  const [compareMode, setCompareMode] = useState(false);
  const [compareBeforeIdx, setCompareBeforeIdx] = useState(1);
  const [compareAfterIdx, setCompareAfterIdx] = useState(0);
  const [compareProduct, setCompareProduct] = useState<'true-color' | 'ndvi'>('true-color');
  const [compareSplitPct, setCompareSplitPct] = useState(50);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const farmsRef = useRef(farms);
  farmsRef.current = farms;
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const onSelectFarmRef = useRef(onSelectFarm);
  onSelectFarmRef.current = onSelectFarm;
  const moveDragOriginRef = useRef<[number, number] | null>(null);
  const isDraggingVertexRef = useRef(false);

  const scenes = sentinel2Catalog?.scenes ?? [];
  const activeScene = scenes[Math.min(selectedSceneIdx, Math.max(0, scenes.length - 1))] ?? null;

  const isDrawing = editor.editorTool === 'draw-farm' || editor.editorTool === 'draw-zone';

  useEffect(() => {
    setSelectedSceneIdx(0);
    setCompareAfterIdx(0);
    setCompareBeforeIdx(scenes.length > 1 ? 1 : 0);
    if (scenes.length < 2) {
      setCompareMode(false);
    }
  }, [activeFarm.id, scenes.length]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(() => mapRef.current?.resize(), 120);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Initialize MapLibre Precision Map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        attributionControl: false,
        fadeDuration: 150,
        maxPitch: 75,
        style: {
          version: 8,
          sources: {
            'esri-satellite': {
              type: 'raster',
              tiles: [ESRI_HIGH_RES_BASEMAP.url],
              tileSize: 256,
              maxzoom: ESRI_HIGH_RES_BASEMAP.maxZoom,
              attribution: ESRI_HIGH_RES_BASEMAP.attribution,
            },
            'terrain-hillshade': {
              type: 'raster',
              tiles: [TERRAIN_ELEVATION_LAYER.hillshadeUrl],
              tileSize: 256,
              maxzoom: TERRAIN_ELEVATION_LAYER.maxZoom,
            },
            'aws-terrarium-dem': {
              type: 'raster-dem',
              tiles: [TERRAIN_ELEVATION_LAYER.terrariumDemUrl],
              tileSize: 256,
              maxzoom: 15,
              encoding: 'terrarium',
            },
            'esri-labels': {
              type: 'raster',
              tiles: [ESRI_HIGH_RES_BASEMAP.labelsUrl],
              tileSize: 256,
              maxzoom: 16,
            },
          },
          layers: [
            {
              id: 'esri-satellite-layer',
              type: 'raster',
              source: 'esri-satellite',
              minzoom: 0,
              maxzoom: 21,
              paint: { 'raster-opacity': 1, 'raster-resampling': 'linear' },
            },
            {
              id: 'terrain-hillshade-layer',
              type: 'raster',
              source: 'terrain-hillshade',
              minzoom: 0,
              maxzoom: 21,
              paint: { 'raster-opacity': 0 },
            },
            {
              id: 'esri-labels-layer',
              type: 'raster',
              source: 'esri-labels',
              minzoom: 0,
              maxzoom: 21,
              paint: { 'raster-opacity': 0.72 },
            },
          ],
        },
        center: [activeFarm.center.lon, activeFarm.center.lat],
        zoom: 15.4,
        pitch: 0,
      });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Unable to initialize MapLibre satellite viewer.');
      return;
    }

    map.on('error', (evt) => {
      const msg = evt?.error?.message || '';
      if (msg.toLowerCase().includes('worker') || msg.toLowerCase().includes('webgl')) {
        setMapError(msg);
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        map.resize();
      }
    });
    resizeObserver.observe(container);

    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // 1. All saved farms polygons (clickable to select)
      map.addSource('all-farms', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: farmsRef.current.map((f) => ({
            type: 'Feature',
            properties: {
              id: f.id,
              name: f.name,
              isActive: f.id === editorRef.current.draftFarm.id,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ensureClosedRing(f.boundary)],
            },
          })),
        },
      });

      map.addLayer({
        id: 'all-farms-fill',
        type: 'fill',
        source: 'all-farms',
        paint: {
          'fill-color': ['case', ['get', 'isActive'], '#10b981', '#0ea5e9'],
          'fill-opacity': ['case', ['get', 'isActive'], 0.04, 0.14],
        },
      });

      map.addLayer({
        id: 'all-farms-outline',
        type: 'line',
        source: 'all-farms',
        paint: {
          'line-color': ['case', ['get', 'isActive'], '#34d399', '#38bdf8'],
          'line-width': ['case', ['get', 'isActive'], 1.2, 2],
          'line-opacity': 0.85,
        },
      });

      // Farm center pins
      map.addSource('farm-pins', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: farmsRef.current.map((f) => ({
            type: 'Feature',
            properties: { id: f.id, name: f.name, isKarnataka: f.isKarnatakaDemo },
            geometry: { type: 'Point', coordinates: [f.center.lon, f.center.lat] },
          })),
        },
      });

      map.addLayer({
        id: 'farm-pins-circle',
        type: 'circle',
        source: 'farm-pins',
        paint: {
          'circle-radius': 6,
          'circle-color': ['case', ['get', 'isKarnataka'], '#10b981', '#06b6d4'],
          'circle-stroke-color': '#05080f',
          'circle-stroke-width': 2,
        },
      });

      // 2. Highlighted Active Farm Parcel Boundary (live draft)
      map.addSource('farm-parcel', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { hasError: false },
          geometry: {
            type: 'Polygon',
            coordinates: [ensureClosedRing(editorRef.current.draftFarm.boundary)],
          },
        },
      });

      map.addLayer({
        id: 'farm-parcel-fill',
        type: 'fill',
        source: 'farm-parcel',
        paint: {
          'fill-color': '#32D9FF',
          'fill-opacity': 0.14,
        },
      });

      map.addLayer({
        id: 'farm-parcel-glow',
        type: 'line',
        source: 'farm-parcel',
        paint: {
          'line-color': '#32D9FF',
          'line-width': 8,
          'line-blur': 4,
          'line-opacity': 0.34,
        },
      });

      map.addLayer({
        id: 'farm-parcel-casing',
        type: 'line',
        source: 'farm-parcel',
        paint: {
          'line-color': '#050914',
          'line-width': 4.8,
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'farm-parcel-outline',
        type: 'line',
        source: 'farm-parcel',
        paint: {
          'line-color': '#32D9FF',
          'line-width': 2.6,
        },
      });

      // 3. Child Zones inside active farm
      map.addSource('farm-zones', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'farm-zones-fill',
        type: 'fill',
        source: 'farm-zones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case', ['get', 'isSelected'], 0.34, 0.2],
        },
      });

      map.addLayer({
        id: 'farm-zones-outline',
        type: 'line',
        source: 'farm-zones',
        paint: {
          'line-color': ['case', ['get', 'isSelected'], '#facc15', ['get', 'color']],
          'line-width': ['case', ['get', 'isSelected'], 2.8, 1.6],
          'line-dasharray': [2, 1],
        },
      });

      // 4. Draft polygon preview during Draw Farm / Draw Zone
      map.addSource('draft-boundary', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'draft-boundary-fill',
        type: 'fill',
        source: 'draft-boundary',
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': 0.24,
        },
      });

      map.addLayer({
        id: 'draft-boundary-line',
        type: 'line',
        source: 'draft-boundary',
        paint: {
          'line-color': '#fbbf24',
          'line-width': 2.4,
          'line-dasharray': [2, 1.5],
        },
      });

      map.addLayer({
        id: 'draft-boundary-points',
        type: 'circle',
        source: 'draft-boundary',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#fbbf24',
          'circle-stroke-color': '#05080f',
          'circle-stroke-width': 2,
        },
      });

      // Click farm polygon or pin when in 'select' mode
      const handlePickFarm = (e: maplibregl.MapLayerMouseEvent) => {
        if (editorRef.current.editorTool !== 'select') return;
        const fid = e.features?.[0]?.properties?.id as string | undefined;
        if (!fid) return;
        const found = farmsRef.current.find((f) => f.id === fid);
        if (found) {
          onSelectFarmRef.current(found);
        }
      };

      map.on('click', 'all-farms-fill', handlePickFarm);
      map.on('click', 'farm-pins-circle', handlePickFarm);

      map.on('click', 'farm-zones-fill', (e: maplibregl.MapLayerMouseEvent) => {
        if (editorRef.current.editorTool !== 'select') return;
        const zid = e.features?.[0]?.properties?.id as string | undefined;
        if (zid) {
          editorRef.current.setEditingTarget({ type: 'zone', zoneId: zid });
        }
      });

      map.on('mouseenter', 'all-farms-fill', () => {
        if (editorRef.current.editorTool === 'select') map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'all-farms-fill', () => {
        if (editorRef.current.editorTool === 'select') map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'farm-pins-circle', () => {
        if (editorRef.current.editorTool === 'select') map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'farm-pins-circle', () => {
        if (editorRef.current.editorTool === 'select') map.getCanvas().style.cursor = '';
      });
    });

    // Cursor tracking + Move Farm interior drag
    map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      const lon = Number(e.lngLat.lng.toFixed(6));
      const lat = Number(e.lngLat.lat.toFixed(6));
      setCursorCoords({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });

      if (moveDragOriginRef.current && editorRef.current.editorTool === 'move') {
        const [origLon, origLat] = moveDragOriginRef.current;
        editorRef.current.moveActivePolygonByDelta(lon - origLon, lat - origLat, false);
      }
    });

    const startInteriorMove = (lngLat: maplibregl.LngLat, preventDefault: () => void) => {
      if (editorRef.current.editorTool !== 'move' || isDraggingVertexRef.current) return;
      const pt: [number, number] = [lngLat.lng, lngLat.lat];
      if (isPointInRing(pt, editorRef.current.activeRing)) {
        preventDefault();
        map.dragPan.disable();
        editorRef.current.beginHistoryCheckpoint();
        moveDragOriginRef.current = pt;
        map.getCanvas().style.cursor = 'grabbing';
      }
    };

    const finishInteriorMove = (lngLat?: maplibregl.LngLat) => {
      if (!moveDragOriginRef.current) return;
      const [origLon, origLat] = moveDragOriginRef.current;
      moveDragOriginRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = editorRef.current.editorTool === 'move' ? 'grab' : '';
      if (lngLat) {
        editorRef.current.moveActivePolygonByDelta(lngLat.lng - origLon, lngLat.lat - origLat, true);
      } else {
        editorRef.current.moveActivePolygonByDelta(0, 0, true);
      }
    };

    map.on('mousedown', (e: maplibregl.MapMouseEvent) => {
      startInteriorMove(e.lngLat, () => e.preventDefault());
    });
    map.on('mouseup', (e: maplibregl.MapMouseEvent) => {
      finishInteriorMove(e.lngLat);
    });
    map.on('touchstart', (e: maplibregl.MapTouchEvent) => {
      if (e.lngLat) startInteriorMove(e.lngLat, () => e.preventDefault());
    });
    map.on('touchend', (e: maplibregl.MapTouchEvent) => {
      finishInteriorMove(e.lngLat);
    });

    map.on('move', () => {
      setBearingDeg(Number(map.getBearing().toFixed(1)));
      setZoomLevel(Number(map.getZoom().toFixed(1)));
    });

    // Global map click: Draw Farm / Draw Zone / Add Vertex along edge
    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (isDraggingVertexRef.current || moveDragOriginRef.current) return;
      const tool = editorRef.current.editorTool;
      const pt: [number, number] = [
        Number(e.lngLat.lng.toFixed(6)),
        Number(e.lngLat.lat.toFixed(6)),
      ];
      if (tool === 'draw-farm' || tool === 'draw-zone') {
        editorRef.current.addDrawPoint(pt);
      } else if (tool === 'add-vertex') {
        editorRef.current.insertVertexAtPoint(pt, true);
      }
    });

    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      vertexMarkersRef.current.forEach((m) => m.remove());
      midpointMarkersRef.current.forEach((m) => m.remove());
      vertexMarkersRef.current = [];
      midpointMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Prevent doubleClickZoom conflicts when editing or drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (editor.editorTool === 'select') {
      map.doubleClickZoom.enable();
      map.dragPan.enable();
    } else {
      map.doubleClickZoom.disable();
    }
  }, [editor.editorTool]);

  // Keep all-farms, farm-pins, farm-parcel & farm-zones synchronized
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncSources = () => {
      const allFarmsSrc = map.getSource('all-farms') as maplibregl.GeoJSONSource | undefined;
      if (allFarmsSrc) {
        allFarmsSrc.setData({
          type: 'FeatureCollection',
          features: farms.map((f) => {
            const poly = f.id === editor.draftFarm.id ? editor.draftFarm.boundary : f.boundary;
            return {
              type: 'Feature',
              properties: {
                id: f.id,
                name: f.name,
                isActive: f.id === editor.draftFarm.id,
              },
              geometry: {
                type: 'Polygon',
                coordinates: [ensureClosedRing(poly)],
              },
            };
          }),
        });
      }

      const pinsSrc = map.getSource('farm-pins') as maplibregl.GeoJSONSource | undefined;
      if (pinsSrc) {
        pinsSrc.setData({
          type: 'FeatureCollection',
          features: farms.map((f) => ({
            type: 'Feature',
            properties: { id: f.id, name: f.name, isKarnataka: f.isKarnatakaDemo },
            geometry: { type: 'Point', coordinates: [f.center.lon, f.center.lat] },
          })),
        });
      }

      const parcelSrc = map.getSource('farm-parcel') as maplibregl.GeoJSONSource | undefined;
      if (parcelSrc) {
        parcelSrc.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [ensureClosedRing(editor.draftFarm.boundary)],
          },
        });
      }

      if (map.getLayer('farm-parcel-outline')) {
        map.setPaintProperty(
          'farm-parcel-outline',
          'line-color',
          editor.validationError ? '#f43f5e' : editor.editingTarget.type === 'farm' ? '#32D9FF' : '#52E3A4'
        );
      }

      const zonesSrc = map.getSource('farm-zones') as maplibregl.GeoJSONSource | undefined;
      if (zonesSrc) {
        zonesSrc.setData({
          type: 'FeatureCollection',
          features: (editor.draftFarm.zones || []).map((z) => ({
            type: 'Feature',
            properties: {
              id: z.id,
              name: z.name,
              color: z.color,
              isSelected: editor.editingTarget.type === 'zone' && editor.editingTarget.zoneId === z.id,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [ensureClosedRing(z.boundary)],
            },
          })),
        });
      }
    };

    if (map.isStyleLoaded()) {
      syncSources();
    } else {
      map.once('load', syncSources);
    }
  }, [farms, editor.draftFarm, editor.editingTarget, editor.validationError]);

  // Fit map when activeFarm changes or Reset View pressed
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = computePolygonBounds(activeFarm.boundary);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 96, bottom: 96, left: 80, right: 320 },
        maxZoom: 16.4,
        pitch: is3DView ? 48 : 0,
        duration: 950,
      });
    } else {
      map.flyTo({
        center: [activeFarm.center.lon, activeFarm.center.lat],
        zoom: 15.2,
        pitch: is3DView ? 48 : 0,
        duration: 950,
      });
    }
  }, [activeFarm.id, editor.resetViewNonce]);

  // Manage draggable vertex markers & edge midpoint handles
  useEffect(() => {
    const map = mapRef.current;
    vertexMarkersRef.current.forEach((m) => m.remove());
    midpointMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
    midpointMarkersRef.current = [];

    const showHandles =
      editor.editorTool === 'edit' ||
      editor.editorTool === 'delete-vertex' ||
      editor.editorTool === 'add-vertex';

    if (!map || !showHandles || editor.openVertices.length < 3) return;

    const verts = editor.openVertices;
    verts.forEach((coord, idx) => {
      const isSelected = editor.selectedVertexIdx === idx;
      const isDeleteMode = editor.editorTool === 'delete-vertex';
      const handleEl = document.createElement('div');
      handleEl.className = isDeleteMode
        ? 'w-4 h-4 rounded-full bg-rose-500 border-2 border-[#050914] shadow-md cursor-pointer hover:scale-125 transition-transform'
        : `w-4 h-4 rounded-sm border-2 border-[#050914] shadow-md cursor-grab active:cursor-grabbing transition-transform ${
            isSelected ? 'bg-[#FFB84D] scale-125' : 'bg-[#52E3A4] hover:scale-110'
          }`;
      handleEl.title = isDeleteMode
        ? `Click to delete corner #${idx + 1}`
        : `Corner #${idx + 1}: drag to reshape boundary`;

      // Isolate vertex pointer events from map drag/pan
      const stop = (ev: Event) => ev.stopPropagation();
      handleEl.addEventListener('mousedown', stop);
      handleEl.addEventListener('touchstart', stop, { passive: true });
      handleEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (editorRef.current.editorTool === 'delete-vertex') {
          editorRef.current.deleteVertexAtIndex(idx);
        } else {
          editorRef.current.setSelectedVertexIdx(idx);
        }
      });

      const marker = new maplibregl.Marker({
        element: handleEl,
        draggable: editor.editorTool === 'edit',
      })
        .setLngLat(coord)
        .addTo(map);

      if (editor.editorTool === 'edit') {
        marker.on('dragstart', () => {
          isDraggingVertexRef.current = true;
          map.dragPan.disable();
          editorRef.current.beginHistoryCheckpoint();
          editorRef.current.setSelectedVertexIdx(idx);
        });
        marker.on('drag', () => {
          const lngLat = marker.getLngLat();
          editorRef.current.updateActiveVertex(idx, [lngLat.lng, lngLat.lat], false);
        });
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          editorRef.current.updateActiveVertex(idx, [lngLat.lng, lngLat.lat], true);
          map.dragPan.enable();
          setTimeout(() => {
            isDraggingVertexRef.current = false;
          }, 40);
        });
      }

      vertexMarkersRef.current.push(marker);
    });

    // Edge midpoint '+' handles in edit / add-vertex mode
    if (editor.editorTool === 'edit' || editor.editorTool === 'add-vertex') {
      verts.forEach((a, idx) => {
        const b = verts[(idx + 1) % verts.length];
        const midLon = Number(((a[0] + b[0]) / 2).toFixed(6));
        const midLat = Number(((a[1] + b[1]) / 2).toFixed(6));

        const midEl = document.createElement('button');
        midEl.type = 'button';
        midEl.textContent = '+';
        midEl.className =
          'w-4 h-4 rounded-full bg-cyan-400/90 text-[#05080f] text-[11px] font-bold leading-none flex items-center justify-center border border-[#05080f] shadow cursor-pointer hover:bg-cyan-300 hover:scale-125 transition-transform';
        midEl.title = 'Click to add a new vertex on this edge';
        midEl.addEventListener('mousedown', (ev) => ev.stopPropagation());
        midEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          editorRef.current.insertVertexAtPoint([midLon, midLat], true);
        });

        const midMarker = new maplibregl.Marker({ element: midEl, draggable: false })
          .setLngLat([midLon, midLat])
          .addTo(map);
        midpointMarkersRef.current.push(midMarker);
      });
    }

    return () => {
      vertexMarkersRef.current.forEach((m) => m.remove());
      midpointMarkersRef.current.forEach((m) => m.remove());
      vertexMarkersRef.current = [];
      midpointMarkersRef.current = [];
    };
  }, [
    editor.editorTool,
    editor.editingTarget,
    editor.selectedVertexIdx,
    editor.openVertices.map((v) => `${v[0]},${v[1]}`).join('|'),
  ]);

  // Sync draft polygon GeoJSON during Draw Farm / Draw Zone
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const src = map.getSource('draft-boundary') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const pts = editor.drawPoints;
    const features: Array<{
      type: 'Feature';
      properties: Record<string, never>;
      geometry:
        | { type: 'Point'; coordinates: [number, number] }
        | { type: 'LineString'; coordinates: [number, number][] }
        | { type: 'Polygon'; coordinates: [number, number][][] };
    }> = pts.map((pt) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: pt },
    }));

    if (pts.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: pts.length >= 3 ? [...pts, pts[0]] : pts,
        },
      });
    }
    if (pts.length >= 3) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[...pts, pts[0]]],
        },
      });
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [editor.drawPoints]);

  // Sync Visual Basemap layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncBasemap = () => {
      if (map.getLayer('active-basemap-layer')) map.removeLayer('active-basemap-layer');
      if (map.getSource('active-basemap-source')) map.removeSource('active-basemap-source');

      if (map.getLayer('esri-satellite-layer')) {
        map.setPaintProperty(
          'esri-satellite-layer',
          'raster-opacity',
          basemap === 'esri-imagery' ? basemapOpacity : 1
        );
      }

      if (map.getLayer('terrain-hillshade-layer')) {
        const showTerrainAsBase = basemap === 'terrain-hillshade';
        const showTerrainAsOverlay = overlay === 'terrain-hillshade';
        map.setPaintProperty(
          'terrain-hillshade-layer',
          'raster-opacity',
          showTerrainAsBase ? basemapOpacity : showTerrainAsOverlay ? overlayOpacity : 0
        );
      }

      if (basemap === 'sentinel2-true-color' && activeScene) {
        map.addSource('active-basemap-source', {
          type: 'raster',
          tiles: [activeScene.trueColorTileUrl],
          tileSize: 256,
          maxzoom: 14,
        });
        map.addLayer(
          {
            id: 'active-basemap-layer',
            type: 'raster',
            source: 'active-basemap-source',
            minzoom: 0,
            maxzoom: 21,
            paint: { 'raster-opacity': basemapOpacity },
          },
          'terrain-hillshade-layer'
        );
      } else if (basemap === 'modis-true-color') {
        const modis = getGibsTileConfig('true-color');
        if (modis) {
          map.addSource('active-basemap-source', {
            type: 'raster',
            tiles: [modis.url],
            tileSize: 256,
            maxzoom: modis.maxZoom,
          });
          map.addLayer(
            {
              id: 'active-basemap-layer',
              type: 'raster',
              source: 'active-basemap-source',
              minzoom: 0,
              maxzoom: 21,
              paint: { 'raster-opacity': basemapOpacity },
            },
            'terrain-hillshade-layer'
          );
        }
      }
    };

    if (map.isStyleLoaded()) syncBasemap();
    else map.once('load', syncBasemap);
  }, [basemap, activeScene?.id, basemapOpacity, overlay, overlayOpacity]);

  // Sync Scientific Observation Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncOverlay = () => {
      if (map.getLayer('scientific-overlay-layer')) map.removeLayer('scientific-overlay-layer');
      if (map.getSource('scientific-overlay-source')) map.removeSource('scientific-overlay-source');

      if (overlay === 'none' || overlay === 'terrain-hillshade') return;

      let tileUrl: string | null = null;
      let sourceMaxZoom = 9;

      if (overlay === 'sentinel2-ndvi') {
        if (activeScene) {
          tileUrl = activeScene.ndviTileUrl;
          sourceMaxZoom = 14;
        }
      } else {
        const cfg = getGibsTileConfig(overlay as GibsLayerId);
        if (cfg) {
          tileUrl = cfg.url;
          sourceMaxZoom = cfg.maxZoom;
        }
      }

      if (!tileUrl) return;

      map.addSource('scientific-overlay-source', {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: sourceMaxZoom,
      });

      map.addLayer(
        {
          id: 'scientific-overlay-layer',
          type: 'raster',
          source: 'scientific-overlay-source',
          minzoom: 0,
          maxzoom: 21,
          paint: { 'raster-opacity': overlayOpacity },
        },
        'esri-labels-layer'
      );
    };

    if (map.isStyleLoaded()) syncOverlay();
    else map.once('load', syncOverlay);
  }, [overlay, activeScene?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('scientific-overlay-layer')) {
      map.setPaintProperty('scientific-overlay-layer', 'raster-opacity', overlayOpacity);
    }
    if (map.getLayer('terrain-hillshade-layer') && overlay === 'terrain-hillshade' && basemap !== 'terrain-hillshade') {
      map.setPaintProperty('terrain-hillshade-layer', 'raster-opacity', overlayOpacity);
    }
  }, [overlayOpacity, overlay, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyTerrain = () => {
      if (terrainEnabled) map.setTerrain({ source: 'aws-terrarium-dem', exaggeration: 1.5 });
      else map.setTerrain(null);
    };
    if (map.isStyleLoaded()) applyTerrain();
    else map.once('load', applyTerrain);
  }, [terrainEnabled]);

  // Synchronized Before/After Sentinel-2 Comparison Map
  useEffect(() => {
    if (!compareMode || !compareContainerRef.current || !mapRef.current || scenes.length < 2) {
      if (compareMapRef.current) {
        compareMapRef.current.remove();
        compareMapRef.current = null;
      }
      return;
    }

    const beforeScene = scenes[Math.min(compareBeforeIdx, scenes.length - 1)];
    const afterScene = scenes[Math.min(compareAfterIdx, scenes.length - 1)];
    const mainMap = mapRef.current;

    const beforeTile = compareProduct === 'ndvi' ? beforeScene.ndviTileUrl : beforeScene.trueColorTileUrl;
    const afterTile = compareProduct === 'ndvi' ? afterScene.ndviTileUrl : afterScene.trueColorTileUrl;

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

    const compareMap = new maplibregl.Map({
      container: compareContainerRef.current,
      attributionControl: false,
      interactive: true,
      style: {
        version: 8,
        sources: {
          'esri-fallback': {
            type: 'raster',
            tiles: [ESRI_HIGH_RES_BASEMAP.url],
            tileSize: 256,
            maxzoom: 18,
          },
          's2-before': {
            type: 'raster',
            tiles: [beforeTile],
            tileSize: 256,
            maxzoom: 14,
          },
        },
        layers: [
          { id: 'esri-fallback-layer', type: 'raster', source: 'esri-fallback', minzoom: 0, maxzoom: 21 },
          { id: 's2-before-layer', type: 'raster', source: 's2-before', minzoom: 0, maxzoom: 21 },
        ],
      },
      center: mainMap.getCenter(),
      zoom: mainMap.getZoom(),
      bearing: mainMap.getBearing(),
      pitch: mainMap.getPitch(),
    });

    compareMap.on('error', () => {});

    compareMap.on('load', () => {
      compareMap.addSource('parcel-ref', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [ensureClosedRing(editor.draftFarm.boundary)] },
        },
      });
      compareMap.addLayer({
        id: 'parcel-ref-line',
        type: 'line',
        source: 'parcel-ref',
        paint: { 'line-color': '#22d3ee', 'line-width': 2 },
      });
    });

    const applyAfterToMain = () => {
      if (mainMap.getLayer('compare-after-layer')) mainMap.removeLayer('compare-after-layer');
      if (mainMap.getSource('compare-after-source')) mainMap.removeSource('compare-after-source');
      mainMap.addSource('compare-after-source', {
        type: 'raster',
        tiles: [afterTile],
        tileSize: 256,
        maxzoom: 14,
      });
      mainMap.addLayer(
        {
          id: 'compare-after-layer',
          type: 'raster',
          source: 'compare-after-source',
          minzoom: 0,
          maxzoom: 21,
        },
        'esri-labels-layer'
      );
    };
    if (mainMap.isStyleLoaded()) applyAfterToMain();

    let syncing = false;
    const syncMainToCompare = () => {
      if (syncing) return;
      syncing = true;
      compareMap.jumpTo({
        center: mainMap.getCenter(),
        zoom: mainMap.getZoom(),
        bearing: mainMap.getBearing(),
        pitch: mainMap.getPitch(),
      });
      syncing = false;
    };
    const syncCompareToMain = () => {
      if (syncing) return;
      syncing = true;
      mainMap.jumpTo({
        center: compareMap.getCenter(),
        zoom: compareMap.getZoom(),
        bearing: compareMap.getBearing(),
        pitch: compareMap.getPitch(),
      });
      syncing = false;
    };

    mainMap.on('move', syncMainToCompare);
    compareMap.on('move', syncCompareToMain);
    compareMapRef.current = compareMap;

    return () => {
      mainMap.off('move', syncMainToCompare);
      compareMap.off('move', syncCompareToMain);
      if (mainMap.isStyleLoaded()) {
        if (mainMap.getLayer('compare-after-layer')) mainMap.removeLayer('compare-after-layer');
        if (mainMap.getSource('compare-after-source')) mainMap.removeSource('compare-after-source');
      }
      compareMap.remove();
      compareMapRef.current = null;
    };
  }, [compareMode, compareBeforeIdx, compareAfterIdx, compareProduct, scenes, editor.draftFarm.boundary]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = (await res.json()) as { results?: GeocodeResult[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setSearchResults(data.results || []);
      if (!data.results || data.results.length === 0) {
        setSearchError('No matching global locations found.');
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unable to search location');
    } finally {
      setSearching(false);
    }
  };

  const toggle3DView = () => {
    const next = !is3DView;
    setIs3DView(next);
    if (next && !terrainEnabled) setTerrainEnabled(true);
    mapRef.current?.easeTo({ pitch: next ? 52 : 0, duration: 700 });
  };

  const fitActiveParcel = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = computePolygonBounds(editor.draftFarm.boundary);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 96, bottom: 96, left: 80, right: 320 },
        maxZoom: 16.4,
        duration: 900,
      });
    }
  };

  const toggleFullscreen = async () => {
    if (!viewportRef.current) return;
    try {
      if (!document.fullscreenElement) await viewportRef.current.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Safe fallback inside restricted iframes
    }
  };

  const activeDatasetMeta: DatasetCardMeta = useMemo(() => {
    if (overlay === 'sentinel2-ndvi') {
      return {
        title: 'Vegetation Analysis · Sentinel-2 NDVI',
        resolution: '10 m native',
        dateLabel: activeScene
          ? `${activeScene.date} · ${activeScene.cloudCoverPct}% cloud`
          : sentinel2Loading
            ? 'Querying STAC catalog...'
            : 'No recent clear scene',
        source: 'Copernicus Sentinel-2 L2A (Planetary Computer)',
        availability: activeScene ? `Available (${scenes.length} dates)` : 'Fallback to Esri base',
        limitation: 'Optical NIR/Red index requires cloud-free pixels; 10 m grid blends sub-10 m micro-rows.',
        legend: SENTINEL2_NDVI_LEGEND,
      };
    }
    if (overlay === 'ndvi' || overlay === 'soil-moisture' || overlay === 'precipitation') {
      const cfg = getGibsTileConfig(overlay);
      if (cfg) {
        return {
          title: cfg.label,
          resolution: cfg.resolution,
          dateLabel: cfg.cadence,
          source: cfg.attribution,
          availability: 'Live NASA GIBS WMTS',
          limitation: cfg.limitation,
          legend: cfg.legend,
        };
      }
    }
    if (overlay === 'terrain-hillshade' || basemap === 'terrain-hillshade') {
      return {
        title: TERRAIN_ELEVATION_LAYER.label,
        resolution: TERRAIN_ELEVATION_LAYER.resolution,
        dateLabel: TERRAIN_ELEVATION_LAYER.observationDate,
        source: TERRAIN_ELEVATION_LAYER.source,
        availability: 'Global DEM + Hillshade',
        limitation: TERRAIN_ELEVATION_LAYER.limitation,
      };
    }
    if (basemap === 'sentinel2-true-color') {
      return {
        title: 'Sentinel-2 Level-2A True Colour',
        resolution: '10 m native',
        dateLabel: activeScene
          ? `${activeScene.date} · ${activeScene.cloudCoverPct}% cloud`
          : sentinel2Loading
            ? 'Querying STAC catalog...'
            : 'Unavailable for site',
        source: 'Copernicus Sentinel-2 L2A (Planetary Computer)',
        availability: activeScene ? `Available (${scenes.length} dates)` : 'Using Esri backup',
        limitation: '10 m resolution shows field parcels clearly; individual trees/plants are sub-pixel.',
      };
    }
    if (basemap === 'modis-true-color') {
      const cfg = getGibsTileConfig('true-color')!;
      return {
        title: cfg.label,
        resolution: cfg.resolution,
        dateLabel: cfg.cadence,
        source: cfg.attribution,
        availability: 'Live NASA GIBS WMTS',
        limitation: cfg.limitation,
        legend: cfg.legend,
      };
    }
    return {
      title: ESRI_HIGH_RES_BASEMAP.label,
      resolution: ESRI_HIGH_RES_BASEMAP.resolution,
      dateLabel: ESRI_HIGH_RES_BASEMAP.observationDate,
      source: ESRI_HIGH_RES_BASEMAP.source,
      availability: 'Global Mosaic',
      limitation: ESRI_HIGH_RES_BASEMAP.limitation,
    };
  }, [basemap, overlay, activeScene, scenes.length, sentinel2Loading]);

  const activeStats = calculateGeometryStats(editor.activeRing);
  const draftDrawRing = editor.drawPoints.length >= 3 ? ensureClosedRing(editor.drawPoints) : [];
  const draftAreaHa = draftDrawRing.length >= 4 ? calculatePolygonAreaHectares(draftDrawRing) : 0;
  const draftPerimeterM = draftDrawRing.length >= 4 ? calculatePolygonPerimeterMeters(draftDrawRing) : 0;

  const compareBeforeScene = scenes[Math.min(compareBeforeIdx, Math.max(0, scenes.length - 1))];
  const compareAfterScene = scenes[Math.min(compareAfterIdx, Math.max(0, scenes.length - 1))];

  const canvasCursorClass =
    isDrawing || editor.editorTool === 'add-vertex'
      ? 'cursor-crosshair'
      : editor.editorTool === 'move'
        ? 'cursor-grab'
        : '';

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-[640px] lg:h-[740px] min-h-[540px] min-w-0 rounded-xl overflow-hidden border border-[#32D9FF]/20 bg-[#050914] select-none"
    >
      <div ref={mapContainerRef} className={`w-full h-full min-h-[540px] ${canvasCursorClass}`} />

      {mapError && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#070b14]/95 p-6 text-center">
          <Globe className="w-10 h-10 text-cyan-400 mb-3" />
          <p className="text-sm font-medium text-slate-200">Satellite Map Renderer Notice</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">{mapError}</p>
        </div>
      )}

      {/* Synchronized Before/After Sentinel-2 Comparison Layer */}
      {compareMode && scenes.length >= 2 && (
        <>
          <div
            ref={compareContainerRef}
            className="absolute inset-0 z-10 pointer-events-auto"
            style={{ clipPath: `inset(0 ${100 - compareSplitPct}% 0 0)` }}
          />
          <div
            className="absolute top-0 bottom-0 z-20 w-0.5 bg-cyan-400 pointer-events-none"
            style={{ left: `${compareSplitPct}%` }}
          >
            <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#05080f]/95 border border-cyan-400 rounded-md px-2 py-1 text-[10px] font-mono text-cyan-300 whitespace-nowrap shadow-lg">
              {compareBeforeScene?.date} | {compareAfterScene?.date}
            </div>
          </div>
        </>
      )}

      {/* TOP-LEFT FLOATING BAR: Farm Selector + Search + Compare */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-2 max-w-[calc(100%-24px)] sm:max-w-[540px]">
        <div className="flex flex-wrap items-center gap-2 mission-glass rounded-xl p-2 shadow-xl">
          <select
            value={activeFarm.id}
            onChange={(e) => {
              const found = farms.find((f) => f.id === e.target.value);
              if (found) onSelectFarm(found);
            }}
            aria-label="Select farm parcel"
            className="min-h-[36px] max-w-[200px] bg-[#0A101D] border border-slate-700/90 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-100 focus:outline-none focus:border-cyan-500"
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 min-w-[180px] relative">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Locate city, district or farm..."
                className="w-full min-h-[36px] bg-[#0A101D] border border-slate-700/90 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-3 py-1 min-h-[36px] rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {searching ? '...' : 'Locate'}
            </button>

            {searchResults.length > 0 && (
              <div className="absolute z-40 left-0 right-0 top-full mt-1.5 bg-[#070b14]/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onSelectSearchLocation(r.lat, r.lon, `${r.name}, ${r.region || r.country}`, r.elevation);
                      setSearchResults([]);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800/80 flex items-center justify-between gap-2 border-b border-slate-800/70 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-medium text-slate-100 truncate">{r.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{r.region}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                      {r.lat.toFixed(2)}°, {r.lon.toFixed(2)}°
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>

          {scenes.length >= 2 && (
            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                compareMode
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'bg-[#0A101D] text-slate-200 border-slate-700 hover:border-cyan-500/60'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>{compareMode ? 'Exit Compare' : 'Compare S2'}</span>
            </button>
          )}
        </div>

        {searchError && (
          <div className="bg-[#05080f]/90 border border-amber-500/40 rounded-lg px-3 py-1.5 text-[11px] text-amber-300">
            {searchError}
          </div>
        )}
      </div>

      {/* BEFORE/AFTER COMPARISON FLOATING BAR */}
      {compareMode && scenes.length >= 2 && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2.5 bg-[#05080f]/92 backdrop-blur-md border border-cyan-500/50 rounded-xl px-3.5 py-2 text-xs shadow-2xl max-w-[95%]">
          <span className="font-semibold text-cyan-300 whitespace-nowrap">Sentinel-2 10m Swipe</span>
          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Left:</span>
            <select
              value={compareBeforeIdx}
              onChange={(e) => setCompareBeforeIdx(Number(e.target.value))}
              className="bg-[#0A101D] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-100"
            >
              {scenes.map((s, idx) => (
                <option key={s.id} value={idx}>
                  {s.date} ({s.cloudCoverPct}% cld)
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Right:</span>
            <select
              value={compareAfterIdx}
              onChange={(e) => setCompareAfterIdx(Number(e.target.value))}
              className="bg-[#0A101D] border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-100"
            >
              {scenes.map((s, idx) => (
                <option key={s.id} value={idx}>
                  {s.date} ({s.cloudCoverPct}% cld)
                </option>
              ))}
            </select>
          </label>
          <select
            value={compareProduct}
            onChange={(e) => setCompareProduct(e.target.value as 'true-color' | 'ndvi')}
            className="bg-[#0A101D] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100"
          >
            <option value="true-color">True Colour</option>
            <option value="ndvi">NDVI Vegetation</option>
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Split</span>
            <input
              type="range"
              min={10}
              max={90}
              value={compareSplitPct}
              onChange={(e) => setCompareSplitPct(Number(e.target.value))}
              aria-label="Before and after split slider"
              className="w-24 accent-cyan-400"
            />
          </div>
        </div>
      )}

      {/* TOP-RIGHT FLOATING SATELLITE LAYER SELECTOR */}
      <div className="absolute top-3 right-3 z-30 flex flex-col items-end gap-2 max-h-[calc(100%-96px)]">
        <button
          type="button"
          onClick={() => setLayerDrawerOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 min-h-[36px] rounded-xl mission-glass text-xs font-medium text-[#F4F8FF] hover:border-[#32D9FF]/60 shadow-xl whitespace-nowrap"
        >
          <Layers className="w-3.5 h-3.5 text-[#32D9FF]" />
          <span>{activeDatasetMeta.title}</span>
          <span className="text-[11px] font-mono text-[#52E3A4]">· {activeDatasetMeta.resolution}</span>
          {layerDrawerOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#8CA2BD]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#8CA2BD]" />}
        </button>

        {layerDrawerOpen && (
          <div className="w-72 sm:w-80 mission-glass rounded-xl p-3 space-y-3 shadow-2xl overflow-y-auto">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Visual Basemaps</span>
                <span className="font-mono text-[10px] text-slate-500">{Math.round(basemapOpacity * 100)}%</span>
              </div>

              <div className="grid grid-cols-1 gap-1">
                {[
                  {
                    id: 'esri-imagery' as BasemapId,
                    name: 'High-Resolution Satellite Imagery',
                    res: '0.3–1.0 m',
                    note: 'Esri World Imagery',
                  },
                  {
                    id: 'sentinel2-true-color' as BasemapId,
                    name: 'Sentinel-2 True Colour',
                    res: '10 m',
                    note: activeScene ? `${activeScene.date} · ${activeScene.cloudCoverPct}% cloud` : 'Planetary Computer',
                  },
                  {
                    id: 'modis-true-color' as BasemapId,
                    name: 'NASA MODIS True Color',
                    res: '250 m',
                    note: 'NASA GIBS Daily Optical',
                  },
                  {
                    id: 'terrain-hillshade' as BasemapId,
                    name: 'Terrain & Elevation',
                    res: '~30 m DEM',
                    note: 'Terrarium + Esri Hillshade',
                  },
                ].map((item) => {
                  const selected = basemap === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChangeBasemap(item.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                        selected
                          ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200'
                          : 'bg-[#0A101D]/80 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.note}</div>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-emerald-300 shrink-0">
                        {item.res}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <SlidersHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="text-[10px] text-slate-400 shrink-0">Basemap Opacity</span>
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.05}
                  value={basemapOpacity}
                  onChange={(e) => setBasemapOpacity(Number(e.target.value))}
                  aria-label="Basemap opacity"
                  className="flex-1 accent-cyan-400"
                />
              </div>
            </div>

            {(basemap === 'sentinel2-true-color' || overlay === 'sentinel2-ndvi') && scenes.length > 0 && (
              <div className="border-t border-slate-800 pt-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Sentinel-2 Acquisition Date</span>
                  <span className="font-mono text-cyan-300">{activeScene?.mgrsTile}</span>
                </div>
                <select
                  value={selectedSceneIdx}
                  onChange={(e) => setSelectedSceneIdx(Number(e.target.value))}
                  aria-label="Select Sentinel-2 observation date"
                  className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-100"
                >
                  {scenes.map((s, idx) => (
                    <option key={s.id} value={idx}>
                      {s.date} · Cloud {s.cloudCoverPct}% · {s.platform}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-slate-800 pt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Scientific Observation Layers</span>
                <span className="font-mono text-[10px] text-slate-500">
                  {overlay === 'none' ? 'Off' : `${Math.round(overlayOpacity * 100)}%`}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1">
                {[
                  { id: 'none' as ScientificOverlayId, name: 'No Scientific Overlay', res: 'Base only', note: 'Clear visual view' },
                  {
                    id: 'sentinel2-ndvi' as ScientificOverlayId,
                    name: 'Vegetation Analysis (Sentinel-2 NDVI)',
                    res: '10 m',
                    note: activeScene ? `${activeScene.date} · ${activeScene.cloudCoverPct}% cloud` : '10 m B08/B04',
                  },
                  {
                    id: 'ndvi' as ScientificOverlayId,
                    name: 'NASA MODIS NDVI',
                    res: '250 m',
                    note: 'NASA GIBS 8-Day Composite',
                  },
                  {
                    id: 'soil-moisture' as ScientificOverlayId,
                    name: 'NASA SMAP Soil Moisture',
                    res: '9 km',
                    note: 'NASA GIBS L4 Root-Zone',
                  },
                  {
                    id: 'precipitation' as ScientificOverlayId,
                    name: 'NASA GPM Precipitation',
                    res: '10 km',
                    note: 'NASA GIBS IMERG Rain Rate',
                  },
                  {
                    id: 'terrain-hillshade' as ScientificOverlayId,
                    name: 'Terrain Hillshade Overlay',
                    res: '~30 m',
                    note: 'Esri World Hillshade',
                  },
                ].map((item) => {
                  const selected = overlay === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onChangeOverlay(item.id)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                        selected
                          ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                          : 'bg-[#0A101D]/80 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{item.note}</div>
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-cyan-300 shrink-0">
                        {item.res}
                      </span>
                    </button>
                  );
                })}
              </div>

              {overlay !== 'none' && (
                <div className="flex items-center gap-2 pt-0.5">
                  <SlidersHorizontal className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-[10px] text-slate-400 shrink-0">Overlay Opacity</span>
                  <input
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    aria-label="Scientific overlay opacity"
                    className="flex-1 accent-emerald-400"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Source</span>
                <span className="text-slate-200 font-medium text-right truncate">{activeDatasetMeta.source}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Observation / Status</span>
                <span className="font-mono text-cyan-300 text-right">
                  {activeDatasetMeta.dateLabel} · {activeDatasetMeta.availability}
                </span>
              </div>
              {activeDatasetMeta.legend && (
                <div className="pt-1 space-y-1">
                  <div className="text-[10px] font-mono text-slate-400">{activeDatasetMeta.legend.unit}</div>
                  <div className="flex items-center gap-1">
                    {activeDatasetMeta.legend.stops.map((stop) => (
                      <div key={stop.label} className="flex-1 flex flex-col gap-0.5">
                        <div className="h-1.5 w-full rounded-sm" style={{ backgroundColor: stop.color }} />
                        <span className="text-[9px] font-mono text-slate-300 truncate">{stop.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-1.5 bg-[#0A101D] border border-slate-800 rounded-lg p-2 text-slate-400 leading-relaxed">
                <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{activeDatasetMeta.limitation}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM-RIGHT ADVANCED MAP CONTROLS */}
      <div className="absolute bottom-4 right-3 z-30 flex flex-col items-end gap-1.5">
        <div className="flex flex-col bg-[#05080f]/88 backdrop-blur-md border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 280 })}
            title="Zoom in"
            aria-label="Zoom in"
            className="p-2 text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 border-b border-slate-800"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 280 })}
            title="Zoom out"
            aria-label="Zoom out"
            className="p-2 text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 border-b border-slate-800"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.resetNorthPitch({ duration: 500 })}
            title="Reset north"
            aria-label="Reset north and compass"
            className="p-2 text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70 border-b border-slate-800"
          >
            <Compass
              className="w-4 h-4 text-cyan-400 transition-transform"
              style={{ transform: `rotate(${-bearingDeg}deg)` }}
            />
          </button>
          <button
            type="button"
            onClick={fitActiveParcel}
            title="Fit active farm parcel"
            aria-label="Fit active farm parcel"
            className="p-2 text-slate-200 hover:text-emerald-300 hover:bg-slate-800/70 border-b border-slate-800"
          >
            <LocateFixed className="w-4 h-4 text-emerald-400" />
          </button>
          <button
            type="button"
            onClick={toggle3DView}
            title="Toggle 2D / 3D pitch"
            className={`px-2 py-1.5 text-[10px] font-mono font-semibold border-b border-slate-800 ${
              is3DView ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-200 hover:bg-slate-800/70'
            }`}
          >
            {is3DView ? '3D' : '2D'}
          </button>
          <button
            type="button"
            onClick={() => setTerrainEnabled((v) => !v)}
            title="Toggle 3D elevation terrain"
            aria-label="Toggle 3D terrain"
            className={`p-2 border-b border-slate-800 ${
              terrainEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            <Mountain className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
            className="p-2 text-slate-200 hover:text-cyan-300 hover:bg-slate-800/70"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {onOpenEarthGlobe && (
          <button
            type="button"
            onClick={onOpenEarthGlobe}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#05080f]/88 backdrop-blur-md border border-slate-700/80 text-[11px] font-medium text-cyan-300 hover:border-cyan-400 shadow-lg whitespace-nowrap"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>3D Earth Globe</span>
          </button>
        )}
      </div>

      {/* BOTTOM-LEFT PARCEL & COORDINATE TELEMETRY HUD */}
      <div className="pointer-events-none absolute bottom-10 left-3 z-20 mission-glass rounded-xl px-3.5 py-2.5 text-xs space-y-1 max-w-sm shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-slate-100 truncate">
            {editor.draftFarm.name}
            {editor.editingTarget.type === 'zone' ? ' (Zone Active)' : ''}
          </span>
          <span className="font-mono tabular-nums text-[10px] text-cyan-300 shrink-0">Z{zoomLevel.toFixed(1)}</span>
        </div>
        <div className="font-mono tabular-nums text-[11px] text-slate-300">
          Area: {activeStats.areaHectares} ha ({activeStats.areaAcres} ac) · Perim: {activeStats.perimeterMeters.toLocaleString()} m
        </div>
        <div className="font-mono tabular-nums text-[10px] text-slate-400">
          {cursorCoords
            ? `Cursor: ${cursorCoords.lat.toFixed(5)}°, ${cursorCoords.lon.toFixed(5)}°`
            : `Centroid: ${activeStats.center.lat.toFixed(5)}°, ${activeStats.center.lon.toFixed(5)}°`}
        </div>
        {isDrawing && (
          <div className="text-amber-300 font-medium pt-0.5 border-t border-slate-800 text-[11px]">
            Drawing {editor.editorTool === 'draw-zone' ? 'Zone' : 'Farm'}: {editor.drawPoints.length} vertices
            {editor.drawPoints.length >= 3 && ` · Draft: ${draftAreaHa} ha / ${draftPerimeterM} m`}
          </div>
        )}
        {editor.editorTool === 'edit' && (
          <div className="text-emerald-300 font-medium pt-0.5 border-t border-slate-800 text-[11px]">
            Drag green corner handles or click &ldquo;+&rdquo; edge midpoints.
          </div>
        )}
        {editor.editorTool === 'move' && (
          <div className="text-cyan-300 font-medium pt-0.5 border-t border-slate-800 text-[11px]">
            Drag inside highlighted polygon to move boundary cleanly.
          </div>
        )}
      </div>
    </div>
  );
};

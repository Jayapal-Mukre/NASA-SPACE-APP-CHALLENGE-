import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EditingTarget,
  EditorTool,
  FarmParcel,
  FarmZone,
  PersistenceState,
} from '../types/fieldShift';
import {
  ZONE_COLORS,
  calculateGeometryStats,
  createDefaultSubZoneBoundary,
  ensureClosedRing,
  findNearestEdgeIndex,
  getOpenVertices,
  translateRing,
  validatePolygonRing,
} from './geoAndAgronomy';

export interface BoundaryEditorController {
  draftFarm: FarmParcel;
  activeRing: [number, number][];
  openVertices: [number, number][];
  editingTarget: EditingTarget;
  setEditingTarget: (target: EditingTarget) => void;
  editorTool: EditorTool;
  setEditorTool: (tool: EditorTool) => void;
  drawPoints: [number, number][];
  selectedVertexIdx: number | null;
  setSelectedVertexIdx: (idx: number | null) => void;
  hasUnsavedChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;
  validationError: string | null;
  clearValidationError: () => void;
  resetViewNonce: number;
  triggerResetView: () => void;
  // Geometry operations (shared across 2D MapLibre & 3D Cesium)
  beginHistoryCheckpoint: () => void;
  updateActiveVertex: (vertexIdx: number, coord: [number, number], commit?: boolean) => void;
  insertVertexAtPoint: (coord: [number, number], snapToEdge?: boolean) => void;
  deleteVertexAtIndex: (vertexIdx: number) => void;
  moveActivePolygonByDelta: (deltaLon: number, deltaLat: number, commit?: boolean) => void;
  // Drawing new farm or zone
  startDrawFarm: () => void;
  startDrawZone: () => void;
  addDrawPoint: (coord: [number, number]) => void;
  undoLastDrawPoint: () => void;
  cancelDrawing: () => void;
  finishDrawing: () => void;
  // History & persistence
  undo: () => void;
  redo: () => void;
  cancelChanges: () => void;
  saveChanges: () => Promise<void>;
  // Metadata & Zone CRUD
  updateFarmMetadata: (patch: Partial<FarmParcel>) => void;
  addDefaultZone: () => void;
  updateZoneMetadata: (zoneId: string, patch: Partial<FarmZone>) => void;
  deleteZone: (zoneId: string) => void;
}

function recalculateFarmAndZones(farm: FarmParcel, markModified = true): FarmParcel {
  const farmStats = calculateGeometryStats(farm.boundary);
  const zones = (farm.zones || []).map((z) => {
    const zStats = calculateGeometryStats(z.boundary);
    return {
      ...z,
      boundary: zStats.closedRing,
      areaHectares: zStats.areaHectares,
      perimeterMeters: zStats.perimeterMeters,
      areaPctOfFarm: Number(
        Math.min(100, (zStats.areaHectares / Math.max(0.01, farmStats.areaHectares)) * 100).toFixed(1)
      ),
      center: zStats.center,
    };
  });
  const statsWithZones = calculateGeometryStats(farmStats.closedRing, zones);
  return {
    ...farm,
    boundary: statsWithZones.closedRing,
    areaHectares: statsWithZones.areaHectares,
    areaAcres: statsWithZones.areaAcres,
    perimeterMeters: statsWithZones.perimeterMeters,
    boundingBox: statsWithZones.boundingBox,
    geometryVersion: statsWithZones.geometryVersion,
    center: statsWithZones.center,
    boundaryStatus: markModified ? 'Modified' : farm.boundaryStatus || 'Verified',
    zones,
  };
}

export function useBoundaryEditor(params: {
  activeFarm: FarmParcel;
  onPersistUpdateFarm: (farm: FarmParcel) => Promise<FarmParcel>;
  onPersistCreateFarm: (farm: FarmParcel) => Promise<FarmParcel>;
  persistence: PersistenceState;
}): BoundaryEditorController {
  const { activeFarm, onPersistUpdateFarm, onPersistCreateFarm } = params;

  const [draftFarm, setDraftFarm] = useState<FarmParcel>(() => recalculateFarmAndZones(activeFarm, false));
  const [editingTarget, setEditingTargetState] = useState<EditingTarget>({ type: 'farm' });
  const [editorTool, setEditorToolState] = useState<EditorTool>('select');
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [historyPast, setHistoryPast] = useState<FarmParcel[]>([]);
  const [historyFuture, setHistoryFuture] = useState<FarmParcel[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [resetViewNonce, setResetViewNonce] = useState(0);

  const preDragSnapshotRef = useRef<FarmParcel | null>(null);
  const draftFarmRef = useRef(draftFarm);
  draftFarmRef.current = draftFarm;

  // Sync draft when activeFarm ID, persisted timestamp, or geometryVersion updates externally
  useEffect(() => {
    setDraftFarm(recalculateFarmAndZones(activeFarm, false));
    setEditingTargetState({ type: 'farm' });
    setEditorToolState('select');
    setDrawPoints([]);
    setSelectedVertexIdx(null);
    setHistoryPast([]);
    setHistoryFuture([]);
    setHasUnsavedChanges(false);
    setValidationError(null);
    preDragSnapshotRef.current = null;
  }, [activeFarm.id, activeFarm.updatedAt, activeFarm.geometryVersion]);

  const getTargetRing = useCallback((farm: FarmParcel, target: EditingTarget): [number, number][] => {
    if (target.type === 'zone') {
      const z = (farm.zones || []).find((item) => item.id === target.zoneId);
      if (z) return ensureClosedRing(z.boundary);
    }
    return ensureClosedRing(farm.boundary);
  }, []);

  const activeRing = getTargetRing(draftFarm, editingTarget);
  const openVertices = getOpenVertices(activeRing);

  const pushHistoryAndApply = useCallback((nextFarm: FarmParcel, prevSnapshot?: FarmParcel) => {
    const baseSnapshot = prevSnapshot || draftFarmRef.current;
    setHistoryPast((past) => [...past.slice(-24), baseSnapshot]);
    setHistoryFuture([]);
    setDraftFarm(nextFarm);
    setHasUnsavedChanges(true);
  }, []);

  const applyRingToDraft = useCallback(
    (farm: FarmParcel, target: EditingTarget, nextRing: [number, number][]): FarmParcel => {
      if (target.type === 'zone') {
        const nextZones = (farm.zones || []).map((z) =>
          z.id === target.zoneId
            ? { ...z, boundary: ensureClosedRing(nextRing), updatedAt: new Date().toISOString() }
            : z
        );
        return recalculateFarmAndZones({ ...farm, zones: nextZones }, true);
      }
      return recalculateFarmAndZones({ ...farm, boundary: ensureClosedRing(nextRing) }, true);
    },
    []
  );

  const beginHistoryCheckpoint = useCallback(() => {
    preDragSnapshotRef.current = draftFarmRef.current;
  }, []);

  const updateActiveVertex = useCallback(
    (vertexIdx: number, coord: [number, number], commit = true) => {
      const current = draftFarmRef.current;
      const ring = getTargetRing(current, editingTarget);
      const open = getOpenVertices(ring);
      if (vertexIdx < 0 || vertexIdx >= open.length) return;

      const updatedOpen = open.map((p, i) =>
        i === vertexIdx ? ([Number(coord[0].toFixed(6)), Number(coord[1].toFixed(6))] as [number, number]) : p
      );
      const check = validatePolygonRing(updatedOpen);

      if (!commit) {
        // Live drag preview: update geometry smoothly even mid-drag, warn if crossing
        if (!check.valid && check.reason) {
          setValidationError(check.reason);
        } else {
          setValidationError(null);
        }
        const previewFarm = applyRingToDraft(current, editingTarget, ensureClosedRing(updatedOpen));
        setDraftFarm(previewFarm);
        setHasUnsavedChanges(true);
        return;
      }

      if (!check.valid) {
        setValidationError(check.reason || 'Invalid polygon vertex position.');
        if (preDragSnapshotRef.current) {
          setDraftFarm(preDragSnapshotRef.current);
          preDragSnapshotRef.current = null;
        }
        return;
      }

      setValidationError(null);
      const nextFarm = applyRingToDraft(current, editingTarget, check.closedRing);
      pushHistoryAndApply(nextFarm, preDragSnapshotRef.current || current);
      preDragSnapshotRef.current = null;
    },
    [applyRingToDraft, editingTarget, getTargetRing, pushHistoryAndApply]
  );

  const insertVertexAtPoint = useCallback(
    (coord: [number, number], snapToEdge = true) => {
      const current = draftFarmRef.current;
      const ring = getTargetRing(current, editingTarget);
      const open = getOpenVertices(ring);
      if (open.length < 3) return;

      const { insertIndex, projectedPoint } = findNearestEdgeIndex(ring, coord);
      const pointToInsert: [number, number] = snapToEdge
        ? projectedPoint
        : [Number(coord[0].toFixed(6)), Number(coord[1].toFixed(6))];

      const nextOpen = [...open.slice(0, insertIndex), pointToInsert, ...open.slice(insertIndex)];
      const check = validatePolygonRing(nextOpen);
      if (!check.valid) {
        setValidationError(check.reason || 'Unable to insert vertex at that location.');
        return;
      }
      setValidationError(null);
      const nextFarm = applyRingToDraft(current, editingTarget, check.closedRing);
      pushHistoryAndApply(nextFarm);
      setSelectedVertexIdx(insertIndex);
    },
    [applyRingToDraft, editingTarget, getTargetRing, pushHistoryAndApply]
  );

  const deleteVertexAtIndex = useCallback(
    (vertexIdx: number) => {
      const current = draftFarmRef.current;
      const ring = getTargetRing(current, editingTarget);
      const open = getOpenVertices(ring);
      if (open.length <= 3) {
        setValidationError('Cannot delete vertex: a valid polygon requires at least 3 corners.');
        return;
      }
      if (vertexIdx < 0 || vertexIdx >= open.length) return;

      const nextOpen = open.filter((_, i) => i !== vertexIdx);
      const check = validatePolygonRing(nextOpen);
      if (!check.valid) {
        setValidationError(check.reason || 'Deleting this vertex would create an invalid self-intersecting shape.');
        return;
      }
      setValidationError(null);
      const nextFarm = applyRingToDraft(current, editingTarget, check.closedRing);
      pushHistoryAndApply(nextFarm);
      setSelectedVertexIdx(null);
    },
    [applyRingToDraft, editingTarget, getTargetRing, pushHistoryAndApply]
  );

  const moveActivePolygonByDelta = useCallback(
    (deltaLon: number, deltaLat: number, commit = true) => {
      const current = draftFarmRef.current;
      const baseFarm = preDragSnapshotRef.current || current;
      const baseRing = getTargetRing(baseFarm, editingTarget);
      const movedRing = translateRing(baseRing, deltaLon, deltaLat);

      let nextFarm: FarmParcel;
      if (editingTarget.type === 'farm') {
        const movedZones = (baseFarm.zones || []).map((z) => ({
          ...z,
          boundary: translateRing(z.boundary, deltaLon, deltaLat),
          updatedAt: new Date().toISOString(),
        }));
        nextFarm = recalculateFarmAndZones({ ...baseFarm, boundary: movedRing, zones: movedZones }, true);
      } else {
        nextFarm = applyRingToDraft(baseFarm, editingTarget, movedRing);
      }

      if (!commit) {
        setDraftFarm(nextFarm);
        setHasUnsavedChanges(true);
        return;
      }

      setValidationError(null);
      pushHistoryAndApply(nextFarm, baseFarm);
      preDragSnapshotRef.current = null;
    },
    [applyRingToDraft, editingTarget, getTargetRing, pushHistoryAndApply]
  );

  const setEditingTarget = useCallback((target: EditingTarget) => {
    setEditingTargetState(target);
    setSelectedVertexIdx(null);
    setValidationError(null);
  }, []);

  const setEditorTool = useCallback((tool: EditorTool) => {
    setValidationError(null);
    if (tool !== 'draw-farm' && tool !== 'draw-zone') {
      setDrawPoints([]);
    }
    setEditorToolState(tool);
  }, []);

  const startDrawFarm = useCallback(() => {
    setValidationError(null);
    setDrawPoints([]);
    setSelectedVertexIdx(null);
    setEditorToolState('draw-farm');
  }, []);

  const startDrawZone = useCallback(() => {
    setValidationError(null);
    setDrawPoints([]);
    setSelectedVertexIdx(null);
    setEditorToolState('draw-zone');
  }, []);

  const addDrawPoint = useCallback((coord: [number, number]) => {
    setValidationError(null);
    setDrawPoints((prev) => [
      ...prev,
      [Number(coord[0].toFixed(6)), Number(coord[1].toFixed(6))],
    ]);
  }, []);

  const undoLastDrawPoint = useCallback(() => {
    setDrawPoints((prev) => prev.slice(0, -1));
    setValidationError(null);
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawPoints([]);
    setEditorToolState('select');
    setValidationError(null);
  }, []);

  const finishDrawing = useCallback(async () => {
    const check = validatePolygonRing(drawPoints);
    if (!check.valid) {
      setValidationError(check.reason || 'Invalid drawn polygon.');
      return;
    }

    const stats = calculateGeometryStats(check.closedRing);

    if (editorTool === 'draw-zone') {
      const current = draftFarmRef.current;
      const nextIdx = (current.zones?.length || 0) + 1;
      const newZone: FarmZone = {
        id: `zone-${Date.now()}`,
        name: `Zone ${String.fromCharCode(64 + nextIdx)} · Crop Block`,
        cropType: current.dominantCrops[0] || 'Millet + Pulse',
        soilType: current.primarySoilType,
        irrigationType: current.irrigationType || 'rainfed',
        areaHectares: stats.areaHectares,
        perimeterMeters: stats.perimeterMeters,
        areaPctOfFarm: Number(
          Math.min(100, (stats.areaHectares / Math.max(0.01, current.areaHectares)) * 100).toFixed(1)
        ),
        center: stats.center,
        color: ZONE_COLORS[(nextIdx - 1) % ZONE_COLORS.length],
        boundary: stats.closedRing,
        updatedAt: new Date().toISOString(),
      };
      const nextFarm = recalculateFarmAndZones(
        { ...current, zones: [...(current.zones || []), newZone] },
        true
      );
      pushHistoryAndApply(nextFarm);
      setDrawPoints([]);
      setEditingTargetState({ type: 'zone', zoneId: newZone.id });
      setEditorToolState('edit');
      setValidationError(null);
      return;
    }

    // Create a brand new farm parcel and persist cleanly without fabricating crop/soil answers
    const isKa =
      stats.center.lat >= 11.5 &&
      stats.center.lat <= 18.6 &&
      stats.center.lon >= 74 &&
      stats.center.lon <= 78.6;
    const newFarm: FarmParcel = {
      id: `farm-${Date.now()}`,
      name: `Mapped Farm Parcel (${stats.center.lat.toFixed(3)}°, ${stats.center.lon.toFixed(3)}°)`,
      region: isKa ? 'Karnataka, India' : 'Custom Mapped Region',
      district: isKa ? 'Needs farmer input' : 'Needs farmer input',
      state: isKa ? 'Karnataka' : 'Custom Region',
      country: isKa ? 'India' : 'Global',
      isKarnatakaDemo: isKa,
      agroClimaticZone: isKa ? 'Karnataka Dry-Transition Belt' : 'Site-Specific Parcel',
      elevationMeters: 540,
      areaHectares: stats.areaHectares,
      areaAcres: stats.areaAcres,
      perimeterMeters: stats.perimeterMeters,
      boundingBox: stats.boundingBox,
      geometryVersion: stats.geometryVersion,
      geometryType: 'Polygon',
      primarySoilType: 'Needs farmer input',
      dominantCrops: [],
      irrigationType: undefined,
      plantingInfo: undefined,
      boundaryStatus: 'Draft',
      center: stats.center,
      boundary: stats.closedRing,
      zones: [],
      description: 'Precision field parcel digitized directly on satellite imagery.',
      updatedAt: new Date().toISOString(),
    };

    try {
      await onPersistCreateFarm(newFarm);
      setDrawPoints([]);
      setEditorToolState('select');
      setValidationError(null);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to save new drawn farm.');
    }
  }, [drawPoints, editorTool, onPersistCreateFarm, pushHistoryAndApply]);

  const undo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((future) => [draftFarmRef.current, ...future.slice(0, 24)]);
      setDraftFarm(previous);
      setSelectedVertexIdx(null);
      setValidationError(null);
      return past.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryFuture((future) => {
      if (future.length === 0) return future;
      const [next, ...rest] = future;
      setHistoryPast((past) => [...past.slice(-24), draftFarmRef.current]);
      setDraftFarm(next);
      setHasUnsavedChanges(true);
      setSelectedVertexIdx(null);
      setValidationError(null);
      return rest;
    });
  }, []);

  const cancelChanges = useCallback(() => {
    setDraftFarm(recalculateFarmAndZones(activeFarm, false));
    setHistoryPast([]);
    setHistoryFuture([]);
    setHasUnsavedChanges(false);
    setSelectedVertexIdx(null);
    setDrawPoints([]);
    setEditorToolState('select');
    setValidationError(null);
    preDragSnapshotRef.current = null;
  }, [activeFarm]);

  const saveChanges = useCallback(async () => {
    const farmCheck = validatePolygonRing(draftFarmRef.current.boundary);
    if (!farmCheck.valid) {
      setValidationError(farmCheck.reason || 'Farm boundary is invalid.');
      return;
    }
    for (const z of draftFarmRef.current.zones || []) {
      const zCheck = validatePolygonRing(z.boundary);
      if (!zCheck.valid) {
        setValidationError(`Zone "${z.name}": ${zCheck.reason}`);
        return;
      }
    }

    const toSave: FarmParcel = {
      ...recalculateFarmAndZones(draftFarmRef.current, false),
      boundaryStatus: 'Verified',
      updatedAt: new Date().toISOString(),
    };
    const saved = await onPersistUpdateFarm(toSave);
    setDraftFarm(recalculateFarmAndZones(saved, false));
    setHasUnsavedChanges(false);
    setHistoryPast([]);
    setHistoryFuture([]);
    setValidationError(null);
  }, [onPersistUpdateFarm]);

  const updateFarmMetadata = useCallback(
    (patch: Partial<FarmParcel>) => {
      const current = draftFarmRef.current;
      const nextDistrict = patch.district !== undefined ? patch.district : current.district;
      const nextState = patch.state !== undefined ? patch.state : current.state;
      const nextRegion =
        patch.region !== undefined
          ? patch.region
          : [nextDistrict, nextState].filter(Boolean).join(', ') || current.region;
      const next = {
        ...current,
        ...patch,
        region: nextRegion,
      };
      pushHistoryAndApply(next);
    },
    [pushHistoryAndApply]
  );

  const addDefaultZone = useCallback(() => {
    const current = draftFarmRef.current;
    const idx = (current.zones?.length || 0) + 1;
    const ring = createDefaultSubZoneBoundary(current.boundary, idx - 1);
    const stats = calculateGeometryStats(ring);
    const newZone: FarmZone = {
      id: `zone-${Date.now()}`,
      name: `Zone ${String.fromCharCode(64 + idx)} · Sub-Parcel`,
      cropType: current.dominantCrops[0] || 'Finger Millet',
      soilType: current.primarySoilType,
      irrigationType: current.irrigationType || 'rainfed',
      areaHectares: stats.areaHectares,
      perimeterMeters: stats.perimeterMeters,
      areaPctOfFarm: Number(
        Math.min(100, (stats.areaHectares / Math.max(0.01, current.areaHectares)) * 100).toFixed(1)
      ),
      center: stats.center,
      color: ZONE_COLORS[(idx - 1) % ZONE_COLORS.length],
      boundary: stats.closedRing,
      updatedAt: new Date().toISOString(),
    };
    const nextFarm = recalculateFarmAndZones(
      { ...current, zones: [...(current.zones || []), newZone] },
      true
    );
    pushHistoryAndApply(nextFarm);
    setEditingTargetState({ type: 'zone', zoneId: newZone.id });
    setEditorToolState('edit');
  }, [pushHistoryAndApply]);

  const updateZoneMetadata = useCallback(
    (zoneId: string, patch: Partial<FarmZone>) => {
      const current = draftFarmRef.current;
      const nextZones = (current.zones || []).map((z) =>
        z.id === zoneId ? { ...z, ...patch, updatedAt: new Date().toISOString() } : z
      );
      pushHistoryAndApply({ ...current, zones: nextZones });
    },
    [pushHistoryAndApply]
  );

  const deleteZone = useCallback(
    (zoneId: string) => {
      const current = draftFarmRef.current;
      const nextZones = (current.zones || []).filter((z) => z.id !== zoneId);
      pushHistoryAndApply({ ...current, zones: nextZones });
      if (editingTarget.type === 'zone' && editingTarget.zoneId === zoneId) {
        setEditingTargetState({ type: 'farm' });
        setSelectedVertexIdx(null);
      }
    },
    [editingTarget, pushHistoryAndApply]
  );

  const triggerResetView = useCallback(() => {
    setResetViewNonce((n) => n + 1);
  }, []);

  return {
    draftFarm,
    activeRing,
    openVertices,
    editingTarget,
    setEditingTarget,
    editorTool,
    setEditorTool,
    drawPoints,
    selectedVertexIdx,
    setSelectedVertexIdx,
    hasUnsavedChanges,
    canUndo: historyPast.length > 0,
    canRedo: historyFuture.length > 0,
    validationError,
    clearValidationError: () => setValidationError(null),
    resetViewNonce,
    triggerResetView,
    beginHistoryCheckpoint,
    updateActiveVertex,
    insertVertexAtPoint,
    deleteVertexAtIndex,
    moveActivePolygonByDelta,
    startDrawFarm,
    startDrawZone,
    addDrawPoint,
    undoLastDrawPoint,
    cancelDrawing,
    finishDrawing,
    undo,
    redo,
    cancelChanges,
    saveChanges,
    updateFarmMetadata,
    addDefaultZone,
    updateZoneMetadata,
    deleteZone,
  };
}

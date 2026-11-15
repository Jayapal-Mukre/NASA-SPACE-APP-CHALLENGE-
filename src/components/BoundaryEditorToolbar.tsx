import React from 'react';
import {
  MousePointer2,
  Pencil,
  Edit3,
  PlusCircle,
  MinusCircle,
  Move,
  Undo2,
  Redo2,
  Save,
  XCircle,
  RotateCcw,
  Check,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { EditorTool, PersistenceState } from '../types/fieldShift';
import { BoundaryEditorController } from '../utils/useBoundaryEditor';
import { calculatePolygonAreaHectares, ensureClosedRing } from '../utils/geoAndAgronomy';

interface BoundaryEditorToolbarProps {
  editor: BoundaryEditorController;
  persistence: PersistenceState;
  viewLabel: '2D Satellite Map' | '3D Globe';
}

export const BoundaryEditorToolbar: React.FC<BoundaryEditorToolbarProps> = ({
  editor,
  persistence,
  viewLabel,
}) => {
  const {
    draftFarm,
    editingTarget,
    setEditingTarget,
    editorTool,
    setEditorTool,
    drawPoints,
    selectedVertexIdx,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    validationError,
    openVertices,
  } = editor;

  const isDrawing = editorTool === 'draw-farm' || editorTool === 'draw-zone';
  const draftDrawAreaHa =
    drawPoints.length >= 3 ? calculatePolygonAreaHectares(ensureClosedRing(drawPoints)) : 0;

  const activeZone =
    editingTarget.type === 'zone'
      ? (draftFarm.zones || []).find((z) => z.id === editingTarget.zoneId)
      : null;

  const tools: Array<{
    id: EditorTool;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'select',
      label: 'SELECT FARM',
      hint: 'Click any farm polygon on map or globe to select it',
      icon: <MousePointer2 className="w-3.5 h-3.5" />,
    },
    {
      id: 'draw-farm',
      label: 'DRAW FARM',
      hint: 'Click 3+ corners on imagery to create a new farm boundary',
      icon: <Pencil className="w-3.5 h-3.5" />,
    },
    {
      id: 'edit',
      label: 'EDIT BOUNDARY',
      hint: 'Drag corner handles or click edge midpoints to reshape polygon',
      icon: <Edit3 className="w-3.5 h-3.5" />,
    },
    {
      id: 'add-vertex',
      label: 'ADD VERTEX',
      hint: 'Click any polygon edge to insert a new corner vertex',
      icon: <PlusCircle className="w-3.5 h-3.5" />,
    },
    {
      id: 'delete-vertex',
      label: 'DELETE VERTEX',
      hint: 'Click a corner handle to remove it (minimum 3 corners required)',
      icon: <MinusCircle className="w-3.5 h-3.5" />,
    },
    {
      id: 'move',
      label: 'MOVE FARM',
      hint: 'Drag inside the highlighted polygon to reposition the entire parcel',
      icon: <Move className="w-3.5 h-3.5" />,
    },
  ];

  const instructionText = (() => {
    if (editorTool === 'draw-farm') {
      return `Drawing new farm (${drawPoints.length} points${draftDrawAreaHa > 0 ? ` · ${draftDrawAreaHa} ha` : ''}). Click imagery to add corners, then click Finish Drawing.`;
    }
    if (editorTool === 'draw-zone') {
      return `Drawing zone inside ${draftFarm.name} (${drawPoints.length} points${draftDrawAreaHa > 0 ? ` · ${draftDrawAreaHa} ha` : ''}). Click inside farm, then Finish Drawing.`;
    }
    if (editorTool === 'edit') {
      return `Editing ${activeZone ? activeZone.name : draftFarm.name} (${openVertices.length} corners). Drag corner squares or click "+" midpoints to refine.`;
    }
    if (editorTool === 'add-vertex') {
      return 'Click anywhere along the polygon boundary edge to insert a new corner vertex.';
    }
    if (editorTool === 'delete-vertex') {
      return 'Click a corner handle on the boundary to remove it (minimum 3 corners preserved).';
    }
    if (editorTool === 'move') {
      return `Drag inside ${activeZone ? activeZone.name : draftFarm.name} to translate the entire boundary without losing zones or identity.`;
    }
    return `Click any farm polygon in ${viewLabel} to switch parcels, or choose EDIT BOUNDARY / DRAW FARM.`;
  })();

  return (
    <div className="mission-panel rounded-xl p-3.5 space-y-3">
      {/* Row 1: Primary Tools + History + Save/Cancel */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Farm boundary editing tools">
          {tools.map((t) => {
            const active = editorTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                onClick={() => (t.id === 'draw-farm' ? editor.startDrawFarm() : setEditorTool(t.id))}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg text-[11px] font-mono tracking-wide border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? t.id === 'draw-farm'
                      ? 'bg-[#FFB84D] text-[#050914] border-[#FFB84D] font-bold'
                      : 'bg-[#32D9FF] text-[#050914] border-[#32D9FF] font-bold'
                    : 'bg-[#050914] text-[#F4F8FF] border-[#32D9FF]/20 hover:border-[#32D9FF]/60'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* History, Save, Cancel, Reset View */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isDrawing ? (
            <>
              <button
                type="button"
                disabled={drawPoints.length < 3 || persistence.status === 'saving'}
                onClick={editor.finishDrawing}
                title="Validate and finish polygon drawing"
                className="flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-[#52E3A4] text-[#050914] text-[11px] font-mono font-bold hover:bg-[#52E3A4]/90 disabled:opacity-40 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>FINISH DRAWING</span>
              </button>
              <button
                type="button"
                disabled={drawPoints.length === 0}
                onClick={editor.undoLastDrawPoint}
                title="Remove last drawn vertex"
                className="flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/25 text-[11px] font-mono text-[#F4F8FF] hover:border-[#32D9FF] disabled:opacity-40 whitespace-nowrap"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>UNDO POINT</span>
              </button>
              <button
                type="button"
                onClick={editor.cancelDrawing}
                className="flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/20 text-[11px] font-mono text-[#8CA2BD] hover:text-[#F4F8FF] whitespace-nowrap"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>CANCEL</span>
              </button>
            </>
          ) : (
            <>
              {selectedVertexIdx !== null && openVertices.length > 3 && (
                <button
                  type="button"
                  onClick={() => editor.deleteVertexAtIndex(selectedVertexIdx)}
                  title="Delete the currently selected vertex corner"
                  className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-rose-500/15 border border-rose-500/50 text-[11px] font-mono text-rose-200 hover:bg-rose-500/25 whitespace-nowrap"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>DELETE #{selectedVertexIdx + 1}</span>
                </button>
              )}

              <button
                type="button"
                disabled={!canUndo}
                onClick={editor.undo}
                title="Undo last geometry or metadata edit"
                aria-label="Undo"
                className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/20 text-[11px] font-mono text-[#F4F8FF] hover:border-[#32D9FF]/60 disabled:opacity-40 whitespace-nowrap"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">UNDO</span>
              </button>

              <button
                type="button"
                disabled={!canRedo}
                onClick={editor.redo}
                title="Redo previously undone edit"
                aria-label="Redo"
                className="flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/20 text-[11px] font-mono text-[#F4F8FF] hover:border-[#32D9FF]/60 disabled:opacity-40 whitespace-nowrap"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">REDO</span>
              </button>

              <button
                type="button"
                disabled={!hasUnsavedChanges || persistence.status === 'saving'}
                onClick={editor.saveChanges}
                title="Save boundary and zone changes to server store"
                className={`flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg text-[11px] font-mono font-bold transition-colors whitespace-nowrap ${
                  hasUnsavedChanges
                    ? 'bg-[#52E3A4] text-[#050914] hover:bg-[#52E3A4]/90'
                    : 'bg-[#050914] border border-[#32D9FF]/15 text-[#8CA2BD]/50 cursor-not-allowed'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>{persistence.status === 'saving' ? 'SAVING...' : 'SAVE CHANGES'}</span>
              </button>

              <button
                type="button"
                disabled={!hasUnsavedChanges || persistence.status === 'saving'}
                onClick={editor.cancelChanges}
                title="Discard unsaved boundary edits"
                className="flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/20 text-[11px] font-mono text-[#8CA2BD] hover:text-[#F4F8FF] disabled:opacity-40 whitespace-nowrap"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>CANCEL</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={editor.triggerResetView}
            title="Reset map camera to fit active parcel"
            className="flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-lg bg-[#050914] border border-[#32D9FF]/20 text-[11px] font-mono text-[#F4F8FF] hover:border-[#32D9FF]/60 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET VIEW</span>
          </button>
        </div>
      </div>

      {/* Row 2: Active Target Selector (Parent Farm vs Child Zone) + Live Status & Help */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Editing Target:</span>
          </span>
          <select
            aria-label="Select boundary editing target"
            value={editingTarget.type === 'farm' ? 'farm' : editingTarget.zoneId}
            onChange={(e) => {
              const val = e.target.value;
              setEditingTarget(val === 'farm' ? { type: 'farm' } : { type: 'zone', zoneId: val });
            }}
            className="bg-[#05080f] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
          >
            <option value="farm">
              Farm Boundary · {draftFarm.name} ({draftFarm.areaHectares} ha)
            </option>
            {(draftFarm.zones || []).map((z) => (
              <option key={z.id} value={z.id}>
                Zone · {z.name} ({z.areaHectares} ha · {z.areaPctOfFarm}%)
              </option>
            ))}
          </select>

          <span className="text-slate-400 truncate">{instructionText}</span>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
          {hasUnsavedChanges ? (
            <span className="text-amber-300 font-semibold">Unsaved Changes</span>
          ) : persistence.status === 'saved' ? (
            <span className="text-emerald-300">
              Saved ({persistence.source === 'server-json-store' ? 'Server Store' : 'Demo Local Cache'})
            </span>
          ) : persistence.status === 'error' ? (
            <span className="text-rose-300">Save Failed</span>
          ) : (
            <span className="text-slate-400">
              Synced ({persistence.source === 'server-json-store' ? 'Server Store' : 'Demo Local Cache'})
            </span>
          )}
        </div>
      </div>

      {/* Validation or Persistence Error Strip */}
      {(validationError || persistence.status === 'error') && (
        <div className="flex items-center justify-between gap-3 bg-rose-950/40 border border-rose-500/40 rounded-lg px-3 py-2 text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{validationError || persistence.message}</span>
          </div>
          {validationError && (
            <button
              type="button"
              onClick={editor.clearValidationError}
              className="text-[11px] underline text-rose-300 hover:text-white shrink-0"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
};

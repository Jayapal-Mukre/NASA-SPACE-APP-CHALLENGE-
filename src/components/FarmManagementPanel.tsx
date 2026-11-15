import React, { useState } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Edit3,
  Layers,
  MapPin,
  Save,
  AlertTriangle,
  Database,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import {
  FarmParcel,
  IrrigationAvailability,
  PersistenceState,
} from '../types/fieldShift';
import { BoundaryEditorController } from '../utils/useBoundaryEditor';
import {
  calculateGeometryStats,
  hectaresToAcres,
} from '../utils/geoAndAgronomy';

interface FarmManagementPanelProps {
  farms: FarmParcel[];
  activeFarm: FarmParcel;
  editor: BoundaryEditorController;
  persistence: PersistenceState;
  onSelectFarm: (farm: FarmParcel) => void;
  onDuplicateFarm: (farm: FarmParcel) => Promise<void>;
  onDeleteFarm: (farmId: string) => Promise<void>;
  onCreateNewFarmViaForm: (farm: FarmParcel) => Promise<void>;
}

const IRRIGATION_OPTIONS: { value: IrrigationAvailability; label: string }[] = [
  { value: 'rainfed', label: 'Rainfed (Monsoon Dependent)' },
  { value: 'protective-tank', label: 'Protective Tank / Pond' },
  { value: 'borewell-drip', label: 'Borewell + Micro-Drip' },
  { value: 'canal-surface', label: 'Canal Command Surface' },
];

export const FarmManagementPanel: React.FC<FarmManagementPanelProps> = ({
  farms,
  activeFarm,
  editor,
  persistence,
  onSelectFarm,
  onDuplicateFarm,
  onDeleteFarm,
  onCreateNewFarmViaForm,
}) => {
  const { draftFarm, editingTarget, hasUnsavedChanges } = editor;
  const stats = calculateGeometryStats(draftFarm.boundary);

  const [confirmDeleteFarmId, setConfirmDeleteFarmId] = useState<string | null>(null);
  const [confirmDeleteZoneId, setConfirmDeleteZoneId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDistrict, setNewDistrict] = useState('Mandya');
  const [newState, setNewState] = useState('Karnataka');
  const [newSoil, setNewSoil] = useState('Red Sandy Loam');
  const [newCrops, setNewCrops] = useState('Finger Millet, Pigeon Pea');
  const [newIrrigation, setNewIrrigation] = useState<IrrigationAvailability>('rainfed');
  const [newLat, setNewLat] = useState(activeFarm.center.lat.toFixed(4));
  const [newLon, setNewLon] = useState(activeFarm.center.lon.toFixed(4));

  const handleCreateFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(newLat);
    const lon = parseFloat(newLon);
    if (!newName.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const d = 0.002;
    const boundary: [number, number][] = [
      [lon - d, lat + d],
      [lon + d, lat + d],
      [lon + d, lat - d],
      [lon - d, lat - d],
      [lon - d, lat + d],
    ];
    const farmStats = calculateGeometryStats(boundary);
    const crops = newCrops
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newFarm: FarmParcel = {
      id: `farm-${Date.now()}`,
      name: newName.trim(),
      district: newDistrict.trim() || 'Needs farmer input',
      state: newState.trim() || 'Needs farmer input',
      region: [newDistrict.trim(), newState.trim()].filter(Boolean).join(', ') || 'Custom Region',
      country: newState.toLowerCase().includes('iowa') ? 'USA' : 'India',
      isKarnatakaDemo: lat >= 11.5 && lat <= 18.6 && lon >= 74 && lon <= 78.6,
      agroClimaticZone: 'Saved Agricultural Parcel',
      elevationMeters: 520,
      areaHectares: farmStats.areaHectares,
      areaAcres: farmStats.areaAcres,
      perimeterMeters: farmStats.perimeterMeters,
      boundingBox: farmStats.boundingBox,
      geometryVersion: farmStats.geometryVersion,
      geometryType: 'Polygon',
      primarySoilType: newSoil.trim() || 'Needs farmer input',
      dominantCrops: crops,
      irrigationType: newIrrigation,
      boundaryStatus: 'Draft',
      center: farmStats.center,
      boundary: farmStats.closedRing,
      zones: [],
      description: `Farm parcel registered via Farm Management Panel (${newDistrict || 'Custom'}, ${newState || 'Region'}).`,
      updatedAt: new Date().toISOString(),
    };
    await onCreateNewFarmViaForm(newFarm);
    setNewName('');
    setShowCreateForm(false);
  };

  return (
    <section className="mission-panel rounded-xl p-5 space-y-5">
      {/* Header & Persistence Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#32D9FF]/15 pb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Farm &amp; Zone Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Create, rename, duplicate, and divide parcels into persistent crop zones with geodesic area tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-300 mr-2">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {persistence.source === 'server-json-store'
                ? 'Backend Store: Express JSON DB'
                : 'Demo Local Fallback (Server Unavailable)'}
            </span>
            {persistence.status === 'saved' && (
              <span className="flex items-center gap-1 text-emerald-300 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={editor.startDrawFarm}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold hover:bg-amber-400 whitespace-nowrap"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Draw Farm on Map</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-[#05080f] border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500/60 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>New Farm Form</span>
          </button>
        </div>
      </div>

      {/* Create New Farm Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateFormSubmit}
          className="bg-[#05080f] border border-cyan-500/40 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
        >
          <div>
            <label className="block text-slate-400 mb-1">Farm Name *</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Tumkur North Plot"
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">District</label>
            <input
              type="text"
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">State</label>
            <input
              type="text"
              value={newState}
              onChange={(e) => setNewState(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Irrigation Type</label>
            <select
              value={newIrrigation}
              onChange={(e) => setNewIrrigation(e.target.value as IrrigationAvailability)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            >
              {IRRIGATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Crop Type(s)</label>
            <input
              type="text"
              value={newCrops}
              onChange={(e) => setNewCrops(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Soil Type</label>
            <input
              type="text"
              value={newSoil}
              onChange={(e) => setNewSoil(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Latitude</label>
            <input
              type="number"
              step="0.0001"
              value={newLat}
              onChange={(e) => setNewLat(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Longitude</label>
            <input
              type="number"
              step="0.0001"
              value={newLon}
              onChange={(e) => setNewLon(e.target.value)}
              className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-2 font-mono text-slate-100"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={persistence.status === 'saving'}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400"
            >
              Create &amp; Save Farm
            </button>
          </div>
        </form>
      )}

      {/* Main 3-Column Farm Switcher, Metadata Editor & Zone Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Column 1: Switch Between Saved Farms */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
            <span>Saved Farms ({farms.length})</span>
            <span className="text-[11px] font-normal text-slate-400">Click to switch</span>
          </div>

          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {farms.map((farm) => {
              const selected = farm.id === activeFarm.id;
              const zoneCount = farm.zones?.length || 0;
              return (
                <div
                  key={farm.id}
                  className={`rounded-lg border p-2.5 transition-colors ${
                    selected
                      ? 'bg-emerald-500/12 border-emerald-400/70'
                      : 'bg-[#05080f] border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectFarm(farm)}
                    className="w-full text-left flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{farm.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {farm.district || farm.region} · {farm.boundaryStatus || 'Verified'} · {zoneCount}{' '}
                        {zoneCount === 1 ? 'zone' : 'zones'}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums text-[11px] text-cyan-300 shrink-0">
                      <div>{farm.areaHectares} ha</div>
                      <div className="text-[10px] text-slate-400">{hectaresToAcres(farm.areaHectares)} ac</div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Active Farm Properties & Actions */}
        <div className="lg:col-span-4 bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <div className="font-semibold text-slate-100">Active Farm Record</div>
              <div className="font-mono text-[10px] text-slate-400">ID: {draftFarm.id}</div>
            </div>
            <span className="font-mono text-[11px] text-emerald-300">
              {draftFarm.boundaryStatus || 'Verified'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">Farm Name</label>
              <input
                type="text"
                value={draftFarm.name}
                onChange={(e) => editor.updateFarmMetadata({ name: e.target.value })}
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">District</label>
              <input
                type="text"
                value={draftFarm.district || ''}
                onChange={(e) => editor.updateFarmMetadata({ district: e.target.value })}
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">State</label>
              <input
                type="text"
                value={draftFarm.state || ''}
                onChange={(e) => editor.updateFarmMetadata({ state: e.target.value })}
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Crop Type(s)</label>
              <input
                type="text"
                value={draftFarm.dominantCrops.join(', ')}
                onChange={(e) =>
                  editor.updateFarmMetadata({
                    dominantCrops: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Soil Type</label>
              <input
                type="text"
                value={draftFarm.primarySoilType}
                onChange={(e) => editor.updateFarmMetadata({ primarySoilType: e.target.value })}
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-400 mb-1">Irrigation Type</label>
              <select
                value={draftFarm.irrigationType || 'rainfed'}
                onChange={(e) =>
                  editor.updateFarmMetadata({
                    irrigationType: e.target.value as IrrigationAvailability,
                  })
                }
                className="w-full bg-[#0A101D] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
              >
                {IRRIGATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Calculated Geodesic Metrics */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 font-mono tabular-nums text-[11px]">
            <div>
              <div className="text-[10px] text-slate-400">Area</div>
              <div className="text-emerald-300 font-semibold">
                {stats.areaHectares} ha · {stats.areaAcres} ac
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Perimeter / Corners</div>
              <div className="text-cyan-300 font-semibold">
                {stats.perimeterMeters.toLocaleString()} m · {stats.vertexCount} pts
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-slate-400">Centroid (WGS84)</div>
              <div className="text-slate-200">
                {stats.center.lat.toFixed(5)}° N, {stats.center.lon.toFixed(5)}° E
              </div>
            </div>
          </div>

          {/* Farm Actions: Edit Boundary, Save, Duplicate, Delete */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                editor.setEditingTarget({ type: 'farm' });
                editor.setEditorTool('edit');
              }}
              className="flex items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg bg-cyan-500/15 border border-cyan-500/50 text-cyan-200 hover:bg-cyan-500/25"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Boundary</span>
            </button>

            {hasUnsavedChanges && (
              <button
                type="button"
                disabled={persistence.status === 'saving'}
                onClick={editor.saveChanges}
                className="flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Farm</span>
              </button>
            )}

            <button
              type="button"
              disabled={persistence.status === 'saving'}
              onClick={() => onDuplicateFarm(draftFarm)}
              className="flex items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg bg-[#0A101D] border border-slate-700 text-slate-200 hover:border-slate-500"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>

            {farms.length > 1 && confirmDeleteFarmId !== activeFarm.id && (
              <button
                type="button"
                onClick={() => setConfirmDeleteFarmId(activeFarm.id)}
                className="flex items-center gap-1 px-2.5 py-2 min-h-[38px] rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>

          {confirmDeleteFarmId === activeFarm.id && (
            <div className="bg-rose-950/50 border border-rose-500/50 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] text-rose-200">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                Delete &ldquo;{activeFarm.name}&rdquo; permanently?
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteFarmId(null)}
                  className="px-2.5 py-1 rounded border border-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteFarm(activeFarm.id);
                    setConfirmDeleteFarmId(null);
                  }}
                  className="px-2.5 py-1 rounded bg-rose-500 text-white font-semibold"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Zones Inside Active Farm */}
        <div className="lg:col-span-4 bg-[#050914] border border-[#32D9FF]/15 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-100">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Farm Zones ({(draftFarm.zones || []).length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={editor.startDrawZone}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25 font-medium"
              >
                + Draw Zone
              </button>
              <button
                type="button"
                onClick={editor.addDefaultZone}
                className="px-2.5 py-1.5 rounded-lg bg-[#0A101D] border border-slate-700 text-slate-200 hover:border-cyan-400"
              >
                + Quick Zone
              </button>
            </div>
          </div>

          {(draftFarm.zones || []).length === 0 ? (
            <div className="py-6 text-center text-slate-400 space-y-2">
              <p>No sub-zones defined for {draftFarm.name}.</p>
              <p className="text-[11px]">
                Divide a single farm into distinct crop, irrigation, or soil management blocks.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {(draftFarm.zones || []).map((zone) => {
                const isEditingZone =
                  editingTarget.type === 'zone' && editingTarget.zoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      isEditingZone
                        ? 'bg-cyan-500/10 border-cyan-400/70'
                        : 'bg-[#0A101D] border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: zone.color }}
                        />
                        <input
                          type="text"
                          value={zone.name}
                          onChange={(e) =>
                            editor.updateZoneMetadata(zone.id, { name: e.target.value })
                          }
                          aria-label={`Zone name for ${zone.id}`}
                          className="w-full bg-transparent border-b border-transparent focus:border-cyan-400 text-xs font-semibold text-slate-100 focus:outline-none"
                        />
                      </div>
                      <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                        {zone.areaHectares} ha ({zone.areaPctOfFarm}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={zone.cropType}
                        onChange={(e) =>
                          editor.updateZoneMetadata(zone.id, { cropType: e.target.value })
                        }
                        placeholder="Crop type"
                        aria-label="Zone crop type"
                        className="bg-[#05080f] border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200"
                      />
                      <select
                        value={zone.irrigationType}
                        onChange={(e) =>
                          editor.updateZoneMetadata(zone.id, {
                            irrigationType: e.target.value as IrrigationAvailability,
                          })
                        }
                        aria-label="Zone irrigation type"
                        className="bg-[#05080f] border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200"
                      >
                        {IRRIGATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label.split(' ')[0]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                      <span className="font-mono text-slate-400">
                        Perim: {zone.perimeterMeters} m
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            editor.setEditingTarget({ type: 'zone', zoneId: zone.id });
                            editor.setEditorTool('edit');
                          }}
                          className={`px-2 py-1 rounded border font-medium ${
                            isEditingZone
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                              : 'border-slate-700 text-cyan-300 hover:border-cyan-400'
                          }`}
                        >
                          {isEditingZone ? 'Editing Geometry' : 'Edit Shape'}
                        </button>

                        {confirmDeleteZoneId === zone.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              editor.deleteZone(zone.id);
                              setConfirmDeleteZoneId(null);
                            }}
                            className="px-2 py-1 rounded bg-rose-500 text-white font-semibold"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteZoneId(zone.id)}
                            aria-label={`Delete zone ${zone.name}`}
                            className="p-1 rounded border border-slate-800 text-rose-300 hover:border-rose-500/50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

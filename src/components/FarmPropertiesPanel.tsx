import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Edit3,
  Layers,
  MapPin,
  RefreshCw,
  Save,
  Sprout,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useSelectedFarm } from '../context/SelectedFarmContext';
import { IrrigationAvailability } from '../types/fieldShift';
import { calculateGeometryStats } from '../utils/geoAndAgronomy';

interface FarmPropertiesPanelProps {
  compact?: boolean;
  areaUnit?: 'ha' | 'acres';
}

const IRRIGATION_LABELS: Record<IrrigationAvailability, string> = {
  rainfed: 'Rainfed (Monsoon Dependent)',
  'protective-tank': 'Protective Tank / Pond',
  'borewell-drip': 'Borewell + Micro-Drip',
  'canal-surface': 'Canal Command Surface',
};

export const FarmPropertiesPanel: React.FC<FarmPropertiesPanelProps> = ({
  compact = false,
  areaUnit = 'ha',
}) => {
  const {
    activeFarm,
    bannerSyncState,
    bannerStatusMessage,
    datasetAvailability,
    datasetStatuses,
    patchFarmMetadata,
    retryFarmDatasets,
    persistence,
  } = useSelectedFarm();

  const stats = calculateGeometryStats(activeFarm.boundary, activeFarm.zones);
  const bbox = activeFarm.boundingBox ?? stats.boundingBox;

  const [editingMeta, setEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState(activeFarm.name);
  const [districtInput, setDistrictInput] = useState(activeFarm.district || '');
  const [stateInput, setStateInput] = useState(activeFarm.state || '');
  const [cropsInput, setCropsInput] = useState(activeFarm.dominantCrops.join(', '));
  const [soilInput, setSoilInput] = useState(
    activeFarm.primarySoilType === 'Needs farmer input' ? '' : activeFarm.primarySoilType
  );
  const [irrigationInput, setIrrigationInput] = useState<string>(activeFarm.irrigationType || '');
  const [plantingInput, setPlantingInput] = useState(activeFarm.plantingInfo || '');

  useEffect(() => {
    setEditingMeta(false);
    setSaveFeedback(null);
    setNameInput(activeFarm.name);
    setDistrictInput(activeFarm.district && activeFarm.district !== 'Needs farmer input' ? activeFarm.district : '');
    setStateInput(activeFarm.state && activeFarm.state !== 'Needs farmer input' ? activeFarm.state : '');
    setCropsInput(activeFarm.dominantCrops.join(', '));
    setSoilInput(activeFarm.primarySoilType === 'Needs farmer input' ? '' : activeFarm.primarySoilType);
    setIrrigationInput(activeFarm.irrigationType || '');
    setPlantingInput(activeFarm.plantingInfo || '');
  }, [activeFarm.id, activeFarm.updatedAt, activeFarm.geometryVersion]);

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMeta(true);
    setSaveFeedback(null);
    try {
      const crops = cropsInput
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      await patchFarmMetadata(activeFarm.id, {
        name: nameInput.trim() || activeFarm.name,
        district: districtInput.trim() || 'Needs farmer input',
        state: stateInput.trim() || 'Needs farmer input',
        region: [districtInput.trim(), stateInput.trim()].filter(Boolean).join(', ') || activeFarm.region,
        dominantCrops: crops,
        primarySoilType: soilInput.trim() || 'Needs farmer input',
        irrigationType: irrigationInput ? (irrigationInput as IrrigationAvailability) : undefined,
        plantingInfo: plantingInput.trim() || undefined,
      });
      setEditingMeta(false);
      setSaveFeedback('Farm properties saved.');
    } catch (err) {
      setSaveFeedback(err instanceof Error ? err.message : 'Unable to save farm properties.');
    } finally {
      setSavingMeta(false);
    }
  };

  const bannerToneClass =
    bannerSyncState === 'loading'
      ? 'bg-[#32D9FF]/12 border-[#32D9FF]/45 text-[#32D9FF]'
      : bannerSyncState === 'updated'
        ? 'bg-[#52E3A4]/12 border-[#52E3A4]/45 text-[#52E3A4]'
        : bannerSyncState === 'partial'
          ? 'bg-[#FFB84D]/12 border-[#FFB84D]/45 text-[#FFB84D]'
          : bannerSyncState === 'error'
            ? 'bg-rose-500/15 border-rose-500/50 text-rose-300'
            : 'bg-[#091426] border-[#32D9FF]/20 text-[#8CA2BD]';

  const statusBadge = (status: string) => {
    if (status === 'available') {
      return 'bg-[#52E3A4]/15 text-[#52E3A4] border-[#52E3A4]/40';
    }
    if (status === 'loading') {
      return 'bg-[#32D9FF]/15 text-[#32D9FF] border-[#32D9FF]/40';
    }
    if (status === 'error') {
      return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    }
    return 'bg-[#FFB84D]/15 text-[#FFB84D] border-[#FFB84D]/40';
  };

  return (
    <div className="bg-[#091426] border border-[#32D9FF]/20 rounded-xl p-4 space-y-3.5 text-xs">
      {/* Header + Sync Status Banner */}
      <div className="flex items-start justify-between gap-2 border-b border-[#32D9FF]/15 pb-2.5">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#32D9FF]">
            Selected Farm Properties
          </div>
          <h3 className="text-sm font-bold text-[#F4F8FF] truncate mt-0.5">{activeFarm.name}</h3>
          <div className="font-mono text-[10px] text-[#8CA2BD] truncate">
            ID: {activeFarm.id} · {activeFarm.geometryVersion || stats.geometryVersion}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setEditingMeta((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#050914] border border-[#32D9FF]/25 text-[11px] text-[#32D9FF] hover:border-[#32D9FF]"
          >
            {editingMeta ? <X className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
            <span>{editingMeta ? 'Cancel' : 'Edit'}</span>
          </button>
        </div>
      </div>

      {/* Sync Status Banner */}
      <div className={`rounded-lg border px-2.5 py-2 flex items-center justify-between gap-2 text-[11px] ${bannerToneClass}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {bannerSyncState === 'loading' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : bannerSyncState === 'updated' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate font-medium">{bannerStatusMessage}</span>
        </div>
        <button
          type="button"
          onClick={() => retryFarmDatasets()}
          disabled={bannerSyncState === 'loading'}
          className="px-2 py-0.5 rounded border border-current/40 text-[10px] font-mono hover:bg-white/10 disabled:opacity-40 shrink-0"
        >
          {bannerSyncState === 'error' ? 'Retry' : 'Refresh'}
        </button>
      </div>

      {saveFeedback && (
        <div className="text-[11px] font-mono text-[#52E3A4] bg-[#52E3A4]/10 border border-[#52E3A4]/30 rounded-lg px-2.5 py-1.5">
          {saveFeedback}
        </div>
      )}

      {/* Inline Metadata Editor */}
      {editingMeta ? (
        <form onSubmit={handleSaveMetadata} className="space-y-2.5 bg-[#050914] border border-[#32D9FF]/25 rounded-lg p-3">
          <div>
            <label className="block text-[10px] text-[#8CA2BD] mb-0.5">Farm Name</label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[#8CA2BD] mb-0.5">District</label>
              <input
                type="text"
                value={districtInput}
                placeholder="e.g. Mandya"
                onChange={(e) => setDistrictInput(e.target.value)}
                className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#8CA2BD] mb-0.5">State</label>
              <input
                type="text"
                value={stateInput}
                placeholder="e.g. Karnataka"
                onChange={(e) => setStateInput(e.target.value)}
                className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-[#8CA2BD] mb-0.5">Crop Types (comma-separated)</label>
            <input
              type="text"
              value={cropsInput}
              placeholder="e.g. Finger Millet, Pigeon Pea"
              onChange={(e) => setCropsInput(e.target.value)}
              className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[#8CA2BD] mb-0.5">Soil Type</label>
              <input
                type="text"
                value={soilInput}
                placeholder="e.g. Red Sandy Loam"
                onChange={(e) => setSoilInput(e.target.value)}
                className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#8CA2BD] mb-0.5">Irrigation Type</label>
              <select
                value={irrigationInput}
                onChange={(e) => setIrrigationInput(e.target.value)}
                className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
              >
                <option value="">Needs farmer input</option>
                <option value="rainfed">Rainfed</option>
                <option value="protective-tank">Protective Tank</option>
                <option value="borewell-drip">Borewell Drip</option>
                <option value="canal-surface">Canal Surface</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-[#8CA2BD] mb-0.5">Planting Info / Window</label>
            <input
              type="text"
              value={plantingInput}
              placeholder="e.g. Kharif Jun 15 sowing, 120d cycle"
              onChange={(e) => setPlantingInput(e.target.value)}
              className="w-full bg-[#091426] border border-slate-700 rounded px-2 py-1 text-xs text-[#F4F8FF]"
            />
          </div>
          <button
            type="submit"
            disabled={savingMeta || persistence.status === 'saving'}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[#52E3A4] text-[#050914] font-bold hover:bg-[#52E3A4]/90 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingMeta ? 'Saving...' : 'Save Farm Properties'}</span>
          </button>
        </form>
      ) : (
        <div className={compact ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
          {/* 1. Identification */}
          <div className="bg-[#050914] border border-[#32D9FF]/12 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#32D9FF]">
              <MapPin className="w-3 h-3" />
              <span>Identification</span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">District / State</span>
                <span className="text-[#F4F8FF] text-right">
                  {activeFarm.district && activeFarm.district !== 'Needs farmer input'
                    ? `${activeFarm.district}, ${activeFarm.state || activeFarm.country}`
                    : activeFarm.region || 'Not available'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Boundary Status</span>
                <span className="font-mono text-[#52E3A4]">{activeFarm.boundaryStatus || 'Verified'}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Agro-Climatic Zone</span>
                <span className="text-[#F4F8FF] text-right truncate">{activeFarm.agroClimaticZone}</span>
              </div>
            </div>
          </div>

          {/* 2. Geographic Properties */}
          <div className="bg-[#050914] border border-[#32D9FF]/12 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#52E3A4]">
              <Layers className="w-3 h-3" />
              <span>Geographic Properties</span>
            </div>
            <div className="space-y-1 font-mono tabular-nums text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD] font-sans">Area</span>
                <span className="text-[#52E3A4] font-semibold">
                  {areaUnit === 'acres'
                    ? `${stats.areaAcres} ac (${stats.areaHectares} ha)`
                    : `${stats.areaHectares} ha (${stats.areaAcres} ac)`}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD] font-sans">Perimeter / Corners</span>
                <span className="text-[#F4F8FF]">
                  {stats.perimeterMeters.toLocaleString()} m · {stats.vertexCount} pts
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD] font-sans">Centroid</span>
                <span className="text-[#32D9FF]">
                  {stats.center.lat.toFixed(4)}°, {stats.center.lon.toFixed(4)}°
                </span>
              </div>
              <div
                className="text-[10px] text-[#8CA2BD] truncate"
                title={bbox ? bbox.join(', ') : 'Unavailable'}
              >
                BBox: {bbox ? `[${bbox.map((n) => n.toFixed(4)).join(', ')}]` : 'Unavailable'}
              </div>
            </div>
          </div>

          {/* 3. Agricultural Properties */}
          <div className="bg-[#050914] border border-[#32D9FF]/12 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#FFB84D]">
              <Sprout className="w-3 h-3" />
              <span>Agricultural Properties</span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Crop Types</span>
                <span className={activeFarm.dominantCrops.length > 0 ? 'text-[#F4F8FF] text-right' : 'text-[#FFB84D] font-mono'}>
                  {activeFarm.dominantCrops.length > 0
                    ? activeFarm.dominantCrops.join(', ')
                    : 'Needs farmer input'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Soil Type</span>
                <span
                  className={
                    activeFarm.primarySoilType && activeFarm.primarySoilType !== 'Needs farmer input'
                      ? 'text-[#F4F8FF] text-right'
                      : 'text-[#FFB84D] font-mono'
                  }
                >
                  {activeFarm.primarySoilType || 'Needs farmer input'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Irrigation</span>
                <span className={activeFarm.irrigationType ? 'text-[#32D9FF] text-right' : 'text-[#FFB84D] font-mono'}>
                  {activeFarm.irrigationType
                    ? IRRIGATION_LABELS[activeFarm.irrigationType]
                    : 'Needs farmer input'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Planting Info</span>
                <span className={activeFarm.plantingInfo ? 'text-[#F4F8FF] text-right' : 'text-[#8CA2BD] font-mono'}>
                  {activeFarm.plantingInfo || 'Not available'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#8CA2BD]">Parcel Zones</span>
                <span className="text-[#52E3A4] font-mono">
                  {(activeFarm.zones || []).length > 0
                    ? `${activeFarm.zones!.length} (${activeFarm.zones!.map((z) => `${z.areaHectares} ha`).join(', ')})`
                    : 'None defined'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Data Availability */}
          <div className="bg-[#050914] border border-[#32D9FF]/12 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#32D9FF]">
                <Database className="w-3 h-3" />
                <span>Data Availability</span>
              </div>
              {Object.values(datasetStatuses).some((s) => s === 'error') && (
                <button
                  type="button"
                  onClick={() => retryFarmDatasets()}
                  className="text-[10px] font-mono text-rose-300 underline hover:text-rose-200"
                >
                  Retry Failed
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {datasetAvailability.map((ds) => (
                <div
                  key={ds.label}
                  className="border border-slate-800/80 rounded px-2 py-1.5 bg-[#091426]/60 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-[#F4F8FF] truncate">{ds.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border font-mono text-[9px] uppercase shrink-0 ${statusBadge(
                        ds.status
                      )}`}
                    >
                      {ds.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#8CA2BD] font-mono gap-2">
                    <span className="truncate">{ds.resolution}</span>
                    <span className="truncate">
                      {ds.observationDate || (ds.status === 'loading' ? 'Acquiring...' : 'Unavailable')}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8CA2BD]/85 leading-snug">{ds.limitation}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

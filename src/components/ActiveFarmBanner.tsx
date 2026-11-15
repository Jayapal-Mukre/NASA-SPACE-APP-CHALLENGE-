import React from 'react';
import { AlertTriangle, CheckCircle2, MapPin, RefreshCw } from 'lucide-react';
import { useSelectedFarm } from '../context/SelectedFarmContext';
import { hectaresToAcres } from '../utils/geoAndAgronomy';

interface ActiveFarmBannerProps {
  moduleTitle: string;
  areaUnit?: 'ha' | 'acres';
}

export const ActiveFarmBanner: React.FC<ActiveFarmBannerProps> = ({
  moduleTitle,
  areaUnit = 'ha',
}) => {
  const {
    activeFarm,
    bannerSyncState,
    bannerStatusMessage,
    retryFarmDatasets,
    sentinel2Catalog,
    observations,
  } = useSelectedFarm();

  const areaText =
    areaUnit === 'acres'
      ? `${hectaresToAcres(activeFarm.areaHectares)} ac (${activeFarm.areaHectares} ha)`
      : `${activeFarm.areaHectares} ha (${hectaresToAcres(activeFarm.areaHectares)} ac)`;

  const tone =
    bannerSyncState === 'loading'
      ? 'border-[#32D9FF]/45 bg-[#32D9FF]/10 text-[#32D9FF]'
      : bannerSyncState === 'updated'
        ? 'border-[#52E3A4]/40 bg-[#52E3A4]/10 text-[#52E3A4]'
        : bannerSyncState === 'error'
          ? 'border-rose-500/50 bg-rose-500/12 text-rose-300'
          : 'border-[#FFB84D]/40 bg-[#FFB84D]/10 text-[#FFB84D]';

  return (
    <div className="mission-panel rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-1.5 text-[#52E3A4] font-semibold">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{activeFarm.name}</span>
        </div>
        <span className="text-[#8CA2BD]/50">·</span>
        <span className="font-mono text-[11px] text-[#32D9FF]">{moduleTitle}</span>
        <span className="text-[#8CA2BD]/50 hidden sm:inline">·</span>
        <span className="font-mono text-[11px] text-[#8CA2BD] hidden sm:inline">
          {areaText} · {activeFarm.center.lat.toFixed(4)}° N, {activeFarm.center.lon.toFixed(4)}° E
        </span>
        {sentinel2Catalog?.scenes?.[0] && (
          <span className="font-mono text-[10px] text-[#8CA2BD] hidden lg:inline">
            · S2 {sentinel2Catalog.scenes[0].date}
          </span>
        )}
        {observations?.sourceStatus.nasaPowerMeta && (
          <span className="font-mono text-[10px] text-[#8CA2BD] hidden xl:inline">
            · POWER {observations.sourceStatus.nasaPowerMeta.endDate}
          </span>
        )}
      </div>

      <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-medium ${tone}`}>
        {bannerSyncState === 'loading' ? (
          <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
        ) : bannerSyncState === 'updated' ? (
          <CheckCircle2 className="w-3 h-3 shrink-0" />
        ) : (
          <AlertTriangle className="w-3 h-3 shrink-0" />
        )}
        <span>{bannerStatusMessage}</span>
        {(bannerSyncState === 'error' || bannerSyncState === 'partial') && (
          <button
            type="button"
            onClick={() => retryFarmDatasets()}
            className="ml-1 px-1.5 py-0.5 rounded border border-current/40 font-mono text-[10px] hover:bg-white/10"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

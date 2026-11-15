import React from 'react';
import {
  Database,
  ShieldCheck,
  BookOpen,
  Compass,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  NasaObservationBundle,
  Sentinel2CatalogResponse,
  SoilProfile,
  UiExperienceMode,
} from '../types/fieldShift';

interface ScienceMethodologyCenterProps {
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  sentinel2Catalog: Sentinel2CatalogResponse | null;
  uiMode: UiExperienceMode;
  onChangeUiMode: (mode: UiExperienceMode) => void;
}

export const ScienceMethodologyCenter: React.FC<ScienceMethodologyCenterProps> = ({
  observations,
  soil,
  sentinel2Catalog,
  uiMode,
  onChangeUiMode,
}) => {
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const latestS2 = sentinel2Catalog?.scenes?.[0];

  const datasets = [
    {
      name: 'NASA POWER Agroclimatology L2',
      provider: 'NASA Langley Research Center',
      productId: 'POWER Daily Point API (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, GWETTOP, GWETROOT, ALLSKY_SFC_SW_DWN)',
      resolution: '0.5° × 0.625° (~55 km grid)',
      cadence: 'Daily (90-day live pull + monthly climatology)',
      obsDate: powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}` : '90-day window',
      status: observations?.sourceStatus.nasaPower === 'live' ? 'Live Observed' : 'Climatology Fallback',
      processing: 'Direct JSON ingestion; -999 fill values filtered and disclosed via missingFillPoints.',
      limitations: 'Synoptic 55 km grid represents regional meteorology, not parcel-scale microclimate gauges.',
    },
    {
      name: 'NASA MODIS Terra Vegetation & Reflectance',
      provider: 'NASA EOSDIS GIBS',
      productId: 'MODIS_Terra_NDVI_8Day & MODIS_Terra_CorrectedReflectance_TrueColor',
      resolution: '250 m native',
      cadence: '8-day NDVI composite / Daily RGB',
      obsDate: 'Latest 8-Day / Rolling 4-day lag',
      status: 'Live WMTS Tiles',
      processing: 'EPSG:3857 Web Mercator WMTS tile compositing over MapLibre and CesiumJS.',
      limitations: '250 m pixels average across smallholder boundaries; clouds obscure optical scenes.',
    },
    {
      name: 'NASA SMAP L4 Root-Zone Soil Moisture',
      provider: 'NASA EOSDIS GIBS / NSIDC',
      productId: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
      resolution: '9 km native (~8,100 ha cell)',
      cadence: '3-Hourly / Daily assimilated',
      obsDate: 'Latest Near-Real-Time Composite',
      status: 'Live WMTS Tiles',
      processing: 'L-band brightness temperature assimilated into Catchment land-surface model.',
      limitations: '9 km spatial footprint captures watershed moisture trends, NOT individual small fields.',
    },
    {
      name: 'NASA GPM IMERG Precipitation Rate',
      provider: 'NASA EOSDIS GIBS / GSFC',
      productId: 'IMERG_Precipitation_Rate',
      resolution: '10 km native',
      cadence: 'Near-Real-Time 30-min / Daily',
      obsDate: 'Latest Near-Real-Time',
      status: 'Live WMTS Tiles',
      processing: 'Multi-satellite microwave + IR merged precipitation rate overlay.',
      limitations: '10 km grid smooths localized convective cloudbursts; requires local rain-gauge verification.',
    },
    {
      name: 'Copernicus Sentinel-2 Level-2A (Surface Reflectance & NDVI)',
      provider: 'ESA / Copernicus via Microsoft Planetary Computer STAC',
      productId: 'sentinel-2-l2a (Visual TCI & B08/B04 NDVI)',
      resolution: '10 m native',
      cadence: '5-day revisit (cloud-filtered <35%)',
      obsDate: latestS2 ? `${latestS2.date} (${latestS2.cloudCoverPct}% cloud)` : 'Latest clear catalog pass',
      status: sentinel2Catalog?.available ? 'Live STAC & Tile Proxy' : 'Basemap Fallback',
      processing: 'Server-side STAC search + dynamic TiTiler true-color & NDVI expression rendering.',
      limitations: 'Optical bands are blocked by monsoon cloud cover; NDVI reflects canopy greenness, not soil NPK.',
    },
    {
      name: 'Esri World Imagery & AWS Terrarium 30 m DEM',
      provider: 'Esri / Maxar / Earthstar & AWS Open Data',
      productId: 'World_Imagery + Mapzen Terrarium DEM',
      resolution: '0.3–1.0 m RGB / ~30 m elevation',
      cadence: 'Multi-date high-res mosaic',
      obsDate: '2020–2025 Mosaic Baseline',
      status: 'Live Tile Service',
      processing: 'High-DPI visual field boundary delineation & Cesium/MapLibre topographic relief.',
      limitations: 'Visual reference mosaic (NOT live daily NASA observation); acquisition dates vary.',
    },
    {
      name: 'ISRIC SoilGrids v2.0 & Agro-Ecological Fallback',
      provider: 'ISRIC World Soil Information',
      productId: 'SoilGrids 2.0 (sand, silt, clay, phh2o, soc, nitrogen, cec, bdod)',
      resolution: '250 m modeled soil raster',
      cadence: 'Static global baseline (0–30 cm)',
      obsDate: 'SoilGrids v2.0 Release',
      status: soil?.source.includes('ISRIC') ? 'Live ISRIC API' : 'Regional Fallback Active',
      processing: 'Depth-weighted 0–30 cm horizon aggregation + Saxton-Rawls available water capacity estimate.',
      limitations: 'Spatial prediction uncertainty (~250 m); does NOT replace laboratory NPK, Zn, B soil tests.',
    },
    {
      name: 'Open-Meteo 7-Day Forecast',
      provider: 'Open-Meteo / National Weather Services',
      productId: 'ECMWF / GFS Blended Forecast',
      resolution: '~9–13 km',
      cadence: 'Hourly / Daily 7-day forecast',
      obsDate: 'Rolling +7 days from today',
      status: observations?.sourceStatus.openMeteo === 'live' ? 'Live Forecast' : 'Fallback',
      processing: 'Direct short-term temperature, rain, and multi-depth modeled soil moisture forecast.',
      limitations: 'Model forecast subject to synoptic skill decay beyond days 4–5.',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Farmer vs Researcher Depth Toggle */}
      <div className="bg-[#0A101D]/90 backdrop-blur-md border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider">
            Phase 9 · Scientific Methodology, Transparency &amp; Impact Center
          </div>
          <h2 className="text-lg lg:text-xl font-bold text-slate-100 mt-0.5">
            Earth Observation Provenance, Modeling Assumptions &amp; Limitations
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Every indicator in FIELD SHIFT tracks its source, spatial resolution, observation window, and whether it is Observed, Derived, Estimated, or Simulated.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#05080f] border border-slate-800 rounded-lg p-1 text-xs">
          <button
            type="button"
            onClick={() => onChangeUiMode('farmer')}
            className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
              uiMode === 'farmer'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Farmer Summary
          </button>
          <button
            type="button"
            onClick={() => onChangeUiMode('researcher')}
            className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
              uiMode === 'researcher'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Judge / Researcher Technical
          </button>
        </div>
      </div>

      {/* 9.4 Data Source Explorer Table */}
      <div className="bg-[#0A101D]/90 backdrop-blur-md border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Database className="w-4 h-4 text-cyan-400" />
          <span>Data Source Explorer &amp; Live Retrieval Audit</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[880px]">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left py-2.5 pr-3 font-medium">Dataset &amp; Provider</th>
                <th className="text-left py-2.5 px-2 font-medium">Product ID / Resolution</th>
                <th className="text-left py-2.5 px-2 font-medium">Observation Window</th>
                <th className="text-left py-2.5 px-2 font-medium">Live Status</th>
                <th className="text-left py-2.5 pl-2 font-medium">Processing &amp; Known Limitations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 align-top">
              {datasets.map((d) => (
                <tr key={d.name}>
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-slate-100">{d.name}</div>
                    <div className="text-[11px] text-cyan-300">{d.provider}</div>
                  </td>
                  <td className="py-3 px-2 font-mono text-[11px] text-slate-300 max-w-[230px]">
                    <div className="text-slate-200">{d.resolution}</div>
                    <div className="text-slate-400 truncate" title={d.productId}>
                      {d.productId}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-[11px] text-slate-300">
                    <div>{d.obsDate}</div>
                    <div className="text-slate-400">{d.cadence}</div>
                  </td>
                  <td className="py-3 px-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                        d.status.includes('Fallback') ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {d.status.includes('Fallback') ? (
                        <AlertTriangle className="w-3 h-3" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3" />
                      )}
                      <span>{d.status}</span>
                    </span>
                  </td>
                  <td className="py-3 pl-2 text-[11px] text-slate-300 space-y-1 max-w-[300px]">
                    <div>{d.processing}</div>
                    <div className="text-amber-300/90">Limit: {d.limitations}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 9.3 Scientific Methodology & 9.5 Agricultural Impact & Value */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#0A101D]/90 backdrop-blur-md border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>
              {uiMode === 'farmer'
                ? 'How FIELD SHIFT Combines Space & Soil Science'
                : 'Harmonization, Modeling & AI Architecture'}
            </span>
          </div>

          <div className="space-y-2.5 text-slate-300 leading-relaxed">
            <p>
              <strong className="text-cyan-300">1. Data Harmonization:</strong> Parcel polygons drawn on high-resolution Esri / 10 m Sentinel-2 imagery query NASA POWER meteorology, Open-Meteo 7-day forecasts, and ISRIC SoilGrids depth profiles at the parcel centroid.
            </p>
            <p>
              <strong className="text-cyan-300">2. Derived Physical Indicators:</strong> Daily reference ET₀ uses the Hargreaves-Samani solar-VPD formulation; Hydro-Thermal NDVI proxy is explicitly tagged as a modeled indicator whenever optical Sentinel-2 scenes are cloud-obscured. Air temperature (`T2M`) is never conflated with satellite thermal LST.
            </p>
            <p>
              <strong className="text-cyan-300">3. Deterministic Agronomic Engine + Explainable AI:</strong> Hard water ceilings, soil pH nodulation boundaries, and equipment compatibility rules are enforced deterministically in TypeScript (`evaluateAndRankStrategies`), while Gemini explains evidence, trade-offs, and uncertainties in English, Kannada, and Hindi without fabricating measurements.
            </p>
            <p>
              <strong className="text-amber-300">4. Ground Validation Requirement:</strong> Satellite and modeled outputs must be verified with composite 0–15 cm / 15–30 cm laboratory soil tests (NPK, pH, micronutrients) and district KVK/IMD monsoon onset advisories prior to field investment.
            </p>
          </div>
        </div>

        <div className="bg-[#0A101D]/90 backdrop-blur-md border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Compass className="w-4 h-4 text-amber-400" />
            <span>Agricultural Planning Value &amp; Non-Guarantee Statement</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-cyan-300">Water Conservation Planning</div>
              <p className="text-slate-300">
                Identifies seasonal ETc deficits early so rainfed and tank-irrigated farms avoid high-draw summer crops when moisture budgets fall short.
              </p>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-emerald-300">Soil Protection &amp; Biological N</div>
              <p className="text-slate-300">
                Highlights legume intercrops, deep taproot subsoil breakers, and cover crops that increase living soil cover and interrupt pest carryover.
              </p>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-amber-300">Climate Risk Awareness</div>
              <p className="text-slate-300">
                Lets farmers and extension advisors stress-test delayed monsoons, dry spells, and heat spikes before committing seed and fertilizer capital.
              </p>
            </div>
            <div className="bg-[#05080f] border border-slate-800 rounded-lg p-3 space-y-1">
              <div className="font-semibold text-slate-100">Accessible Multilingual Advisory</div>
              <p className="text-slate-300">
                Delivers consistent, evidence-grounded explanations in English, Kannada, and Hindi alongside printable PDF &amp; CSV advisory exports.
              </p>
            </div>
          </div>

          <div className="bg-[#05080f] border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2.5 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Honest Impact Boundary:</strong> FIELD SHIFT is a transparent decision-support tool. It does not guarantee verified yield gains, farm income, or soil carbon credits without local field trials and laboratory verification.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

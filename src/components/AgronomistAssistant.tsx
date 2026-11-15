import React, { useState } from 'react';
import {
  Send,
  Bot,
  User,
  AlertTriangle,
  Copy,
  Check,
  FileText,
  Sparkles,
  Globe2,
  Trash2,
} from 'lucide-react';
import {
  AgronomistLanguage,
  AgronomistMessage,
  ClimateScenario,
  FarmerPriority,
  FarmParcel,
  FarmRotationInputs,
  NasaObservationBundle,
  RotationPlanResponse,
  Sentinel2CatalogResponse,
  SoilProfile,
  UiExperienceMode,
} from '../types/fieldShift';
import { SimulatedImpactMetrics } from '../utils/geoAndAgronomy';

interface AgronomistAssistantProps {
  farm: FarmParcel;
  observations: NasaObservationBundle | null;
  soil: SoilProfile | null;
  scenario: ClimateScenario;
  impact?: SimulatedImpactMetrics;
  sentinel2Catalog?: Sentinel2CatalogResponse | null;
  rotationPlan?: RotationPlanResponse;
  selectedStrategyId?: string;
  farmInputs?: FarmRotationInputs;
  farmerPriority?: FarmerPriority;
  uiMode?: UiExperienceMode;
  language: AgronomistLanguage;
  onChangeLanguage: (lang: AgronomistLanguage) => void;
  messages: AgronomistMessage[];
  onAddMessage: (msg: AgronomistMessage) => void;
  onClearMessages?: () => void;
  onOpenReportModal?: () => void;
}

const LANGUAGE_UI: Record<
  AgronomistLanguage,
  {
    badge: string;
    subtitle: string;
    emptyTitle: string;
    emptyHint: string;
    placeholder: string;
    sendLabel: string;
    advisoryBtn: string;
    advisoryPrompt: string;
    prompts: string[];
  }
> = {
  en: {
    badge: 'English',
    subtitle: 'Evidence-based Farm Copilot · Separates NASA observations, modeled estimates & missing lab tests',
    emptyTitle: 'FIELD SHIFT AI — Your Farm Intelligence Copilot',
    emptyHint:
      'Ask about water stress, crop rotation trade-offs, soil organic matter, legume N cycling, or missing lab tests.',
    placeholder: 'Ask your farm copilot in English...',
    sendLabel: 'Send',
    advisoryBtn: 'Generate Seasonal Advisory',
    advisoryPrompt:
      'Generate a complete seasonal farm advisory checklist for my selected parcel: planting-window guidance, recommended rotation reasoning, irrigation triggers, cover crop opportunities, soil lab tests needed, and local validation checklist.',
    prompts: [
      'Why is my farm experiencing water stress under this scenario?',
      'Which crop rotation strategy best fits my soil & farmer priority?',
      'How do legumes contribute to nitrogen cycling here, and what soil tests are missing?',
      'What happens if monsoon rainfall drops -25% and how do we reduce erosion?',
    ],
  },
  kn: {
    badge: 'ಕನ್ನಡ (Kannada)',
    subtitle: 'ರೈತ ಸ್ನೇಹಿ ಕೃಷಿ ಸಲಹೆಗಾರ · NASA ದತ್ತಾಂಶ, ಮಣ್ಣಿನ ಮಾಹಿತಿ ಮತ್ತು ಅನಿಶ್ಚಿತತೆಗಳ ಸ್ಪಷ್ಟ ವಿವರಣೆ',
    emptyTitle: 'FIELD SHIFT AI — ನಿಮ್ಮ ಜಮೀನಿನ ಬುದ್ಧಿವಂತ ಕೃಷಿ ಸಹಾಯಕ',
    emptyHint:
      'ನೀರಿನ ಕೊರತೆ, ಬೆಳೆ ಪರಿವರ್ತನೆ, ಮಣ್ಣಿನ ಆರೋಗ್ಯ, ದ್ವಿದಳ ಧಾನ್ಯಗಳ ಸಾರಜನಕ ಸ್ಥಿರೀಕರಣ ಅಥವಾ ಮಣ್ಣಿನ ಪರೀಕ್ಷೆಗಳ ಬಗ್ಗೆ ಕೇಳಿ.',
    placeholder: 'ನಿಮ್ಮ ಜಮೀನಿನ ಬಗ್ಗೆ ಕನ್ನಡದಲ್ಲಿ ಪ್ರಶ್ನೆ ಕೇಳಿ...',
    sendLabel: 'ಕಳುಹಿಸಿ',
    advisoryBtn: 'ಋತುಮಾನದ ಕೃಷಿ ಸಲಹೆ ಪಡೆಯಿರಿ',
    advisoryPrompt:
      'ನನ್ನ ಆಯ್ದ ಜಮೀನಿಗೆ ಈ ಋತುಮಾನದ ಸಂಪೂರ್ಣ ಕೃಷಿ ಸಲಹೆಯನ್ನು ನೀಡಿ: ಬಿತ್ತನೆ ಸಮಯ, ಸೂಕ್ತ ಬೆಳೆ ಪರಿವರ್ತನೆ ಕಾರಣಗಳು, ನೀರಾವರಿ ಸಲಹೆ, ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಪಟ್ಟಿ ಮತ್ತು ಸ್ಥಳೀಯ ಪರಿಶೀಲನೆ ಕ್ರಮಗಳು.',
    prompts: [
      'ಈ ಸನ್ನಿವೇಶದಲ್ಲಿ ನನ್ನ ಜಮೀನಿಗೆ ನೀರಿನ ಒತ್ತಡ ಏಕೆ ಹೆಚ್ಚಾಗಿದೆ?',
      'ನನ್ನ ಜಮೀನಿನ ಮಣ್ಣು ಮತ್ತು ಆದ್ಯತೆಗೆ ಯಾವ ಬೆಳೆ ಪರಿವರ್ತನೆ ಹೆಚ್ಚು ಸೂಕ್ತ?',
      'ಮಳೆ ಕಡಿಮೆಯಾದರೆ ರಾಗಿ, ತೊಗರಿ ಮತ್ತು ಕಡಲೆ ಬೆಳೆಗಳನ್ನು ಹೇಗೆ ಉಳಿಸಿಕೊಳ್ಳುವುದು?',
      'ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಮತ್ತು ಸಾವಯವ ಇಂಗಾಲ ಹೆಚ್ಚಿಸಲು ಯಾವ ಮಣ್ಣು ಪರೀಕ್ಷೆ ಬೇಕು?',
    ],
  },
  hi: {
    badge: 'हिन्दी (Hindi)',
    subtitle: 'किसान-अनुकूल कृषि कोपायलट · NASA अवलोकन, मॉडल अनुमान और आवश्यक मिट्टी परीक्षण का स्पष्ट अंतर',
    emptyTitle: 'FIELD SHIFT AI — आपका स्मार्ट कृषि सलाहकार',
    emptyHint:
      'जल तनाव, फसल चक्र, मिट्टी की सेहत, दलहन द्वारा नाइट्रोजन स्थिरीकरण या आवश्यक लैब टेस्ट के बारे में पूछें।',
    placeholder: 'अपने खेत के बारे में हिन्दी में प्रश्न पूछें...',
    sendLabel: 'भेजें',
    advisoryBtn: 'मौसमी कृषि सलाह तैयार करें',
    advisoryPrompt:
      'मेरे चयनित खेत के लिए संपूर्ण मौसमी कृषि सलाह तैयार करें: बुवाई विंडो मार्गदर्शन, अनुशंसित फसल चक्र तर्क, सिंचाई सुझाव, कवर फसल अवसर, आवश्यक मिट्टी परीक्षण और स्थानीय सत्यापन जांच सूची।',
    prompts: [
      'इस जलवायु परिदृश्य में मेरे खेत में जल तनाव क्यों बढ़ रहा है?',
      'मेरी मिट्टी और प्राथमिकता के अनुसार कौन सा फसल चक्र सबसे उपयुक्त है?',
      'कम मानसून वर्षा होने पर मिट्टी की नमी और कटाव को कैसे नियंत्रित करें?',
      'दलहन फसलें नाइट्रोजन कैसे बढ़ाती हैं और कौन सा मिट्टी परीक्षण आवश्यक है?',
    ],
  },
};

export const AgronomistAssistant: React.FC<AgronomistAssistantProps> = ({
  farm,
  observations,
  soil,
  scenario,
  impact,
  sentinel2Catalog,
  rotationPlan,
  selectedStrategyId,
  farmInputs,
  farmerPriority = 'drought-resilience',
  uiMode = 'farmer',
  language,
  onChangeLanguage,
  messages,
  onAddMessage,
  onClearMessages,
  onOpenReportModal,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const locale = LANGUAGE_UI[language];
  const latestS2 = sentinel2Catalog?.scenes?.[0];
  const powerMeta = observations?.sourceStatus.nasaPowerMeta;
  const activeStrategy =
    rotationPlan?.strategies.find((s) => s.id === selectedStrategyId) || rotationPlan?.strategies[0];

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: AgronomistMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      language,
    };
    onAddMessage(userMsg);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const effectivePh = farmInputs?.soilTestOverrideEnabled
        ? farmInputs.customPhH2O
        : soil?.phH2O;
      const effectiveSoc = farmInputs?.soilTestOverrideEnabled
        ? farmInputs.customOrganicCarbonGKg
        : soil?.organicCarbonGKg;

      const res = await fetch('/api/ai/agronomist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          language,
          mode: uiMode,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          context: {
            farmId: farm.id,
            farmName: farm.name,
            district: farm.district,
            state: farm.state,
            region: farm.region,
            lat: farm.center.lat,
            lon: farm.center.lon,
            areaHectares: farm.areaHectares,
            perimeterMeters: farm.perimeterMeters,
            geometryVersion: farm.geometryVersion,
            agroClimaticZone: farm.agroClimaticZone,
            boundaryVertexCount: farm.boundary.length,
            powerDateWindow: powerMeta ? `${powerMeta.startDate} to ${powerMeta.endDate}` : '90-day series',
            meanTempC: observations?.summary.meanTempC,
            totalPrecip90dMm: observations?.summary.totalPrecip90dMm,
            meanRootSoilWetnessPct: observations?.summary.meanRootSoilWetnessPct,
            estimatedNdvi: observations?.summary.estimatedNdvi,
            sentinel2LatestDate: latestS2?.date,
            sentinel2CloudPct: latestS2?.cloudCoverPct,
            soilSource: farmInputs?.soilTestOverrideEnabled
              ? 'Farmer Lab Test Override + ISRIC Baseline'
              : soil?.source || farm.primarySoilType,
            textureClass: soil?.textureClass || farm.primarySoilType,
            phH2O: effectivePh,
            organicCarbonGKg: effectiveSoc,
            farmerPriority,
            existingCropSequence:
              farmInputs?.existingCropSequence ||
              (farm.dominantCrops.length > 0 ? farm.dominantCrops.join(' -> ') : 'Needs farmer input'),
            irrigationAvailability: farmInputs?.irrigationAvailability || farm.irrigationType || 'Needs farmer input',
            equipmentAvailability: farmInputs?.equipmentAvailability,
            scenarioLabel: scenario.label,
            tempDeltaC: scenario.tempDeltaC,
            precipChangePct: scenario.precipChangePct,
            irrigationEfficiencyPct: scenario.irrigationEfficiencyPct,
            monsoonOnsetDelayDays: scenario.monsoonOnsetDelayDays ?? 0,
            drySpellDurationDays: scenario.drySpellDurationDays ?? 4,
            waterStressIndex: impact?.waterStressIndex,
            recommendedStrategyName: activeStrategy?.name,
            rotationStrategies: rotationPlan?.strategies.map((s) => ({
              id: s.id,
              name: s.name,
              suitabilityRating: s.suitabilityRating,
              totalWaterDemandMm: s.totalWaterDemandMm,
              soilNitrogenDeltaKgHa: s.soilNitrogenDeltaKgHa,
            })),
          },
        }),
      });

      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'AI Agronomist service error.');
      }

      onAddMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.reply || 'No response received.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        language,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach AI Agronomist.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div className="mission-panel rounded-xl overflow-hidden flex flex-col h-[640px]">
      {/* Header + Language Switcher + Seasonal Advisory CTA */}
      <div className="px-5 py-3.5 border-b border-[#32D9FF]/15 flex flex-wrap items-center justify-between gap-3 bg-[#060E1D]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-100">
              FIELD SHIFT AI — Farm Intelligence Copilot
            </h3>
            <span className="px-2 py-0.5 rounded bg-[#091426] border border-[#32D9FF]/30 font-mono text-[10px] text-[#32D9FF]">
              Parcel: {farm.name} ({farm.center.lat.toFixed(3)}°, {farm.center.lon.toFixed(3)}°)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{locale.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Language Switcher: English / Kannada / Hindi */}
          <div className="flex items-center gap-1 bg-[#05080f] border border-slate-800 rounded-lg p-1">
            <Globe2 className="w-3.5 h-3.5 text-cyan-400 mx-1.5 shrink-0" />
            {(['en', 'kn', 'hi'] as AgronomistLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => onChangeLanguage(lang)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  language === lang
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {lang === 'en' ? 'English' : lang === 'kn' ? 'ಕನ್ನಡ' : 'हिन्दी'}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(locale.advisoryPrompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{locale.advisoryBtn}</span>
          </button>

          {onOpenReportModal && (
            <button
              type="button"
              onClick={onOpenReportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg bg-[#05080f] border border-slate-700 text-xs font-medium text-slate-200 hover:border-cyan-500/60 whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export Advisory</span>
            </button>
          )}

          {onClearMessages && messages.length > 0 && (
            <button
              type="button"
              onClick={onClearMessages}
              title="Clear conversation"
              className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-500/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Synchronized Context Strip */}
      <div className="px-5 py-2 border-b border-[#32D9FF]/15 bg-[#050914] text-[11px] font-mono text-[#8CA2BD] flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[#52E3A4] font-semibold">{farm.name}</span>
        <span>·</span>
        <span>NASA POWER: {observations?.summary.totalPrecip90dMm ?? '—'} mm / {observations?.summary.meanTempC ?? '—'}°C</span>
        <span>·</span>
        <span>S2 Scene: {latestS2?.date || 'Pending'}</span>
        <span>·</span>
        <span>Soil pH {soil?.phH2O ?? '—'}</span>
        <span>·</span>
        <span className="text-[#32D9FF]">Scenario: {scenario.label}</span>
        <span>·</span>
        <span className="text-[#FFB84D]">Strategy: {activeStrategy?.name || 'Baseline'}</span>
      </div>

      {/* Localized Quick Prompts */}
      <div className="px-5 py-2.5 border-b border-[#32D9FF]/15 flex items-center gap-2 overflow-x-auto bg-[#071122]">
        {locale.prompts.map((qp, idx) => (
          <button
            key={idx}
            type="button"
            disabled={loading}
            onClick={() => sendQuestion(qp)}
            className="px-3 py-1.5 min-h-[34px] rounded-lg bg-[#0e1729] border border-slate-700/80 text-xs text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {qp}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-2.5">
            <Bot className="w-9 h-9 text-emerald-400" />
            <p className="text-sm font-semibold text-slate-100">{locale.emptyTitle}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{locale.emptyHint}</p>
            <p className="text-[11px] text-amber-300/90">
              Uncertainty Guardrail: Copilot distinguishes NASA/Sentinel observations from modeled estimates and flags missing field soil lab tests.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-emerald-400" />
                </div>
              )}
              <div
                className={`max-w-[88%] sm:max-w-[82%] rounded-xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-slate-100'
                    : 'bg-[#05080f] border border-slate-800 text-slate-200'
                }`}
              >
                <div>{m.content}</div>
                <div className="flex items-center justify-between gap-3 mt-2 pt-1.5 border-t border-slate-800/70 text-[10px] font-mono text-slate-500">
                  <span>
                    {m.timestamp}
                    {m.role === 'assistant' ? ' · Source-grounded (Observations vs Modeled)' : ''}
                  </span>
                  {m.role === 'assistant' && (
                    <button
                      type="button"
                      onClick={() => handleCopy(m.id, m.content)}
                      className="flex items-center gap-1 text-slate-400 hover:text-cyan-300"
                    >
                      {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === m.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4 text-cyan-400" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
            <Bot className="w-4 h-4" />
            <span>Synthesizing NASA POWER, Sentinel-2, SoilGrids &amp; Rotation Context...</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-rose-950/40 border border-rose-500/40 rounded-lg p-3 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="p-3.5 border-t border-slate-800 bg-[#070b14] flex items-center gap-2.5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={locale.placeholder}
          className="flex-1 min-h-[40px] bg-[#05080f] border border-slate-700 rounded-lg px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-lg bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{locale.sendLabel}</span>
        </button>
      </form>
    </div>
  );
};

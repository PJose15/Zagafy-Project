'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Heart,
  History,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import type { Character } from '@/lib/store';

// Lazy-load ReactMarkdown — only needed when a user expands a character card
// AND clicks "Run Audit". Most sessions never render it, so keep it off the
// initial /characters bundle (saves react-markdown + remark/rehype/micromark).
const ReactMarkdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => <MarkdownLoading />,
});
import { CharacterAvatar, DecorativeDivider } from '@/components/antiquarian';
import { indicatorConfig, statusConfig } from './constants';

function MarkdownLoading() {
  const t = useTranslations('characters');
  return <span className="text-xs italic text-sepia-600">{t('loadingRenderer')}</span>;
}

interface CharacterViewCardProps {
  char: Character;
  characters: Character[];
  isExpanded: boolean;
  isAnalyzing: boolean;
  analysisResult?: string;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAnalyze: () => void;
}

export function CharacterViewCard({
  char,
  characters,
  isExpanded,
  isAnalyzing,
  analysisResult,
  onToggleExpand,
  onEdit,
  onDelete,
  onAnalyze,
}: CharacterViewCardProps) {
  const t = useTranslations('characters');
  const tStatus = useTranslations('canonStatus');
  return (
    <div className="flex flex-col h-full">
      <div
        className="p-6 cursor-pointer hover:bg-parchment-200/30 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <CharacterAvatar name={char.name} size="lg" indicator={char.currentState?.indicator} />
            <div>
              <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
                {char.name}
                {char.currentState?.indicator && char.currentState.indicator !== 'stable' && (
                  <AlertCircle size={16} className={indicatorConfig[char.currentState.indicator].color} aria-hidden="true" />
                )}
              </h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-block px-2.5 py-0.5 bg-parchment-200 text-sepia-600 text-xs font-medium rounded-full uppercase tracking-wider">
                  {char.role}
                </span>
                {char.canonStatus && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig[char.canonStatus].bg} ${statusConfig[char.canonStatus].color}`}>
                    {(() => {
                      const Icon = statusConfig[char.canonStatus].icon;
                      return <Icon size={12} aria-hidden="true" />;
                    })()}
                    {tStatus(char.canonStatus)}
                  </span>
                )}
                {char.currentState?.indicator && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${indicatorConfig[char.currentState.indicator].bg} ${indicatorConfig[char.currentState.indicator].color}`}>
                    <Activity size={12} aria-hidden="true" />
                    {t(`indicator.${char.currentState.indicator}`)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-2 text-sepia-600 hover:text-brass-500 hover:bg-parchment-200 rounded-lg transition-colors"
              aria-label={t('editAria', { name: char.name })}
            >
              <Edit3 size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 rounded-lg transition-colors"
              aria-label={t('deleteAria', { name: char.name })}
            >
              <Trash2 size={18} />
            </button>
            <div className="p-2 text-sepia-600">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-6 pb-6 pt-2 bg-parchment-200/30 animate-in fade-in slide-in-from-top-2">
          <DecorativeDivider variant="brass-rule" className="my-4" />
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Left Sidebar: Static Profile & Knowledge */}
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-forest-500/10 border border-brass-500/20 rounded-xl p-4">
                <h3 className="text-[10px] font-bold text-brass-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Activity size={12} aria-hidden="true" /> {t('currentKnowledgeHeading')}
                </h3>
                <p className="text-sm text-sepia-900 font-medium leading-relaxed">
                  {char.currentState?.currentKnowledge || t('nothingTracked')}
                </p>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Users size={12} aria-hidden="true" /> {t('coreIdentityHeading')}
                </h3>
                <p className="text-sm text-sepia-700 leading-relaxed whitespace-pre-wrap bg-parchment-100/50 p-3 rounded-xl border border-sepia-300/30">
                  {char.coreIdentity || <span className="italic text-sepia-600">{t('noCoreIdentity')}</span>}
                </p>
              </div>

              <div>
                <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest mb-2">{t('backgroundHeading')}</h3>
                <p className="text-sm text-sepia-600 leading-relaxed whitespace-pre-wrap line-clamp-4 hover:line-clamp-none transition-all">
                  {char.description || <span className="italic text-sepia-600">{t('noDescription')}</span>}
                </p>
              </div>
            </div>

            {/* Main Content: Live State & Relationships */}
            <div className="xl:col-span-2 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={12} className="text-forest-400" aria-hidden="true" /> {t('liveLogicHeading')}
                  </h3>
                  <span className="text-xs font-medium px-2 py-1 rounded-md bg-parchment-100 border border-sepia-300/50 text-sepia-700">
                    {t.rich('pressureInline', {
                      level: t(`pressure.${char.currentState?.pressureLevel || 'Low'}`),
                      v: (chunks) => (
                        <strong
                          className={
                            char.currentState?.pressureLevel === 'Critical' ? 'text-wax-500' :
                            char.currentState?.pressureLevel === 'High' ? 'text-brass-400' :
                            char.currentState?.pressureLevel === 'Medium' ? 'text-brass-500' : 'text-forest-400'
                          }
                        >
                          {chunks}
                        </strong>
                      ),
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.emotionalState')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.emotionalState || '—'}</p>
                  </div>
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.visibleGoal')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.visibleGoal || '—'}</p>
                  </div>
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.hiddenNeed')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.hiddenNeed || '—'}</p>
                  </div>
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.currentFear')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.currentFear || '—'}</p>
                  </div>
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.dominantBelief')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.dominantBelief || '—'}</p>
                  </div>
                  <div className="bg-parchment-100/40 p-3 rounded-xl border border-sepia-300/50/40 hover:border-sepia-300/40 transition-colors">
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 block mb-1">{t('field.emotionalWound')}</span>
                    <p className="text-sm text-sepia-800">{char.currentState?.emotionalWound || '—'}</p>
                  </div>
                </div>
              </div>

              {char.dynamicRelationships && char.dynamicRelationships.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Heart size={12} className="text-wax-500" aria-hidden="true" /> {t('dynamicMapLabel')}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {char.dynamicRelationships.map((rel, idx) => {
                      const targetChar = characters.find((c) => c.id === rel.targetId);
                      return (
                        <div
                          key={idx}
                          className={`bg-parchment-100/40 p-3 rounded-xl border flex flex-col gap-2 ${targetChar ? 'border-sepia-300/50/40' : 'border-red-800/40'}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className={`text-sm font-medium ${targetChar ? 'text-sepia-800' : 'text-wax-500'}`}>
                              {targetChar?.name || t('deletedCharacter')}
                            </span>
                            <div className="flex gap-2 text-[10px] font-mono">
                              <span className="text-forest-400 bg-forest-400/10 px-1.5 py-0.5 rounded">T:{rel.trustLevel}</span>
                              <span className="text-wax-500 bg-wax-500/10 px-1.5 py-0.5 rounded">X:{rel.tensionLevel}</span>
                            </div>
                          </div>
                          <p className="text-xs text-sepia-600 leading-relaxed">{rel.dynamics}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Sidebar: History & Audit */}
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-parchment-100/80 border border-sepia-300/50 rounded-xl p-4 flex flex-col h-full max-h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={12} className="text-brass-400" aria-hidden="true" /> {t('intelligenceAudit')}
                  </h3>
                  <button
                    onClick={onAnalyze}
                    disabled={isAnalyzing}
                    className="text-[10px] font-medium uppercase tracking-wider bg-forest-500/10 hover:bg-forest-500/20 text-brass-500 px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                  >
                    {isAnalyzing ? t('analyzing') : t('runAudit')}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-sm text-sepia-700">
                  {analysisResult ? (
                    <div className="prose prose-sepia prose-sm max-w-none prose-headings:text-sepia-800 prose-headings:font-medium prose-headings:text-[10px] prose-headings:uppercase prose-headings:tracking-widest prose-headings:mt-4 prose-headings:mb-2 prose-p:leading-relaxed prose-p:text-sepia-600 prose-p:text-xs">
                      <ReactMarkdown>{analysisResult}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-sepia-600 space-y-3 py-8">
                      <ShieldAlert size={24} className="text-sepia-600" aria-hidden="true" />
                      <p className="text-xs px-2">{t('auditEmpty')}</p>
                    </div>
                  )}
                </div>
              </div>

              {char.stateHistory && char.stateHistory.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-sepia-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <History size={12} className="text-brass-400" aria-hidden="true" /> {t('stateEvolutionHeading')}
                  </h3>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {char.stateHistory.map((h) => (
                      <div key={h.id} className="relative pl-4 border-l-2 border-sepia-300/50 pb-4 last:pb-0">
                        <div className="absolute w-2 h-2 bg-sepia-400 rounded-full -left-[5px] top-1.5 ring-4 ring-parchment-100"></div>
                        <span className="text-[10px] font-mono text-sepia-600 block mb-1">{h.context}</span>
                        <p className="text-xs text-sepia-700 leading-relaxed">{h.changes}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { fadeUp } from '@/lib/animations';
import { ParchmentCard, BrassButton } from '@/components/antiquarian';
import { Edit2, BookOpen, Users, Globe, Swords } from 'lucide-react';
import type { GenesisData, GenesisStep } from '@/lib/types/genesis';

interface GenesisSummaryProps {
  data: GenesisData;
  onEdit: (step: GenesisStep) => void;
  onCreate: () => void;
  isCreating: boolean;
}

function SectionHeader({ icon, title, editLabel, onEdit }: { icon: React.ReactNode; title: string; editLabel: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-sepia-800 uppercase tracking-wider">{title}</h3>
      </div>
      <button
        onClick={onEdit}
        className="text-sepia-600 hover:text-brass-600 transition-colors p-1 rounded"
        aria-label={editLabel}
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}

export function GenesisSummary({ data, onEdit, onCreate, isCreating }: GenesisSummaryProps) {
  const t = useTranslations('genesisSummary');
  const tg = useTranslations('genesis');
  return (
    <motion.div {...fadeUp} className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-serif font-bold text-sepia-900">{data.projectName}</h2>
        <p className="text-sepia-600 italic">{data.logline}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Genre & Tone */}
        <ParchmentCard padding="md">
          <SectionHeader
            icon={<BookOpen size={16} className="text-brass-600" />}
            title={t('genreTone')}
            editLabel={t('editAria', { title: t('genreTone') })}
            onEdit={() => onEdit('genre-tone')}
          />
          <div className="flex flex-wrap gap-1.5">
            {data.genres.map(g => (
              <span key={g} className="text-xs bg-forest-700/10 text-forest-700 px-2 py-0.5 rounded-full">{g}</span>
            ))}
            {data.tones.map(t => (
              <span key={t} className="text-xs bg-brass-500/10 text-brass-700 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        </ParchmentCard>

        {/* World */}
        <ParchmentCard padding="md">
          <SectionHeader
            icon={<Globe size={16} className="text-brass-600" />}
            title={t('world')}
            editLabel={t('editAria', { title: t('world') })}
            onEdit={() => onEdit('world')}
          />
          <p className="text-sm text-sepia-700">{data.world.setting}</p>
          {data.world.timePeriod && (
            <p className="text-xs text-sepia-600 mt-1">{data.world.timePeriod}</p>
          )}
          {data.world.rules.filter(Boolean).length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.world.rules.filter(Boolean).map((r, i) => (
                <li key={i} className="text-xs text-sepia-600">- {r}</li>
              ))}
            </ul>
          )}
        </ParchmentCard>

        {/* Protagonist */}
        <ParchmentCard padding="md">
          <SectionHeader
            icon={<Users size={16} className="text-brass-600" />}
            title={t('protagonist')}
            editLabel={t('editAria', { title: t('protagonist') })}
            onEdit={() => onEdit('protagonist')}
          />
          <p className="text-sm font-medium text-sepia-800">{data.protagonist.name}</p>
          {data.protagonist.description && (
            <p className="text-xs text-sepia-600 mt-1">{data.protagonist.description}</p>
          )}
          {data.protagonist.goal && (
            <p className="text-xs text-sepia-600 mt-1">{t('goal', { value: data.protagonist.goal })}</p>
          )}
          {data.protagonist.fear && (
            <p className="text-xs text-sepia-600">{t('fear', { value: data.protagonist.fear })}</p>
          )}
        </ParchmentCard>

        {/* Antagonist */}
        <ParchmentCard padding="md">
          <SectionHeader
            icon={<Swords size={16} className="text-brass-600" />}
            title={t('antagonist')}
            editLabel={t('editAria', { title: t('antagonist') })}
            onEdit={() => onEdit('antagonist')}
          />
          <p className="text-sm font-medium text-sepia-800">
            {data.antagonist.name}
            <span className="text-xs text-sepia-600 ml-2">({tg(`antagonistType.${data.antagonist.type}`)})</span>
          </p>
          {data.antagonist.description && (
            <p className="text-xs text-sepia-600 mt-1">{data.antagonist.description}</p>
          )}
          {data.antagonist.motivation && (
            <p className="text-xs text-sepia-600 mt-1">{t('motivation', { value: data.antagonist.motivation })}</p>
          )}
        </ParchmentCard>
      </div>

      <div className="text-center pt-4">
        <BrassButton size="lg" onClick={onCreate} disabled={isCreating}>
          {isCreating ? t('creating') : t('create')}
        </BrassButton>
      </div>
    </motion.div>
  );
}

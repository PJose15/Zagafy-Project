'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { AvatarCircle } from './avatar-circle';
import type { Heteronym } from '@/lib/types/heteronym';
import type { HeteronymVoice } from '@/lib/heteronym-voice';
import { VoiceToneEditor } from '@/components/heteronyms/voice-tone-editor';

// Antiquarian inks — twelve muted pigments a 19th-century stationer might
// stock, replacing the old flat-UI swatches. Existing heteronyms keep
// whatever color they were saved with.
const COLOR_SWATCHES = [
  '#991b1b', // wax red
  '#a8502e', // burnt sienna
  '#c49b48', // brass ochre
  '#6b7a2e', // olive ink
  '#166534', // forest
  '#3e7a6e', // verdigris
  '#3a5a7a', // prussian blue
  '#4a4a7a', // indigo ink
  '#6e3a5a', // plum
  '#a04a5a', // madder rose
  '#7a5a30', // sepia
  '#5a5a52', // slate ink
];

const EMOJI_OPTIONS = [
  '✍️', '📝', '🖊️', '🎭', '🌙', '🔥', '⚡', '🌊', '🌿', '🦋', '👁️', '🎪',
  '🗡️', '🌹', '🦅', '🌑', '💀', '🎠', '🧪', '🔮', '🌀', '🎯', '🦁', '🐺',
];

interface HeteronymModalProps {
  heteronym?: Heteronym | null;
  onSave: (data: { name: string; bio: string; styleNote: string; avatarColor: string; avatarEmoji: string; voice?: HeteronymVoice }) => void;
  onClose: () => void;
}

export function HeteronymModal({ heteronym, onSave, onClose }: HeteronymModalProps) {
  const t = useTranslations('heteronyms.modal');
  const [name, setName] = useState(heteronym?.name || '');
  const [bio, setBio] = useState(heteronym?.bio || '');
  const [styleNote, setStyleNote] = useState(heteronym?.styleNote || '');
  const [avatarColor, setAvatarColor] = useState(heteronym?.avatarColor || COLOR_SWATCHES[0]);
  const [avatarEmoji, setAvatarEmoji] = useState(heteronym?.avatarEmoji || '✍️');
  const [nameError, setNameError] = useState('');
  const [voice, setVoice] = useState<HeteronymVoice | undefined>(heteronym?.voice);
  const [customEmoji, setCustomEmoji] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Z5: scroll lock + Escape + Tab trap (replaces the bare Escape listener).
  useModalHygiene(panelRef, onClose);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t('nameRequired'));
      return;
    }
    onSave({
      name: trimmedName,
      bio: bio.trim(),
      styleNote: styleNote.trim(),
      avatarColor,
      avatarEmoji,
      voice,
    });
  };

  const handleCustomEmojiChange = (value: string) => {
    setCustomEmoji(value);
    // Extract the last emoji-like character
    const emojis = [...value];
    if (emojis.length > 0) {
      setAvatarEmoji(emojis[emojis.length - 1]);
    }
  };

  const isEditing = !!heteronym;

  return (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? t('editAria') : t('createAria')}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-parchment-100 border border-sepia-300/40 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto custom-scrollbar texture-parchment"
        >
          <div className="flex items-center justify-between p-6 border-b border-sepia-300/50">
            <h2 className="text-lg font-serif font-semibold text-sepia-900">
              {isEditing ? t('editTitle') : t('newTitle')}
            </h2>
            <button onClick={onClose} className="p-1 text-sepia-600 hover:text-sepia-800 rounded-lg hover:bg-parchment-200">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Live Preview */}
            <div className="flex items-center gap-3 pb-4 border-b border-sepia-300/50">
              <AvatarCircle color={avatarColor} emoji={avatarEmoji} size={48} />
              <div>
                <p className="text-sepia-900 font-medium">{name || t('unnamed')}</p>
                <p className="text-xs text-sepia-600">{styleNote || t('noStyleNote')}</p>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-sepia-700 mb-1">{t('nameLabel')}</label>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  const v = e.target.value.slice(0, 30);
                  setName(v);
                  if (v.trim()) setNameError('');
                }}
                maxLength={30}
                className="w-full bg-parchment-200 border border-sepia-300/40 rounded-lg px-3 py-2 text-sepia-900 focus:outline-none focus:border-brass-500/60"
                placeholder={t('namePlaceholder')}
              />
              <div className="flex justify-between mt-1">
                {nameError ? (
                  <p className="text-xs text-wax-600">{nameError}</p>
                ) : (
                  <span />
                )}
                <span className="text-xs text-sepia-600">{name.length}/30</span>
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-sepia-700 mb-1">{t('bioLabel')}</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 150))}
                maxLength={150}
                rows={2}
                className="w-full bg-parchment-200 border border-sepia-300/40 rounded-lg px-3 py-2 text-sepia-900 resize-none focus:outline-none focus:border-brass-500/60"
                placeholder={t('bioPlaceholder')}
              />
              <p className="text-xs text-sepia-600 text-right mt-1">{bio.length}/150</p>
            </div>

            {/* Voice & Style */}
            <div>
              <label className="block text-sm font-medium text-sepia-700 mb-2">{t('voiceStyleLabel')}</label>
              <VoiceToneEditor
                initialVoice={voice}
                styleNote={styleNote}
                onVoiceChange={setVoice}
                onStyleNoteChange={setStyleNote}
              />
            </div>

            {/* Avatar Color */}
            <div>
              <label className="block text-sm font-medium text-sepia-700 mb-2">{t('avatarColor')}</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAvatarColor(color)}
                    className={`w-8 h-8 rounded-full transition ${
                      avatarColor === color ? 'ring-2 ring-white outline-offset-2 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={t('colorAria', { color })}
                  />
                ))}
                <label className="w-8 h-8 rounded-full border-2 border-dashed border-sepia-300/50 flex items-center justify-center cursor-pointer hover:border-sepia-400 transition-colors relative overflow-hidden">
                  <span className="text-xs text-sepia-600">+</span>
                  <input
                    type="color"
                    value={avatarColor}
                    onChange={(e) => setAvatarColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    aria-label={t('customColor')}
                  />
                </label>
              </div>
            </div>

            {/* Avatar Emoji */}
            <div>
              <label className="block text-sm font-medium text-sepia-700 mb-2">{t('avatarEmoji')}</label>
              <div className="grid grid-cols-8 gap-1.5 mb-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatarEmoji(emoji)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition ${
                      avatarEmoji === emoji
                        ? 'bg-parchment-300 ring-2 ring-brass-400'
                        : 'hover:bg-parchment-200'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-sepia-600">{t('orType')}</span>
                <input
                  type="text"
                  value={customEmoji}
                  onChange={(e) => handleCustomEmojiChange(e.target.value)}
                  className="w-16 bg-parchment-200 border border-sepia-300/40 rounded px-2 py-1 text-center text-lg focus:outline-none focus:border-brass-500/60"
                  placeholder="🎭"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-sepia-300/50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-sepia-700 hover:bg-parchment-200 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-forest-700 text-cream-50 hover:bg-forest-600 transition-colors"
              >
                {isEditing ? t('saveChanges') : t('createAlterEgo')}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
  );
}

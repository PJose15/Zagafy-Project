'use client';

import { UserCircle } from 'lucide-react';
import { ParchmentCard, ParchmentInput } from '@/components/antiquarian';
import { useProfile } from '@/hooks/use-profile';
import { AVATAR_EMOJIS, AVATAR_COLORS } from '@/lib/profiles/profile';

/** Local profile editor — display name, avatar, and preferences. No login. */
export function ProfileSettings() {
  const { profile, save, setPreferences } = useProfile();

  return (
    <ParchmentCard className="space-y-4">
      <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
        <UserCircle size={20} aria-hidden="true" className="text-brass-500" />
        Profile
      </h2>
      <p className="text-sepia-600 text-sm leading-relaxed">
        Your local identity in Zagafy. Stored in this browser only — no account or sign-in required.
      </p>

      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-parchment"
          style={{ backgroundColor: profile.avatarColor }}
          aria-hidden="true"
        >
          {profile.avatarEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <label htmlFor="profile-name" className="block text-xs font-medium text-sepia-600 mb-1">
            Display name
          </label>
          <ParchmentInput
            id="profile-name"
            value={profile.displayName}
            onChange={e => save({ displayName: e.target.value })}
            placeholder="Your name"
            maxLength={60}
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-sepia-600 mb-2">Avatar</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => save({ avatarEmoji: emoji })}
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                profile.avatarEmoji === emoji
                  ? 'bg-brass-300/40 ring-2 ring-brass-500/60'
                  : 'bg-parchment-200/60 hover:bg-parchment-300/60'
              }`}
              aria-label={`Use ${emoji} avatar`}
              aria-pressed={profile.avatarEmoji === emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-sepia-600 mb-2">Colour</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => save({ avatarColor: color })}
              className={`w-8 h-8 rounded-full transition-transform ${
                profile.avatarColor === color ? 'ring-2 ring-offset-2 ring-offset-parchment-100 ring-sepia-700 scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Use colour ${color}`}
              aria-pressed={profile.avatarColor === color}
            />
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-sepia-800 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={profile.preferences.reducedMotion}
          onChange={e => setPreferences({ reducedMotion: e.target.checked })}
          className="accent-brass-500"
        />
        Reduce motion &amp; animations
      </label>
    </ParchmentCard>
  );
}

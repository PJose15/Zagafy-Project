'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  subscribeProfile,
  getProfileSnapshot,
  getServerProfileSnapshot,
  saveProfile as persistProfile,
  updatePreferences as persistPreferences,
  type Profile,
  type ProfilePreferences,
} from '@/lib/profiles/profile';

/**
 * Reactive access to the local profile via useSyncExternalStore — updates on
 * same-tab changes (PROFILE_CHANGED_EVENT) and cross-tab changes (storage).
 * `profile` is always defined (a stable default before anything is saved).
 */
export function useProfile() {
  const profile = useSyncExternalStore(
    subscribeProfile,
    getProfileSnapshot,
    getServerProfileSnapshot,
  );

  const save = useCallback((patch: Partial<Omit<Profile, 'preferences'>>) => {
    persistProfile(patch);
  }, []);

  const setPreferences = useCallback((patch: Partial<ProfilePreferences>) => {
    persistPreferences(patch);
  }, []);

  return { profile, save, setPreferences };
}

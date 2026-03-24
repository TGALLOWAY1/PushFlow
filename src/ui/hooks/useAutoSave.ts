/**
 * useAutoSave — debounced auto-persistence of ProjectState to localStorage.
 *
 * Saves 1 s after the last state change.  Flushes immediately on
 * beforeunload / visibilitychange so nothing is lost on reload or tab-close.
 */

import { useEffect, useRef } from 'react';
import { type ProjectState } from '../state/projectState';
import { saveProject } from '../persistence/projectStorage';

const DEBOUNCE_MS = 1_000;

export function useAutoSave(state: ProjectState): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  const isFirstRender = useRef(true);

  // Always keep stateRef current so flush helpers see latest state.
  stateRef.current = state;

  useEffect(() => {
    // Skip saving the state we just loaded from storage.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveProject(stateRef.current);
      timerRef.current = null;
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state]);

  // Flush any pending save on page unload or tab hide.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        saveProject(stateRef.current);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      flush(); // also flush on unmount
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}

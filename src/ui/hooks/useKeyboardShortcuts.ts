/**
 * useKeyboardShortcuts.
 *
 * Global keyboard shortcuts for the project editor:
 * - Ctrl+Z / Cmd+Z: Undo
 * - Ctrl+Y / Cmd+Shift+Z: Redo
 * - Delete / Backspace: Remove selected pad assignment
 * - Escape: Deselect event
 */

import { useEffect } from 'react';
import { useProject } from '../state/ProjectContext';
import { getActiveLayout } from '../state/projectState';

export function useKeyboardShortcuts() {
  const { state, dispatch, undo, redo } = useProject();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Undo: Ctrl+Z / Cmd+Z
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Y / Cmd+Shift+Z
      if ((isMod && e.key === 'y') || (isMod && e.shiftKey && e.key === 'z') || (isMod && e.shiftKey && e.key === 'Z')) {
        e.preventDefault();
        redo();
        return;
      }

      // Escape: Deselect
      if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_EVENT', payload: null });
        return;
      }

      // Delete / Backspace: Remove pad at selected event
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedEventIndex === null) return;
        const assignments = state.analysisResult?.executionPlan.fingerAssignments;
        if (!assignments) return;
        const a = assignments.find(fa => fa.eventIndex === state.selectedEventIndex);
        if (!a || a.row === undefined || a.col === undefined) return;
        const layout = getActiveLayout(state);
        if (!layout) return;
        const padKey = `${a.row},${a.col}`;
        if (layout.padToVoice[padKey]) {
          e.preventDefault();
          dispatch({ type: 'REMOVE_VOICE_FROM_PAD', payload: { padKey } });
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, dispatch, undo, redo]);
}

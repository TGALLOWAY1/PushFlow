/**
 * TimelinePanel.
 *
 * Collapsible bottom panel wrapping ExecutionTimeline.
 * Filters to only show unmuted sound streams.
 * Provides bidirectional selection with the grid.
 */

import { useState, useMemo } from 'react';
import { useProject } from '../state/ProjectContext';
import { getActiveStreams } from '../state/projectState';
import { ExecutionTimeline } from './ExecutionTimeline';
import { type Voice } from '../../types/voice';

export function TimelinePanel() {
  const { state, dispatch } = useProject();
  const [collapsed, setCollapsed] = useState(false);

  const activeStreams = getActiveStreams(state);
  const assignments = state.analysisResult?.executionPlan.fingerAssignments;

  // Build Voice[] from active streams for the timeline
  const voices: Voice[] = useMemo(() =>
    activeStreams.map(s => ({
      id: s.id,
      name: s.name,
      sourceType: 'midi_track' as const,
      sourceFile: '',
      originalMidiNote: s.originalMidiNote,
      color: s.color,
    })),
    [activeStreams]
  );

  // Filter assignments to only unmuted streams
  const activeNotes = useMemo(() =>
    new Set(activeStreams.map(s => s.originalMidiNote)),
    [activeStreams]
  );

  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    return assignments.filter(a => activeNotes.has(a.noteNumber));
  }, [assignments, activeNotes]);

  if (activeStreams.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg bg-gray-800/30 border border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-400 hover:bg-gray-800/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="font-medium">
          Timeline
          <span className="text-gray-500 ml-2">
            {new Set(filteredAssignments.map(a => a.startTime)).size} events
          </span>
        </span>
        <span className="text-gray-600">{collapsed ? '+' : '-'}</span>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <ExecutionTimeline
            assignments={filteredAssignments}
            voices={voices}
            selectedEventIndex={state.selectedEventIndex}
            onEventClick={idx => dispatch({ type: 'SELECT_EVENT', payload: idx })}
            tempo={state.tempo}
          />
        </div>
      )}
    </div>
  );
}

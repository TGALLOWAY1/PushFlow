/**
 * ExecutionTimeline Component.
 *
 * Per-voice swim lane timeline showing finger assignments over time.
 * Each voice gets its own horizontal lane. Events are colored by hand
 * and labeled with the finger used.
 */

import { useMemo } from 'react';
import { type FingerAssignment } from '../../types/executionPlan';
import { type Voice } from '../../types/voice';

interface ExecutionTimelineProps {
  assignments: FingerAssignment[];
  voices: Voice[];
  selectedEventIndex?: number | null;
  onEventClick?: (eventIndex: number) => void;
}

const FINGER_ABBREV: Record<string, string> = {
  thumb: 'Th', index: 'Ix', middle: 'Md', ring: 'Rg', pinky: 'Pk',
};

const HAND_STYLES = {
  left: { bg: '#3b82f6', text: '#dbeafe' },
  right: { bg: '#a855f7', text: '#f3e8ff' },
  Unplayable: { bg: '#ef4444', text: '#fecaca' },
};

const LANE_HEIGHT = 28;

export function ExecutionTimeline({ assignments, voices, selectedEventIndex, onEventClick }: ExecutionTimelineProps) {
  if (assignments.length === 0) {
    return <div className="text-gray-500 text-sm">No assignments to display.</div>;
  }

  const minTime = assignments[0].startTime;
  const maxTime = assignments[assignments.length - 1].startTime;
  const duration = Math.max(maxTime - minTime, 0.1);

  // Build voice lookup by noteNumber
  const voiceByNote = useMemo(() => {
    const map = new Map<number, Voice>();
    for (const v of voices) {
      if (v.originalMidiNote !== null) map.set(v.originalMidiNote, v);
    }
    return map;
  }, [voices]);

  // Discover unique voices (by noteNumber) from assignments, ordered by first appearance
  const voiceLanes = useMemo(() => {
    const seen = new Map<number, { noteNumber: number; voice: Voice | null; firstTime: number }>();
    for (const a of assignments) {
      if (!seen.has(a.noteNumber)) {
        seen.set(a.noteNumber, {
          noteNumber: a.noteNumber,
          voice: voiceByNote.get(a.noteNumber) ?? null,
          firstTime: a.startTime,
        });
      }
    }
    // Sort by noteNumber for a stable vertical order
    return [...seen.values()].sort((a, b) => a.noteNumber - b.noteNumber);
  }, [assignments, voiceByNote]);

  // Map noteNumber to lane index
  const laneIndex = new Map<number, number>();
  voiceLanes.forEach((lane, i) => laneIndex.set(lane.noteNumber, i));

  const totalHeight = voiceLanes.length * LANE_HEIGHT;

  return (
    <div className="w-full space-y-1">
      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: HAND_STYLES.left.bg }} /> Left
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: HAND_STYLES.right.bg }} /> Right
        </span>
        <span className="text-gray-500">|</span>
        <span>{assignments.length} events</span>
        <span>{assignments.filter(a => a.assignedHand === 'Unplayable').length} unplayable</span>
        <span>Duration: {duration.toFixed(1)}s</span>
      </div>

      {/* Swim lanes */}
      <div className="flex">
        {/* Voice labels */}
        <div className="flex-shrink-0 w-20 pr-2" style={{ height: totalHeight }}>
          {voiceLanes.map(lane => (
            <div
              key={lane.noteNumber}
              className="flex items-center justify-end text-[10px] truncate"
              style={{ height: LANE_HEIGHT }}
            >
              <span
                className="truncate font-medium"
                style={{ color: lane.voice?.color ?? '#9ca3af' }}
                title={lane.voice?.name ?? `Note ${lane.noteNumber}`}
              >
                {lane.voice?.name ?? `N${lane.noteNumber}`}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="flex-1 relative overflow-hidden rounded border border-gray-700 bg-gray-900/50" style={{ height: totalHeight }}>
          {/* Lane dividers */}
          {voiceLanes.map((_, i) => (
            <div
              key={i}
              className="absolute w-full border-b border-gray-800/50"
              style={{ top: (i + 1) * LANE_HEIGHT }}
            />
          ))}

          {/* Alternating lane backgrounds */}
          {voiceLanes.map((_, i) => (
            i % 2 === 1 ? (
              <div
                key={`bg-${i}`}
                className="absolute w-full bg-white/[0.02]"
                style={{ top: i * LANE_HEIGHT, height: LANE_HEIGHT }}
              />
            ) : null
          ))}

          {/* Events */}
          {assignments.map((a, i) => {
            const lane = laneIndex.get(a.noteNumber);
            if (lane === undefined) return null;

            const x = ((a.startTime - minTime) / duration) * 100;
            const isSelected = a.eventIndex === selectedEventIndex;
            const style = HAND_STYLES[a.assignedHand] ?? HAND_STYLES.Unplayable;
            const fingerLabel = a.finger ? FINGER_ABBREV[a.finger] ?? a.finger : '?';
            const handPrefix = a.assignedHand === 'left' ? 'L' : a.assignedHand === 'right' ? 'R' : '!';

            return (
              <button
                key={`${a.eventIndex ?? i}-${a.startTime}`}
                className={`absolute flex items-center justify-center rounded-sm transition-all
                  ${isSelected ? 'z-20 ring-2 ring-yellow-400 scale-110' : 'z-10 hover:z-20 hover:scale-105'}`}
                style={{
                  left: `calc(${x}% - 10px)`,
                  top: lane * LANE_HEIGHT + 3,
                  width: 20,
                  height: LANE_HEIGHT - 6,
                  backgroundColor: style.bg,
                  opacity: isSelected ? 1 : 0.85,
                }}
                onClick={() => onEventClick?.(a.eventIndex ?? i)}
                title={`${a.startTime.toFixed(3)}s | ${handPrefix}-${fingerLabel} | cost: ${a.cost.toFixed(1)} | ${a.difficulty}`}
              >
                <span className="text-[7px] font-bold leading-none" style={{ color: style.text }}>
                  {fingerLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Time axis */}
      <div className="flex ml-20">
        <div className="flex-1 flex justify-between text-[10px] text-gray-500">
          <span>{minTime.toFixed(1)}s</span>
          <span>{((minTime + maxTime) / 2).toFixed(1)}s</span>
          <span>{maxTime.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

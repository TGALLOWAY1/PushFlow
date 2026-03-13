/**
 * InteractiveGrid.
 *
 * Wraps the 8x8 Push 3 grid with interactive editing capabilities:
 * - Click empty pad to assign selected sound
 * - Drag sound from VoicePalette onto a pad
 * - Drag between pads to swap
 * - Click assigned pad to select/inspect
 * - Drop-target highlighting
 */

import { useState, useCallback, useMemo } from 'react';
import chroma from 'chroma-js';
import { useProject } from '../state/ProjectContext';
import { getActiveLayout, getActiveStreams, type SoundStream } from '../state/projectState';
import { PadContextMenu } from './PadContextMenu';
import { type Voice } from '../../types/voice';
import { type FingerAssignment } from '../../types/executionPlan';

interface InteractiveGridProps {
  assignments?: FingerAssignment[];
  selectedEventIndex?: number | null;
  onEventClick?: (idx: number | null) => void;
  /** When provided, display this layout instead of the global active layout.
   *  Used when viewing a candidate solution whose layout differs from the user's. */
  layoutOverride?: import('../../types/layout').Layout;
}

/** Abbreviated finger names for display */
const FINGER_ABBREV: Record<string, string> = {
  thumb: 'Th', index: 'Ix', middle: 'Md', ring: 'Rg', pinky: 'Pk',
};

const HAND_COLORS = {
  left: { bg: 'rgba(59,130,246,0.25)', border: '#3b82f6', text: '#93c5fd' },
  right: { bg: 'rgba(168,85,247,0.25)', border: '#a855f7', text: '#d8b4fe' },
  Unplayable: { bg: 'rgba(239,68,68,0.2)', border: '#ef4444', text: '#fca5a5' },
  mixed: { bg: 'rgba(234,179,8,0.2)', border: '#eab308', text: '#fde68a' },
};

interface PadSummary {
  voiceName: string;
  voiceColor: string | null;
  noteNumber: number | null;
  hands: Set<string>;
  fingers: Set<string>;
  hitCount: number;
}

function safeColorAlpha(color: string | null | undefined, alpha: number, fallback: string) {
  if (!color) return fallback;
  try {
    return chroma(color).alpha(alpha).css();
  } catch {
    return fallback;
  }
}

export function InteractiveGrid({ assignments, selectedEventIndex, onEventClick, layoutOverride }: InteractiveGridProps) {
  const { state, dispatch } = useProject();
  const layout = layoutOverride ?? getActiveLayout(state);
  const activeStreams = getActiveStreams(state);
  const [dragOverPad, setDragOverPad] = useState<string | null>(null);
  const [dragSourcePad, setDragSourcePad] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ padKey: string; x: number; y: number } | null>(null);

  // Voice lookup by noteNumber
  const voiceByNote = useMemo(() => {
    const map = new Map<number, SoundStream>();
    for (const s of state.soundStreams) {
      map.set(s.originalMidiNote, s);
    }
    return map;
  }, [state.soundStreams]);

  // Build per-pad summary from assignments (analysis results)
  const padSummaries = useMemo(() => {
    const map = new Map<string, PadSummary>();
    if (!assignments) return map;
    for (const a of assignments) {
      if (a.row === undefined || a.col === undefined) continue;
      const key = `${a.row},${a.col}`;
      let summary = map.get(key);
      if (!summary) {
        const voice = voiceByNote.get(a.noteNumber);
        summary = {
          voiceName: voice?.name ?? `N${a.noteNumber}`,
          voiceColor: voice?.color ?? null,
          noteNumber: a.noteNumber,
          hands: new Set(),
          fingers: new Set(),
          hitCount: 0,
        };
        map.set(key, summary);
      }
      summary.hands.add(a.assignedHand);
      if (a.finger) summary.fingers.add(`${a.assignedHand[0].toUpperCase()}-${FINGER_ABBREV[a.finger] ?? a.finger}`);
      summary.hitCount++;
    }
    return map;
  }, [assignments, voiceByNote]);

  // Selected pads: all assignments at the same start time as the selected event
  const selectedPadKeys = useMemo(() => {
    const keys = new Set<string>();
    if (selectedEventIndex === null || !assignments) return keys;
    const selectedAssignment = assignments.find(a => a.eventIndex === selectedEventIndex);
    if (!selectedAssignment) return keys;
    const targetTime = selectedAssignment.startTime;
    for (const a of assignments) {
      if (a.startTime === targetTime && a.row !== undefined && a.col !== undefined) {
        keys.add(`${a.row},${a.col}`);
      }
    }
    return keys;
  }, [assignments, selectedEventIndex]);

  // Active playing pads
  const activePadKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!assignments || (!state.isPlaying && state.currentTime === 0)) return keys;
    
    // Map event keys to durations
    const durationMap = new Map<string, number>();
    for (const stream of state.soundStreams) {
      if (stream.muted) continue;
      for (const ev of stream.events) {
        durationMap.set(ev.eventKey, ev.duration);
      }
    }

    for (const a of assignments) {
      const duration = (a.eventKey && durationMap.get(a.eventKey)) || 0.2;
      if (state.currentTime >= a.startTime && state.currentTime < a.startTime + duration) {
        if (a.row !== undefined && a.col !== undefined) {
          keys.add(`${a.row},${a.col}`);
        }
      }
    }
    return keys;
  }, [assignments, state.currentTime, state.isPlaying, state.soundStreams]);

  // Handle dropping a sound onto a pad
  const handleDrop = useCallback((e: React.DragEvent, padKey: string) => {
    e.preventDefault();
    setDragOverPad(null);

    // Check if it's a palette drag (sound stream)
    const streamData = e.dataTransfer.getData('application/pushflow-stream');
    if (streamData) {
      try {
        const data = JSON.parse(streamData);
        const stream = state.soundStreams.find(s => s.id === data.id);
        if (stream) {
          dispatch({ type: 'ASSIGN_VOICE_TO_PAD', payload: { padKey, stream } });
        }
      } catch { /* invalid data */ }
      setDragSourcePad(null);
      return;
    }

    // Check if it's a pad-to-pad drag (swap)
    const padData = e.dataTransfer.getData('application/pushflow-pad');
    if (padData && padData !== padKey) {
      dispatch({ type: 'SWAP_PADS', payload: { padKeyA: padData, padKeyB: padKey } });
    }
    setDragSourcePad(null);
  }, [state.soundStreams, dispatch]);

  const handleDragOver = useCallback((e: React.DragEvent, padKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPad(padKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverPad(null);
  }, []);

  // Drag from a pad (for swapping)
  const handlePadDragStart = useCallback((e: React.DragEvent, padKey: string, voice: Voice) => {
    e.dataTransfer.setData('application/pushflow-pad', padKey);
    e.dataTransfer.setData('application/pushflow-stream', JSON.stringify({
      id: voice.id,
      name: voice.name,
      color: voice.color,
      originalMidiNote: voice.originalMidiNote,
      source: 'grid',
    }));
    e.dataTransfer.effectAllowed = 'move';
    setDragSourcePad(padKey);
  }, []);

  const handlePadClick = useCallback((row: number, col: number) => {
    const padKey = `${row},${col}`;
    const voice = layout?.padToVoice[padKey];

    if (!voice) {
      // Empty pad — if there's a selected event, find its assignment
      if (onEventClick) onEventClick(null);
      return;
    }

    // Pad has a voice — find an assignment for this pad and select it
    if (assignments && onEventClick) {
      const a = assignments.find(fa => fa.row === row && fa.col === col);
      onEventClick(a?.eventIndex ?? null);
    }
  }, [layout, assignments, onEventClick]);

  const handleRemovePad = useCallback((padKey: string) => {
    dispatch({ type: 'REMOVE_VOICE_FROM_PAD', payload: { padKey } });
  }, [dispatch]);

  // Render grid rows (row 7 at top, row 0 at bottom — Push 3 orientation)
  const rows = [];
  for (let row = 7; row >= 0; row--) {
    const cells = [];
    for (let col = 0; col < 8; col++) {
      const padKey = `${row},${col}`;
      const voice = layout?.padToVoice[padKey];
      const summary = padSummaries.get(padKey);
      const isSelected = selectedPadKeys.has(padKey);
      const isActivePlaying = activePadKeys.has(padKey);
      const isDragOver = padKey === dragOverPad;
      const isDragSource = padKey === dragSourcePad;
      const isLeftZone = col < 4;
      const constraint = layout?.fingerConstraints[padKey];

      // Determine colors
      let bgColor: string;
      let borderColor: string;
      let textColor: string;

      if (voice) {
        if (summary && summary.hitCount > 0) {
          const hands = [...summary.hands];
          if (hands.length === 1 && hands[0] !== 'Unplayable') {
            const scheme = HAND_COLORS[hands[0] as 'left' | 'right'] ?? HAND_COLORS.mixed;
            bgColor = safeColorAlpha(voice.color, 0.25, scheme.bg);
            borderColor = scheme.border;
            textColor = scheme.text;
          } else if (hands.includes('Unplayable') && hands.length === 1) {
            bgColor = HAND_COLORS.Unplayable.bg;
            borderColor = HAND_COLORS.Unplayable.border;
            textColor = HAND_COLORS.Unplayable.text;
          } else {
            bgColor = safeColorAlpha(voice.color, 0.25, HAND_COLORS.mixed.bg);
            borderColor = HAND_COLORS.mixed.border;
            textColor = HAND_COLORS.mixed.text;
          }
        } else {
          // Assigned but no analysis yet
          bgColor = safeColorAlpha(voice.color, 0.18, '#1e293b');
          borderColor = voice.color ?? '#334155';
          textColor = '#94a3b8';
        }
      } else {
        bgColor = isLeftZone ? '#0f172a' : '#120f1f';
        borderColor = '#1e293b';
        textColor = '#475569';
      }

      // Finger display
      const fingerList = summary ? [...summary.fingers].slice(0, 2) : [];

      // Check if stream is muted
      const streamForVoice = voice ? state.soundStreams.find(s => s.id === voice.id) : null;
      const isMuted = streamForVoice?.muted ?? false;

      cells.push(
        <div
          key={padKey}
          className={`
            group relative flex flex-col items-center justify-center
            w-14 h-14 rounded-lg text-[10px] font-mono leading-tight
            border-2 transition-all duration-100 select-none
            ${isSelected ? 'ring-2 ring-yellow-400/60 z-10 scale-105' : ''}
            ${isActivePlaying && !isSelected ? 'ring-2 ring-emerald-400/90 z-10 scale-105 brightness-125' : ''}
            ${isDragOver ? 'ring-2 ring-blue-400/60 scale-105' : ''}
            ${isDragSource ? 'opacity-30' : ''}
            ${isMuted ? 'opacity-30 pointer-events-none' : ''}
            ${!voice ? 'hover:border-gray-600' : 'hover:scale-[1.02]'}
            ${isMuted ? 'cursor-default' : 'cursor-pointer'}
          `}
          style={{
            backgroundColor: isDragOver ? 'rgba(59,130,246,0.15)' : bgColor,
            borderColor: isDragOver ? '#3b82f6' : isSelected ? '#facc15' : borderColor,
            color: textColor,
          }}
          onClick={() => !isMuted && handlePadClick(row, col)}
          onContextMenu={e => {
            e.preventDefault();
            if (!isMuted) setContextMenu({ padKey, x: e.clientX, y: e.clientY });
          }}
          onDragOver={e => !isMuted && handleDragOver(e, padKey)}
          onDragLeave={handleDragLeave}
          onDrop={e => !isMuted && handleDrop(e, padKey)}
          draggable={!!voice && !isMuted}
          onDragStart={e => voice && !isMuted && handlePadDragStart(e, padKey, voice)}
          onDragEnd={() => { setDragSourcePad(null); setDragOverPad(null); }}
          title={voice
            ? `[${row},${col}] ${voice.name}${summary ? ` | ${summary.hitCount} hits` : ''}${constraint ? ` | Constraint: ${constraint}` : ''}`
            : `[${row},${col}] empty — drop a sound here`}
        >
          {voice ? (
            <>
              {/* Voice name */}
              <span className="block truncate w-full px-0.5 text-center text-[11px] font-semibold text-white/95 leading-tight">
                {voice.name}
              </span>
              {/* Fingers (from analysis) */}
              {fingerList.length > 0 && (
                <span className="block text-[10px] font-medium leading-none mt-0.5" style={{ color: textColor }}>
                  {fingerList.join(' ')}
                </span>
              )}
              {/* Hit count and Constraint badges removed as per UX audit. They are now visible solely in the tooltip (title attribute). */}
              
              {/* Remove button (visible on hover via parent group) */}
              <button
                className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center
                           text-[9px] text-red-300 bg-red-500/30 rounded-bl opacity-0
                           group-hover:opacity-100 transition-opacity"
                onClick={e => {
                  e.stopPropagation();
                  handleRemovePad(padKey);
                }}
                title="Remove from pad"
              >
                ×
              </button>
            </>
          ) : (
            <span className="text-[8px] text-gray-600">{row},{col}</span>
          )}
        </div>
      );
    }
    rows.push(
      <div key={row} className="flex gap-1 items-center">
        <span className="w-4 text-[10px] text-gray-500 text-right mr-1 font-mono">{row}</span>
        {cells}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Analysis stale indicator */}
      {state.analysisStale && state.analysisResult && (
        <div className="text-[10px] text-amber-400 mb-1">
          Layout changed — analysis outdated
        </div>
      )}

      <div className="inline-block">
        <div className="flex flex-col gap-1">
          {rows}
          {/* Column labels */}
          <div className="flex gap-1 ml-5">
            {Array.from({ length: 8 }, (_, col) => (
              <div key={col} className="w-14 text-center text-[10px] text-gray-500 font-mono">{col}</div>
            ))}
          </div>
        </div>
        {/* Zone labels */}
        <div className="flex ml-5 mt-1 gap-1">
          <div className="w-[calc(4*3.5rem+3*0.25rem)] text-center text-[10px] text-blue-400/70 border-t border-blue-500/20 pt-0.5">
            Left Hand
          </div>
          <div className="w-[calc(4*3.5rem+3*0.25rem)] text-center text-[10px] text-purple-400/70 border-t border-purple-500/20 pt-0.5">
            Right Hand
          </div>
        </div>
      </div>

      {/* Summary line */}
      {layout && (
        <div className="text-[10px] text-gray-500 mt-1">
          {Object.keys(layout.padToVoice).length} pad{Object.keys(layout.padToVoice).length !== 1 ? 's' : ''} assigned
          {' / '}
          {activeStreams.length} active sound{activeStreams.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <PadContextMenu
          padKey={contextMenu.padKey}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

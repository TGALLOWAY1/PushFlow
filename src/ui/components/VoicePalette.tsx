/**
 * VoicePalette.
 *
 * Lists all SoundStreams with: color swatch, name, event count, mute toggle,
 * pad location (if assigned), and drag handle for placing on grid.
 * Streams are grouped into "On Grid" and "Unassigned".
 */

import { useMemo } from 'react';
import { useProject } from '../state/ProjectContext';
import { getActiveLayout, type SoundStream } from '../state/projectState';

export function VoicePalette() {
  const { state, dispatch } = useProject();
  const layout = getActiveLayout(state);

  // Build a map of which pads each stream occupies
  const streamPadLocations = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!layout) return map;
    for (const [padKey, voice] of Object.entries(layout.padToVoice)) {
      const existing = map.get(voice.id) ?? [];
      existing.push(padKey);
      map.set(voice.id, existing);
    }
    return map;
  }, [layout]);

  // Split into assigned vs unassigned
  const { assigned, unassigned } = useMemo(() => {
    const a: SoundStream[] = [];
    const u: SoundStream[] = [];
    for (const stream of state.soundStreams) {
      if (streamPadLocations.has(stream.id)) {
        a.push(stream);
      } else {
        u.push(stream);
      }
    }
    return { assigned: a, unassigned: u };
  }, [state.soundStreams, streamPadLocations]);

  const handleDragStart = (e: React.DragEvent, stream: SoundStream) => {
    e.dataTransfer.setData('application/pushflow-stream', JSON.stringify({
      id: stream.id,
      name: stream.name,
      color: stream.color,
      originalMidiNote: stream.originalMidiNote,
      source: 'palette',
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Sounds
      </h3>

      {/* Unassigned streams */}
      {unassigned.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500">
            Unassigned ({unassigned.length})
          </span>
          {unassigned.map(stream => (
            <StreamRow
              key={stream.id}
              stream={stream}
              padKeys={[]}
              onToggleMute={() => dispatch({ type: 'TOGGLE_MUTE', payload: stream.id })}
              onDragStart={handleDragStart}
            />
          ))}
        </div>
      )}

      {/* Assigned streams */}
      {assigned.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500">
            On Grid ({assigned.length})
          </span>
          {assigned.map(stream => (
            <StreamRow
              key={stream.id}
              stream={stream}
              padKeys={streamPadLocations.get(stream.id) ?? []}
              onToggleMute={() => dispatch({ type: 'TOGGLE_MUTE', payload: stream.id })}
              onDragStart={handleDragStart}
            />
          ))}
        </div>
      )}

      {state.soundStreams.length === 0 && (
        <p className="text-xs text-gray-500 py-2">No sounds loaded.</p>
      )}
    </div>
  );
}

function StreamRow({
  stream,
  padKeys,
  onToggleMute,
  onDragStart,
}: {
  stream: SoundStream;
  padKeys: string[];
  onToggleMute: () => void;
  onDragStart: (e: React.DragEvent, stream: SoundStream) => void;
}) {
  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs
        border border-transparent hover:border-gray-700
        cursor-grab active:cursor-grabbing
        ${stream.muted ? 'opacity-40' : ''}
      `}
      draggable
      onDragStart={e => onDragStart(e, stream)}
    >
      {/* Color swatch */}
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: stream.color }}
      />

      {/* Name */}
      <span className="flex-1 truncate text-gray-200 font-medium">
        {stream.name}
      </span>

      {/* Event count */}
      <span className="text-gray-500 text-[10px] flex-shrink-0">
        {stream.events.length}x
      </span>

      {/* Pad location(s) */}
      {padKeys.length > 0 && (
        <span className="text-[10px] text-gray-500 font-mono flex-shrink-0">
          [{padKeys[0]}]
          {padKeys.length > 1 && `+${padKeys.length - 1}`}
        </span>
      )}

      {/* Mute toggle */}
      <button
        className={`
          flex-shrink-0 w-5 h-5 flex items-center justify-center rounded
          text-[10px] transition-colors
          ${stream.muted
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}
        `}
        onClick={e => {
          e.stopPropagation();
          onToggleMute();
        }}
        title={stream.muted ? 'Unmute' : 'Mute'}
      >
        {stream.muted ? 'M' : 'S'}
      </button>
    </div>
  );
}

/**
 * LoopGridCanvas.
 *
 * Step-sequencer grid for the Loop Editor.
 * Horizontal axis = time (steps), vertical axis = lanes.
 * Click to toggle events on/off.
 */

import { useRef, useCallback, useEffect } from 'react';
import {
  type LoopConfig,
  type LoopLane,
  type LoopEvent,
  type LoopCellKey,
  loopCellKey,
  stepsPerBar,
  totalSteps,
} from '../../../types/loopEditor';
import { type LoopEditorAction } from '../../state/loopEditorReducer';

interface LoopGridCanvasProps {
  config: LoopConfig;
  lanes: LoopLane[];
  events: Map<LoopCellKey, LoopEvent>;
  playheadStep: number;
  isPlaying: boolean;
  dispatch: React.Dispatch<LoopEditorAction>;
}

const CELL_WIDTH = 28;
const CELL_HEIGHT = 32;
const HEADER_HEIGHT = 40;
const SUB_HEADER_HEIGHT = 20;

export function LoopGridCanvas({
  config,
  lanes,
  events,
  playheadStep,
  isPlaying,
  dispatch,
}: LoopGridCanvasProps) {
  const playheadRef = useRef<HTMLDivElement>(null);
  const steps = totalSteps(config);
  const spb = stepsPerBar(config.subdivision);
  const sortedLanes = [...lanes].sort((a, b) => a.orderIndex - b.orderIndex);
  const gridWidth = steps * CELL_WIDTH;
  const gridHeight = sortedLanes.length * CELL_HEIGHT;

  // Update playhead position via ref (avoids re-render per frame)
  useEffect(() => {
    if (playheadRef.current) {
      const x = playheadStep * CELL_WIDTH;
      playheadRef.current.style.transform = `translateX(${x}px)`;
    }
  }, [playheadStep]);

  const handleCellClick = useCallback(
    (laneId: string, stepIndex: number) => {
      dispatch({ type: 'TOGGLE_CELL', payload: { laneId, stepIndex } });
    },
    [dispatch],
  );

  if (sortedLanes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Add lanes to get started
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto relative">
      <div style={{ minWidth: gridWidth }} className="relative">
        {/* Bar number headers */}
        <div className="sticky top-0 z-10 bg-gray-950" style={{ height: HEADER_HEIGHT }}>
          <div className="flex" style={{ height: HEADER_HEIGHT }}>
            {Array.from({ length: config.barCount }, (_, bar) => (
              <div
                key={bar}
                className="text-center text-xs font-medium text-gray-400 border-l border-gray-600 flex items-end justify-center pb-1"
                style={{ width: spb * CELL_WIDTH }}
              >
                {bar + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Subdivision labels */}
        <div className="sticky z-10 bg-gray-900/80" style={{ height: SUB_HEADER_HEIGHT, top: HEADER_HEIGHT }}>
          <div className="flex" style={{ height: SUB_HEADER_HEIGHT }}>
            {Array.from({ length: steps }, (_, step) => {
              const posInBar = step % spb;
              const beatSize = Math.max(1, spb / 4);
              const isBeat = posInBar % beatSize === 0;
              const beatNum = Math.floor(posInBar / beatSize) + 1;
              return (
                <div
                  key={step}
                  className="text-center text-[10px] text-gray-500 flex items-center justify-center"
                  style={{ width: CELL_WIDTH }}
                >
                  {isBeat ? beatNum : ''}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid body */}
        <div className="relative" style={{ height: gridHeight }}>
          {/* Bar and beat grid lines (background) */}
          {Array.from({ length: steps }, (_, step) => {
            const posInBar = step % spb;
            const isBarLine = posInBar === 0;
            const beatSize = Math.max(1, spb / 4);
            const isBeatLine = posInBar % beatSize === 0;
            return (
              <div
                key={`line-${step}`}
                className={`absolute top-0 bottom-0 ${
                  isBarLine
                    ? 'border-l border-gray-500'
                    : isBeatLine
                      ? 'border-l border-gray-700'
                      : 'border-l border-gray-800/50'
                }`}
                style={{ left: step * CELL_WIDTH }}
              />
            );
          })}

          {/* Lane rows */}
          {sortedLanes.map((lane, laneIndex) => (
            <div
              key={lane.id}
              className="flex absolute left-0 right-0"
              style={{
                top: laneIndex * CELL_HEIGHT,
                height: CELL_HEIGHT,
                opacity: lane.isMuted ? 0.3 : 1,
              }}
            >
              {/* Row border */}
              <div className="absolute inset-0 border-b border-gray-800/40" />

              {/* Cells */}
              {Array.from({ length: steps }, (_, step) => {
                const key = loopCellKey(lane.id, step);
                const event = events.get(key);
                const hasEvent = !!event;

                return (
                  <div
                    key={step}
                    className="relative cursor-pointer hover:bg-gray-700/30 transition-colors"
                    style={{ width: CELL_WIDTH, height: CELL_HEIGHT }}
                    onClick={() => handleCellClick(lane.id, step)}
                  >
                    {hasEvent && (
                      <div
                        className="absolute inset-[2px] rounded-sm"
                        style={{
                          backgroundColor: lane.color,
                          opacity: 0.4 + ((event?.velocity ?? 100) / 127) * 0.6,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Playhead */}
          {isPlaying && (
            <div
              ref={playheadRef}
              className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-20 pointer-events-none"
              style={{ transform: `translateX(${playheadStep * CELL_WIDTH}px)` }}
            />
          )}
        </div>

        {/* Right edge bar line */}
        <div
          className="absolute border-l border-gray-500"
          style={{
            left: gridWidth,
            top: HEADER_HEIGHT,
            bottom: 0,
          }}
        />
      </div>
    </div>
  );
}

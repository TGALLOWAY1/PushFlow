/**
 * LoopEditorView.
 *
 * Top-level container for the Loop Editor tab.
 * Manages local loop state, persistence, playback, and project commit.
 */

import { useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProject } from '../../state/ProjectContext';
import {
  loopEditorReducer,
  createInitialLoopState,
} from '../../state/loopEditorReducer';
import { saveLoopState, loadLoopState } from '../../persistence/loopStorage';
import { convertLoopToPerformanceLanes } from '../../state/loopToLanes';
import { type LoopLane } from '../../../types/loopEditor';
import { stepDuration, totalSteps } from '../../../types/loopEditor';
import { generateId } from '../../../utils/idGenerator';
import { LoopEditorToolbar } from './LoopEditorToolbar';
import { LoopLaneSidebar } from './LoopLaneSidebar';
import { LoopGridCanvas } from './LoopGridCanvas';

const LANE_COLORS = ['#ef4444', '#f97316', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
const DEFAULT_MIDI_NOTES = [36, 38, 42, 46, 48, 60, 62, 64];

export function LoopEditorView() {
  const { state: projectState, dispatch: projectDispatch } = useProject();

  // Initialize from localStorage or create fresh
  const initialState = useMemo(() => {
    const saved = loadLoopState(projectState.id);
    if (saved) return saved;
    return createInitialLoopState();
  }, [projectState.id]);

  const [loopState, dispatch] = useReducer(loopEditorReducer, initialState);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const playheadRef = useRef<number>(loopState.playheadStep);

  // Keep playheadRef in sync
  playheadRef.current = loopState.playheadStep;

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveLoopState(projectState.id, loopState);
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [loopState, projectState.id]);

  // Playback animation
  useEffect(() => {
    if (!loopState.isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      lastTimeRef.current = 0;
      return;
    }

    const stepDur = stepDuration(loopState.config);
    const steps = totalSteps(loopState.config);

    const tick = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }
      const elapsed = (timestamp - lastTimeRef.current) / 1000;
      const stepsAdvanced = elapsed / stepDur;
      const newStep = (playheadRef.current + stepsAdvanced) % steps;

      dispatch({ type: 'SET_PLAYHEAD', payload: newStep });
      lastTimeRef.current = timestamp;
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [loopState.isPlaying, loopState.config]);

  // Add lane
  const handleAddLane = useCallback(() => {
    const nextIndex = loopState.lanes.length;
    const newLane: LoopLane = {
      id: generateId('llane'),
      name: `Lane ${nextIndex + 1}`,
      color: LANE_COLORS[nextIndex % LANE_COLORS.length],
      midiNote: DEFAULT_MIDI_NOTES[nextIndex % DEFAULT_MIDI_NOTES.length] ?? null,
      orderIndex: nextIndex,
      isMuted: false,
      isSolo: false,
    };
    dispatch({ type: 'ADD_LANE', payload: newLane });
  }, [loopState.lanes.length]);

  // Commit loop to project
  const handleCommitToProject = useCallback(() => {
    const label = projectState.name || 'Loop Pattern';
    const result = convertLoopToPerformanceLanes(loopState, label);

    // Set group orderIndex after existing groups
    result.group.orderIndex = projectState.laneGroups.length;

    projectDispatch({
      type: 'IMPORT_LANES',
      payload: {
        lanes: result.lanes,
        sourceFile: result.sourceFile,
        group: result.group,
      },
    });
  }, [loopState, projectState.name, projectState.laneGroups.length, projectDispatch]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <LoopEditorToolbar
        config={loopState.config}
        laneCount={loopState.lanes.length}
        eventCount={loopState.events.size}
        isPlaying={loopState.isPlaying}
        dispatch={dispatch}
        onAddLane={handleAddLane}
        onCommitToProject={handleCommitToProject}
      />

      {/* Main content: sidebar + grid */}
      <div className="flex rounded-lg bg-gray-800/20 border border-gray-700 overflow-hidden" style={{ minHeight: 300 }}>
        <LoopLaneSidebar lanes={loopState.lanes} dispatch={dispatch} />
        <LoopGridCanvas
          config={loopState.config}
          lanes={loopState.lanes}
          events={loopState.events}
          playheadStep={loopState.playheadStep}
          isPlaying={loopState.isPlaying}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}

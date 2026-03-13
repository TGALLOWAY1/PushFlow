import { useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../state/ProjectContext';
import { saveProject } from '../../persistence/projectStorage';
import { EditorToolbar } from '../EditorToolbar';
import { VoicePalette } from '../VoicePalette';
import { InteractiveGrid } from '../InteractiveGrid';
import { CompareGridView } from '../CompareGridView';
import { AnalysisSidePanel } from '../AnalysisSidePanel';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { EventDetailPanel } from '../EventDetailPanel';
import { TimelinePanel } from '../TimelinePanel';
import { TransitionDetailPanel } from './TransitionDetailPanel';
import { LaneToolbar } from '../lanes/LaneToolbar';
import { LaneSidebar } from '../lanes/LaneSidebar';
import { LaneTimeline } from '../lanes/LaneTimeline';
import { LaneInspector } from '../lanes/LaneInspector';
import { WorkspacePatternStudio } from './WorkspacePatternStudio';
import { useAutoAnalysis } from '../../hooks/useAutoAnalysis';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

type FocusMode = 'balanced' | 'timeline' | 'layout';
type DrawerTab = 'execution' | 'composer';

const SIDEBAR_WIDTH = 256;
const INSPECTOR_WIDTH = 288;
const TIMELINE_PADDING = 100;

export function PerformanceWorkspace() {
  const { state, dispatch } = useProject();
  const navigate = useNavigate();
  const { generateFull, generationProgress } = useAutoAnalysis();
  useKeyboardShortcuts();

  const [focusMode, setFocusMode] = useState<FocusMode>('balanced');
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('execution');
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const [selectedLaneIds, setSelectedLaneIds] = useState<Set<string>>(new Set());
  const [currentZoom, setCurrentZoom] = useState(70);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventTime, setSelectedEventTime] = useState<number | null>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.performanceLanes.length === 0 && state.soundStreams.length > 0) {
      dispatch({ type: 'POPULATE_LANES_FROM_STREAMS' });
    }
  }, [state.performanceLanes.length, state.soundStreams.length, dispatch]);

  useEffect(() => {
    if (state.performanceLanes.length > 0) {
      dispatch({ type: 'SYNC_STREAMS_FROM_LANES' });
    }
  }, [state.performanceLanes, dispatch]);

  const minZoom = useMemo(() => {
    const secondsPerBeat = 60 / state.tempo;
    const totalDuration = secondsPerBeat * 16;
    const availableWidth = Math.max(window.innerWidth - SIDEBAR_WIDTH - INSPECTOR_WIDTH - TIMELINE_PADDING, 400);
    return Math.max(20, Math.round(availableWidth / totalDuration));
  }, [state.tempo]);

  const zoom = Math.max(currentZoom, minZoom);
  const setZoom = useCallback((nextZoom: number) => {
    setCurrentZoom(Math.max(nextZoom, minZoom));
  }, [minZoom]);

  const assignments = state.analysisResult?.executionPlan.fingerAssignments;

  useEffect(() => {
    if (!assignments || state.selectedEventIndex === null) return;
    const selectedAssignment = assignments.find(assignment => assignment.eventIndex === state.selectedEventIndex);
    if (selectedAssignment && selectedAssignment.startTime !== selectedEventTime) {
      setSelectedEventTime(selectedAssignment.startTime);
    }
  }, [assignments, state.selectedEventIndex, selectedEventTime]);

  const handleSelectEventTime = useCallback((time: number) => {
    setSelectedEventTime(time);
    if (!assignments) {
      dispatch({ type: 'SELECT_EVENT', payload: null });
      return;
    }
    const selectedAssignment = assignments.find(assignment => assignment.startTime === time);
    dispatch({ type: 'SELECT_EVENT', payload: selectedAssignment?.eventIndex ?? null });
  }, [assignments, dispatch]);

  const handleSelectLane = useCallback((id: string | null, multiSelect?: boolean) => {
    if (!id) {
      setSelectedLaneIds(new Set());
      return;
    }
    setSelectedLaneIds(prev => {
      if (multiSelect) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (prev.size === 1 && prev.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  const selectedLanes = state.performanceLanes.filter(lane => selectedLaneIds.has(lane.id));
  const selectedCandidate = state.candidates.find(candidate => candidate.id === state.selectedCandidateId) ?? null;
  const compareCandidate = state.candidates.find(candidate => candidate.id === state.compareCandidateId) ?? null;
  const isCompareMode = !!selectedCandidate && !!compareCandidate;

  return (
    <div className="max-w-[1600px] mx-auto space-y-3">
      <div className="flex items-center gap-3">
        <button
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          onClick={() => {
            saveProject(state);
            navigate('/');
          }}
          title="Save and return to library"
        >
          &larr; Library
        </button>

        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-200 truncate">
            {state.name || 'Untitled'}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-[0.2em]">
            Performance Workspace
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/40 p-1">
          <FocusButton active={focusMode === 'balanced'} onClick={() => setFocusMode('balanced')}>
            Balanced
          </FocusButton>
          <FocusButton active={focusMode === 'timeline'} onClick={() => setFocusMode('timeline')}>
            Timeline Focus
          </FocusButton>
          <FocusButton active={focusMode === 'layout'} onClick={() => setFocusMode('layout')}>
            Layout Focus
          </FocusButton>
        </div>
      </div>

      {state.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {state.error}
          <button
            className="ml-2 text-red-500 hover:text-red-400"
            onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
          >
            ×
          </button>
        </div>
      )}

      <EditorToolbar
        generateFull={generateFull}
        generationProgress={generationProgress}
        showAnalysis={showAnalysis}
        setShowAnalysis={setShowAnalysis}
        showDiagnostics={showDiagnostics}
        setShowDiagnostics={setShowDiagnostics}
      />

      <div
        className="grid gap-4 items-start"
        style={{ gridTemplateColumns: getWorkspaceColumns(focusMode) }}
      >
        <div className="space-y-3 min-w-0">
          <div className="p-3 rounded-lg glass-panel space-y-2">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">Workspace Flow</div>
            <div className="text-sm text-gray-200">Edit the performance timeline in the center, watch the Push grid update on the right, and open the composer below to generate or sketch new material directly into the same project.</div>
            <div className="flex gap-2 pt-1">
              <button
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  drawerTab === 'composer' ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
                onClick={() => setDrawerTab('composer')}
              >
                Open Composer
              </button>
              <button
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  drawerTab === 'execution' ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
                onClick={() => setDrawerTab('execution')}
              >
                Execution View
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg glass-panel">
            <VoicePalette />
          </div>
        </div>

        <div className="min-w-0 rounded-lg glass-panel overflow-hidden">
          <LaneToolbar
            zoom={zoom}
            minZoom={minZoom}
            onZoomChange={setZoom}
            showInactive={showInactive}
            onToggleShowInactive={() => setShowInactive(!showInactive)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {state.performanceLanes.length === 0 ? (
            <div className="px-6 py-20 text-center text-gray-500">
              Import MIDI files or open the composer below to generate timeline material inside this project.
            </div>
          ) : (
            <div className="flex min-h-[460px]">
              <LaneSidebar
                selectedLaneIds={selectedLaneIds}
                onSelectLane={handleSelectLane}
                searchQuery={searchQuery}
                showInactive={showInactive}
                scrollRef={sidebarScrollRef}
              />

              <LaneTimeline
                zoom={zoom}
                scrollLeft={scrollLeft}
                onScrollLeft={setScrollLeft}
                selectedLaneIds={selectedLaneIds}
                onSelectLane={handleSelectLane}
                searchQuery={searchQuery}
                showInactive={showInactive}
                selectedEventTime={selectedEventTime}
                onSelectEventTime={handleSelectEventTime}
                onVerticalScroll={scrollTop => {
                  if (sidebarScrollRef.current) {
                    sidebarScrollRef.current.scrollTop = scrollTop;
                  }
                }}
              />

              {selectedLanes.length > 0 && (
                <LaneInspector
                  lane={selectedLanes[0]}
                  lanes={selectedLanes}
                  onClose={() => setSelectedLaneIds(new Set())}
                />
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 min-w-0">
          <div className="p-3 rounded-lg glass-panel">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-400">
                {isCompareMode ? 'Layout Compare' : 'Push Grid'}
              </h3>
              <span className="text-[10px] text-gray-500">Timeline-linked</span>
            </div>
            {isCompareMode ? (
              <CompareGridView
                candidateA={selectedCandidate}
                candidateB={compareCandidate}
                voices={state.soundStreams}
                candidateAIndex={state.candidates.indexOf(selectedCandidate) + 1}
                candidateBIndex={state.candidates.indexOf(compareCandidate) + 1}
              />
            ) : (
              <InteractiveGrid
                assignments={assignments}
                layoutOverride={selectedCandidate?.layout}
                selectedEventIndex={state.selectedEventIndex}
                onEventClick={idx => dispatch({ type: 'SELECT_EVENT', payload: idx })}
              />
            )}
          </div>

          <EventDetailPanel />
          <TransitionDetailPanel />

          {showAnalysis && (
            <div className="p-3 rounded-lg glass-panel">
              <AnalysisSidePanel />
            </div>
          )}

          {showDiagnostics && state.analysisResult && (
            <div className="p-3 rounded-lg glass-panel">
              <DiagnosticsPanel />
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg glass-panel overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-800 bg-gray-900/40">
          <DrawerButton active={drawerTab === 'execution'} onClick={() => setDrawerTab('execution')}>
            Execution
          </DrawerButton>
          <DrawerButton active={drawerTab === 'composer'} onClick={() => setDrawerTab('composer')}>
            Pattern Composer
          </DrawerButton>
          <div className="flex-1" />
          <span className="text-[10px] text-gray-600">
            {drawerTab === 'execution'
              ? 'Inspect event-level execution and playback'
              : 'Generate or sketch new material into the same timeline'}
          </span>
        </div>

        <div className="p-3">
          {drawerTab === 'execution' ? <TimelinePanel /> : <WorkspacePatternStudio />}
        </div>
      </div>
    </div>
  );
}

function FocusButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
        active ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DrawerButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function getWorkspaceColumns(focusMode: FocusMode): string {
  switch (focusMode) {
    case 'timeline':
      return '260px minmax(0, 1.55fr) minmax(360px, 0.95fr)';
    case 'layout':
      return '240px minmax(0, 1fr) minmax(460px, 1.15fr)';
    default:
      return '260px minmax(0, 1.35fr) minmax(420px, 1fr)';
  }
}

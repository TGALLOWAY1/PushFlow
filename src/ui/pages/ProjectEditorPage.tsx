/**
 * ProjectEditorPage.
 *
 * Main workspace with three tabs:
 * - Lanes: Import, organize, and preview performance lanes
 * - Loop Editor: Manual lane-based step sequencer for test patterns
 * - Editor: Grid layout editing, analysis, and timeline
 *
 * Editor Layout:
 * ┌─────────────────────────────────────────────────┐
 * │ EditorToolbar (name, undo/redo, layout, actions) │
 * ├──────────────────────┬──────────────────────────┤
 * │                      │ VoicePalette             │
 * │   InteractiveGrid    │ AnalysisSidePanel        │
 * │   (8x8 pad editor)   │ DiagnosticsPanel         │
 * ├──────────────────────┴──────────────────────────┤
 * │ EventDetailPanel (when event selected)          │
 * ├─────────────────────────────────────────────────┤
 * │ TimelinePanel (collapsible)                     │
 * └─────────────────────────────────────────────────┘
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ProjectProvider, useProject } from '../state/ProjectContext';
import { loadProject, saveProject } from '../persistence/projectStorage';
import { EditorToolbar } from '../components/EditorToolbar';
import { InteractiveGrid } from '../components/InteractiveGrid';
import { CompareGridView } from '../components/CompareGridView';
import { VoicePalette } from '../components/VoicePalette';
import { AnalysisSidePanel } from '../components/AnalysisSidePanel';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { EventDetailPanel } from '../components/EventDetailPanel';
import { TimelinePanel } from '../components/TimelinePanel';
import { PerformanceLanesView } from '../components/lanes/PerformanceLanesView';
import { LoopEditorView } from '../components/loop-editor/LoopEditorView';
import { useAutoAnalysis } from '../hooks/useAutoAnalysis';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

type EditorTab = 'lanes' | 'loop-editor' | 'editor';

export function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const initialState = useMemo(() => {
    if (!id) return null;
    return loadProject(id);
  }, [id]);

  if (!initialState) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <p className="text-gray-400 mb-4">Project not found.</p>
        <button
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          onClick={() => navigate('/')}
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <ProjectProvider initialState={initialState}>
      <ProjectContent />
    </ProjectProvider>
  );
}

function ProjectContent() {
  const { state, dispatch } = useProject();
  const navigate = useNavigate();

  // Default to lanes tab if project has lanes, else editor
  const [activeTab, setActiveTab] = useState<EditorTab>(
    state.performanceLanes.length > 0 ? 'lanes' : 'editor'
  );

  const handleTabChange = useCallback((tab: EditorTab) => {
    if (tab === 'editor' && state.performanceLanes.length > 0) {
      // Sync lanes → streams when switching to editor
      dispatch({ type: 'SYNC_STREAMS_FROM_LANES' });
    }
    if (tab === 'lanes' && state.performanceLanes.length === 0 && state.soundStreams.length > 0) {
      // Populate lanes from existing streams (legacy import path)
      dispatch({ type: 'POPULATE_LANES_FROM_STREAMS' });
    }
    setActiveTab(tab);
  }, [state.performanceLanes.length, state.soundStreams.length, dispatch]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-3">
      {/* Top bar: Library button + Tab switcher */}
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

        <span className="text-sm font-medium text-gray-300 truncate">
          {state.name || 'Untitled'}
        </span>

        <div className="flex-1" />

        {/* Tab switcher */}
        <div className="flex bg-gray-800/50 rounded-lg p-0.5 border border-gray-700">
          <button
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'lanes'
                ? 'bg-gray-700 text-gray-200 font-medium'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => handleTabChange('lanes')}
          >
            Lanes
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'loop-editor'
                ? 'bg-gray-700 text-gray-200 font-medium'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => handleTabChange('loop-editor')}
          >
            Loop Editor
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              activeTab === 'editor'
                ? 'bg-gray-700 text-gray-200 font-medium'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => handleTabChange('editor')}
          >
            Editor
          </button>
        </div>
      </div>

      {/* Error display */}
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

      {/* Tab content */}
      {activeTab === 'lanes' ? (
        <PerformanceLanesView />
      ) : activeTab === 'loop-editor' ? (
        <LoopEditorView />
      ) : (
        <EditorContent />
      )}
    </div>
  );
}

function EditorContent() {
  const { state, dispatch } = useProject();
  const { generateFull } = useAutoAnalysis();
  useKeyboardShortcuts();

  return (
    <>
      {/* Editor toolbar */}
      <EditorToolbar />

      {/* Main content: Grid + Side Panel */}
      <div className="flex gap-4">
        {/* Left: Grid (or side-by-side compare grids) */}
        <div className="flex-shrink-0">
          {(() => {
            const selectedCandidate = state.candidates.find(c => c.id === state.selectedCandidateId);
            const compareCandidate = state.candidates.find(c => c.id === state.compareCandidateId);
            const isCompareMode = !!selectedCandidate && !!compareCandidate;

            if (isCompareMode) {
              return (
                <>
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Compare</h3>
                  <CompareGridView
                    candidateA={selectedCandidate}
                    candidateB={compareCandidate}
                    voices={state.soundStreams}
                    candidateAIndex={state.candidates.indexOf(selectedCandidate) + 1}
                    candidateBIndex={state.candidates.indexOf(compareCandidate) + 1}
                  />
                </>
              );
            }

            return (
              <>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Layout</h3>
                <InteractiveGrid
                  assignments={state.analysisResult?.executionPlan.fingerAssignments}
                  layoutOverride={selectedCandidate?.layout}
                  selectedEventIndex={state.selectedEventIndex}
                  onEventClick={idx => dispatch({ type: 'SELECT_EVENT', payload: idx })}
                />
              </>
            );
          })()}
        </div>

        {/* Right: Side panel */}
        <div className="flex-1 min-w-0 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
          {/* Voice Palette */}
          <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-700">
            <VoicePalette />
          </div>

          {/* Analysis */}
          <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-700">
            <AnalysisSidePanel generateFull={generateFull} />
          </div>

          {/* Diagnostics */}
          {state.analysisResult && (
            <div className="p-3 rounded-lg bg-gray-800/30 border border-gray-700">
              <DiagnosticsPanel />
            </div>
          )}
        </div>
      </div>

      {/* Event detail (when selected) */}
      <EventDetailPanel />

      {/* Bottom: Timeline */}
      <TimelinePanel />
    </>
  );
}

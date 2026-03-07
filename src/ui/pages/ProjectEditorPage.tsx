/**
 * ProjectEditorPage.
 *
 * Main workspace for editing a project's grid layout, viewing analysis,
 * and inspecting the timeline.
 *
 * Layout:
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

import { useMemo } from 'react';
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
import { useAutoAnalysis } from '../hooks/useAutoAnalysis';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

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
      <EditorContent />
    </ProjectProvider>
  );
}

function EditorContent() {
  const { state, dispatch } = useProject();
  const navigate = useNavigate();
  const { generateFull } = useAutoAnalysis();
  useKeyboardShortcuts();

  return (
    <div className="max-w-[1400px] mx-auto space-y-3">
      {/* Top toolbar */}
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
        <div className="flex-1">
          <EditorToolbar />
        </div>
      </div>

      {/* Error display */}
      {state.error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {state.error}
        </div>
      )}

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
        <div className="flex-1 min-w-0 space-y-3">
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
    </div>
  );
}

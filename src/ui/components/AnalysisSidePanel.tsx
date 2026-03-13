/**
 * AnalysisSidePanel.
 *
 * Shows analysis results: difficulty heatmap, constraints, candidate switching,
 * and comparison. Displayed to the right of the grid in the editor.
 */

import { useState } from 'react';
import { useProject } from '../state/ProjectContext';
import { DifficultyHeatmap } from './DifficultyHeatmap';
import { CandidateCompare } from './CandidateCompare';
import { type CandidateSolution } from '../../types/candidateSolution';
import { type GenerationMode } from '../hooks/useAutoAnalysis';

type PanelTab = 'analysis' | 'compare';

export function AnalysisSidePanel({ generateFull, generationProgress }: { generateFull: (mode?: GenerationMode) => Promise<void>; generationProgress?: string | null }) {
  const { state, dispatch } = useProject();
  const [tab, setTab] = useState<PanelTab>('analysis');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('fast');
  const compareId = state.compareCandidateId;
  const setCompareId = (id: string | null) => dispatch({ type: 'SET_COMPARE_CANDIDATE', payload: id });

  const activeResult = state.analysisResult;
  const hasCandidates = state.candidates.length > 0;

  const generateDisabled = state.isProcessing;

  // Find compare candidate
  const selectedCandidate = state.candidates.find(c => c.id === state.selectedCandidateId) ?? null;
  const compareCandidate = state.candidates.find(c => c.id === compareId) ?? null;

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex items-center gap-1 text-xs">
        <button
          className={`px-2 py-1 rounded ${tab === 'analysis' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
          onClick={() => { setTab('analysis'); setCompareId(null); }}
        >
          Analysis
        </button>
        {hasCandidates && (
          <button
            className={`px-2 py-1 rounded ${tab === 'compare' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => setTab('compare')}
          >
            Compare
          </button>
        )}
        <div className="flex-1" />
        {/* Mode selector + Generate button */}
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-[11px] rounded px-1 py-1 cursor-pointer"
          value={generationMode}
          onChange={(e) => setGenerationMode(e.target.value as GenerationMode)}
          disabled={generateDisabled}
          title="Quick: fast optimization (~3s). Thorough: deep optimization with restarts (~10-15s). Auto: chooses based on complexity."
        >
          <option value="fast">Quick</option>
          <option value="deep">Thorough</option>
          <option value="auto">Auto</option>
        </select>
        <button
          className={`px-2 py-1 rounded text-[11px] transition-colors ${
            generateDisabled
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
          onClick={() => generateFull(generationMode)}
          disabled={generateDisabled}
          title="Generate 3 layout candidates (auto-assigns pads if none are set)"
        >
          {state.isProcessing ? 'Analyzing...' : 'Generate'}
        </button>
      </div>

      {/* Analysis tab */}
      {tab === 'analysis' && (
        <div className="space-y-3">
          {/* Processing indicator */}
          {state.isProcessing && (
            <div className="text-xs text-blue-400 animate-pulse">
              {generationProgress || 'Running analysis...'}
            </div>
          )}

          {/* No analysis yet */}
          {!activeResult && !state.isProcessing && (
            <div className="text-xs text-gray-500 py-4 text-center">
              Assign sounds to pads, or click Generate to auto-assign and analyze.
            </div>
          )}

          {/* Difficulty heatmap */}
          {activeResult && (
            <>
              <DifficultyHeatmap analysis={activeResult.difficultyAnalysis} />

              {/* Score stats */}
              <div className="flex gap-2 text-[11px]">
                <StatBadge
                  label="Score"
                  value={activeResult.executionPlan.score.toFixed(1)}
                  tooltip="Total execution cost (lower is better). <5 easy, 5-15 moderate, >15 difficult"
                  quality={activeResult.executionPlan.score < 5 ? 'good' : activeResult.executionPlan.score < 15 ? 'ok' : 'bad'}
                />
                <StatBadge
                  label="Drift"
                  value={activeResult.executionPlan.averageDrift.toFixed(2)}
                  tooltip="Avg hand movement per event (lower = more compact). <0.5 compact, >1.0 spread out"
                  quality={activeResult.executionPlan.averageDrift < 0.5 ? 'good' : activeResult.executionPlan.averageDrift < 1.0 ? 'ok' : 'bad'}
                />
                <StatBadge
                  label="Hard"
                  value={String(activeResult.executionPlan.hardCount)}
                  warn={activeResult.executionPlan.hardCount > 0}
                  tooltip="Events requiring difficult reaches or fast hand switches. Zero is ideal"
                />
              </div>

              {/* Finger usage */}
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500">Finger Usage</span>
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-400">
                  {Object.entries(activeResult.executionPlan.fingerUsageStats).map(([finger, count]) => (
                    <span key={finger} className="bg-gray-800/80 px-1.5 py-0.5 rounded">
                      {finger}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Candidate switcher (when multiple candidates exist) */}
          {hasCandidates && (
            <div className="space-y-1 pt-2 border-t border-gray-800">
              <span className="text-[10px] text-gray-500">Candidates ({state.candidates.length})</span>
              <div className="flex flex-wrap gap-1">
                {state.candidates.map((c, i) => {
                  const isActive = c.id === state.selectedCandidateId;
                  const score = c.difficultyAnalysis.overallScore;
                  return (
                    <button
                      key={c.id}
                      className={`
                        px-2 py-1 text-[11px] rounded transition-colors
                        ${isActive
                          ? 'bg-blue-600/30 border border-blue-500 text-blue-300'
                          : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200'}
                      `}
                      onClick={() => {
                        dispatch({ type: 'SELECT_CANDIDATE', payload: c.id });
                        dispatch({ type: 'SET_ANALYSIS_RESULT', payload: c });
                      }}
                    >
                      #{i + 1} {(score * 100).toFixed(0)}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compare tab */}
      {tab === 'compare' && hasCandidates && selectedCandidate && (
        <CompareContent
          candidates={state.candidates}
          selectedCandidate={selectedCandidate}
          compareCandidate={compareCandidate}
          compareId={compareId}
          onCompareIdChange={setCompareId}
        />
      )}
    </div>
  );
}

function CompareContent({
  candidates,
  selectedCandidate,
  compareCandidate,
  compareId,
  onCompareIdChange,
}: {
  candidates: CandidateSolution[];
  selectedCandidate: CandidateSolution;
  compareCandidate: CandidateSolution | null;
  compareId: string | null;
  onCompareIdChange: (id: string | null) => void;
}) {
  const others = candidates.filter(c => c.id !== selectedCandidate.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">Compare with:</span>
        <div className="flex gap-1">
          {others.map(c => (
            <button
              key={c.id}
              className={`px-2 py-1 text-[11px] rounded transition-colors ${
                c.id === compareId
                  ? 'bg-purple-600/30 border border-purple-500 text-purple-300'
                  : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => onCompareIdChange(c.id === compareId ? null : c.id)}
            >
              #{candidates.indexOf(c) + 1}
            </button>
          ))}
        </div>
      </div>

      {compareCandidate ? (
        <CandidateCompare candidateA={selectedCandidate} candidateB={compareCandidate} />
      ) : (
        <div className="text-gray-500 text-xs py-4 text-center">
          Select a candidate above to compare.
        </div>
      )}
    </div>
  );
}

const QUALITY_STYLES = {
  good: { border: 'border-green-500/30', bg: 'bg-green-500/10', dot: 'bg-green-400' },
  ok: { border: 'border-gray-700', bg: 'bg-gray-800/50', dot: 'bg-yellow-400' },
  bad: { border: 'border-red-500/30', bg: 'bg-red-500/10', dot: 'bg-red-400' },
} as const;

function StatBadge({ label, value, warn, tooltip, quality }: {
  label: string; value: string; warn?: boolean; tooltip?: string;
  quality?: 'good' | 'ok' | 'bad';
}) {
  const qStyle = quality ? QUALITY_STYLES[quality] : null;
  const borderClass = warn ? 'border-amber-500/30' : qStyle?.border ?? 'border-gray-700';
  const bgClass = warn ? 'bg-amber-500/10' : qStyle?.bg ?? 'bg-gray-800/50';

  return (
    <div
      className={`px-2 py-1 rounded border text-[11px] ${borderClass} ${bgClass} cursor-help`}
      title={tooltip}
    >
      <span className="text-[9px] text-gray-500 uppercase mr-1">{label}</span>
      {quality && <span className={`inline-block w-1.5 h-1.5 rounded-full ${qStyle!.dot} mr-1 align-middle`} />}
      <span className={`font-mono ${warn ? 'text-amber-400' : 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

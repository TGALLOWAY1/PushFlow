/**
 * DiagnosticsPanel.
 *
 * Shows fatigue map, hand balance, spatial stats from the current analysis.
 */

import { useMemo } from 'react';
import { useProject } from '../state/ProjectContext';

export function DiagnosticsPanel() {
  const { state } = useProject();
  const result = state.analysisResult;

  if (!result) {
    return (
      <div className="text-xs text-gray-500 py-2 text-center">
        No analysis available.
      </div>
    );
  }

  const { executionPlan } = result;

  // Hand balance
  const handStats = useMemo(() => {
    let left = 0, right = 0, unplayable = 0;
    for (const a of executionPlan.fingerAssignments) {
      if (a.assignedHand === 'left') left++;
      else if (a.assignedHand === 'right') right++;
      else unplayable++;
    }
    const total = left + right + unplayable;
    return { left, right, unplayable, total };
  }, [executionPlan.fingerAssignments]);

  // Top fatigue entries
  const topFatigue = useMemo(() =>
    Object.entries(executionPlan.fatigueMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6),
    [executionPlan.fatigueMap]
  );

  const balanceRatio = handStats.total > 0
    ? handStats.left / (handStats.left + handStats.right || 1)
    : 0.5;

  return (
    <div className="space-y-3">
      <h4 className="text-xs text-gray-500 font-medium">Diagnostics</h4>

      {/* Hand balance */}
      <div className="space-y-1">
        <span className="text-[10px] text-gray-500">Hand Balance</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-blue-400 w-6 text-right">{handStats.left}</span>
          <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden flex">
            <div
              className="h-full bg-blue-500/60"
              style={{ width: `${balanceRatio * 100}%` }}
            />
            <div
              className="h-full bg-purple-500/60"
              style={{ width: `${(1 - balanceRatio) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-purple-400 w-6">{handStats.right}</span>
        </div>
        {handStats.unplayable > 0 && (
          <span className="text-[10px] text-red-400">
            {handStats.unplayable} unplayable
          </span>
        )}
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <DiagnosticItem label="Total Score" value={executionPlan.score.toFixed(1)} />
        <DiagnosticItem label="Avg Drift" value={executionPlan.averageDrift.toFixed(3)} />
        <DiagnosticItem label="Hard Events" value={String(executionPlan.hardCount)} warn={executionPlan.hardCount > 0} />
        <DiagnosticItem label="Unplayable" value={String(executionPlan.unplayableCount)} warn={executionPlan.unplayableCount > 0} />
      </div>

      {/* Average metrics */}
      <div className="space-y-1">
        <span className="text-[10px] text-gray-500">Avg Cost Breakdown</span>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <MetricBar label="Move" value={executionPlan.averageMetrics.movement} max={2} />
          <MetricBar label="Stretch" value={executionPlan.averageMetrics.stretch} max={2} />
          <MetricBar label="Drift" value={executionPlan.averageMetrics.drift} max={2} />
          <MetricBar label="Bounce" value={executionPlan.averageMetrics.bounce} max={2} />
          <MetricBar label="Fatigue" value={executionPlan.averageMetrics.fatigue} max={2} />
          <MetricBar label="Cross" value={executionPlan.averageMetrics.crossover} max={2} />
        </div>
      </div>

      {/* Fatigue */}
      {topFatigue.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500">Finger Fatigue</span>
          <div className="space-y-0.5">
            {topFatigue.map(([finger, fatigue]) => (
              <div key={finger} className="flex items-center gap-1 text-[10px]">
                <span className="text-gray-400 w-12 truncate">{finger}</span>
                <div className="flex-1 h-2 bg-gray-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(fatigue * 50, 100)}%`,
                      backgroundColor: fatigue > 1 ? '#ef4444' : fatigue > 0.5 ? '#f97316' : '#22c55e',
                    }}
                  />
                </div>
                <span className="text-gray-500 w-8 text-right">{fatigue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosticItem({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`px-2 py-1 rounded border text-center ${
      warn ? 'border-amber-500/30 bg-amber-500/10' : 'border-gray-700 bg-gray-800/50'
    }`}>
      <div className="text-[9px] text-gray-500">{label}</div>
      <div className={`font-mono ${warn ? 'text-amber-400' : 'text-gray-300'}`}>{value}</div>
    </div>
  );
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-gray-500">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 75 ? '#ef4444' : pct > 40 ? '#f97316' : '#22c55e',
          }}
        />
      </div>
    </div>
  );
}

/**
 * EditorToolbar.
 *
 * Top bar for the project editor: project name, undo/redo, layout selector,
 * save/export, analysis stale indicator.
 */

import { useProject } from '../state/ProjectContext';
import { saveProject, exportProjectToFile } from '../persistence/projectStorage';
import { getActiveLayout } from '../state/projectState';
import { createEmptyLayout } from '../../types/layout';
import { generateId } from '../../utils/idGenerator';

export function EditorToolbar() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useProject();
  const activeLayout = getActiveLayout(state);

  const handleAddLayout = () => {
    const newLayout = createEmptyLayout(
      generateId('layout'),
      `Layout ${state.layouts.length + 1}`
    );
    dispatch({ type: 'ADD_LAYOUT', payload: newLayout });
    dispatch({ type: 'SET_ACTIVE_LAYOUT', payload: newLayout.id });
  };

  const handleCloneLayout = () => {
    if (!activeLayout) return;
    const clone = {
      ...activeLayout,
      id: generateId('layout'),
      name: `${activeLayout.name} (copy)`,
      padToVoice: { ...activeLayout.padToVoice },
      fingerConstraints: { ...activeLayout.fingerConstraints },
      scoreCache: null,
    };
    dispatch({ type: 'ADD_LAYOUT', payload: clone });
    dispatch({ type: 'SET_ACTIVE_LAYOUT', payload: clone.id });
  };

  return (
    <div className="flex items-center gap-3 pb-3 border-b border-gray-800">
      {/* Project name */}
      <h1 className="text-lg font-bold truncate">{state.name}</h1>

      {/* Layout selector */}
      {state.layouts.length > 1 && (
        <div className="flex items-center gap-1 text-xs">
          {state.layouts.map(l => (
            <button
              key={l.id}
              className={`px-2 py-1 rounded transition-colors ${
                l.id === state.activeLayoutId
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_LAYOUT', payload: l.id })}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout actions */}
      <div className="flex gap-1">
        <button
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
          onClick={handleAddLayout}
          title="Add empty layout"
        >
          + Layout
        </button>
        {activeLayout && (
          <button
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400"
            onClick={handleCloneLayout}
            title="Clone current layout"
          >
            Clone
          </button>
        )}
      </div>

      {/* Undo / Redo */}
      <div className="flex gap-1">
        <button
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
      </div>

      {/* Save */}
      <button
        className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700"
        onClick={() => saveProject(state)}
        title="Save project"
      >
        Save
      </button>

      {/* Export */}
      <button
        className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700"
        onClick={() => exportProjectToFile(state)}
        title="Export as JSON"
      >
        Export
      </button>

      {/* Analysis stale indicator */}
      {state.analysisStale && state.analysisResult && (
        <span className="text-[10px] text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
          Analysis outdated
        </span>
      )}
    </div>
  );
}

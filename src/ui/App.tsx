/**
 * PushFlow App.
 *
 * Root component with routing.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProjectLibraryPage } from './pages/ProjectLibraryPage';
import { ProjectEditorPage } from './pages/ProjectEditorPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
        <Routes>
          <Route path="/" element={<ProjectLibraryPage />} />
          <Route path="/project/:id" element={<ProjectEditorPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

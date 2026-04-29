import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import DatabaseVisualizer from './pages/DatabaseVisualizer';
import WorkspaceArea from './pages/WorkspaceArea';
import RepoSelector from './pages/RepoSelector';
import './App.css'; // Let's keep it or delete it. Actually let's not import App.css

function App() {
  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/db" element={<DatabaseVisualizer />} />
        <Route path="/workspace" element={<WorkspaceArea />} />
        <Route path="/select-repo" element={<RepoSelector />} />
      </Routes>
    </div>
  );
}

export default App;

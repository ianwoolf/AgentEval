import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import {TargetPage} from './pages/TargetPage'
import {DatasetPage} from './pages/DatasetPage'
import {EvaluationPage} from './pages/EvaluationPage'
import {ReportPage} from './pages/ReportPage'
import {ReflectPage} from './pages/ReflectPage'

const nav = [
  ['Target', '/targets'], ['Dataset', '/datasets'], ['Evaluation', '/evaluations'],
  ['Report', '/reports'], ['Reflect', '/reflect'], ['Settings', '/settings'],
]

export function App() {
  return <div className="app-shell">
    <aside><div className="brand">EVAL STUDIO</div><div className="eyebrow">MODULAR EVALUATION</div>
      <nav>{nav.map(([label, path]) => <NavLink key={path} to={path}>{label}</NavLink>)}</nav>
      <div className="runtime">API v1 · Python core</div>
    </aside>
    <main><div className="workspace"><span>WORKSPACE</span><strong>Local evaluation environment</strong></div>
      <Routes>
        <Route path="/targets" element={<TargetPage/>} />
        <Route path="/datasets" element={<DatasetPage/>} />
        <Route path="/evaluations" element={<EvaluationPage/>} />
        <Route path="/reports" element={<ReportPage/>} />
        <Route path="/reflect" element={<ReflectPage />} />
        <Route path="/settings" element={<section><header className="page-header"><div><h1>Settings</h1><p>Runtime connectivity and backend capabilities.</p></div></header><div className="settings-list"><div><span>Frontend</span><strong>React + TypeScript</strong></div><div><span>Backend</span><strong>FastAPI · API v1</strong></div><div><span>Evaluation core</span><strong>Python adapters</strong></div></div></section>} />
        <Route path="*" element={<Navigate to="/targets" replace />} />
      </Routes>
    </main>
  </div>
}

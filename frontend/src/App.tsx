import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessagesSquare,
  ListChecks,
  ClipboardCheck,
  Scale,
  GitCompareArrows,
  ArrowUpRight,
  ShieldCheck,
  Menu,
  Settings2,
  X,
} from 'lucide-react';
import type { Config } from './lib/types';
import { api } from './lib/api';
import { ToastProvider } from './components/ui';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import Detail from './pages/Detail';
import Checklists from './pages/Checklists';
import Appeals from './pages/Appeals';
import Evaluations from './pages/Evaluations';
import Compare from './pages/Compare';
const WorkspaceContext = createContext<{
  config: Config | null;
  reviewer: boolean;
  refresh: () => void;
  revision: number;
}>({ config: null, reviewer: false, refresh: () => {}, revision: 0 });
export const useWorkspace = () => useContext(WorkspaceContext);
const nav = [
  ['/', 'Overview', LayoutDashboard],
  ['/conversations', 'Conversations', MessagesSquare],
  ['/checklists', 'Checklists', ListChecks],
  ['/evaluations', 'Evaluations', ClipboardCheck],
  ['/appeals', 'Appeals & review', Scale],
  ['/compare', 'Version comparison', GitCompareArrows],
] as const;
function Shell() {
  const [config, setConfig] = useState<Config | null>(null),
    [reviewer, setReviewer] = useState(false),
    [revision, setRevision] = useState(0),
    [menu, setMenu] = useState(false);
  const location = useLocation();
  const refresh = useCallback(() => setRevision((x) => x + 1), []);
  useEffect(() => {
    api<Config>('/config/status')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [revision]);
  useEffect(() => setMenu(false), [location.pathname]);
  const active = nav.find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path),
  );
  return (
    <WorkspaceContext.Provider value={{ config, reviewer, refresh, revision }}>
      <div className="app-shell">
        <aside className={`sidebar ${menu ? 'open' : ''}`}>
          <NavLink to="/" className="brand">
            <div className="brand-mark">
              <span />
              <span />
              <span />
            </div>
            <div>
              CQA<span>INTELLIGENCE</span>
            </div>
          </NavLink>
          <div className="workspace-label">QUALITY WORKSPACE</div>
          <nav>
            {nav.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === '/'}>
                <Icon size={18} />
                {label}
                {path === '/appeals' && <span className="nav-dot" />}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="audit-label">
              <ShieldCheck size={20} />
              <div>
                Evidence you can trust<small>Every decision, traceable.</small>
              </div>
            </div>
            <div className="prototype">
              FREEDOM BROKER <ArrowUpRight size={13} />
              <small>Hackathon prototype · local workspace</small>
            </div>
          </div>
        </aside>
        {menu && (
          <button
            className="mobile-shade"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{active?.[1] ?? 'Conversation report'}</strong>
            </div>
            <div className="topbar-right">
              <span className={`connection ${config?.llm_configured ? 'connected' : ''}`}>
                <i />
                {config?.test_mode
                  ? 'Test provider'
                  : config?.llm_configured
                    ? 'Gemini connected'
                    : 'Model setup needed'}
              </span>
              <label className="role-toggle">
                <input
                  type="checkbox"
                  checked={reviewer}
                  onChange={(e) => setReviewer(e.target.checked)}
                />
                <Settings2 size={14} />
                {reviewer ? 'Reviewer mode' : 'Supervisor mode'}
              </label>
              <div className="avatar" title="Demo user, no authentication">
                {reviewer ? 'RV' : 'QS'}
              </div>
            </div>
          </header>
          {config?.test_mode && (
            <div className="test-banner">
              TEST MODE · Deterministic test output, not a real AI assessment.
            </div>
          )}
          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/conversations/:id" element={<Detail />} />
              <Route path="/checklists" element={<Checklists />} />
              <Route path="/evaluations" element={<Evaluations />} />
              <Route path="/appeals" element={<Appeals />} />
              <Route path="/compare" element={<Compare />} />
              <Route
                path="*"
                element={
                  <div className="empty">
                    <h1>Page not found</h1>
                    <NavLink to="/">Return to overview</NavLink>
                  </div>
                }
              />
            </Routes>
          </main>
          <footer className="footer">
            <span>
              CQA Intelligence <span className="footer-dot">·</span> Freedom Broker hackathon
              prototype
            </span>
            <span>Original transcripts. Auditable decisions.</span>
          </footer>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </BrowserRouter>
  );
}

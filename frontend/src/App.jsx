import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Datasets from './pages/Datasets';
import Labels from './pages/Labels';
import Tasks from './pages/Tasks';
import Annotations from './pages/Annotations';
import AutoLabel from './pages/AutoLabel';
import Reviews from './pages/Reviews';
import Team from './pages/Team';
import Quality from './pages/Quality';
import ApiKeys from './pages/ApiKeys';
import Exports from './pages/Exports';
import Webhooks from './pages/Webhooks';
import AuditLog from './pages/AuditLog';
import Analytics from './pages/Analytics';
import AIServices from './pages/AIServices';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Comments from './pages/Comments';
import Guidelines from './pages/Guidelines';
import DataImports from './pages/DataImports';
import Reports from './pages/Reports';
import Tags from './pages/Tags';
import ActivityFeed from './pages/ActivityFeed';
import SavedFilters from './pages/SavedFilters';
import Templates from './pages/Templates';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/projects', label: 'Projects', icon: '📁' },
  { path: '/datasets', label: 'Datasets', icon: '📊' },
  { path: '/labels', label: 'Labels', icon: '🏷️' },
  { path: '/tasks', label: 'Tasks', icon: '✅' },
  { path: '/annotations', label: 'Annotations', icon: '📝' },
  { path: '/auto-label', label: 'Auto Label', icon: '🤖' },
  { path: '/reviews', label: 'Reviews', icon: '🔍' },
  { path: '/ai-services', label: 'AI Services', icon: '🧠' },
  { path: '/guidelines', label: 'Guidelines', icon: '📖' },
  { path: '/comments', label: 'Comments', icon: '💬' },
  { path: '/data-imports', label: 'Data Imports', icon: '📥' },
  { path: '/team', label: 'Team', icon: '👥' },
  { path: '/quality', label: 'Quality', icon: '📈' },
  { path: '/tags', label: 'Tags', icon: '🔖' },
  { path: '/templates', label: 'Templates', icon: '📋' },
  { path: '/reports', label: 'Reports', icon: '📄' },
  { path: '/api-keys', label: 'API Keys', icon: '🔑' },
  { path: '/exports', label: 'Exports', icon: '📦' },
  { path: '/webhooks', label: 'Webhooks', icon: '🔗' },
  { path: '/notifications', label: 'Notifications', icon: '🔔' },
  { path: '/activity-feed', label: 'Activity Feed', icon: '⚡' },
  { path: '/saved-filters', label: 'Saved Filters', icon: '💾' },
  { path: '/audit-log', label: 'Audit Log', icon: '📋' },
  { path: '/analytics', label: 'Analytics', icon: '📉' },
  { path: '/profile', label: 'Profile', icon: '👤' },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);
  }, [location]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    navigate('/login');
  };

  if (!isAuthenticated || location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={() => setIsAuthenticated(true)} />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <span className="logo-icon">🏷️</span>
            {sidebarOpen && <span className="logo-text">LabelAI</span>}
          </div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            {sidebarOpen && <span className="nav-label">Logout</span>}
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/datasets" element={<Datasets />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/annotations" element={<Annotations />} />
          <Route path="/auto-label" element={<AutoLabel />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/ai-services" element={<AIServices />} />
          <Route path="/guidelines" element={<Guidelines />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/data-imports" element={<DataImports />} />
          <Route path="/team" element={<Team />} />
          <Route path="/quality" element={<Quality />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/exports" element={<Exports />} />
          <Route path="/webhooks" element={<Webhooks />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/activity-feed" element={<ActivityFeed />} />
          <Route path="/saved-filters" element={<SavedFilters />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;

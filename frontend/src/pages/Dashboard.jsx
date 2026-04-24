import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const features = [
  { key: 'projects', path: '/projects', icon: '📁', title: 'Projects', desc: 'Organize labeling work into projects', endpoint: '/projects' },
  { key: 'datasets', path: '/datasets', icon: '📊', title: 'Datasets', desc: 'Manage your data collections', endpoint: '/datasets' },
  { key: 'labels', path: '/labels', icon: '🏷️', title: 'Labels', desc: 'Define label templates and schemas', endpoint: '/labels' },
  { key: 'tasks', path: '/tasks', icon: '✅', title: 'Tasks', desc: 'Create and assign labeling tasks', endpoint: '/tasks' },
  { key: 'annotations', path: '/annotations', icon: '📝', title: 'Annotations', desc: 'View and manage annotations', endpoint: '/annotations' },
  { key: 'autoLabels', path: '/auto-label', icon: '🤖', title: 'Auto Label', desc: 'AI-powered automatic labeling', endpoint: '/auto-labels' },
  { key: 'reviews', path: '/reviews', icon: '🔍', title: 'Reviews', desc: 'Human review queue for quality', endpoint: '/reviews' },
  { key: 'aiServices', path: '/ai-services', icon: '🧠', title: 'AI Services', desc: 'Text classification, NER, sentiment', endpoint: null },
  { key: 'guidelines', path: '/guidelines', icon: '📖', title: 'Guidelines', desc: 'Annotation guidelines per project', endpoint: '/guidelines' },
  { key: 'comments', path: '/comments', icon: '💬', title: 'Comments', desc: 'Discussion threads on resources', endpoint: '/comments' },
  { key: 'dataImports', path: '/data-imports', icon: '📥', title: 'Data Imports', desc: 'Import data from files and APIs', endpoint: '/data-imports' },
  { key: 'team', path: '/team', icon: '👥', title: 'Team', desc: 'Manage team members and roles', endpoint: '/team' },
  { key: 'quality', path: '/quality', icon: '📈', title: 'Quality', desc: 'Track labeling quality metrics', endpoint: '/quality' },
  { key: 'tags', path: '/tags', icon: '🔖', title: 'Tags', desc: 'Organize resources with tags', endpoint: '/tags' },
  { key: 'templates', path: '/templates', icon: '📋', title: 'Templates', desc: 'Project and workflow templates', endpoint: '/templates' },
  { key: 'reports', path: '/reports', icon: '📄', title: 'Reports', desc: 'Generate and download reports', endpoint: '/reports' },
  { key: 'apiKeys', path: '/api-keys', icon: '🔑', title: 'API Keys', desc: 'Manage API access keys', endpoint: '/api-keys' },
  { key: 'exports', path: '/exports', icon: '📦', title: 'Exports', desc: 'Export labeled datasets', endpoint: '/exports' },
  { key: 'webhooks', path: '/webhooks', icon: '🔗', title: 'Webhooks', desc: 'Configure event notifications', endpoint: '/webhooks' },
  { key: 'notifications', path: '/notifications', icon: '🔔', title: 'Notifications', desc: 'View alerts and notifications', endpoint: '/notifications' },
  { key: 'activityFeed', path: '/activity-feed', icon: '⚡', title: 'Activity Feed', desc: 'Real-time activity stream', endpoint: '/activity-feed' },
  { key: 'savedFilters', path: '/saved-filters', icon: '💾', title: 'Saved Filters', desc: 'Save and reuse filter configs', endpoint: '/saved-filters' },
  { key: 'auditLog', path: '/audit-log', icon: '📋', title: 'Audit Log', desc: 'Track all platform activities', endpoint: '/audit-logs' },
  { key: 'analytics', path: '/analytics', icon: '📉', title: 'Analytics', desc: 'Insights and performance metrics', endpoint: null },
  { key: 'profile', path: '/profile', icon: '👤', title: 'Profile', desc: 'Your profile and settings', endpoint: null },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    features.forEach(async (f) => {
      if (!f.endpoint) return;
      try {
        const res = await api.get(f.endpoint);
        const data = res.data;
        let count = 0;
        if (Array.isArray(data)) count = data.length;
        else if (data.data && Array.isArray(data.data)) count = data.data.length;
        else if (data.total != null) count = data.total;
        else if (data.count != null) count = data.count;
        setCounts((prev) => ({ ...prev, [f.key]: count }));
      } catch {
        setCounts((prev) => ({ ...prev, [f.key]: '-' }));
      }
    });
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1><span className="page-header-icon">🏠</span> Dashboard</h1>
      </div>
      <div className="card-grid">
        {features.map((f) => (
          <div key={f.key} className="dashboard-card" onClick={() => navigate(f.path)}>
            <div className="dashboard-card-icon">{f.icon}</div>
            <div className="dashboard-card-title">{f.title}</div>
            <div className="dashboard-card-desc">{f.desc}</div>
            {f.endpoint && (
              <div className="dashboard-card-count">
                {counts[f.key] !== undefined ? counts[f.key] : '...'} items
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/profile');
      const data = res.data?.data || res.data;
      setProfile(data);
      setProfileForm({ name: data.name || '', email: data.email || '' });
    } catch { setProfile(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleProfileSave = async () => {
    if (!profileForm.name.trim()) { showToast('Name is required', 'error'); return; }
    if (!profileForm.email.trim()) { showToast('Email is required', 'error'); return; }
    setSavingProfile(true);
    try {
      const res = await api.put('/profile', profileForm);
      const data = res.data?.data || res.data;
      setProfile(data);
      setProfileForm({ name: data.name || '', email: data.email || '' });
      setEditingProfile(false);
      showToast('Profile updated');
    } catch (err) { showToast(err.response?.data?.error || 'Failed to update profile', 'error'); }
    setSavingProfile(false);
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword) { showToast('Current password is required', 'error'); return; }
    if (!passwordForm.newPassword) { showToast('New password is required', 'error'); return; }
    if (passwordForm.newPassword.length < 6) { showToast('New password must be at least 6 characters', 'error'); return; }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { showToast('Passwords do not match', 'error'); return; }
    setSavingPassword(true);
    try {
      await api.put('/profile/password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password changed successfully');
    } catch (err) { showToast(err.response?.data?.error || 'Failed to change password', 'error'); }
    setSavingPassword(false);
  };

  const handleCancelEdit = () => {
    setProfileForm({ name: profile?.name || '', email: profile?.email || '' });
    setEditingProfile(false);
  };

  const roleColor = (r) => {
    if (r === 'admin') return 'danger';
    if (r === 'reviewer' || r === 'manager') return 'warning';
    return 'info';
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">👤</span> Profile & Settings</h1>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading profile...</span></div>
      ) : !profile ? (
        <div className="empty-state"><div className="empty-state-icon">👤</div><div className="empty-state-title">Unable to load profile</div><div className="empty-state-desc">Please try again later</div><button className="btn btn-primary" onClick={fetchProfile}>Retry</button></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Profile Information</h2>
              {!editingProfile && (
                <button className="btn btn-primary" onClick={() => setEditingProfile(true)}>Edit Profile</button>
              )}
            </div>
            {editingProfile ? (
              <>
                <div className="form-group">
                  <label>Name</label>
                  <input className="form-input" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="Full name" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input className="form-input" type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="Email address" />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button className="btn btn-secondary" onClick={handleCancelEdit} disabled={savingProfile}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleProfileSave} disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </>
            ) : (
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Name</div>
                  <div className="detail-value">{profile.name}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Email</div>
                  <div className="detail-value">{profile.email}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Role</div>
                  <div className="detail-value"><span className={`badge badge-${roleColor(profile.role)}`}>{profile.role}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Joined</div>
                  <div className="detail-value">{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</div>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Change Password</h2>
            <div className="form-group">
              <label>Current Password</label>
              <input className="form-input" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="Enter current password" />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input className="form-input" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Enter new password" />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input className="form-input" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="Confirm new password" />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-danger" onClick={handlePasswordChange} disabled={savingPassword}>{savingPassword ? 'Changing...' : 'Change Password'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

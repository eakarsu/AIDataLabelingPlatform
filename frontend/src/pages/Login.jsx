import React, { useState } from 'react';
import api from '../api';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data.token || res.data.data?.token;
      if (token) {
        localStorage.setItem('token', token);
        onLogin();
        window.location.href = '/dashboard';
      } else {
        setError('No token received from server');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = () => {
    setEmail('admin@labelai.com');
    setPassword('password123');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">🏷️</div>
        <h1>LabelAI</h1>
        <p className="login-subtitle">AI Data Labeling Platform</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner spinner-sm"></span>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="quick-login-divider">or</div>

        <button
          type="button"
          className="btn btn-secondary btn-full"
          onClick={handleQuickLogin}
        >
          ⚡ Quick Login (Auto-populate credentials)
        </button>
      </div>
    </div>
  );
}

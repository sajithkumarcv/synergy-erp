import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { variables } from './Variable';
import './Login.css';

const Login = () => {
  const [mode,         setMode]         = useState('login'); // 'login' | 'forgot'
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  // Forgot-password state
  const [forgotEmail,    setForgotEmail]    = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotMsg,      setForgotMsg]      = useState('');

  const { login } = useAuth();

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setForgotMsg('');
    setForgotUsername('');
    setForgotEmail('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(variables.API_URL + 'Auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.status === 401) { setError('Invalid username or password.'); return; }
      if (!res.ok)            { setError('Server error. Please try again.'); return; }
      const data = await res.json();
      login(data);
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setForgotMsg('');
    if (!forgotUsername.trim() || !forgotEmail.trim()) {
      setError('Please enter your username and email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(variables.API_URL + 'Auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotUsername.trim(), email: forgotEmail.trim() })
      });
      const data = await res.json().catch(() => ({}));
      // Backend always returns a generic success message (anti-enumeration).
      setForgotMsg(data.message || 'If an account with that email exists, a password reset link has been sent.');
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">

      {/* Left brand panel */}
      <div className="login-left">
        <div className="login-left-inner">
          <img src="/logo.svg" alt="PMS" style={{ width: 108, height: 108, borderRadius: 24, marginBottom: 16 }} />
          <h1 className="login-app-name">PMS</h1>
          <p className="login-app-desc">Project Management System</p>
          <div className="login-features">
            <div className="login-feature-item">✓ Procurement &amp; Inventory</div>
            <div className="login-feature-item">✓ Job Costing &amp; Finance</div>
            <div className="login-feature-item">✓ Customer Management</div>
            <div className="login-feature-item">✓ Real-time Reporting</div>
          </div>
        </div>
        <div className="login-left-footer">
          &copy; {new Date().getFullYear()} PMS &mdash; All rights reserved
        </div>
      </div>

      {/* Right login form */}
      <div className="login-right">
        <div className="login-card">

          <div className="login-card-header">
            <h2 className="login-title">{mode === 'login' ? 'Sign In' : 'Reset Password'}</h2>
            <p className="login-subtitle">
              {mode === 'login'
                ? 'Enter your credentials to access the system'
                : 'Enter your account email and we will send you a reset link'}
            </p>
          </div>

          {error && (
            <div className="login-error">
              <span>⚠</span> {error}
            </div>
          )}

          {/* ── Forgot-password view ── */}
          {mode === 'forgot' ? (
            forgotMsg ? (
              <>
                <div className="login-success">
                  <span>✓</span> {forgotMsg}
                </div>
                <button type="button" className="login-link login-back" onClick={() => switchMode('login')}>
                  ← Back to sign in
                </button>
              </>
            ) : (
              <form onSubmit={handleForgot} noValidate className="login-form">
                <div className="login-field">
                  <label htmlFor="forgot-username">Username</label>
                  <div className="login-input-wrap">
                    <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="8" cy="5.5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/>
                    </svg>
                    <input
                      id="forgot-username"
                      type="text"
                      placeholder="Enter your username"
                      value={forgotUsername}
                      onChange={e => setForgotUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="login-field">
                  <label htmlFor="forgot-email">Email Address</label>
                  <div className="login-input-wrap">
                    <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5 8 8.5l5.5-4" strokeLinecap="round"/>
                    </svg>
                    <input
                      id="forgot-email"
                      type="email"
                      placeholder="Enter your email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className={`login-submit${loading ? ' login-submit--loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? <span className="login-spinner" /> : 'Send Reset Link'}
                </button>

                <button type="button" className="login-link login-back" onClick={() => switchMode('login')}>
                  ← Back to sign in
                </button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} noValidate className="login-form">

            <div className="login-field">
              <label htmlFor="login-username">Username</label>
              <div className="login-input-wrap">
                <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="8" cy="5.5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/>
                </svg>
                <input
                  id="login-username"
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round"/>
                </svg>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword
                    ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"/><circle cx="8" cy="8" r="2"/><line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round"/></svg>
                    : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"/><circle cx="8" cy="8" r="2"/></svg>
                  }
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`login-submit${loading ? ' login-submit--loading' : ''}`}
              disabled={loading}
            >
              {loading
                ? <span className="login-spinner" />
                : 'Sign In'
              }
            </button>

            <button type="button" className="login-link login-forgot" onClick={() => switchMode('forgot')}>
              Forgot your password?
            </button>

          </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

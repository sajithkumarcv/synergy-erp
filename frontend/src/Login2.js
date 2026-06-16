import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { variables } from './Variable';
import './Login2.css';

const IconUser = () => (
  <svg className="l2-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="8" cy="5.5" r="3" />
    <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round" />
  </svg>
);

const IconLock = () => (
  <svg className="l2-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round" />
  </svg>
);

const IconMail = () => (
  <svg className="l2-input-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="M2.5 4.5 8 8.5l5.5-4" strokeLinecap="round" />
  </svg>
);

const EyeOpen = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);

const EyeOff = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" />
    <circle cx="8" cy="8" r="2" />
    <line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round" />
  </svg>
);

const Login2 = () => {
  const [mode,         setMode]         = useState('login');
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      if (res.status === 401) { setError('Invalid username or password.'); return; }
      if (!res.ok)            { setError('Server error. Please try again.'); return; }
      login(await res.json());
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
      const res  = await fetch(variables.API_URL + 'Auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: forgotUsername.trim(), email: forgotEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setForgotMsg(data.message || 'If an account with that email exists, a reset link has been sent.');
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="l2-root">
      {/* Animated background */}
      <div className="l2-bg">
        <div className="l2-orb l2-orb-1" />
        <div className="l2-orb l2-orb-2" />
        <div className="l2-orb l2-orb-3" />
        <div className="l2-grid" />
      </div>

      {/* Card */}
      <div className="l2-card">

        {/* Brand */}
        <div className="l2-brand">
          <div className="l2-logo-ring">
            <img src="/logo.svg" alt="PMS" onError={e => { e.target.style.display='none'; }} />
          </div>
          <div className="l2-app-name">PMS</div>
          <div className="l2-app-tagline">Project Management System</div>
        </div>

        <hr className="l2-divider" />

        {error && (
          <div className="l2-error" style={{ marginBottom: 20 }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6.5" /><line x1="8" y1="5" x2="8" y2="8.5" strokeLinecap="round" /><circle cx="8" cy="11" r="0.5" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        {/* ── Forgot-password view ── */}
        {mode === 'forgot' ? (
          forgotMsg ? (
            <>
              <div className="l2-success">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="8" cy="8" r="6.5" /><polyline points="5,8 7,10.5 11,6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{forgotMsg}</span>
              </div>
              <button type="button" className="l2-link" onClick={() => switchMode('login')}>
                ← Back to sign in
              </button>
            </>
          ) : (
            <>
              <div className="l2-section-title">Reset Password</div>
              <div className="l2-section-sub">Enter your account details and we'll send you a reset link.</div>
              <form onSubmit={handleForgot} noValidate className="l2-form">
                <div className="l2-field">
                  <label htmlFor="l2-forgot-user">Username</label>
                  <div className="l2-input-wrap">
                    <IconUser />
                    <input
                      id="l2-forgot-user"
                      type="text"
                      placeholder="Your username"
                      value={forgotUsername}
                      onChange={e => setForgotUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="l2-field">
                  <label htmlFor="l2-forgot-email">Email Address</label>
                  <div className="l2-input-wrap">
                    <IconMail />
                    <input
                      id="l2-forgot-email"
                      type="email"
                      placeholder="Your email address"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>
                <button type="submit" className="l2-submit" disabled={loading}>
                  {loading ? <span className="l2-spinner" /> : 'Send Reset Link'}
                </button>
                <button type="button" className="l2-link" onClick={() => switchMode('login')}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )
        ) : (
          <>
            <div className="l2-section-title">Welcome back</div>
            <div className="l2-section-sub">Sign in to continue to your workspace.</div>
            <form onSubmit={handleSubmit} noValidate className="l2-form">
              <div className="l2-field">
                <label htmlFor="l2-username">Username</label>
                <div className="l2-input-wrap">
                  <IconUser />
                  <input
                    id="l2-username"
                    type="text"
                    placeholder="Enter username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className="l2-field">
                <label htmlFor="l2-password">Password</label>
                <div className="l2-input-wrap">
                  <IconLock />
                  <input
                    id="l2-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="l2-eye"
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex={-1}
                    title={showPassword ? 'Hide' : 'Show'}
                  >
                    {showPassword ? <EyeOff /> : <EyeOpen />}
                  </button>
                </div>
              </div>

              <button type="submit" className="l2-submit" disabled={loading}>
                {loading ? <span className="l2-spinner" /> : 'Sign In'}
              </button>

              <button type="button" className="l2-link" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
            </form>
          </>
        )}

        <div className="l2-footer">
          &copy; {new Date().getFullYear()} PMS &mdash; All rights reserved
        </div>
      </div>
    </div>
  );
};

export default Login2;

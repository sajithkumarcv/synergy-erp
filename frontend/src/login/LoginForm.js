import React, { useState, useEffect } from 'react';
import { useAuth, LOGOUT_REASON_KEY } from '../AuthContext';
import { variables } from '../Variable';
import { brand } from '../branding';

// ═══════════════════════════════════════════════════════════════════
// LoginForm — the ONE card with all auth logic (login / session-conflict
// / forgot-password). Written once, never forked per client. Layouts wrap
// this; branding supplies the copy via brand().text.
//
// Renders the card CONTENTS only (header + form). The surrounding
// .login-card / page chrome belongs to the layout component.
// ═══════════════════════════════════════════════════════════════════

export default function LoginForm() {
  const b = brand();
  const t = b.text || {};

  const [mode,         setMode]         = useState('login'); // 'login' | 'forgot'
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState(() => {
    try { return sessionStorage.getItem(LOGOUT_REASON_KEY) || ''; } catch { return ''; }
  });
  const [loading,      setLoading]      = useState(false);
  const [conflict,     setConflict]     = useState(null); // { activeSince, ipAddress }

  useEffect(() => {
    try { sessionStorage.removeItem(LOGOUT_REASON_KEY); } catch {}
  }, []);

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

  const doLogin = async (force) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(variables.API_URL + 'Auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, force })
      });
      if (res.status === 401) { setConflict(null); setError('Invalid username or password.'); return; }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'ACTIVE_SESSION') {
          setConflict({ activeSince: data.activeSince, ipAddress: data.ipAddress });
        } else {
          setError(data.message || 'Sign-in conflict. Please try again.');
        }
        return;
      }
      if (!res.ok) { setError('Server error. Please try again.'); return; }
      const data = await res.json();
      setConflict(null);
      login(data);
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    await doLogin(false);
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
      if (!res.ok) {
        setError(data.message || 'Request failed. Please try again.');
        return;
      }
      setForgotMsg(data.message || 'A password reset link has been sent to your email address.');
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="login-card-header">
        <h2 className="login-title">
          {mode === 'login' ? (t.signInTitle || 'Sign In') : (t.resetTitle || 'Reset Password')}
        </h2>
        <p className="login-subtitle">
          {mode === 'login'
            ? (t.signInSubtitle || 'Enter your credentials to access the system')
            : (t.resetSubtitle  || 'Enter your account email and we will send you a reset link')}
        </p>
      </div>

      {error && (
        <div className="login-error">
          <span>⚠</span> {error}
        </div>
      )}

      {conflict ? (
        <div className="login-conflict">
          <div className="login-conflict-title">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" width="18" height="18">
              <rect x="1.5" y="2.5" width="13" height="9" rx="1.2"/>
              <path d="M5.5 14h5M8 11.5V14" strokeLinecap="round"/>
            </svg>
            Already signed in on another PC
          </div>
          <p className="login-conflict-text">
            This account has an active session
            {conflict.ipAddress ? <> from <strong>{conflict.ipAddress}</strong></> : null}
            {conflict.activeSince ? <> since <strong>{new Date(conflict.activeSince).toLocaleString()}</strong></> : null}.
            <br />
            Continuing here will sign out the other PC.
          </p>
          <button
            type="button"
            className={`login-submit${loading ? ' login-submit--loading' : ''}`}
            disabled={loading}
            onClick={() => doLogin(true)}
          >
            {loading ? <span className="login-spinner" /> : 'Sign out other PC & continue'}
          </button>
          <button type="button" className="login-link login-back" onClick={() => setConflict(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <>
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
                {loading ? <span className="login-spinner" /> : 'Sign In'}
              </button>

              <button type="button" className="login-link login-forgot" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}

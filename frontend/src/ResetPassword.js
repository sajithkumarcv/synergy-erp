import React, { useState, useEffect, useCallback } from 'react';
import { variables } from './Variable';
import './Login.css';

const ResetPassword = ({ token }) => {
  const [checking,  setChecking]  = useState(true);
  const [valid,     setValid]     = useState(false);
  const [username,  setUsername]  = useState('');

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  // Send the user back to the clean login URL (drops ?reset-token=…)
  const goToLogin = useCallback(() => {
    window.history.replaceState({}, '', window.location.pathname);
    window.location.reload();
  }, []);

  // Validate the token on mount
  useEffect(() => {
    let active = true;
    fetch(`${variables.API_URL}Auth/validate-reset-token?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        setValid(!!d.valid);
        setUsername(d.username || '');
      })
      .catch(() => active && setValid(false))
      .finally(() => active && setChecking(false));
    return () => { active = false; };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!password || !confirm) { setError('Please fill in both password fields.'); return; }
    if (password.length < 6)   { setError('Password must be at least 6 characters long.'); return; }
    if (password !== confirm)  { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await fetch(variables.API_URL + 'Auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message || 'Password reset failed.'); return; }
      setDone(true);
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

      {/* Right panel */}
      <div className="login-right">
        <div className="login-card">
          <div className="login-card-header">
            <h2 className="login-title">Set a New Password</h2>
            <p className="login-subtitle">
              {username ? `Resetting password for ${username}` : 'Choose a new password for your account'}
            </p>
          </div>

          {checking ? (
            <div className="login-checking">
              <span className="login-spinner login-spinner--dark" /> Verifying your reset link…
            </div>
          ) : done ? (
            <>
              <div className="login-success">
                <span>✓</span> Your password has been reset successfully.
              </div>
              <button type="button" className="login-submit" onClick={goToLogin}>
                Go to Sign In
              </button>
            </>
          ) : !valid ? (
            <>
              <div className="login-error">
                <span>⚠</span> This password reset link is invalid or has expired.
              </div>
              <button type="button" className="login-submit" onClick={goToLogin}>
                Back to Sign In
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="login-form">
              {error && (
                <div className="login-error"><span>⚠</span> {error}</div>
              )}

              <div className="login-field">
                <label htmlFor="rp-password">New Password</label>
                <div className="login-input-wrap">
                  <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round"/>
                  </svg>
                  <input
                    id="rp-password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPwd(v => !v)}
                    tabIndex={-1}
                    title={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd
                      ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"/><circle cx="8" cy="8" r="2"/><line x1="2" y1="2" x2="14" y2="14" strokeLinecap="round"/></svg>
                      : <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"/><circle cx="8" cy="8" r="2"/></svg>
                    }
                  </button>
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="rp-confirm">Confirm Password</label>
                <div className="login-input-wrap">
                  <svg className="login-field-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" strokeLinecap="round"/>
                  </svg>
                  <input
                    id="rp-confirm"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`login-submit${loading ? ' login-submit--loading' : ''}`}
                disabled={loading}
              >
                {loading ? <span className="login-spinner" /> : 'Reset Password'}
              </button>

              <button type="button" className="login-link login-back" onClick={goToLogin}>
                ← Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

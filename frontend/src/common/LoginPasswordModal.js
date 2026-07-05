import React, { useState, useEffect, useRef } from 'react';
import '../procurement/Procurement.css';

/**
 * Reusable modal that asks the current user to re-enter their login password.
 *
 * Props:
 *   title       – modal heading
 *   message     – body text above the password field
 *   onConfirm(password) – called with the plain-text password when submitted
 *   onClose     – called when cancelled
 *   loading     – pass true while the parent is processing (disables buttons)
 */
const LoginPasswordModal = ({ title = 'Confirm Action', message, onConfirm, onClose, loading = false }) => {
    const [password, setPassword] = useState('');
    const [error,    setError]    = useState('');
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const submit = () => {
        if (!password.trim()) { setError('Password is required.'); return; }
        setError('');
        onConfirm(password.trim());
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 420 }}>
                <div className="pf-header">
                    <div className="pf-header-title">{title}</div>
                    <button className="pf-close" onClick={onClose} disabled={loading}>✕</button>
                </div>
                <div className="pf-body">
                    {message && (
                        <div style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
                            {message}
                        </div>
                    )}
                    {error && (
                        <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                        Your Login Password <span style={{ color: '#dc2626' }}>*</span>
                    </div>
                    <input
                        ref={inputRef}
                        type="password" autoComplete="new-password"
                        className="pf-input"
                        placeholder="Enter your login password to confirm…"
                        value={password}
                        disabled={loading}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                    />
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="pf-btn-pri" onClick={submit} disabled={loading}>
                        {loading ? 'Verifying…' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginPasswordModal;

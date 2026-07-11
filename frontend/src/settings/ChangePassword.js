import React, { useState } from 'react';
import { variables } from '../Variable';
import { useAuth } from '../AuthContext';
import './Settings.css';

const ChangePassword = () => {
    const { auth, authHeader, logout } = useAuth();

    const [username, setUsername] = useState('');
    const [oldPwd,   setOldPwd]   = useState('');
    const [newPwd,   setNewPwd]   = useState('');
    const [confirm,  setConfirm]  = useState('');
    const [showOld,  setShowOld]  = useState(false);
    const [showNew,  setShowNew]  = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [err,      setErr]      = useState('');
    const [done,     setDone]     = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setErr('');
        if (!username || !oldPwd || !newPwd || !confirm) { setErr('Please fill in all fields.'); return; }
        if (username.trim().toLowerCase() !== (auth?.username || '').toLowerCase()) {
            setErr('The username does not match your account.'); return;
        }
        if (newPwd.length < 6)              { setErr('New password must be at least 6 characters.'); return; }
        if (newPwd !== confirm)             { setErr('New passwords do not match.'); return; }
        if (newPwd === oldPwd)              { setErr('New password must be different from the current one.'); return; }

        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}Auth/change-password`, {
                method: 'POST',
                headers: authHeader(),
                body: JSON.stringify({ username: username.trim(), oldPassword: oldPwd, newPassword: newPwd }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Password change failed.'); return; }

            // Success → show confirmation briefly, then force re-login.
            setDone(true);
            setUsername(''); setOldPwd(''); setNewPwd(''); setConfirm('');
            setTimeout(() => { logout(); }, 1800);
        } catch {
            setErr('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = { width: '100%', padding: '8px 38px 8px 10px', fontSize: 13 };

    return (
        <div className="po-page">
            <div className="po-grid-wrap" style={{ maxWidth: 520 }}>
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Change Password</div>
                            <div className="po-page-sub">Update the password for your account.</div>
                        </div>
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '22px 24px' }}>
                    {done ? (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                                Password changed successfully
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>
                                Signing you out — please sign in again with your new password…
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={submit} noValidate>
                            {err && (
                                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 14 }}>
                                    ✕ {err}
                                </div>
                            )}

                            {/* Username */}
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                Username
                            </label>
                            <input
                                type="text"
                                className="pf-input" autoComplete="username"
                                style={{ width: '100%', padding: '8px 10px', fontSize: 13, marginBottom: 14 }}
                                value={username} onChange={e => setUsername(e.target.value)} disabled={saving} />

                            {/* Current password */}
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                Current password
                            </label>
                            <div style={{ position: 'relative', marginBottom: 14 }}>
                                <input
                                    type={showOld ? 'text' : 'password'}
                                    className="pf-input" autoComplete="current-password"
                                    style={inputStyle}
                                    value={oldPwd} onChange={e => setOldPwd(e.target.value)} disabled={saving} />
                                <button type="button" onClick={() => setShowOld(v => !v)} tabIndex={-1}
                                    style={pwdToggleStyle}>{showOld ? 'Hide' : 'Show'}</button>
                            </div>

                            {/* New password */}
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                New password
                            </label>
                            <div style={{ position: 'relative', marginBottom: 14 }}>
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    className="pf-input" autoComplete="new-password"
                                    style={inputStyle}
                                    value={newPwd} onChange={e => setNewPwd(e.target.value)} disabled={saving} />
                                <button type="button" onClick={() => setShowNew(v => !v)} tabIndex={-1}
                                    style={pwdToggleStyle}>{showNew ? 'Hide' : 'Show'}</button>
                            </div>

                            {/* Confirm new password */}
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                                Confirm new password
                            </label>
                            <input
                                type={showNew ? 'text' : 'password'}
                                className="pf-input" autoComplete="new-password"
                                style={{ width: '100%', padding: '8px 10px', fontSize: 13, marginBottom: 18 }}
                                value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving} />

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="pf-btn-pri" type="submit"
                                    disabled={saving || !username || !oldPwd || !newPwd || !confirm}
                                    style={{ padding: '8px 20px', fontSize: 13 }}>
                                    {saving ? 'Updating…' : 'Change Password'}
                                </button>
                            </div>

                            <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 12, lineHeight: 1.55 }}>
                                For your security, you will be signed out after changing your password and must sign in again with the new one.
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

const pwdToggleStyle = {
    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', color: '#64748b', fontSize: 11,
    cursor: 'pointer', padding: '2px 4px',
};

export default ChangePassword;
export { ChangePassword };

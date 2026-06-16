import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import './Settings.css';

const BudgetPassword = () => {
    const currentUser = useCurrentUser();

    const [roles,     setRoles]     = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [selRole,   setSelRole]   = useState('');
    const [pwd,       setPwd]       = useState('');
    const [confirm,   setConfirm]   = useState('');
    const [saving,    setSaving]    = useState(false);
    const [msg,       setMsg]       = useState('');
    const [err,       setErr]       = useState('');

    // ── My (per-user) budget password ────────────────────────
    const [myStatus, setMyStatus] = useState({ hasPassword: false, modifiedDate: null });
    const [myCurrent, setMyCurrent] = useState('');
    const [myNew,     setMyNew]     = useState('');
    const [myConfirm, setMyConfirm] = useState('');
    const [mySaving,  setMySaving]  = useState(false);
    const [myMsg,     setMyMsg]     = useState('');
    const [myErr,     setMyErr]     = useState('');

    const loadMyStatus = useCallback(() => {
        fetch(`${variables.API_URL}jobbudget/my-password-status`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setMyStatus({ hasPassword: !!d?.hasPassword, modifiedDate: d?.modifiedDate || null }))
            .catch(console.error);
    }, []);

    useEffect(() => { loadMyStatus(); }, [loadMyStatus]);

    const saveMy = async () => {
        setMyErr(''); setMyMsg('');
        if (myNew.length < 4)     { setMyErr('Password must be at least 4 characters.'); return; }
        if (myNew !== myConfirm)  { setMyErr('Passwords do not match.'); return; }
        if (myStatus.hasPassword && !myCurrent) { setMyErr('Current password is required.'); return; }
        setMySaving(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/set-my-password`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    newPassword:     myNew,
                    currentPassword: myStatus.hasPassword ? myCurrent : null,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) setMyErr(d?.message || 'Save failed.');
            else {
                setMyMsg(d?.message || 'Saved.');
                setMyCurrent(''); setMyNew(''); setMyConfirm('');
                loadMyStatus();
            }
        } catch { setMyErr('Network error.'); }
        finally { setMySaving(false); }
    };

    const loadRoles = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}jobbudget/password-roles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRoles(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadRoles(); }, [loadRoles]);

    const save = async () => {
        setErr(''); setMsg('');
        if (!selRole)        { setErr('Pick a role first.'); return; }
        if (pwd.length < 4)  { setErr('Password must be at least 4 characters.'); return; }
        if (pwd !== confirm) { setErr('Passwords do not match.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/set-password`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    roleId:      parseInt(selRole),
                    newPassword: pwd,
                    changedBy:   currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Save failed.'); }
            else {
                setMsg(d?.message || 'Saved.');
                setPwd(''); setConfirm('');
                loadRoles();
            }
        } catch { setErr('Network error.'); }
        finally { setSaving(false); }
    };

    const selRoleObj = roles.find(r => String(r.roleId) === String(selRole));

    return (
        <div className="po-page">
            <div className="po-grid-wrap" style={{ maxWidth: 720 }}>
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Budget Password</div>
                            <div className="po-page-sub">Per-role password required to approve or revise job budgets.</div>
                        </div>
                    </div>
                </div>

                {/* ─── My personal budget password ─────────────────────────── */}
                <div style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                    padding: '20px 22px', marginBottom: 18,
                    borderLeft: myStatus.hasPassword ? '4px solid #16a34a' : '4px solid #f59e0b',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                🔐 My Budget Password
                            </div>
                            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                                Your personal password is used to authorise budget approve/revise, job complete/cancel,
                                stage-freeze and revise-reopen actions. It takes precedence over your role's shared password.
                            </div>
                        </div>
                        <div>
                            {myStatus.hasPassword
                                ? <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>✓ Configured</span>
                                : <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Not set — using role password</span>}
                        </div>
                    </div>

                    {myStatus.modifiedDate && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                            Last changed: <strong>{new Date(myStatus.modifiedDate).toLocaleString('en-GB')}</strong>
                        </div>
                    )}

                    {myMsg && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>✓ {myMsg}</div>}
                    {myErr && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {myErr}</div>}

                    {myStatus.hasPassword && (
                        <>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Current password</label>
                            <input type="password" className="pf-input" autoComplete="current-password"
                                style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 10 }}
                                value={myCurrent} onChange={e => setMyCurrent(e.target.value)} disabled={mySaving} />
                        </>
                    )}

                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                        {myStatus.hasPassword ? 'New password' : 'Password'}
                    </label>
                    <input type="password" className="pf-input" autoComplete="new-password"
                        style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 10 }}
                        value={myNew} onChange={e => setMyNew(e.target.value)} disabled={mySaving} />

                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Confirm new password</label>
                    <input type="password" className="pf-input" autoComplete="new-password"
                        style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 14 }}
                        value={myConfirm} onChange={e => setMyConfirm(e.target.value)} disabled={mySaving} />

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="pf-btn-pri" onClick={saveMy}
                            disabled={mySaving || !myNew || !myConfirm || (myStatus.hasPassword && !myCurrent)}
                            style={{ padding: '7px 18px', fontSize: 13 }}>
                            {mySaving ? 'Saving…' : (myStatus.hasPassword ? 'Change my password' : 'Set my password')}
                        </button>
                    </div>
                </div>

                {/* ─── Per-role admin section (back-compat) ─────────────────── */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 22px' }}>
                    {/* Role status table */}
                    <div style={{ marginBottom: 22 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Roles
                        </div>
                        {loading ? (
                            <div style={{ color: '#94a3b8', fontSize: 12 }}>Loading roles…</div>
                        ) : roles.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 12 }}>No roles found.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Role</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#475569', width: 130 }}>Password set?</th>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', width: 230 }}>Last changed</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roles.map(r => (
                                        <tr key={r.roleId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '7px 10px' }}>
                                                <span style={{ fontWeight: 600, color: '#1e293b' }}>{r.roleName}</span>
                                                <span style={{ marginLeft: 8, fontFamily: 'Courier New', background: '#f1f5f9', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 10.5 }}>{r.roleCode}</span>
                                            </td>
                                            <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                                {r.isConfigured
                                                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>✓ Set</span>
                                                    : <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>Not set</span>}
                                            </td>
                                            <td style={{ padding: '7px 10px', fontSize: 11, color: '#64748b' }}>
                                                {r.modifiedDate
                                                    ? `${new Date(r.modifiedDate).toLocaleString('en-GB')} by ${r.modifiedBy || '—'}`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Set / change form */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 18 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Set or change a role's password
                        </div>

                        {msg && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✓ {msg}</div>}
                        {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>}

                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Role</label>
                            <select className="pf-input" value={selRole} onChange={e => setSelRole(e.target.value)}
                                style={{ width: '100%', padding: '7px 10px', fontSize: 13 }} disabled={saving}>
                                <option value="">— Select a role —</option>
                                {roles.map(r => (
                                    <option key={r.roleId} value={r.roleId}>
                                        {r.roleName} ({r.roleCode}) {r.isConfigured ? '— configured' : '— not set'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                            {selRoleObj?.isConfigured ? 'New password' : 'Password'}
                        </label>
                        <input type="password" className="pf-input" autoComplete="new-password"
                            style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 12 }}
                            value={pwd} onChange={e => setPwd(e.target.value)} disabled={saving || !selRole} />

                        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Confirm password</label>
                        <input type="password" className="pf-input" autoComplete="new-password"
                            style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 16 }}
                            value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving || !selRole} />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="pf-btn-pri" onClick={save}
                                disabled={saving || !selRole || !pwd || !confirm}
                                style={{ padding: '7px 18px', fontSize: 13 }}>
                                {saving ? 'Saving…' : 'Save password'}
                            </button>
                        </div>

                        <div style={{ marginTop: 18, fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 12, lineHeight: 1.55 }}>
                            Passwords are hashed (SHA-256) before being stored in <code style={{ fontFamily: 'Courier New', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>TBL_ROLE_SECRET</code>.
                            <br />When a user approves or revises a budget, they enter the password of any one of their assigned roles that has the matching <strong>APPROVE</strong> or <strong>REVISE</strong> permission on Jobs.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BudgetPassword;
export { BudgetPassword };

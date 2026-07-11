import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import RolePasswordPanel from './RolePasswordPanel';
import './Settings.css';

// ── My personal budget password card ─────────────────────────────────────────
const MyBudgetPassword = () => {
    const [status,  setStatus]  = useState({ hasPassword: false, modifiedDate: null });
    const [current, setCurrent] = useState('');
    const [pwd,     setPwd]     = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving,  setSaving]  = useState(false);
    const [msg,     setMsg]     = useState('');
    const [err,     setErr]     = useState('');

    const loadStatus = useCallback(() => {
        fetch(`${variables.API_URL}jobbudget/my-password-status`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setStatus({ hasPassword: !!d?.hasPassword, modifiedDate: d?.modifiedDate || null }))
            .catch(console.error);
    }, []);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    const save = async () => {
        setErr(''); setMsg('');
        if (pwd.length < 4)    { setErr('Password must be at least 4 characters.'); return; }
        if (pwd !== confirm)   { setErr('Passwords do not match.'); return; }
        if (status.hasPassword && !current) { setErr('Current password is required.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/set-my-password`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ newPassword: pwd, currentPassword: status.hasPassword ? current : null }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) setErr(d?.message || 'Save failed.');
            else {
                setMsg(d?.message || 'Saved.');
                setCurrent(''); setPwd(''); setConfirm('');
                loadStatus();
            }
        } catch { setErr('Network error.'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: '20px 22px', marginBottom: 18,
            borderLeft: status.hasPassword ? '4px solid #16a34a' : '4px solid #f59e0b',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>🔐 My Budget Password</div>
                {status.hasPassword
                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>✓ Configured</span>
                    : <span style={{ background: '#fef3c7', color: '#92400e', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Not set — using role password</span>}
            </div>

            <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 12 }}>
                Your personal password authorises your budget approve/revise and related actions; it takes precedence over your role's shared password.
            </div>

            {status.modifiedDate && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                    Last changed: <strong>{new Date(status.modifiedDate).toLocaleString('en-GB')}</strong>
                </div>
            )}

            {msg && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>✓ {msg}</div>}
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {err}</div>}

            {status.hasPassword && (
                <>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Current password</label>
                    <input type="password" className="pf-input" autoComplete="current-password"
                        style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 10 }}
                        value={current} onChange={e => setCurrent(e.target.value)} disabled={saving} />
                </>
            )}

            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                {status.hasPassword ? 'New password' : 'Password'}
            </label>
            <input type="password" className="pf-input" autoComplete="new-password"
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 10 }}
                value={pwd} onChange={e => setPwd(e.target.value)} disabled={saving} />

            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Confirm new password</label>
            <input type="password" className="pf-input" autoComplete="new-password"
                style={{ width: '100%', padding: '7px 10px', fontSize: 13, marginBottom: 14 }}
                value={confirm} onChange={e => setConfirm(e.target.value)} disabled={saving} />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="pf-btn-pri" onClick={save}
                    disabled={saving || !pwd || !confirm || (status.hasPassword && !current)}
                    style={{ padding: '7px 18px', fontSize: 13 }}>
                    {saving ? 'Saving…' : (status.hasPassword ? 'Change my password' : 'Set my password')}
                </button>
            </div>
        </div>
    );
};

// ── Password Manage page (two tabs) ──────────────────────────────────────────
const TABS = [
    { key: 'budget',  label: 'Budget Password' },
    { key: 'invoice', label: 'Invoice Password' },
];

const PasswordManage = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const initialTab = new URLSearchParams(location.search).get('tab') === 'invoice' ? 'invoice' : 'budget';
    const [tab, setTab] = useState(initialTab);

    // Keep the tab in sync if the query string changes (e.g. legacy redirect).
    useEffect(() => {
        const t = new URLSearchParams(location.search).get('tab');
        if (t === 'invoice' || t === 'budget') setTab(t);
    }, [location.search]);

    const selectTab = (key) => {
        setTab(key);
        navigate(`/settings/password-manage?tab=${key}`, { replace: true });
    };

    return (
        <div className="po-page">
            <div className="po-grid-wrap" style={{ maxWidth: 720 }}>
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Password Manage</div>
                            <div className="po-page-sub">Manage budget and invoice role passwords.</div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 18 }}>
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => selectTab(t.key)}
                            style={{
                                padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                background: 'none', border: 'none',
                                color: tab === t.key ? '#1e40af' : '#64748b',
                                borderBottom: tab === t.key ? '2px solid #1e40af' : '2px solid transparent',
                                marginBottom: -1,
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'budget' ? (
                    <>
                        <MyBudgetPassword />
                        <RolePasswordPanel
                            rolesUrl="jobbudget/password-roles"
                            saveUrl="jobbudget/set-password"
                            hint="Per-role password required to approve or revise job budgets. Users may enter the password of any assigned role that has the matching APPROVE or REVISE permission on Jobs."
                        />
                    </>
                ) : (
                    <RolePasswordPanel
                        rolesUrl="supplierinvoice/revise-password-roles"
                        saveUrl="supplierinvoice/set-revise-password"
                        hint="Per-role password required to revise an approved supplier invoice back to Draft. Users may enter the password of any assigned role that has INVOICE_REVISE configured."
                    />
                )}
            </div>
        </div>
    );
};

export default PasswordManage;
export { PasswordManage };

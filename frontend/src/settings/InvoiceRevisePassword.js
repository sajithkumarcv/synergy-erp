import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import './Settings.css';

const InvoiceRevisePassword = () => {
    const currentUser = useCurrentUser();

    const [roles,   setRoles]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [selRole, setSelRole] = useState('');
    const [pwd,     setPwd]     = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving,  setSaving]  = useState(false);
    const [msg,     setMsg]     = useState('');
    const [err,     setErr]     = useState('');

    const loadRoles = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}supplierinvoice/revise-password-roles`, { headers: authHeaders() })
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
            const res = await fetch(`${variables.API_URL}supplierinvoice/set-revise-password`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ roleId: parseInt(selRole), newPassword: pwd, changedBy: currentUser }),
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
                            <div className="po-page-title">Invoice Revision Password</div>
                            <div className="po-page-sub">Per-role password required to revise an approved supplier invoice back to Draft.</div>
                        </div>
                    </div>
                </div>

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
                                                {r.roleCode && <span style={{ marginLeft: 8, fontFamily: 'Courier New', background: '#f1f5f9', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 10.5 }}>{r.roleCode}</span>}
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
                            Set or change a role's revision password
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
                                        {r.roleName}{r.roleCode ? ` (${r.roleCode})` : ''} {r.isConfigured ? '— configured' : '— not set'}
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
                            Passwords are hashed (SHA-256) before being stored. When a user clicks <strong>Revise</strong> on an approved invoice,
                            they must enter the password matching any one of their assigned roles that has <strong>INVOICE_REVISE</strong> configured.
                            <br />Default password for ADMIN, MANAGER and FINANCE MANAGER roles is <code style={{ fontFamily: 'Courier New', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>admin</code> — change it immediately.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceRevisePassword;
export { InvoiceRevisePassword };

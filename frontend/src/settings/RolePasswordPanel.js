import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';

// ── Reusable per-role password panel ─────────────────────────────────────────
// A plain roles table (Role / Status / Last changed) plus a small set/change
// form. Used by both tabs of the Password Manage page, parameterised only by:
//   rolesUrl  — GET endpoint returning [{ roleId, roleName, roleCode?,
//               isConfigured, modifiedBy?, modifiedDate? }]
//   saveUrl   — POST endpoint { roleId, newPassword, changedBy }
//   hint      — one short line under the form (optional)
//
// The loader normalises key casing defensively so it survives either a
// PascalCase (dynamic) or camelCase (typed) JSON shape from the server.
const norm = (r) => ({
    roleId:       r.roleId       ?? r.RoleId,
    roleName:     r.roleName     ?? r.RoleName     ?? '',
    roleCode:     r.roleCode     ?? r.RoleCode     ?? '',
    isConfigured: r.isConfigured ?? r.IsConfigured ?? false,
    modifiedBy:   r.modifiedBy   ?? r.ModifiedBy   ?? null,
    modifiedDate: r.modifiedDate ?? r.ModifiedDate ?? null,
});

const RolePasswordPanel = ({ rolesUrl, saveUrl, hint }) => {
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
        fetch(`${variables.API_URL}${rolesUrl}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRoles(Array.isArray(d) ? d.map(norm) : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [rolesUrl]);

    useEffect(() => { loadRoles(); }, [loadRoles]);

    const save = async () => {
        setErr(''); setMsg('');
        if (!selRole)        { setErr('Pick a role first.'); return; }
        if (pwd.length < 4)  { setErr('Password must be at least 4 characters.'); return; }
        if (pwd !== confirm) { setErr('Passwords do not match.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}${saveUrl}`, {
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
                                <th style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: '#475569', width: 110 }}>Status</th>
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

                {hint && (
                    <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 12, lineHeight: 1.55 }}>
                        {hint}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RolePasswordPanel;
export { RolePasswordPanel };

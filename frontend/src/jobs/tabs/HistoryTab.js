import React, { useState, useEffect, useMemo } from 'react';
import { variables, authHeaders } from '../../Variable';
import { AUDIT_ACTION_CONFIG, fmtDateTime } from '../jobConstants';

// ── Job History tab ─────────────────────────────────────────────────────────
// Full chronological audit of every change ever made to a job.
// Source: TBL_JOB_AUDIT via /api/job/{id}/audit (sp_GetJobAudit).
// Lifecycle events (Complete / Cancel / Revise) embed their reason into the
// NewValue column — we surface it as a dedicated badge so it's never hidden.

const HistoryTab = ({ job }) => {
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [lifecycle, setLifecycle] = useState({});
    const [filterAction, setFilterAction] = useState('');
    const [filterUser,   setFilterUser]   = useState('');
    const [search,       setSearch]       = useState('');

    useEffect(() => {
        if (!job?.jobId) return;
        setLoading(true);
        const auditP     = fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/audit`,     { headers: authHeaders() }).then(r => r.json()).catch(() => []);
        const lifecycleP = fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/lifecycle`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({}));
        Promise.all([auditP, lifecycleP])
            .then(([a, lc]) => {
                setRows(Array.isArray(a) ? a : []);
                setLifecycle(lc || {});
            })
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    // Distinct actions + users for the filter dropdowns
    const actions = useMemo(() => [...new Set(rows.map(r => r.action))].sort(), [rows]);
    const users   = useMemo(() => [...new Set(rows.map(r => r.createdBy).filter(Boolean))].sort(), [rows]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (filterAction && r.action    !== filterAction) return false;
            if (filterUser   && r.createdBy !== filterUser)   return false;
            if (!q) return true;
            const hay = [r.action, r.section, r.oldValue, r.newValue, r.remarks, r.createdBy].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [rows, filterAction, filterUser, search]);

    // Lifecycle events store reason in NewValue as "Status — reason text".
    // Split it so we can render the reason as its own row.
    const splitNewValue = (action, newVal) => {
        if (!newVal) return { value: null, reason: null };
        if (['STATUS_CHANGED', 'JOB_COMPLETED', 'JOB_CANCELLED', 'JOB_REVISED'].includes(action)) {
            const idx = newVal.indexOf(' — ');
            if (idx > 0) return { value: newVal.slice(0, idx), reason: newVal.slice(idx + 3) };
        }
        return { value: newVal, reason: null };
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: '#64748b' }}>
            <div style={{ width: 18, height: 18, border: '2px solid #e2e8f0', borderTopColor: '#2e5fa3', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading job history…
        </div>
    );

    return (
        <div style={{ padding: '0 0 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>
                        Job History
                        {rows.length > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 8px' }}>
                                {filtered.length}{filtered.length !== rows.length ? ` / ${rows.length}` : ''}
                            </span>
                        )}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                        Every recorded change to <strong>{job.jobId}</strong>, newest first.
                    </p>
                </div>
                {/* Lifecycle summary chips — sourced from job columns, not the audit log,
                    so they're always available even if the audit row was purged. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {lifecycle.completedDate && (
                        <span title={lifecycle.completedReason || ''}
                              style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                            ✅ Completed {fmtDateTime(lifecycle.completedDate)} {lifecycle.completedBy ? `· by ${lifecycle.completedBy}` : ''}
                        </span>
                    )}
                    {lifecycle.cancelledDate && (
                        <span title={lifecycle.cancelledReason || ''}
                              style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600 }}>
                            ✖ Cancelled {fmtDateTime(lifecycle.cancelledDate)} {lifecycle.cancelledBy ? `· by ${lifecycle.cancelledBy}` : ''}
                        </span>
                    )}
                </div>
            </div>

            {/* Filters */}
            {rows.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <input
                        type="text"
                        placeholder="Search reason / value / user…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ flex: 1, minWidth: 200, padding: '6px 10px', fontSize: 12.5, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff' }}
                    />
                    <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: 12.5, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', minWidth: 160 }}>
                        <option value="">All actions</option>
                        {actions.map(a => <option key={a} value={a}>{AUDIT_ACTION_CONFIG[a]?.label || a}</option>)}
                    </select>
                    <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                        style={{ padding: '6px 10px', fontSize: 12.5, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', minWidth: 140 }}>
                        <option value="">All users</option>
                        {users.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {(search || filterAction || filterUser) && (
                        <button onClick={() => { setSearch(''); setFilterAction(''); setFilterUser(''); }}
                            style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b' }}>
                            ✕ Clear
                        </button>
                    )}
                </div>
            )}

            {/* Empty state */}
            {rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10, color: '#94a3b8' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>No history yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Changes to this job will appear here as they happen.</div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                {['When', 'Action', 'Section', 'From → To', 'Reason / Remarks', 'By'].map(h => (
                                    <th key={h} style={{
                                        padding: '8px 12px', textAlign: 'left',
                                        fontSize: 11, fontWeight: 700, color: '#64748b',
                                        textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => {
                                const cfg = AUDIT_ACTION_CONFIG[r.action] || { label: r.action, icon: '•', color: '#64748b' };
                                const { value: newV, reason } = splitNewValue(r.action, r.newValue);
                                return (
                                    <tr key={r.auditId ?? i}
                                        style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f8fafc'}>
                                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#334155', fontFamily: 'monospace', fontSize: 11.5 }}>
                                            {fmtDateTime(r.createdDate)}
                                        </td>
                                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                                                color: cfg.color, background: cfg.color + '14',
                                                border: `1px solid ${cfg.color}44`,
                                                borderRadius: 6, padding: '2px 8px', fontWeight: 600, fontSize: 11.5 }}>
                                                <span>{cfg.icon}</span>{cfg.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{r.section || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: '#334155' }}>
                                            {(r.oldValue || newV) ? (
                                                <span>
                                                    {r.oldValue && <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{r.oldValue}</span>}
                                                    {r.oldValue && newV && <span style={{ color: '#94a3b8', margin: '0 6px' }}>→</span>}
                                                    {newV && <span style={{ fontWeight: 600 }}>{newV}</span>}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#334155', maxWidth: 320 }}>
                                            {reason ? (
                                                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 7px', fontSize: 11.5 }}>
                                                    {reason}
                                                </span>
                                            ) : (r.remarks || <span style={{ color: '#cbd5e1' }}>—</span>)}
                                        </td>
                                        <td style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                            {r.createdBy || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No entries match the filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default HistoryTab;

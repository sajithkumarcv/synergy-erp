import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { fmtDate } from '../../procurementConstants';

const actionColor = (action) => {
    if (!action) return '#64748b';
    if (['Approved', 'Auto-approved'].some(x => action.startsWith(x))) return '#16a34a';
    if (action === 'Rejected')      return '#dc2626';
    if (action === 'Submitted')     return '#1e40af';
    if (action === 'Revised to Draft') return '#b45309';
    if (action === 'Cancelled')     return '#6b7280';
    return '#64748b';
};

const actionBg = (action) => {
    if (!action) return '#f1f5f9';
    if (['Approved', 'Auto-approved'].some(x => action.startsWith(x))) return '#dcfce7';
    if (action === 'Rejected')      return '#fee2e2';
    if (action === 'Submitted')     return '#dbeafe';
    if (action === 'Revised to Draft') return '#fef3c7';
    if (action === 'Cancelled')     return '#f3f4f6';
    return '#f1f5f9';
};

const PrHistoryTab = ({ pr }) => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}purchaserequest/history/${pr.prId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setEntries(Array.isArray(d) ? d : []))
            .catch(() => setError('Failed to load history.'))
            .finally(() => setLoading(false));
    }, [pr.prId]);

    if (loading) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading history…</div>
    );
    if (error) return (
        <div style={{ padding: 24, color: '#dc2626', fontSize: 13 }}>{error}</div>
    );
    if (entries.length === 0) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>
            No history recorded yet.
        </div>
    );

    return (
        <div style={{ padding: '20px 24px', maxWidth: 720 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {entries.map((e, idx) => {
                    const d = e.actionDate ? new Date(e.actionDate) : null;
                    const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                    const isRevision = e.entryType === 'Revision';
                    const isLast     = idx === entries.length - 1;

                    return (
                        <div key={`${e.entryType}-${e.entryId}`} style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 20, position: 'relative' }}>

                            {/* ── Timeline spine ── */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                                    background: actionColor(e.action),
                                    boxShadow: `0 0 0 3px ${actionBg(e.action)}`,
                                    border: `2px solid ${actionColor(e.action)}`,
                                }} />
                                {!isLast && (
                                    <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
                                )}
                            </div>

                            {/* ── Entry card ── */}
                            <div style={{
                                flex: 1, background: '#fff', border: '1px solid #e2e8f0',
                                borderRadius: 8, padding: '12px 16px',
                                borderLeft: `3px solid ${actionColor(e.action)}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        {/* Action badge */}
                                        <span style={{
                                            background: actionBg(e.action), color: actionColor(e.action),
                                            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                            letterSpacing: '.02em',
                                        }}>
                                            {e.action}
                                        </span>

                                        {/* Type pill */}
                                        {isRevision && (
                                            <span style={{ background: '#fef9c3', color: '#854d0e', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                                                ✏️ Rev {e.revisionNo}
                                            </span>
                                        )}
                                        {!isRevision && e.levelNo > 0 && (
                                            <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: 8, fontSize: 10 }}>
                                                Level {e.levelNo}
                                            </span>
                                        )}
                                        {e.isDelegated && (
                                            <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 8, fontSize: 10 }}>
                                                Delegated
                                            </span>
                                        )}
                                    </div>

                                    {/* Date + time */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>{dateStr}</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeStr}</div>
                                    </div>
                                </div>

                                {/* Actor */}
                                <div style={{ marginTop: 6, fontSize: 12, color: '#1e293b', fontWeight: 500 }}>
                                    {e.actionByName || e.actionBy || '—'}
                                    {e.actionByName && e.actionBy && e.actionByName !== e.actionBy && (
                                        <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>({e.actionBy})</span>
                                    )}
                                </div>

                                {/* Remarks / reason */}
                                {e.remarks && (
                                    <div style={{
                                        marginTop: 8, fontSize: 11.5, color: '#475569',
                                        background: '#f8fafc', borderRadius: 5,
                                        padding: '6px 10px', borderLeft: '2px solid #cbd5e1',
                                        fontStyle: 'italic', whiteSpace: 'pre-wrap',
                                    }}>
                                        {e.remarks}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PrHistoryTab;

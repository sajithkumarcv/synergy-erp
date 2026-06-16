import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { fmtDate } from '../../procurementConstants';

const PoHoldLogTab = ({ po }) => {
    const [log,     setLog]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}purchaseorder/${po.poId}/hold-log`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setLog(Array.isArray(d) ? d : []))
            .catch(() => setError('Failed to load hold history.'))
            .finally(() => setLoading(false));
    }, [po.poId]);

    if (loading) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading hold history…</div>
    );
    if (error) return (
        <div style={{ padding: 24, color: '#dc2626', fontSize: 13 }}>{error}</div>
    );
    if (log.length === 0) return (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>
            No hold history recorded for this PO.
        </div>
    );

    return (
        <div style={{ padding: '20px 24px', maxWidth: 720 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {log.map((e, idx) => {
                    const isHold  = e.Action === 'Hold';
                    const isLast  = idx === log.length - 1;
                    const d       = e.ActionDate ? new Date(e.ActionDate) : null;
                    const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                    const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                    const actor   = e.ActionByName || e.ActionBy || '—';
                    const accentColor = isHold ? '#ea580c' : '#16a34a';
                    const accentBg    = isHold ? '#fff7ed' : '#f0fdf4';
                    const borderColor = isHold ? '#fdba74' : '#86efac';

                    return (
                        <div key={e.HoldLogId}
                            style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 20, position: 'relative' }}>

                            {/* ── Timeline spine ── */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                                    background: accentColor,
                                    boxShadow: `0 0 0 3px ${accentBg}`,
                                    border: `2px solid ${accentColor}`,
                                }} />
                                {!isLast && (
                                    <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
                                )}
                            </div>

                            {/* ── Entry card ── */}
                            <div style={{
                                flex: 1, background: '#fff',
                                border: `1px solid ${borderColor}`,
                                borderLeft: `3px solid ${accentColor}`,
                                borderRadius: 8, padding: '12px 16px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                                    {/* Action badge */}
                                    <span style={{
                                        background: accentBg, color: accentColor,
                                        padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                        letterSpacing: '.02em',
                                    }}>
                                        {isHold ? '🔴 Placed on Hold' : '🟢 Hold Released'}
                                    </span>

                                    {/* Date + time */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>{dateStr}</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{timeStr}</div>
                                    </div>
                                </div>

                                {/* Actor */}
                                <div style={{ marginTop: 6, fontSize: 12, color: '#1e293b', fontWeight: 500 }}>
                                    {isHold ? 'Held by' : 'Released by'}: {actor}
                                    {e.ActionByName && e.ActionBy && e.ActionByName !== e.ActionBy && (
                                        <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>({e.ActionBy})</span>
                                    )}
                                </div>

                                {/* Previous status pill */}
                                {e.PreviousStatus && (
                                    <div style={{ marginTop: 5, fontSize: 11, color: '#64748b' }}>
                                        Previous status:&nbsp;
                                        <span style={{ background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: 8, fontWeight: 600 }}>
                                            {e.PreviousStatus}
                                        </span>
                                    </div>
                                )}

                                {/* Reason */}
                                {e.Reason && (
                                    <div style={{
                                        marginTop: 8, fontSize: 11.5, color: '#475569',
                                        background: '#f8fafc', borderRadius: 5,
                                        padding: '6px 10px', borderLeft: '2px solid #cbd5e1',
                                        fontStyle: 'italic', whiteSpace: 'pre-wrap',
                                    }}>
                                        "{e.Reason}"
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

export default PoHoldLogTab;

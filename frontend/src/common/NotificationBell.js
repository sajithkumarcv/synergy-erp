import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';

const POLL_MS = 30000; // 30 seconds

const PRIORITY_COLOR = { Critical: '#dc2626', High: '#ca8a04', Medium: '#3b82f6', Low: '#94a3b8' };

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDue = (d) => {
    if (!d) return null;
    const due  = new Date(d);
    const now  = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((due - now) / 86400000);
    if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, color: '#dc2626' };
    if (diff === 0) return { label: 'Due today',                  color: '#d97706' };
    if (diff <= 3)  return { label: `Due in ${diff}d`,            color: '#ca8a04' };
    return { label: fmtDate(d), color: '#94a3b8' };
};

const fmt = (n) =>
    n == null ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const RING_CSS = `
@keyframes bellRing {
    0%   { transform: rotate(0deg);   transform-origin: top center; }
    10%  { transform: rotate(16deg);  transform-origin: top center; }
    20%  { transform: rotate(-14deg); transform-origin: top center; }
    30%  { transform: rotate(12deg);  transform-origin: top center; }
    40%  { transform: rotate(-8deg);  transform-origin: top center; }
    50%  { transform: rotate(6deg);   transform-origin: top center; }
    60%  { transform: rotate(-4deg);  transform-origin: top center; }
    70%  { transform: rotate(2deg);   transform-origin: top center; }
    85%  { transform: rotate(-1deg);  transform-origin: top center; }
    100% { transform: rotate(0deg);   transform-origin: top center; }
}
.bell-ringing { animation: bellRing 0.9s ease-in-out; }
`;

const NotificationBell = ({ userId, userName }) => {
    const navigate   = useNavigate();
    const [open,     setOpen]     = useState(false);
    const [data,     setData]     = useState({ totalCount: 0, tasks: [], approvals: [] });
    const [loading,  setLoading]  = useState(false);
    const [ringing,  setRinging]  = useState(false);
    const wrapRef  = useRef(null);
    const timerRef = useRef(null);
    const ringRef  = useRef(null);

    const fetch_ = useCallback(() => {
        if (!userId && !userName) return;
        setLoading(true);
        fetch(`${variables.API_URL}notification/my?userId=${userId}&userName=${encodeURIComponent(userName)}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setData(d && typeof d === 'object' ? d : { totalCount: 0, tasks: [], approvals: [] }))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [userId, userName]);

    // Initial load + polling
    useEffect(() => {
        fetch_();
        timerRef.current = setInterval(fetch_, POLL_MS);
        return () => clearInterval(timerRef.current);
    }, [fetch_]);

    // Refresh on window focus
    useEffect(() => {
        const onFocus = () => fetch_();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [fetch_]);

    // Refresh immediately when any task action fires this event
    useEffect(() => {
        const onAction = () => fetch_();
        window.addEventListener('notifications:refresh', onAction);
        return () => window.removeEventListener('notifications:refresh', onAction);
    }, [fetch_]);

    // Ring the bell every hour + once on mount after 2s
    useEffect(() => {
        const ring = () => {
            setRinging(true);
            clearTimeout(ringRef.current);
            ringRef.current = setTimeout(() => setRinging(false), 1000);
        };
        const initialRing = setTimeout(ring, 2000);      // ring once on load
        const id = setInterval(ring, 3600000);            // then every hour
        return () => { clearInterval(id); clearTimeout(ringRef.current); clearTimeout(initialRing); };
    }, []);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const count      = data.totalCount || 0;
    const tasks      = data.tasks      || [];
    const approvals  = data.approvals  || [];

    const goTask     = () => { setOpen(false); navigate('/job-mom'); };
    const goApproval = () => { setOpen(false); navigate('/my-approvals'); };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <style>{RING_CSS}</style>
            {/* ── Bell button ───────────────────────────────── */}
            <button
                onClick={() => { setOpen(o => !o); if (!open) fetch_(); }}
                style={{
                    position: 'relative', border: 'none',
                    cursor: 'pointer', padding: '6px 8px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', transition: 'background .15s',
                    background: count > 0 ? 'rgba(251,191,36,.18)' : 'none',
                    color: count > 0 ? '#fbbf24' : 'var(--header-text, #fff)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = count > 0 ? 'rgba(251,191,36,.28)' : 'rgba(255,255,255,.12)'}
                onMouseLeave={e => e.currentTarget.style.background = count > 0 ? 'rgba(251,191,36,.18)' : 'none'}
                title={count > 0 ? `${count} notification${count > 1 ? 's' : ''}` : 'Notifications'}
            >
                {/* Bell SVG */}
                <svg width="18" height="18" viewBox="0 0 24 24"
                    className={ringing ? 'bell-ringing' : ''}
                    fill={count > 0 ? 'rgba(251,191,36,.25)' : 'none'}
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>

                {/* Badge */}
                {count > 0 && (
                    <span style={{
                        position: 'absolute', top: 2, right: 2,
                        background: '#ef4444', color: '#fff',
                        fontSize: 10, fontWeight: 800, lineHeight: 1,
                        minWidth: 16, height: 16, borderRadius: 99,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', border: '2px solid var(--header-bg, #1e293b)',
                    }}>
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {/* ── Dropdown ──────────────────────────────────── */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: 360, background: '#fff', borderRadius: 12,
                    boxShadow: '0 8px 32px rgba(0,0,0,.18)',
                    border: '1px solid #e2e8f0', zIndex: 9999,
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                            Notifications
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {loading && (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Refreshing…</span>
                            )}
                            {count > 0 && (
                                <span style={{
                                    background: '#fee2e2', color: '#991b1b',
                                    fontSize: 11, fontWeight: 700, borderRadius: 99,
                                    padding: '2px 8px',
                                }}>
                                    {count} pending
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ maxHeight: 460, overflowY: 'auto' }}>

                        {count === 0 && !loading && (
                            <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
                                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                                <div style={{ fontSize: 13 }}>All caught up!</div>
                            </div>
                        )}

                        {/* ── MOM Tasks ─────────────────────── */}
                        {tasks.length > 0 && (
                            <div>
                                <div style={{
                                    padding: '8px 16px', fontSize: 10, fontWeight: 700,
                                    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px',
                                    background: '#fafbfc', borderBottom: '1px solid #f1f5f9',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span>Action Items</span>
                                    <span style={{
                                        background: '#dbeafe', color: '#1e40af',
                                        borderRadius: 99, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                                    }}>{tasks.length}</span>
                                </div>
                                {tasks.map(t => {
                                    const due = fmtDue(t.dueDate);
                                    const priColor = PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.Medium;
                                    return (
                                        <div key={t.momTaskId}
                                            onClick={goTask}
                                            style={{
                                                padding: '10px 16px', cursor: 'pointer',
                                                borderBottom: '1px solid #f8fafc',
                                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        >
                                            {/* Priority dot */}
                                            <span style={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: priColor, flexShrink: 0, marginTop: 5,
                                            }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 13, color: '#1e293b', fontWeight: 500,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {t.description}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                    <span style={{
                                                        background: '#eff6ff', color: '#1d4ed8',
                                                        borderRadius: 4, padding: '1px 5px',
                                                        fontFamily: 'monospace', fontWeight: 700, marginRight: 6,
                                                    }}>
                                                        {t.jobId}
                                                    </span>
                                                    {due && (
                                                        <span style={{ color: due.color, fontWeight: 600 }}>
                                                            {due.label}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: 10, fontWeight: 700, flexShrink: 0,
                                                color: priColor, textTransform: 'uppercase',
                                            }}>
                                                {t.priority}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Pending Approvals ──────────────── */}
                        {approvals.length > 0 && (
                            <div>
                                <div style={{
                                    padding: '8px 16px', fontSize: 10, fontWeight: 700,
                                    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px',
                                    background: '#fafbfc', borderBottom: '1px solid #f1f5f9',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span>Pending Approvals</span>
                                    <span style={{
                                        background: '#fef9c3', color: '#854d0e',
                                        borderRadius: 99, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                                    }}>{approvals.length}</span>
                                </div>
                                {approvals.map(a => (
                                    <div key={a.transactionId}
                                        onClick={goApproval}
                                        style={{
                                            padding: '10px 16px', cursor: 'pointer',
                                            borderBottom: '1px solid #f8fafc',
                                            display: 'flex', gap: 10, alignItems: 'flex-start',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                    >
                                        <span style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: '#f59e0b', flexShrink: 0, marginTop: 5,
                                        }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 13, color: '#1e293b', fontWeight: 500,
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                                {a.documentNo}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                <span style={{ marginRight: 6 }}>{a.moduleName}</span>
                                                {a.documentAmount != null && (
                                                    <span style={{ fontWeight: 600, color: '#64748b' }}>
                                                        {fmt(a.documentAmount)}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                                                {a.levelName} · submitted by {a.submittedBy}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {count > 0 && (
                        <div style={{
                            padding: '10px 16px', borderTop: '1px solid #f1f5f9',
                            display: 'flex', gap: 8,
                        }}>
                            {tasks.length > 0 && (
                                <button onClick={goTask} style={{
                                    flex: 1, background: '#f1f5f9', border: 'none', borderRadius: 7,
                                    padding: '6px 0', fontSize: 12, fontWeight: 600,
                                    color: '#475569', cursor: 'pointer',
                                }}>
                                    View All Tasks
                                </button>
                            )}
                            {approvals.length > 0 && (
                                <button onClick={goApproval} style={{
                                    flex: 1, background: '#fef9c3', border: 'none', borderRadius: 7,
                                    padding: '6px 0', fontSize: 12, fontWeight: 600,
                                    color: '#854d0e', cursor: 'pointer',
                                }}>
                                    View Approvals
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;

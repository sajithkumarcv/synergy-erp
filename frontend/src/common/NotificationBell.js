import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';

const POLL_MS = 10000; // 10 seconds

const PRIORITY_COLOR = { Critical: '#dc2626', High: '#f59e0b', Medium: '#3b82f6', Low: '#94a3b8' };

const MODULE_META = {
    JOB:  { icon: '🏗️', bg: '#dbeafe', color: '#1d4ed8' },
    PO:   { icon: '📦', bg: '#fef9c3', color: '#854d0e' },
    PR:   { icon: '📋', bg: '#f0fdf4', color: '#166534' },
    GRN:  { icon: '📥', bg: '#ede9fe', color: '#6d28d9' },
    INV:  { icon: '💳', bg: '#fff7ed', color: '#c2410c' },
    STR:  { icon: '🔄', bg: '#ecfdf5', color: '#047857' },
    MOM:  { icon: '📌', bg: '#fce7f3', color: '#9d174d' },
    BOM:  { icon: '📐', bg: '#e0f2fe', color: '#0369a1' },
};

const relTime = (d) => {
    if (!d) return '';
    const diff = Math.floor((Date.now() - new Date(d)) / 1000);
    if (diff < 60)  return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

const fmtDue = (d) => {
    if (!d) return null;
    const diff = Math.round((new Date(d) - new Date().setHours(0,0,0,0)) / 86400000);
    if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, color: '#dc2626' };
    if (diff === 0) return { label: 'Due today',                  color: '#d97706' };
    if (diff <= 3)  return { label: `Due in ${diff}d`,            color: '#f59e0b' };
    return null;
};

const ANIM_CSS = `
@keyframes nbSlideIn {
    from { opacity: 0; transform: translateY(-8px) scale(.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);   }
}
@keyframes nbPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.5); }
    50%      { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
}
.nb-panel  { animation: nbSlideIn .18s ease; }
.nb-pulse  { animation: nbPulse 1.4s ease infinite; }
@keyframes bellRing {
    0%,100% { transform: rotate(0); }
    10%  { transform: rotate(14deg); }
    20%  { transform: rotate(-12deg); }
    30%  { transform: rotate(10deg); }
    40%  { transform: rotate(-7deg); }
    50%  { transform: rotate(5deg); }
    60%  { transform: rotate(-3deg); }
    75%  { transform: rotate(2deg); }
}
.nb-bell-ring { animation: bellRing .8s ease; }
`;

// Highlights the referenced document number (e.g. "PR-26-0009") inside a
// task's description text, using the module's own color — so it stands out
// the same way a jobId badge does, without needing the backend to split the
// description into separate fields.
const highlightRef = (description, refDocumentNo, color) => {
    if (!refDocumentNo || !description?.includes(refDocumentNo)) return description;
    const idx = description.indexOf(refDocumentNo);
    return (
        <>
            {description.slice(0, idx)}
            <span style={{ color, fontWeight: 700 }}>{refDocumentNo}</span>
            {description.slice(idx + refDocumentNo.length)}
        </>
    );
};

const Avatar = ({ meta, size = 40 }) => (
    <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: meta?.bg || '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.45,
    }}>
        {meta?.icon || '🔔'}
    </div>
);

const NotificationBell = ({ userId, userName }) => {
    const navigate  = useNavigate();
    const [open,    setOpen]    = useState(false);
    const [data,    setData]    = useState({ totalCount: 0, tasks: [], approvals: [] });
    const [loading, setLoading] = useState(false);
    const [ringing, setRinging] = useState(false);
    const [seenIds, setSeenIds] = useState({ tasks: new Set(), approvals: new Set() });

    const wrapRef  = useRef(null);
    const timerRef = useRef(null);
    const ringRef  = useRef(null);
    const prevCount = useRef(0);

    const fetch_ = useCallback(() => {
        if (!userId && !userName) return;
        setLoading(true);
        fetch(`${variables.API_URL}notification/my?userId=${userId}&userName=${encodeURIComponent(userName)}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const nd = d && typeof d === 'object' ? d : { totalCount: 0, tasks: [], approvals: [] };
                setData(nd);
                // Ring when new notifications arrive
                const newCount = nd.totalCount || 0;
                if (newCount > prevCount.current && prevCount.current !== 0) {
                    setRinging(true);
                    clearTimeout(ringRef.current);
                    ringRef.current = setTimeout(() => setRinging(false), 900);
                }
                prevCount.current = newCount;
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [userId, userName]);

    useEffect(() => {
        fetch_();
        timerRef.current = setInterval(fetch_, POLL_MS);
        return () => clearInterval(timerRef.current);
    }, [fetch_]);

    useEffect(() => {
        const onFocus = () => fetch_();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [fetch_]);

    useEffect(() => {
        const onAction = () => fetch_();
        window.addEventListener('notifications:refresh', onAction);
        return () => window.removeEventListener('notifications:refresh', onAction);
    }, [fetch_]);

    // Initial ring
    useEffect(() => {
        const t = setTimeout(() => {
            setRinging(true);
            ringRef.current = setTimeout(() => setRinging(false), 900);
        }, 1500);
        return () => clearTimeout(t);
    }, []);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);

    // Mark all as seen when panel opens
    const handleOpen = () => {
        const next = !open;
        setOpen(next);
        if (next) {
            fetch_();
            setTimeout(() => {
                setSeenIds({
                    tasks:     new Set((data.tasks     || []).map(t => t.momTaskId)),
                    approvals: new Set((data.approvals || []).map(a => a.transactionId)),
                });
            }, 1500);
        }
    };

    const count     = data.totalCount || 0;
    const tasks     = data.tasks      || [];
    const approvals = data.approvals  || [];

    const isTaskNew     = (t) => !seenIds.tasks.has(t.momTaskId);
    const isApprovalNew = (a) => !seenIds.approvals.has(a.transactionId);

    // Auto-created tasks (e.g. "create PO" on PR approval) carry a
    // refModuleCode/refDocumentId pointing at the actual document — jump
    // straight there. Plain MOM action items have neither, so fall back to
    // the job MOM board as before.
    const goTask = (t) => {
        setOpen(false);
        if (t?.refModuleCode === 'PR' && t.refDocumentId) navigate(`/purchase-requests/${t.refDocumentId}`);
        else navigate('/job-mom');
    };
    const goApproval = () => { setOpen(false); navigate('/my-approvals'); };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <style>{ANIM_CSS}</style>

            {/* ── Bell button ── */}
            <button
                onClick={handleOpen}
                title={count > 0 ? `${count} notification${count !== 1 ? 's' : ''}` : 'Notifications'}
                style={{
                    position: 'relative', border: 'none', cursor: 'pointer',
                    padding: '6px 8px', borderRadius: 8,
                    display: 'flex', alignItems: 'center',
                    background: open ? 'rgba(59,130,246,.18)' : count > 0 ? 'rgba(59,130,246,.12)' : 'none',
                    color: count > 0 ? '#93c5fd' : 'var(--header-text, #fff)',
                    transition: 'background .15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,.12)'; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = count > 0 ? 'rgba(59,130,246,.12)' : 'none'; }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24"
                    className={ringing ? 'nb-bell-ring' : ''}
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>

                {count > 0 && (
                    <span className={count > prevCount.current ? 'nb-pulse' : ''}
                        style={{
                            position: 'absolute', top: 1, right: 1,
                            background: '#ef4444', color: '#fff',
                            fontSize: 10, fontWeight: 800, lineHeight: 1,
                            minWidth: 17, height: 17, borderRadius: 99,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '0 4px',
                            border: '2px solid var(--header-bg, #1e293b)',
                        }}>
                        {count > 99 ? '99+' : count}
                    </span>
                )}
            </button>

            {/* ── Dropdown ── */}
            {open && (
                <div className="nb-panel" style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                    width: 380, background: '#fff', borderRadius: 16,
                    boxShadow: '0 4px 24px rgba(0,0,0,.15), 0 0 0 1px rgba(0,0,0,.06)',
                    zIndex: 9999, overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 18px 10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <span style={{ fontWeight: 700, fontSize: 20, color: '#050505', fontFamily: 'system-ui, sans-serif' }}>
                            Notifications
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {loading && (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>●</span>
                            )}
                            {count > 0 && (
                                <span style={{
                                    background: '#eff6ff', color: '#1d4ed8',
                                    fontSize: 11, fontWeight: 700, borderRadius: 99,
                                    padding: '3px 9px',
                                }}>
                                    {count} new
                                </span>
                            )}
                        </div>
                    </div>

                    <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                        {/* Empty state */}
                        {count === 0 && !loading && (
                            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: '#f0f2f5',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 26, margin: '0 auto 12px',
                                }}>🔔</div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#050505', marginBottom: 4 }}>
                                    You're all caught up
                                </div>
                                <div style={{ fontSize: 13, color: '#65676b' }}>
                                    No new notifications right now.
                                </div>
                            </div>
                        )}

                        {/* ── Action Items (MOM Tasks) ── */}
                        {tasks.length > 0 && (
                            <div>
                                <div style={{
                                    padding: '8px 18px 4px',
                                    fontSize: 13, fontWeight: 700, color: '#65676b',
                                }}>
                                    Action Items
                                </div>
                                {tasks.map(t => {
                                    const due  = fmtDue(t.dueDate);
                                    const pri  = PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.Medium;
                                    const isNew = isTaskNew(t);
                                    const meta  = MODULE_META[t.refModuleCode] || MODULE_META.MOM;
                                    return (
                                        <div key={t.momTaskId}
                                            onClick={() => goTask(t)}
                                            style={{
                                                padding: '8px 18px',
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                cursor: 'pointer',
                                                background: isNew ? '#f0f2ff' : '#fff',
                                                transition: 'background .12s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = isNew ? '#f0f2ff' : '#fff'}
                                        >
                                            {/* Avatar */}
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <Avatar meta={meta} />
                                                <span style={{
                                                    position: 'absolute', bottom: -1, right: -1,
                                                    width: 14, height: 14, borderRadius: '50%',
                                                    background: pri, border: '2px solid #fff',
                                                }} />
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 14, color: '#050505', lineHeight: 1.35,
                                                    fontWeight: isNew ? 600 : 400,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {highlightRef(t.description, t.refDocumentNo, meta.color)}
                                                </div>
                                                <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {t.jobId && (
                                                        <span style={{
                                                            background: '#e0f2fe', color: '#0369a1',
                                                            borderRadius: 4, padding: '1px 5px',
                                                            fontFamily: 'monospace', fontWeight: 600,
                                                        }}>{t.jobId}</span>
                                                    )}
                                                    {due && (
                                                        <span style={{ color: due.color, fontWeight: 600 }}>{due.label}</span>
                                                    )}
                                                    {!due && (
                                                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>{t.priority}</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Unread dot */}
                                            {isNew && (
                                                <span style={{
                                                    width: 10, height: 10, borderRadius: '50%',
                                                    background: '#1877f2', flexShrink: 0,
                                                }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Divider between sections */}
                        {tasks.length > 0 && approvals.length > 0 && (
                            <div style={{ height: 1, background: '#f0f2f5', margin: '4px 0' }} />
                        )}

                        {/* ── Pending Approvals ── */}
                        {approvals.length > 0 && (
                            <div>
                                <div style={{
                                    padding: '8px 18px 4px',
                                    fontSize: 13, fontWeight: 700, color: '#65676b',
                                }}>
                                    Pending Approvals
                                </div>
                                {approvals.map(a => {
                                    const meta  = MODULE_META[a.moduleCode] || MODULE_META.JOB;
                                    const isNew = isApprovalNew(a);
                                    return (
                                        <div key={a.transactionId}
                                            onClick={goApproval}
                                            style={{
                                                padding: '8px 18px',
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                cursor: 'pointer',
                                                background: isNew ? '#fff8f0' : '#fff',
                                                transition: 'background .12s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = isNew ? '#fff8f0' : '#fff'}
                                        >
                                            {/* Avatar */}
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <Avatar meta={meta} />
                                                <span style={{
                                                    position: 'absolute', bottom: -1, right: -1,
                                                    width: 14, height: 14, borderRadius: '50%',
                                                    background: '#f59e0b', border: '2px solid #fff',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 8,
                                                }}>⏳</span>
                                            </div>

                                            {/* Content */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 14, color: '#050505', lineHeight: 1.35,
                                                    fontWeight: isNew ? 600 : 400,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {a.documentNo}
                                                    {a.documentAmount != null && (
                                                        <span style={{ color: '#65676b', fontWeight: 400, fontSize: 13, marginLeft: 6 }}>
                                                            · {Number(a.documentAmount).toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                                                    {a.moduleName} · {a.levelName}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#65676b', marginTop: 1 }}>
                                                    by {a.submittedBy} · {relTime(a.submittedDate)}
                                                </div>
                                            </div>

                                            {/* Unread dot */}
                                            {isNew && (
                                                <span style={{
                                                    width: 10, height: 10, borderRadius: '50%',
                                                    background: '#1877f2', flexShrink: 0,
                                                }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {count > 0 && (
                        <div style={{
                            borderTop: '1px solid #f0f2f5',
                            display: 'flex',
                        }}>
                            {tasks.length > 0 && (
                                <button onClick={goTask} style={{
                                    flex: 1, background: 'none', border: 'none',
                                    padding: '12px 0', fontSize: 13, fontWeight: 600,
                                    color: '#1877f2', cursor: 'pointer', borderRight: approvals.length > 0 ? '1px solid #f0f2f5' : 'none',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    See all tasks
                                </button>
                            )}
                            {approvals.length > 0 && (
                                <button onClick={goApproval} style={{
                                    flex: 1, background: 'none', border: 'none',
                                    padding: '12px 0', fontSize: 13, fontWeight: 600,
                                    color: '#f59e0b', cursor: 'pointer',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f2f5'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                    See all approvals
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

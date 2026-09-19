import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { variables, authHeaders } from '../Variable';

// ─────────────────────────────────────────────────────────────────────────
// Approval history for one document, as a proper centred modal.
//
// Replaces the small popup that used to hang off the status badge in the PO and
// PR lists: it was ~300px wide, scrolled sideways, and cut off long approver
// names. This one is wide, wraps everything, shows where the document is in the
// approval chain (Level 2 of 3, who it is waiting on, who is next) and the full
// history underneath.
//
// Props: moduleCode ('PO' | 'PR' | ...), documentId, documentNo (optional label),
//        onClose
// Data:  GET approval/status/{moduleCode}/{documentId} -> { transaction, log }
// ─────────────────────────────────────────────────────────────────────────

// "Manager-L1, Manager-L1" (a level saved twice) -> ["Manager-L1"]
const uniqList = (s) => [...new Set(String(s || '').split(',').map(x => x.trim()).filter(Boolean))];

const ACTION = {
    Submitted: { bg: '#dbeafe', color: '#1d4ed8', dot: '#3b82f6' },
    Approved:  { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Rejected:  { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    Returned:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    SentBack:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    Cancelled: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
};
const actionCfg = (a) => {
    if (!a) return ACTION.Cancelled;
    const key = Object.keys(ACTION).find(k => a === k || a.startsWith(k));
    return ACTION[key] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
};

const fmtDT = (v) => {
    if (!v) return { date: '—', time: '' };
    const d = new Date(v);
    return {
        date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
};

const Chip = ({ children, bg = '#fef3c7', color = '#92400e' }) => (
    <span style={{ display: 'inline-block', background: bg, color, borderRadius: 999, padding: '3px 12px', fontSize: 13, fontWeight: 600, margin: '3px 6px 3px 0' }}>
        {children}
    </span>
);

// One numbered step per approval level: done / current / upcoming.
const Steps = ({ current, total, outcome }) => {
    const steps = Array.from({ length: total }, (_, i) => i + 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px 0', margin: '14px 0 4px' }}>
            {steps.map((n, i) => {
                let state = 'todo';
                if (outcome === 'Approved') state = 'done';
                else if (n < current) state = 'done';
                else if (n === current) state = outcome === 'Rejected' ? 'rejected' : (outcome ? 'todo' : 'current');
                const c = {
                    done:     { bg: '#22c55e', fg: '#fff', ring: 'transparent', label: '#166534' },
                    current:  { bg: '#f59e0b', fg: '#fff', ring: 'rgba(245,158,11,.28)', label: '#92400e' },
                    rejected: { bg: '#ef4444', fg: '#fff', ring: 'rgba(239,68,68,.25)', label: '#991b1b' },
                    todo:     { bg: '#e2e8f0', fg: '#64748b', ring: 'transparent', label: '#64748b' },
                }[state];
                return (
                    <React.Fragment key={n}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 76 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, boxShadow: `0 0 0 5px ${c.ring}` }}>
                                {state === 'done' ? '✓' : state === 'rejected' ? '✕' : n}
                            </div>
                            <div style={{ marginTop: 7, fontSize: 13, fontWeight: state === 'current' ? 700 : 500, color: c.label }}>Level {n}</div>
                        </div>
                        {i < steps.length - 1 && (
                            <div style={{ flex: '1 1 24px', minWidth: 24, height: 3, marginTop: 15, background: n < current || outcome === 'Approved' ? '#22c55e' : '#e2e8f0', borderRadius: 2 }} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// The modal itself, driven purely by data (so it can also be rendered on its own).
export const ApprovalHistoryView = ({ data, loading, documentNo, onClose }) => {
    const tx   = data?.transaction || null;
    const logs = [...(data?.log || [])].sort((a, b) => new Date(b.actionDate) - new Date(a.actionDate));
    const pending = !!tx && !tx.finalAction && tx.currentStatus === 'Pending';
    const outcome = tx?.finalAction || null;                 // Approved | Rejected | Cancelled | SentBack | null
    const total   = tx?.totalLevels || 0;
    const levelNames    = uniqList(tx?.levelName);
    const approverNames = uniqList(tx?.approverName);
    const pendingUsers  = uniqList(tx?.approverUsers);
    const nextLevel     = uniqList(tx?.nextLevelName);
    const nextApprover  = uniqList(tx?.nextApproverName);
    const nextUsers     = uniqList(tx?.nextApproverUsers);

    const statusPill = pending
        ? { bg: '#fef3c7', color: '#92400e', text: 'Pending approval' }
        : outcome === 'Approved' ? { bg: '#dcfce7', color: '#166534', text: 'Approved' }
        : outcome === 'Rejected' ? { bg: '#fee2e2', color: '#991b1b', text: 'Rejected' }
        : { bg: '#f1f5f9', color: '#475569', text: outcome || tx?.currentStatus || '—' };

    return (
        // React events bubble through a portal to the React parents (the list row), so a
        // click inside the modal must not reach the row's own click handler.
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
             onClick={(e) => e.stopPropagation()}
             style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div role="dialog" aria-modal="true" aria-label="Approval history"
                 style={{ width: '100%', maxWidth: 780, maxHeight: 'calc(100vh - 48px)', background: '#fff', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ background: '#1e3a5f', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>Approval History</div>
                        <div style={{ fontSize: 13, opacity: .8, marginTop: 2, overflowWrap: 'anywhere' }}>
                            {[documentNo || tx?.documentNo, tx?.policyName].filter(Boolean).join('  ·  ')}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close"
                            style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px 24px', overflowY: 'auto', overflowX: 'hidden', fontSize: 14, color: '#1e293b', lineHeight: 1.5 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: 48, fontSize: 15 }}>Loading…</div>
                    ) : !tx && logs.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 48, fontSize: 15, fontStyle: 'italic' }}>No approval activity yet.</div>
                    ) : (
                        <>
                            {tx && (
                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: 15, fontWeight: 700 }}>
                                            {total > 0 ? `Level ${tx.currentLevelNo} of ${total}` : 'Approval'}
                                            {tx.policyName && <span style={{ fontWeight: 500, color: '#64748b' }}>  ·  {tx.policyName}</span>}
                                        </div>
                                        <span style={{ background: statusPill.bg, color: statusPill.color, borderRadius: 999, padding: '4px 14px', fontSize: 13, fontWeight: 700 }}>{statusPill.text}</span>
                                    </div>
                                    {total > 0 && <Steps current={tx.currentLevelNo} total={total} outcome={outcome} />}
                                    {tx.submittedBy && (
                                        <div style={{ marginTop: 10, fontSize: 13, color: '#64748b' }}>
                                            Submitted by <strong style={{ color: '#334155' }}>{tx.submittedBy}</strong>
                                            {tx.submittedDate && <> on {fmtDT(tx.submittedDate).date}</>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Who it is waiting on */}
                            {pending && (
                                <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 20px' }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e' }}>⏳ Awaiting approval — Level {tx.currentLevelNo} of {total}</div>
                                    {(levelNames.length > 0 || approverNames.length > 0) && (
                                        <div style={{ marginTop: 6, fontSize: 14, color: '#78350f', overflowWrap: 'anywhere' }}>
                                            {levelNames.join(', ')}
                                            {approverNames.length > 0 && <span style={{ color: '#a16207' }}>{levelNames.length ? '  ·  ' : ''}{approverNames.join(', ')}</span>}
                                        </div>
                                    )}
                                    {pendingUsers.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: '.4px' }}>Pending with</div>
                                            <div style={{ marginTop: 2 }}>{pendingUsers.map(u => <Chip key={u}>{u}</Chip>)}</div>
                                        </div>
                                    )}
                                    {tx.currentLevelNo < total && (nextLevel.length > 0 || nextApprover.length > 0 || nextUsers.length > 0) && (
                                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #fcd34d', fontSize: 13, color: '#78350f', overflowWrap: 'anywhere' }}>
                                            <strong>Next — Level {tx.currentLevelNo + 1}:</strong>{' '}
                                            {[nextLevel.join(', '), nextApprover.join(', ')].filter(Boolean).join('  ·  ')}
                                            {nextUsers.length > 0 && <div style={{ color: '#a16207', marginTop: 2 }}>{nextUsers.join(', ')}</div>}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Final outcome remarks */}
                            {!pending && tx?.finalRemarks && (
                                <div style={{ marginTop: 16, background: '#f1f5f9', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#334155', overflowWrap: 'anywhere' }}>
                                    <strong>{tx.finalActionBy ? `${tx.finalActionBy}: ` : ''}</strong>{tx.finalRemarks}
                                </div>
                            )}

                            {/* History */}
                            {logs.length > 0 && (
                                <>
                                    <div style={{ margin: '22px 0 10px', fontSize: 13, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.5px' }}>History</div>
                                    <div style={{ position: 'relative', paddingLeft: 26 }}>
                                        <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: '#e2e8f0' }} />
                                        {logs.map((log, i) => {
                                            const a = actionCfg(log.action);
                                            const dt = fmtDT(log.actionDate);
                                            return (
                                                <div key={log.logId || i} style={{ position: 'relative', marginBottom: 16 }}>
                                                    <div style={{ position: 'absolute', left: -26, top: 6, width: 14, height: 14, borderRadius: '50%', background: a.dot, border: '3px solid #fff', boxShadow: '0 0 0 1px #e2e8f0' }} />
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '2px 12px' }}>
                                                        <div>
                                                            <span style={{ background: a.bg, color: a.color, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, marginRight: 10 }}>{log.action}</span>
                                                            <strong style={{ fontSize: 14 }}>{log.actionByName || log.actionBy}</strong>
                                                        </div>
                                                        <div style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>{dt.date}{dt.time && `  ·  ${dt.time}`}</div>
                                                    </div>
                                                    {(log.levelNo > 0 || log.isDelegated || log.isTimedOut) && (
                                                        <div style={{ marginTop: 3, fontSize: 13, color: '#64748b', overflowWrap: 'anywhere' }}>
                                                            {log.levelNo > 0 && <>Level {log.levelNo}{log.levelName ? ` — ${uniqList(log.levelName).join(', ')}` : ''}</>}
                                                            {log.isDelegated && <span> · delegated{log.delegatedFromName ? ` from ${log.delegatedFromName}` : ''}</span>}
                                                            {log.isTimedOut && <span> · timed out</span>}
                                                        </div>
                                                    )}
                                                    {log.remarks && (
                                                        <div style={{ marginTop: 6, background: '#f8fafc', borderLeft: '3px solid #cbd5e1', borderRadius: 4, padding: '6px 12px', fontSize: 14, color: '#475569', fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                                                            {log.remarks}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                    <button onClick={onClose}
                            style={{ padding: '8px 26px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const ApprovalHistoryModal = ({ moduleCode, documentId, documentNo, onClose }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        setLoading(true);
        fetch(`${variables.API_URL}approval/status/${moduleCode}/${documentId}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (live) setData(d); })
            .catch(() => { if (live) setData(null); })
            .finally(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [moduleCode, documentId]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return createPortal(
        <ApprovalHistoryView data={data} loading={loading} documentNo={documentNo} onClose={onClose} />,
        document.body
    );
};

export default ApprovalHistoryModal;

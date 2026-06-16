import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser, useCurrentUserId } from '../AuthContext';
import ApprovalActionModal from './ApprovalActionModal';
import '../procurement/Procurement.css';
import AlertModal from '../common/AlertModal';

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtDateTime = d => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

const fmt = v => (v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const ACTION_COLOR = {
    Submitted: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    Approve:   { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Approved:  { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Reject:    { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    Rejected:  { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    SendBack:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    SentBack:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    Returned:  { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    Cancel:    { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Cancelled: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
};

const ActionBadge = ({ action }) => {
    const c = ACTION_COLOR[action] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: c.bg, color: c.color,
            border: `1px solid ${c.dot}40`,
            borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
            {action}
        </span>
    );
};

// ─────────────────────────────────────────────────────────────────────────
// Props:
//   moduleCode   – e.g. 'INV'
//   documentId   – numeric ID
//   documentNo   – e.g. 'INV-00042' (for submit)
//   documentAmount
//   currencyId
//   onStatusChange(newStatus) – called after submit or approval action
// `linesCount` (optional) — parent detail page passes the current line count
//   from its own state. If supplied and zero, submit is blocked with an alert.
//   If undefined, the pre-check is skipped and backend validation is relied on.
// `lineLabel` (optional) — friendly noun used in the alert (e.g. "line items",
//   "expense entries", "timesheet rows"). Defaults to "line items".
const ApprovalHistoryTab = ({
    moduleCode, documentId, documentNo, documentAmount, currencyId,
    onStatusChange, onTransactionLoad,
    linesCount, lineLabel,
}) => {
    const currentUser = useCurrentUser();
    const userId      = useCurrentUserId();

    const [data,        setData]        = useState(null);   // { transaction, log }
    const [loading,     setLoading]     = useState(false);
    const [submitting,  setSubmitting]  = useState(false);
    const [showAction,  setShowAction]  = useState(false);
    const [error,       setError]       = useState('');
    const [success,     setSuccess]     = useState('');
    const [budgetBlock, setBudgetBlock] = useState(null);   // budget-overrun message → opens override modal
    const [alertMsg, setAlertMsg] = useState(null);
    const [ovPassword,  setOvPassword]  = useState('');
    const [ovReason,    setOvReason]    = useState('');
    const [ovErr,       setOvErr]       = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        fetch(
            `${variables.API_URL}approval/status/${moduleCode}/${documentId}?userId=${userId}`,
            { headers: authHeaders() }
        )
            .then(r => {
                if (!r.ok) throw new Error(`Server error ${r.status}`);
                return r.json();
            })
            .then(d => {
                setData(d);
                if (onTransactionLoad) onTransactionLoad(d?.transaction || null);
            })
            .catch(e => {
                console.error('[ApprovalHistoryTab]', e);
                setError(e.message || 'Failed to load approval status.');
            })
            .finally(() => setLoading(false));
    }, [moduleCode, documentId, userId, onTransactionLoad]);

    useEffect(() => { load(); }, [load]);

    const isBudgetBlock = (msg) => !!msg && /budget/i.test(msg) && /(exceed|over\s*by)/i.test(msg);

    const submitForApproval = async (override = null) => {
        setError('');

        // ── BLOCKING pre-check: require at least one line item ────────────
        // Parent passes `linesCount` from its own state — single source of
        // truth, no URL guessing per module. If the prop is undefined we
        // skip (some documents legitimately have no lines), and rely on the
        // backend's own validation as the ultimate authority.
        if (typeof linesCount === 'number' && linesCount === 0) {
            const label = lineLabel || 'line items';
            setAlertMsg(
                `Cannot submit for approval.\n\n` +
                `No ${label} have been added yet.\n\n` +
                `Please add at least one ${label.replace(/s$/, '')} and try again.`
            );
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(`${variables.API_URL}approval/submit`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    moduleCode,
                    documentId,
                    documentNo,
                    documentAmount,
                    currencyId,
                    submittedBy: currentUser,
                    budgetPassword: override?.budgetPassword || null,
                    overrideReason: override?.overrideReason || null,
                }),
            });
            const d = await res.json();
            if (!res.ok) {
                const msg = d.message || 'Submit failed.';
                // First budget block (no override yet): open the override modal
                if (!override && isBudgetBlock(msg)) {
                    setBudgetBlock(msg); setOvPassword(''); setOvReason(''); setOvErr('');
                } else {
                    setError(msg);
                }
                return;
            }
            setBudgetBlock(null);
            setSuccess('Submitted for approval successfully.' + (override ? ' (budget override)' : ''));
            load();
            if (onStatusChange) onStatusChange(d.newStatus);
        } catch {
            setError('Network error.');
        } finally {
            setSubmitting(false);
        }
    };

    const confirmOverride = () => {
        if (!ovPassword.trim()) { setOvErr('Budget password is required.'); return; }
        if (!ovReason.trim())   { setOvErr('A reason is required.'); return; }
        submitForApproval({ budgetPassword: ovPassword, overrideReason: ovReason.trim() });
    };

    const handleActionDone = (result) => {
        setShowAction(false);
        setSuccess(`Action processed: ${result.newStatus}`);
        load();
        if (onStatusChange) onStatusChange(result.newStatus);
    };

    const tx  = data?.transaction;
    const log = data?.log || [];

    // Server computes canAct (role-matched) and canCancel (submitter or role-matched).
    // isPending guards both — transaction must be active for any action.
    const isPending   = tx?.currentStatus === 'Pending';
    const canResubmit = tx && ['Cancelled', 'Rejected', 'SentBack'].includes(tx.currentStatus);
    const canAct      = isPending && tx?.canAct    === true;
    const canCancel   = isPending && tx?.canCancel === true;

    return (
        <div className="jd-tab-body">
            {error   && (
                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span>⚠ {error}</span>
                    <button onClick={load} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', cursor: 'pointer', flexShrink: 0 }}>
                        Retry
                    </button>
                </div>
            )}
            {success && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>✓ {success}</div>}

            {loading && <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>}

            {/* ── No transaction yet: Show Submit button ── */}
            {!loading && !tx && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '32px 0' }}>
                    <div style={{ fontSize: 32 }}>📋</div>
                    <div style={{ fontSize: 14, color: '#475569' }}>This document has not been submitted for approval.</div>
                    <button className="po-btn-pri" style={{ fontSize: 13, padding: '8px 20px' }}
                            onClick={() => submitForApproval()} disabled={submitting}>
                        {submitting ? 'Submitting…' : '⬆ Submit for Approval'}
                    </button>
                </div>
            )}

            {/* ── Active/completed transaction ── */}
            {!loading && tx && (
                <>
                    {/* Transaction summary card */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>
                                    Approval Status
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <ActionBadge action={tx.currentStatus === 'Pending' ? 'Submitted' : tx.finalAction || tx.currentStatus} />
                                    {isPending && (
                                        <span style={{ fontSize: 12, color: '#92400e' }}>
                                            Level {tx.currentLevelNo} of {tx.totalLevels}
                                            {tx.levelName && ` — ${tx.levelName}`}
                                            {tx.approverName && ` (${tx.approverName})`}
                                        </span>
                                    )}
                                    {tx.completedDate && (
                                        <span style={{ fontSize: 11.5, color: '#64748b' }}>
                                            Completed {fmtDateTime(tx.completedDate)}
                                        </span>
                                    )}
                                </div>

                                {/* Current approver users */}
                                {isPending && tx.approverName && (
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>Pending with:</span>
                                        {(tx.approverUsers || tx.approverName).split(', ').map(name => (
                                            <span key={name} style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Next approver */}
                                {isPending && tx.nextLevelName && (
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, color: '#64748b' }}>Up next — Level {tx.nextLevelNo} · {tx.nextLevelName}:</span>
                                        {(tx.nextApproverUsers || tx.nextApproverName || '').split(', ').filter(Boolean).map(name => (
                                            <span key={name} style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 12, padding: '1px 8px', fontWeight: 600 }}>
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {tx.documentAmount != null && (
                                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>
                                        Policy: <strong>{tx.policyName}</strong>
                                        &nbsp;·&nbsp;Amount: <strong>{fmt(tx.documentAmount)}</strong>
                                    </div>
                                )}
                            </div>

                            {/* Action buttons — role-gated by server-computed flags */}
                            <div style={{ display: 'flex', gap: 6 }}>
                                {canAct && (
                                    <button className="jd-stage-btn"
                                            onClick={() => setShowAction(true)}
                                            style={{ background: '#f0fdf4', color: '#166534', borderColor: '#86efac' }}>
                                        ✔ Take Action
                                    </button>
                                )}
                                {canCancel && !canAct && (
                                    <button className="jd-stage-btn"
                                            onClick={() => setShowAction(true)}
                                            style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}>
                                        ✖ Cancel Submission
                                    </button>
                                )}
                                {canResubmit && (
                                    <button className="jd-stage-btn"
                                            onClick={() => submitForApproval()}
                                            disabled={submitting}
                                            style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' }}>
                                        {submitting ? 'Submitting…' : '⬆ Re-submit for Approval'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {tx.finalRemarks && (
                            <div style={{ marginTop: 10, fontSize: 12, color: '#475569', fontStyle: 'italic' }}>
                                "{tx.finalRemarks}"
                            </div>
                        )}
                    </div>

                    {/* Audit log timeline */}
                    {log.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
                                Approval Trail
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                {log.map((entry, i) => {
                                    const c = ACTION_COLOR[entry.action] || ACTION_COLOR.Cancel;
                                    const isLast = i === log.length - 1;
                                    return (
                                        <div key={entry.logId} style={{ display: 'flex', gap: 14 }}>
                                            {/* Timeline spine */}
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.dot, border: '2px solid #fff', boxShadow: `0 0 0 2px ${c.dot}40`, marginTop: 4, flexShrink: 0 }} />
                                                {!isLast && <div style={{ flex: 1, width: 2, background: '#e2e8f0', marginTop: 2 }} />}
                                            </div>
                                            {/* Entry content */}
                                            <div style={{ paddingBottom: isLast ? 0 : 16, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <ActionBadge action={entry.action} />
                                                    {entry.levelNo > 0 && (
                                                        <span style={{ fontSize: 11, color: '#64748b' }}>
                                                            Level {entry.levelNo}{entry.levelName ? ` — ${entry.levelName}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                                                    <strong>{entry.actionByName || 'System'}</strong>
                                                    &nbsp;·&nbsp;{fmtDateTime(entry.actionDate)}
                                                    {entry.isDelegated && entry.delegatedFromName && (
                                                        <span style={{ color: '#f59e0b', marginLeft: 6 }}>
                                                            (on behalf of {entry.delegatedFromName})
                                                        </span>
                                                    )}
                                                </div>
                                                {entry.remarks && (
                                                    <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>
                                                        "{entry.remarks}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Action modal — actions differ for full approvers vs. submitters */}
            {showAction && tx && (
                <ApprovalActionModal
                    transactionId={tx.transactionId}
                    allowedActions={canAct
                        ? ['Approve', 'Reject', 'SendBack', 'Cancel']
                        : ['Cancel']}
                    documentLabel={documentNo}
                    onDone={handleActionDone}
                    onClose={() => setShowAction(false)}
                />
            )}

            {/* Budget-override modal — authorise submitting/auto-approving past budget */}
            {budgetBlock && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                    onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !submitting) setBudgetBlock(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '2px solid #fcd34d' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>⚠ Budget Exceeded — Authorise Override</div>
                        <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 }}>
                            {budgetBlock}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14, lineHeight: 1.55 }}>
                            Submitting will exceed the budget. Enter your <strong>budget password</strong> to authorise and record the override (logged with your reason).
                        </div>
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Budget Password <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input type="password" value={ovPassword} autoFocus disabled={submitting}
                                onChange={e => { setOvPassword(e.target.value); setOvErr(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') confirmOverride(); }}
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea rows={2} value={ovReason} disabled={submitting}
                                onChange={e => { setOvReason(e.target.value); setOvErr(''); }}
                                placeholder="Why is the overrun being authorised?"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                        </div>
                        {ovErr && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>⚠ {ovErr}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => setBudgetBlock(null)} disabled={submitting}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={confirmOverride} disabled={submitting}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: submitting ? .7 : 1 }}>
                                {submitting ? 'Authorising…' : '⚠ Authorise & Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default ApprovalHistoryTab;

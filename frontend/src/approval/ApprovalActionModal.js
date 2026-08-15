import React, { useState } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser, useCurrentUserId } from '../AuthContext';
import '../procurement/Procurement.css';

// ── Helpers ───────────────────────────────────────────────────────────────
const ACTION_META = {
    Approve:  { label: 'Approve',   cls: 'pf-btn-approve',  icon: '✔',  requiresRemarks: false },
    Reject:   { label: 'Reject',    cls: 'pf-btn-reject',   icon: '✖',  requiresRemarks: true  },
    SendBack: { label: 'Send Back', cls: 'pf-btn-sendback', icon: '↩',  requiresRemarks: true  },
    Cancel:   { label: 'Cancel',    cls: 'pf-btn-reject',   icon: '⊘',  requiresRemarks: false },
};

const isBudgetBlock = msg => /budget/i.test(msg) && /(exceed|over\s*by)/i.test(msg);

// ─────────────────────────────────────────────────────────────────────────
// Props:
//   transactionId  – approval transaction ID
//   allowedActions – array of action strings e.g. ['Approve','Reject','SendBack']
//   documentLabel  – e.g. "INV-00042"
//   onDone(result) – called with { newStatus, isComplete, message } on success
//   onClose        – dismiss without acting
const ApprovalActionModal = ({ transactionId, allowedActions = ['Approve','Reject','SendBack'], documentLabel, onDone, onClose }) => {
    const currentUser = useCurrentUser();
    const userId      = useCurrentUserId();
    const [action,        setAction]      = useState('');
    const [remarks,       setRemarks]     = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [saving,        setSaving]      = useState(false);
    const [error,         setError]       = useState('');
    const [budgetBlock,   setBudgetBlock] = useState('');   // message when server blocks for budget
    const [ovReason,      setOvReason]    = useState('');
    const [ovErr,         setOvErr]       = useState('');

    const meta = action ? ACTION_META[action] : null;

    // Verb shown on the busy overlay while the request is in flight — this can
    // take a few seconds (password check + workflow update), and without a
    // clear "still working" indicator a user watching a frozen-looking modal
    // assumes something has silently failed rather than just being slow.
    const BUSY_VERB = {
        Approve:  'Approving',
        Reject:   'Rejecting',
        SendBack: 'Sending back',
        Cancel:   'Cancelling',
    };

    const submit = async (overrideReason = null) => {
        if (!action) { setError('Please select an action.'); return; }
        if (meta?.requiresRemarks && !remarks.trim()) {
            setError('Remarks are required for this action.');
            return;
        }
        if (action === 'Approve' && !loginPassword.trim()) {
            setError('Your login password is required to approve.');
            return;
        }
        setError(''); setSaving(true);
        try {
            const body = {
                transactionId,
                action,
                actionBy:      userId,
                actionByName:  currentUser,
                remarks:       remarks.trim() || null,
                loginPassword: action === 'Approve' ? loginPassword.trim() : null,
            };
            if (overrideReason)  body.overrideReason  = overrideReason;

            const res = await fetch(`${variables.API_URL}approval/action`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
            const d = await res.json();
            if (!res.ok) {
                const msg = d.message || 'Action failed.';
                if (isBudgetBlock(msg)) {
                    setBudgetBlock(msg);
                } else {
                    setError(msg);
                }
                return;
            }
            onDone(d);
        } catch {
            setError('Network error.');
        } finally {
            setSaving(false);
        }
    };

    // No budget password (removed 2026-08-15) — the typed reason is the override
    // signal and is folded into the approval-log remarks server-side.
    const submitOverride = async () => {
        if (!ovReason.trim()) { setOvErr('Override reason is required.'); return; }
        setOvErr('');
        setBudgetBlock('');
        await submit(ovReason.trim());
    };

    // ── Budget-override modal ─────────────────────────────────────────────
    if (budgetBlock) {
        return (
            <div className="pf-overlay">
                <div className="pf-panel" style={{ maxWidth: 440 }}>
                    <div className="pf-header">
                        <div className="pf-header-title">Budget Override Required</div>
                        {documentLabel && <div className="pf-header-sub">{documentLabel}</div>}
                        <button className="pf-close" onClick={onClose}>✕</button>
                    </div>
                    <div className="pf-body">
                        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                            ⚠ {budgetBlock}
                        </div>
                        {ovErr && <div className="pf-err" style={{ marginBottom: 12 }}>{ovErr}</div>}
                        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14, lineHeight: 1.55 }}>
                            Approving this will exceed the budget. Confirm below to proceed — your reason is recorded against the approval log.
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                            Override Reason <span style={{ color: '#dc2626' }}>*</span>
                        </div>
                        <textarea
                            className="pf-input pf-textarea"
                            rows={3}
                            autoFocus
                            placeholder="Explain why this approval should proceed over budget…"
                            value={ovReason}
                            onChange={e => setOvReason(e.target.value)}
                        />
                    </div>
                    <div className="pf-footer">
                        <button className="pf-btn-sec" onClick={() => setBudgetBlock('')} disabled={saving}>Back</button>
                        <button
                            className="pf-btn-pri"
                            onClick={submitOverride}
                            disabled={saving}
                            style={{ background: '#92400e', borderColor: '#fde68a' }}>
                            {saving ? 'Processing…' : '⚠ Approve with Override'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 460, position: 'relative' }}>
                {saving && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        background: 'rgba(255,255,255,.94)', borderRadius: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div className="pr-spinner">
                            <div className="pr-spinner-ring" />
                            <div className="pr-spinner-text">{BUSY_VERB[action] || 'Processing'}… please wait</div>
                        </div>
                    </div>
                )}
                <div className="pf-header">
                    <div className="pf-header-title">Approval Action</div>
                    {documentLabel && <div className="pf-header-sub">{documentLabel}</div>}
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err" style={{ marginBottom: 14, whiteSpace: 'pre-line' }}>{error}</div>}

                    {/* Action buttons */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                        Select Action
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                        {allowedActions.map(a => {
                            const m = ACTION_META[a];
                            if (!m) return null;
                            const isSelected = action === a;
                            return (
                                <button
                                    key={a}
                                    onClick={() => { setAction(a); setError(''); }}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, fontSize: 13,
                                        fontWeight: 600, cursor: 'pointer',
                                        border: isSelected ? '2px solid transparent' : '1px solid #e2e8f0',
                                        background: isSelected
                                            ? (a === 'Approve' ? '#166534' : a === 'SendBack' ? '#92400e' : '#991b1b')
                                            : '#f8fafc',
                                        color: isSelected ? '#fff' : '#475569',
                                        transition: 'all .15s',
                                    }}>
                                    {m.icon} {m.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Login password — required for Approve */}
                    {action === 'Approve' && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                                Your Login Password <span style={{ color: '#dc2626' }}>*</span>
                            </div>
                            <input
                                type="password" autoComplete="new-password"
                                className="pf-input"
                                placeholder="Enter your login password to confirm…"
                                value={loginPassword}
                                autoFocus
                                onChange={e => { setLoginPassword(e.target.value); setError(''); }}
                                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                            />
                        </div>
                    )}

                    {/* Remarks */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                        Remarks {meta?.requiresRemarks && <span style={{ color: '#dc2626' }}>*</span>}
                    </div>
                    <textarea
                        className="pf-input pf-textarea"
                        rows={3}
                        placeholder={meta?.requiresRemarks ? 'Required — explain the reason…' : 'Optional comments…'}
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                    />
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose} disabled={saving}>Cancel</button>
                    <button
                        className="pf-btn-pri"
                        onClick={() => submit()}
                        disabled={saving || !action}
                        style={action === 'Reject' || action === 'Cancel'
                            ? { background: '#991b1b', borderColor: '#fca5a5' }
                            : action === 'SendBack'
                            ? { background: '#92400e', borderColor: '#fde68a' }
                            : undefined}>
                        {saving ? 'Processing…' : (meta ? `${meta.icon} ${meta.label}` : 'Submit')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ApprovalActionModal;

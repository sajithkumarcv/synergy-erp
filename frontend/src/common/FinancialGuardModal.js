import React, { useState, useRef } from 'react';

/**
 * Reusable guard for financial edits (budget / PO / invoice / expense).
 * Collects the budget password + a reason (min length) before the caller
 * performs the money-changing action.
 *
 * Props:
 *   title, message   — heading + sub-text
 *   busy             — disables inputs while the action runs
 *   error            — error string to show (e.g. "Incorrect budget password.")
 *   minReason        — minimum reason length (default 10)
 *   onCancel()       — close without acting
 *   onConfirm(password, reason) — caller runs the action
 */
const FinancialGuardModal = ({ title, message, busy, error, minReason = 10, onCancel, onConfirm }) => {
    const [pwd, setPwd]       = useState('');
    const [reason, setReason] = useState('');
    const mouseDownBackdrop   = useRef(false);

    const reasonOk = reason.trim().length >= minReason;
    const canSubmit = !busy && pwd && reasonOk;
    const submit = () => { if (canSubmit) onConfirm(pwd, reason.trim()); };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
            onMouseDown={e => { mouseDownBackdrop.current = (e.target === e.currentTarget); }}
            onClick={e => { if (mouseDownBackdrop.current && e.target === e.currentTarget && !busy) onCancel(); }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 430, padding: 22, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>🔐 {title}</div>
                {message && <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>{message}</div>}

                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Reason <span style={{ color: '#dc2626' }}>*</span>
                    <span style={{ fontWeight: 400, color: '#94a3b8' }}> (min {minReason} characters)</span>
                </label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} disabled={busy}
                    placeholder="Why is this financial change being made?"
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, minHeight: 58, resize: 'vertical', boxSizing: 'border-box',
                             border: `1px solid ${reason && !reasonOk ? '#fca5a5' : '#cbd5e1'}`, borderRadius: 6 }} />
                <div style={{ fontSize: 10.5, color: reason && !reasonOk ? '#dc2626' : '#94a3b8', marginTop: 2, textAlign: 'right' }}>
                    {reason.trim().length}/{minReason}
                </div>

                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', margin: '10px 0 4px' }}>
                    Budget password <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input type="password" name="fin-guard-pwd" autoComplete="new-password"
                    value={pwd} onChange={e => setPwd(e.target.value)} disabled={busy}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 6 }} />

                {error && <div style={{ color: '#dc2626', fontSize: 11.5, marginTop: 8 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button onClick={onCancel} disabled={busy}
                        style={{ padding: '6px 14px', fontSize: 12.5, border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={submit} disabled={!canSubmit}
                        style={{ padding: '6px 14px', fontSize: 12.5, border: 0, borderRadius: 6, color: '#fff', fontWeight: 600,
                                 background: canSubmit ? '#0f766e' : '#94a3b8', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                        {busy ? 'Saving…' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FinancialGuardModal;

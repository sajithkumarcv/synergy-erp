import React, { useState } from 'react';
import { variables, authHeaders } from '../../Variable';

/* ─────────────────────────────────────────────────────────────────
   GrnCancelModal
   Password-protected cancellation modal for GRNs.
   - Reason required
   - User's own login password required (verified server-side)
   - Works for both Draft → Cancelled and Received → Cancelled
     (Received cancellation reverses all stock, PO qty, ledger)
   ───────────────────────────────────────────────────────────────── */
const GrnCancelModal = ({ grn, currentUser, onCancelled, onClose }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [showPwd,  setShowPwd]  = useState(false);
    const [busy,     setBusy]     = useState(false);
    const [error,    setError]    = useState('');

    const isReceived = grn.status === 'Received';

    const handleSubmit = async () => {
        setError('');
        if (!reason.trim())    { setError('Please enter a cancellation reason.'); return; }
        if (!password.trim())  { setError('Please enter your password.'); return; }

        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}grn/${grn.grnId}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    cancelledBy: currentUser,
                    reason:      reason.trim(),
                    password,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setError(data?.message || 'Cancellation failed.'); return; }
            onCancelled();
        } catch (e) {
            setError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setBusy(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 460, maxWidth: '100%',
                          boxShadow: '0 8px 40px rgba(0,0,0,.22)', overflow: 'hidden' }}>

                {/* ── Header ── */}
                <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #fee2e2',
                              background: '#fef2f2' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', marginBottom: 3 }}>
                        🚫 Cancel GRN
                    </div>
                    <div style={{ fontSize: 12, color: '#b91c1c' }}>
                        <strong>{grn.grnNumber}</strong>
                        {isReceived && (
                            <span> — This GRN has been <strong>Received</strong>. Cancelling will
                            reverse all stock entries, PO quantities, and the stock ledger.</span>
                        )}
                        {!isReceived && ' — This action cannot be undone.'}
                    </div>
                </div>

                {/* ── Warning for Received GRN ── */}
                {isReceived && (
                    <div style={{ margin: '14px 22px 0', padding: '10px 14px', background: '#fff7ed',
                                  border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412' }}>
                        <strong>⚠ Stock reversal warning:</strong> All items received under this GRN
                        will be deducted from stock balance and a reversal entry (GRN-REV) will be
                        posted to the stock ledger.
                    </div>
                )}

                {/* ── Body ── */}
                <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Reason */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block',
                                        marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Reason for Cancellation <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <textarea
                            rows={3}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Describe why this GRN is being cancelled…"
                            autoFocus
                            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${reason.trim() ? '#d1d5db' : '#fca5a5'}`,
                                     borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                                     fontFamily: 'inherit', outline: 'none' }}
                        />
                    </div>

                    {/* Password */}
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block',
                                        marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Your Password <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPwd ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                placeholder="Enter your login password to confirm…"
                                style={{ width: '100%', padding: '8px 38px 8px 10px', border: `1px solid ${password ? '#d1d5db' : '#fca5a5'}`,
                                         borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
                                         fontFamily: 'inherit', outline: 'none' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd(v => !v)}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                         background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                         fontSize: 15, padding: 0, lineHeight: 1 }}>
                                {showPwd ? '🙈' : '👁'}
                            </button>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Logged in as <strong>{currentUser}</strong> — enter your own login password to authorise.
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
                                      borderRadius: 6, fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                            ⚠ {error}
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{ padding: '12px 22px 16px', borderTop: '1px solid #e2e8f0',
                              display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} disabled={busy}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #d1d5db',
                                 background: '#f8fafc', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Back
                    </button>
                    <button onClick={handleSubmit} disabled={busy || !reason.trim() || !password.trim()}
                        style={{ padding: '7px 20px', borderRadius: 6, border: 'none', fontSize: 13,
                                 fontWeight: 600, fontFamily: 'inherit',
                                 background: (busy || !reason.trim() || !password.trim()) ? '#94a3b8' : '#dc2626',
                                 color: '#fff', cursor: (busy || !reason.trim() || !password.trim()) ? 'not-allowed' : 'pointer',
                                 opacity: busy ? .7 : 1 }}>
                        {busy ? 'Cancelling…' : '🚫 Confirm Cancellation'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GrnCancelModal;

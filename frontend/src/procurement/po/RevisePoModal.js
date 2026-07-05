import React, { useState } from 'react';

const RevisePoModal = ({ po, onClose, onSubmit }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [saving,   setSaving]   = useState(false);
    const [err,      setErr]      = useState('');

    const handleSubmit = async () => {
        setErr('');
        if (!reason.trim()) { setErr('A reason is required.'); return; }
        if (!password)      { setErr('Password is required.'); return; }
        setSaving(true);
        const error = await onSubmit(reason.trim(), password);
        if (error) { setErr(error); setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e293b' }}>Revise Purchase Order</h3>
                <p style={{ margin: '0 0 18px', fontSize: 12, color: '#64748b' }}>
                    {po.poNumber} — this will reset the PO to <strong>Draft</strong> (Rev {(po.revision || 0) + 1}) so lines can be edited and re-submitted for approval.
                </p>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Reason <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <textarea
                        rows={3}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Enter reason for revision…"
                        autoFocus
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Your password <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <input
                        type="password" autoComplete="new-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your login password to confirm"
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                    />
                </div>

                {err && (
                    <div style={{ marginBottom: 14, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>
                        {err}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#b45309', color: '#fff', fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Processing…' : 'Revise PO'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RevisePoModal;

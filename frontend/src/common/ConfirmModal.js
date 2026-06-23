import React from 'react';
import ReactDOM from 'react-dom';

// Shared confirm dialog — replaces window.confirm() throughout the app.
// Usage:
//   const [confirm, setConfirm] = useState(null);
//   setConfirm({ message: 'Delete this?', onConfirm: () => doDelete(id) });
//   {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
const ConfirmModal = ({
    title        = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    confirmStyle = { background: '#dc2626', color: '#fff' },
    onConfirm,
    onClose,
    busy  = false,
    error = null,
}) => ReactDOM.createPortal(
    <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !busy) onClose(); }}
    >
        <div style={{ background: '#fff', borderRadius: 10, width: 420, maxWidth: '92vw', boxShadow: '0 12px 40px rgba(0,0,0,.22)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                {title}
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
                {typeof message === 'string'
                    ? message.split('\n').map((l, i) => <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>{l}</p>)
                    : message}
            </div>
            {error && (
                <div style={{ margin: '0 20px 12px', padding: '7px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                    ⚠ {error}
                </div>
            )}
            <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f1f5f9' }}>
                <button
                    onClick={onClose}
                    disabled={busy}
                    style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}
                >
                    Cancel
                </button>
                <button
                    autoFocus
                    onClick={onConfirm}
                    disabled={busy}
                    style={{ padding: '7px 18px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1, ...confirmStyle }}
                >
                    {busy ? 'Processing…' : confirmLabel}
                </button>
            </div>
        </div>
    </div>,
    document.body
);

export default ConfirmModal;

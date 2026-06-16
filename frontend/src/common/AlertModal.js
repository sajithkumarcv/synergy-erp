import React from 'react';
import ReactDOM from 'react-dom';

// Replaces window.alert() throughout the app.
// Usage:
//   const [alertMsg, setAlertMsg] = useState(null);
//   setAlertMsg('Something went wrong.');
//   {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
const AlertModal = ({ message, onClose, title = 'Notice' }) => {
    const lines = typeof message === 'string' ? message.split('\n') : [String(message ?? '')];

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
            }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: '#fff', borderRadius: 10, width: 400, maxWidth: '92vw',
                boxShadow: '0 12px 40px rgba(0,0,0,.22)', overflow: 'hidden',
            }}>
                <div style={{
                    padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
                    fontWeight: 700, fontSize: 14, color: '#0f172a',
                }}>
                    {title}
                </div>
                <div style={{ padding: '16px 20px', fontSize: 13.5, color: '#334155', lineHeight: 1.6 }}>
                    {lines.map((l, i) => <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0' }}>{l}</p>)}
                </div>
                <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9' }}>
                    <button
                        autoFocus
                        onClick={onClose}
                        onKeyDown={e => e.key === 'Enter' && onClose()}
                        style={{
                            padding: '7px 22px', background: '#1e40af', color: '#fff',
                            border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        }}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AlertModal;

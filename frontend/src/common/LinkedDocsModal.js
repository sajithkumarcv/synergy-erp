import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../Variable';
import { fmt, fmtDate } from '../inventory/inventoryConstants';

// PRs / POs linked to one BOM line or PR line. `url` is the API path (relative to API_URL) returning
// {docId, docNumber, docStatus, lineNum, qty, uomName, unitPrice, docDate}. A line can be covered by several PRs and POs; each row opens that document's Lines tab in a new window.
const LinkedDocsModal = ({ url, kind, heading, itemLabel, onClose }) => {
    const [rows,    setRows]    = useState(null);
    const [error,   setError]   = useState('');
    const isPr = kind === 'PR';

    useEffect(() => {
        let alive = true;
        fetch(`${variables.API_URL}${url}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { if (alive) setRows(Array.isArray(d) ? d : []); })
            .catch(e => { if (alive) setError(e.message); });
        return () => { alive = false; };
    }, [url]);

    const openDoc = (r) => {
        const path = isPr ? `/purchase-requests/${r.docId}` : `/purchase-orders/${r.docId}`;
        window.open(`${path}?tab=lines`, '_blank', 'noopener');
    };

    const total = (rows || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);

    return ReactDOM.createPortal(
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '22px 26px',
                width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>
                            {isPr ? 'Purchase Requests' : 'Purchase Orders'} {heading}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{itemLabel}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                {error && <div style={{ color: '#991b1b', fontSize: 12.5 }}>⚠️ {error}</div>}
                {!error && rows === null && <div style={{ color: '#94a3b8', fontSize: 12.5 }}>Loading…</div>}
                {!error && rows && rows.length === 0 && (
                    <div style={{ color: '#94a3b8', fontSize: 12.5 }}>No {isPr ? 'PRs' : 'POs'} found for this line.</div>
                )}
                {!error && rows && rows.length > 0 && (
                    <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>{isPr ? 'PR No' : 'PO No'}</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Date</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Status</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Qty</th>
                                    {!isPr && <th style={{ padding: '6px 8px', textAlign: 'right' }}>Unit Price</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <tr key={`${r.docId}-${r.lineNum}-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '7px 8px' }}>
                                            <span onClick={() => openDoc(r)} title="Open the lines in a new window"
                                                style={{ color: '#1e40af', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                                                {r.docNumber}
                                            </span>
                                            <span style={{ color: '#94a3b8', marginLeft: 6 }}>line {r.lineNum}</span>
                                        </td>
                                        <td style={{ padding: '7px 8px', color: '#64748b' }}>{r.docDate ? fmtDate(r.docDate) : '—'}</td>
                                        <td style={{ padding: '7px 8px', color: '#64748b' }}>{r.docStatus}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600 }}>
                                            {fmt(r.qty, 4)}<span style={{ display: 'inline-block', width: 44, textAlign: 'left', marginLeft: 4, color: '#94a3b8', fontWeight: 400 }}>{r.uomName}</span>
                                        </td>
                                        {!isPr && <td style={{ padding: '7px 8px', textAlign: 'right' }}>{r.unitPrice != null ? `${fmt(r.unitPrice)} ${r.currencyCode || ''}`.trim() : '—'}</td>}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                                    <td colSpan={3} style={{ padding: '8px', color: '#64748b' }}>
                                        {rows.length} {rows.length === 1 ? 'line' : 'lines'} · total
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                                        {fmt(total, 4)}<span style={{ display: 'inline-block', width: 44, marginLeft: 4 }} />
                                    </td>
                                    {!isPr && <td />}
                                </tr>
                            </tfoot>
                        </table>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};

export default LinkedDocsModal;

import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmt, fmtDate } from '../procurement/procurementConstants';

// ── Last Purchase Price popup (shared) ────────────────────────────
// Opened on demand by clicking an item code / description in a line
// grid, to answer "what did we last pay for this?" while the line is
// being priced. Used from the PO's PR-import grid, the PR lines tab
// and the BOM detail grid.
//
// Reuses the existing price-analysis endpoint rather than a proc of its
// own, so there is one source of truth for price history.
//
// Props: itemId (required, numeric - render nothing if the row has none),
//        itemLabel (subtitle text), onClose.
const LastPurchaseModal = ({ itemId, itemLabel, onClose }) => {
    const { getStatusConfig } = useLookup();
    const [rows,    setRows]    = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        if (!itemId) { setLoading(false); return; }
        let cancelled = false;
        setLoading(true);
        // includeDraft=true — a buyer pricing this line wants Draft-and-above,
        // not only approved orders. Cancelled stays out server-side.
        fetch(`${variables.API_URL}priceanalysis/po?itemId=${itemId}&includeDraft=true`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => {
                if (cancelled) return;
                setRows(Array.isArray(d?.detail) ? d.detail : []);
                setSummary(d?.summary || null);
            })
            .catch(() => { if (!cancelled) setError('Could not load purchase history.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [itemId]);

    // Newest first — the endpoint drives the full analysis page, which is not
    // ordered for this use, so sort here rather than assume. PoId breaks ties:
    // several POs can carry the same date, and without it the sequence numbers
    // would shuffle between openings.
    const ordered = useMemo(
        () => [...rows].sort((a, b) => {
            const d = new Date(b.poDate) - new Date(a.poDate);
            return d !== 0 ? d : (b.poId || 0) - (a.poId || 0);
        }),
        [rows]
    );
    const latest = ordered[0] || null;

    const th = { padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
    const td = { padding: '7px 10px', fontSize: 12, color: '#1e293b', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

    // Same badge the PO screens use, so a status reads identically everywhere.
    // Falls back to a neutral chip for a status with no lookup row configured.
    const StatusPill = ({ status }) => {
        if (!status) return <span style={{ color: '#94a3b8' }}>—</span>;
        const cfg = getStatusConfig('PO', status);
        return (
            <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                background: cfg?.badgeBg    || '#e2e8f0',
                color:      cfg?.badgeColor || '#475569',
            }}>
                {cfg?.statusLabel || status}
            </span>
        );
    };

    return ReactDOM.createPortal(
        <div onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()}
                style={{ background: '#fff', borderRadius: 10, width: 720, maxWidth: '94vw', maxHeight: '82vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a5f' }}>Last purchase price</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{itemLabel}</div>
                    </div>
                    <button onClick={onClose}
                        style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, color: '#94a3b8', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ padding: '16px 20px' }}>
                    {loading && <div style={{ fontSize: 13, color: '#64748b' }}>Loading…</div>}
                    {!loading && error && <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>}

                    {!loading && !error && !latest && (
                        // Informational, not a problem - hence blue rather than amber.
                        // This is the moment the benchmark gets set, so it is worth
                        // saying so rather than showing an empty grey line.
                        <div style={{
                            padding: '12px 14px', borderRadius: 8,
                            border: '1px solid #bfdbfe', background: '#f0f7ff', color: '#1e3a5f',
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: '#2e5fa3' }}>
                                FIRST PURCHASE
                            </div>
                            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.55 }}>
                                This item has never been bought on a Purchase Order.
                                There is no price history to compare against — this order sets the
                                benchmark future purchases will be measured against, so it is worth
                                confirming the quote before it becomes the reference price.
                            </div>
                        </div>
                    )}

                    {!loading && !error && latest && (
                        <>
                            {/* The headline answer — the most recent purchase */}
                            <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Supplier</div>
                                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{latest.supplierName || '—'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>PO date</div>
                                    <div style={{ fontSize: 13, color: '#1e293b' }}>{fmtDate(latest.poDate)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Quantity</div>
                                    <div style={{ fontSize: 13, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(latest.orderedQty)}{latest.uomName ? ` ${latest.uomName}` : ''}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Unit price</div>
                                    <div style={{ fontSize: 17, fontWeight: 700, color: '#1e3a5f', fontVariantNumeric: 'tabular-nums' }}>
                                        {latest.currencyShort ? `${latest.currencyShort} ` : ''}{fmt(latest.unitPrice)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>PO status</div>
                                    <div style={{ marginTop: 2 }}><StatusPill status={latest.status} /></div>
                                </div>
                            </div>

                            {ordered.length > 1 && (
                                <>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                                        Purchase history ({ordered.length}) — most recent first
                                    </div>
                                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead style={{ background: '#f8fafc' }}>
                                                <tr>
                                                    <th style={{ ...th, textAlign: 'right', width: 34 }}>#</th>
                                                    <th style={th}>PO No.</th>
                                                    <th style={th}>Supplier</th>
                                                    <th style={th}>PO date</th>
                                                    <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                                                    <th style={{ ...th, textAlign: 'right' }}>Unit price</th>
                                                    <th style={th}>Currency</th>
                                                    <th style={th}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {ordered.map((d, i) => (
                                                    // Row 1 is the same purchase shown in the card above; it is
                                                    // kept in the list so the numbering means "most recent = 1".
                                                    <tr key={`${d.poId}-${i}`} style={i === 0 ? { background: '#f0f7ff' } : undefined}>
                                                        <td style={{ ...td, textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums', fontWeight: i === 0 ? 700 : 400 }}>{i + 1}</td>
                                                        <td style={{ ...td, fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3' }}>{d.poNumber}</td>
                                                        <td style={{ ...td, whiteSpace: 'normal' }}>{d.supplierName || '—'}</td>
                                                        <td style={td}>{fmtDate(d.poDate)}</td>
                                                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                            {fmt(d.orderedQty)}{d.uomName ? ` ${d.uomName}` : ''}
                                                        </td>
                                                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(d.unitPrice)}</td>
                                                        <td style={td}>{d.currencyShort || '—'}</td>
                                                        <td style={td}><StatusPill status={d.status} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {/* Prices sit in each order's own currency — say so, because
                                orders here genuinely span more than one. */}
                            {new Set(ordered.map(d => d.currencyShort).filter(Boolean)).size > 1 && (
                                <div style={{ marginTop: 10, fontSize: 11, color: '#b45309' }}>
                                    ⚠ These orders were placed in different currencies — compare with care.
                                </div>
                            )}

                            {summary?.orderLines > 1 && (
                                <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
                                    {summary.orderLines} order lines in total. Full history, trends and vendor
                                    comparison are on the Item Price Analysis screen.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default LastPurchaseModal;

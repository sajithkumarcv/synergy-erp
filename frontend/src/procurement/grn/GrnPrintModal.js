import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand } from '../../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../../utils/printWindow';
import '../po/PoPrint.css';

const n    = (v) => fmt(v ?? 0);

const GrnPrintModal = ({ grn, onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}grn/lines/${grn.grnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.grnId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `GRN - ${grn.grnNumber}`);

    // Totals
    const subtotal = lines.reduce((s, l) => {
        const accepted = Math.max(0, (l.receivedQty || 0) - (l.rejectedQty || 0));
        return s + accepted * (l.unitPrice || 0);
    }, 0);
    const taxAmt = lines.reduce((s, l) => {
        const accepted = Math.max(0, (l.receivedQty || 0) - (l.rejectedQty || 0));
        return s + accepted * (l.unitPrice || 0) * (l.taxPct || 0) / 100;
    }, 0);
    const grandTotal = subtotal + taxAmt;

    const currency = grn.currencyShort || grn.currencyName || '';
    const supplierName = grn.supplierName || grn.vendorName || '—';

    const hasQcData   = lines.some(l => l.qcStatus || l.qcRemarks);
    const hasRejected = lines.some(l => l.rejectedQty > 0);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Goods Receipt Note — {grn.grnNumber}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── Printable document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column' }}>

                {/* 1. Company Header */}
                <CompanyHeaderBand company={company} loading={coLoading} />

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Goods Receipt Note</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{grn.grnNumber}</div>
                        <div className="pop-doc-status">{grn.status}</div>
                    </div>
                </div>

                {/* 2. Info band: Supplier | Receipt details */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Supplier / Vendor</div>
                        <div className="pop-info-val">{supplierName}</div>
                        {grn.supplierRef && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Supplier Ref:</span>
                                <span className="pop-info-row-val">{grn.supplierRef}</span>
                            </div>
                        )}
                        {grn.invoiceNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Invoice No:</span>
                                <span className="pop-info-row-val">{grn.invoiceNo}</span>
                            </div>
                        )}
                        {grn.invoiceDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Invoice Date:</span>
                                <span className="pop-info-row-val">{fmtDate(grn.invoiceDate)}</span>
                            </div>
                        )}
                    </div>
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Receipt Details</div>
                        {grn.receivedDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Received:</span>
                                <span className="pop-info-row-val">{fmtDate(grn.receivedDate)}</span>
                            </div>
                        )}
                        {grn.receivedBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Received by:</span>
                                <span className="pop-info-row-val">{grn.receivedBy}</span>
                            </div>
                        )}
                        {grn.doNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">D.O. No:</span>
                                <span className="pop-info-row-val">{grn.doNo}</span>
                            </div>
                        )}
                        {grn.boeNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">BOE No:</span>
                                <span className="pop-info-row-val">{grn.boeNo}</span>
                            </div>
                        )}
                        {grn.deliveryLocation && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Location:</span>
                                <span className="pop-info-row-val">{grn.deliveryLocation}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Terms strip */}
                <div className="pop-terms-strip">
                    <div className="pop-term">
                        <div className="pop-term-label">GRN Date</div>
                        <div className="pop-term-val">{fmtDate(grn.grnDate)}</div>
                    </div>
                    {grn.poNumber && (
                        <div className="pop-term">
                            <div className="pop-term-label">PO Reference</div>
                            <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{grn.poNumber}</div>
                        </div>
                    )}
                    <div className="pop-term">
                        <div className="pop-term-label">Currency</div>
                        <div className="pop-term-val">
                            {currency || '—'}
                            {grn.exchangeRate && grn.exchangeRate !== 1
                                ? <span style={{ fontWeight: 400, color: '#64748b', fontSize: 10, marginLeft: 6 }}>@ {grn.exchangeRate}</span>
                                : null}
                        </div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Status</div>
                        <div className="pop-term-val">{grn.status}</div>
                    </div>
                </div>

                {/* 4. Line items table */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                        Loading lines…
                    </div>
                ) : (
                    <table className="pop-lines-table">
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}>#</th>
                                <th style={{ width: 90 }}>Code</th>
                                <th>Description</th>
                                <th className="num" style={{ width: 65 }}>Ordered</th>
                                <th className="num" style={{ width: 65 }}>Received</th>
                                {hasRejected && <th className="num" style={{ width: 60 }}>Rejected</th>}
                                <th style={{ width: 50 }}>UOM</th>
                                <th className="num" style={{ width: 85 }}>Unit Price</th>
                                <th className="num" style={{ width: 50 }}>Tax %</th>
                                <th className="num" style={{ width: 95 }}>Line Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr><td colSpan={hasRejected ? 10 : 9} style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontStyle: 'italic' }}>No items</td></tr>
                            ) : lines.map((l, i) => {
                                const accepted  = Math.max(0, (l.receivedQty || 0) - (l.rejectedQty || 0));
                                const lineTotal = accepted * (l.unitPrice || 0) * (1 + (l.taxPct || 0) / 100);
                                return (
                                    <tr key={l.grnDetailId}>
                                        <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                        <td className="code">{l.itemCode || '—'}</td>
                                        <td className="desc">
                                            {l.itemDesc || l.itemName || '—'}
                                            {l.batchNo     && <div style={{ fontSize: 10, color: '#64748b' }}>Batch: {l.batchNo}</div>}
                                            {l.serialNo    && <div style={{ fontSize: 10, color: '#64748b' }}>S/N: {l.serialNo}</div>}
                                            {l.storageLocation && <div style={{ fontSize: 10, color: '#64748b' }}>Location: {l.storageLocation}{l.binLocation ? ` / ${l.binLocation}` : ''}</div>}
                                            {l.remarks     && <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>{l.remarks}</div>}
                                        </td>
                                        <td className="num" style={{ color: '#64748b' }}>{l.orderedQty ?? '—'}</td>
                                        <td className="num" style={{ fontWeight: 600, color: '#065f46' }}>{l.receivedQty ?? '—'}</td>
                                        {hasRejected && <td className="num" style={{ color: l.rejectedQty > 0 ? '#dc2626' : '#94a3b8' }}>{l.rejectedQty || 0}</td>}
                                        <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                        <td className="num">{n(l.unitPrice)}</td>
                                        <td className="num" style={{ color: '#64748b' }}>{l.taxPct ?? 0}%</td>
                                        <td className="num" style={{ fontWeight: 600 }}>{n(lineTotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* 5. Totals */}
                <div className="pop-totals">
                    <div className="pop-totals-table">
                        <div className="pop-totals-row">
                            <span className="pop-totals-label">Subtotal</span>
                            <span className="pop-totals-val">{n(subtotal)}</span>
                        </div>
                        {taxAmt > 0 && (
                            <div className="pop-totals-row">
                                <span className="pop-totals-label">Tax</span>
                                <span className="pop-totals-val">{n(taxAmt)}</span>
                            </div>
                        )}
                        <div className="pop-totals-row grand">
                            <span className="pop-totals-label">TOTAL {currency && `(${currency})`}</span>
                            <span className="pop-totals-val">{n(grandTotal)}</span>
                        </div>
                    </div>
                </div>

                {/* 6. QC summary (only if any line has QC data) */}
                {hasQcData && (
                    <div className="pop-notes" style={{ borderLeftColor: '#6366f1', background: '#f5f3ff' }}>
                        <div className="pop-notes-label" style={{ color: '#4338ca' }}>QC Inspection Notes</div>
                        {lines.filter(l => l.qcStatus || l.qcRemarks).map((l, i) => (
                            <div key={l.grnDetailId} style={{ marginBottom: 4, fontSize: 11 }}>
                                <strong>{l.itemCode || l.itemDesc}</strong>
                                {l.qcStatus  && <> — Status: <strong>{l.qcStatus}</strong></>}
                                {l.qcRemarks && <> · {l.qcRemarks}</>}
                            </div>
                        ))}
                    </div>
                )}

                {/* 7. Remarks */}
                {grn.remarks && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Remarks</div>
                        {grn.remarks}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* 8. Signature footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Received by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{grn.receivedBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">QC Inspector / Store Keeper</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Authorised by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                <div className="pop-print-footer-note">
                    This is a computer-generated goods receipt note.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default GrnPrintModal;

import React from 'react';
import { fmt, fmtDate } from '../inventoryConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand } from '../../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../../utils/printWindow';
import '../../procurement/po/PoPrint.css';

const n    = (v) => fmt(v ?? 0);
const dash = (v) => v || '—';

// Props:
//   issueReturn  – the IRN header object
//   lines        – the IRN lines array (already loaded by parent)
//   onClose      – close handler
const IssueReturnPrintModal = ({ issueReturn: irn, lines = [], onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Issue Return - ${irn.returnNo}`);

    const hasUnitCost = lines.some(l => (l.unitCost || 0) > 0);
    const totalValue  = lines.reduce((s, l) => s + (l.returnQty || 0) * (l.unitCost || 0), 0);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Issue Return Note — {irn.returnNo}</span>
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
                    <div className="pop-doc-type" style={{ margin: 0 }}>Issue Return Note</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{irn.returnNo}</div>
                        <div className="pop-doc-status">{irn.status}</div>
                    </div>
                </div>

                {/* 2. Info band */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Return Details</div>
                        <div className="pop-info-val">{dash(irn.returnedBy)}</div>
                        {irn.jobId && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Job:</span>
                                <span className="pop-info-row-val">{irn.jobId}</span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Status:</span>
                            <span className="pop-info-row-val">{irn.status}</span>
                        </div>
                        {irn.notes && (
                            <div className="pop-info-row" style={{ marginTop: 6 }}>
                                <span className="pop-info-row-label">Notes:</span>
                                <span className="pop-info-row-val" style={{ whiteSpace: 'pre-wrap' }}>{irn.notes}</span>
                            </div>
                        )}
                    </div>
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Reference</div>
                        <div className="pop-info-val">{dash(irn.issueNo)}</div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Return Date:</span>
                            <span className="pop-info-row-val">{fmtDate(irn.returnDate)}</span>
                        </div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Total Lines:</span>
                            <span className="pop-info-row-val">{lines.length}</span>
                        </div>
                        {hasUnitCost && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Total Value:</span>
                                <span className="pop-info-row-val" style={{ fontWeight: 700 }}>{n(totalValue)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Terms strip */}
                <div className="pop-terms-strip">
                    <div className="pop-term">
                        <div className="pop-term-label">Return No</div>
                        <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{irn.returnNo}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Date</div>
                        <div className="pop-term-val">{fmtDate(irn.returnDate)}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Issue Ref</div>
                        <div className="pop-term-val">{dash(irn.issueNo)}</div>
                    </div>
                    {irn.jobId && (
                        <div className="pop-term">
                            <div className="pop-term-label">Job</div>
                            <div className="pop-term-val">{irn.jobId}</div>
                        </div>
                    )}
                    <div className="pop-term">
                        <div className="pop-term-label">Status</div>
                        <div className="pop-term-val">{irn.status}</div>
                    </div>
                </div>

                {/* 4. Line items table */}
                <table className="pop-lines-table">
                    <thead>
                        <tr>
                            <th style={{ width: 30 }}>#</th>
                            <th style={{ width: 90 }}>Code</th>
                            <th>Description</th>
                            <th className="num" style={{ width: 75 }}>Ret. Qty</th>
                            <th style={{ width: 55 }}>UOM</th>
                            {hasUnitCost && <th className="num" style={{ width: 90 }}>Unit Cost</th>}
                            {hasUnitCost && <th className="num" style={{ width: 100 }}>Total</th>}
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 ? (
                            <tr>
                                <td colSpan={hasUnitCost ? 8 : 6}
                                    style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No items
                                </td>
                            </tr>
                        ) : lines.map((l, i) => (
                            <tr key={l.returnLineId ?? i}>
                                <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                <td className="code">{l.itemCode || '—'}</td>
                                <td className="desc">{l.itemDesc || l.itemName || '—'}</td>
                                <td className="num">{l.returnQty}</td>
                                <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                {hasUnitCost && (
                                    <td className="num">
                                        {(l.unitCost || 0) > 0 ? n(l.unitCost) : '—'}
                                    </td>
                                )}
                                {hasUnitCost && (
                                    <td className="num" style={{ fontWeight: 600 }}>
                                        {(l.unitCost || 0) > 0 ? n((l.returnQty || 0) * l.unitCost) : '—'}
                                    </td>
                                )}
                                <td style={{ fontSize: 11, color: '#475569' }}>{l.remarks || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* 5. Total value (only if unit costs present) */}
                {hasUnitCost && totalValue > 0 && (
                    <div className="pop-totals">
                        <div className="pop-totals-table">
                            <div className="pop-totals-row grand">
                                <span className="pop-totals-label">TOTAL RETURN VALUE</span>
                                <span className="pop-totals-val">{n(totalValue)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. Notes */}
                {irn.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Remarks</div>
                        {irn.notes}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* 7. Signature footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Returned By</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{irn.returnedBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Warehouse / Store</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Authorized By</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                <div className="pop-print-footer-note">
                    This is a computer-generated issue return note.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default IssueReturnPrintModal;

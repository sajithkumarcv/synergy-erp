import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand } from '../../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../../utils/printWindow';
import '../po/PoPrint.css';

const n   = (v) => fmt(v ?? 0);
const dash = (v) => v || '—';

const PrPrintModal = ({ pr, onClose, infoOnly = false }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}purchaserequest/lines/${pr.prId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [pr.prId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Purchase Request - ${pr.prNumber}`);

    const hasEstPrices  = lines.some(l => l.estUnitPrice > 0);
    const estTotal      = hasEstPrices
        ? lines.reduce((s, l) => s + (l.requiredQty || 0) * (l.estUnitPrice || 0), 0)
        : 0;

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">
                        {infoOnly ? '👁' : '🖨'} Purchase Request — {pr.prNumber}
                        {infoOnly && <span style={{ marginLeft: 8, fontWeight: 400, opacity: .8 }}>(Information)</span>}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    {!infoOnly && (
                        <button className="po-print-btn-print" onClick={handlePrint}>
                            🖨 Print / Save as PDF
                        </button>
                    )}
                </div>
            </div>

            {/* ── Printable document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column' }}>

                {/* 1. Company Header — hidden in info-only view (no print letterhead) */}
                {!infoOnly && <CompanyHeaderBand company={company} loading={coLoading} />}

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Purchase Request</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{pr.prNumber}</div>
                        <div className="pop-doc-status">{pr.status}</div>
                    </div>
                </div>

                {/* 2. Info band: Requested by | Job & Details */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Requested By</div>
                        <div className="pop-info-val">{dash(pr.requestedBy)}</div>
                        {pr.department && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Department:</span>
                                <span className="pop-info-row-val">{pr.department}</span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Created by:</span>
                            <span className="pop-info-row-val">{dash(pr.createdBy)}</span>
                        </div>
                        {pr.notes && (
                            <div className="pop-info-row" style={{ marginTop: 6 }}>
                                <span className="pop-info-row-label">Notes:</span>
                                <span className="pop-info-row-val" style={{ whiteSpace: 'pre-wrap' }}>{pr.notes}</span>
                            </div>
                        )}
                    </div>
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Job &amp; Reference</div>
                        {pr.jobId && (
                            <div className="pop-info-val">{pr.jobId}{pr.jobTitle ? ` — ${pr.jobTitle}` : ''}</div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">PR Date:</span>
                            <span className="pop-info-row-val">{fmtDate(pr.prDate)}</span>
                        </div>
                        {pr.priority && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Priority:</span>
                                <span className="pop-info-row-val">{pr.priority}</span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Total lines:</span>
                            <span className="pop-info-row-val">{lines.length}</span>
                        </div>
                    </div>
                </div>

                {/* 3. Terms strip */}
                <div className="pop-terms-strip">
                    <div className="pop-term">
                        <div className="pop-term-label">PR Number</div>
                        <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{pr.prNumber}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Date</div>
                        <div className="pop-term-val">{fmtDate(pr.prDate)}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Priority</div>
                        <div className="pop-term-val">{dash(pr.priority)}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Status</div>
                        <div className="pop-term-val">{pr.status}</div>
                    </div>
                    {pr.poCount > 0 && (
                        <div className="pop-term">
                            <div className="pop-term-label">POs Raised</div>
                            <div className="pop-term-val">{pr.poCount}</div>
                        </div>
                    )}
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
                                <th className="num" style={{ width: 70 }}>Req. Qty</th>
                                <th style={{ width: 55 }}>UOM</th>
                                <th style={{ width: 90 }}>Req. Date</th>
                                {hasEstPrices && <th className="num" style={{ width: 90 }}>Est. Price</th>}
                                {hasEstPrices && <th className="num" style={{ width: 100 }}>Est. Total</th>}
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr><td colSpan={hasEstPrices ? 9 : 7} style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontStyle: 'italic' }}>No items</td></tr>
                            ) : lines.map((l, i) => (
                                <tr key={l.prLineId}>
                                    <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                    <td className="code">{l.itemCode || '—'}</td>
                                    <td className="desc">{l.itemDesc || l.itemName || '—'}</td>
                                    <td className="num">{l.requiredQty}</td>
                                    <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                    <td style={{ fontSize: 11 }}>{l.requiredDate ? fmtDate(l.requiredDate) : '—'}</td>
                                    {hasEstPrices && <td className="num">{l.estUnitPrice > 0 ? n(l.estUnitPrice) : '—'}</td>}
                                    {hasEstPrices && <td className="num" style={{ fontWeight: 600 }}>{l.estUnitPrice > 0 ? n((l.requiredQty || 0) * l.estUnitPrice) : '—'}</td>}
                                    <td style={{ fontSize: 11, color: '#475569' }}>{l.remarks || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* 5. Estimated total (only if prices exist) */}
                {hasEstPrices && estTotal > 0 && (
                    <div className="pop-totals">
                        <div className="pop-totals-table">
                            <div className="pop-totals-row grand">
                                <span className="pop-totals-label">EST. TOTAL VALUE</span>
                                <span className="pop-totals-val">{n(estTotal)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. Notes */}
                {pr.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Justification</div>
                        {pr.notes}
                    </div>
                )}

                {/* spacer — pushes signature to bottom of A4 */}
                <div style={{ flex: 1 }} />

                {/* 7. Signature footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Prepared by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{pr.requestedBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Department Head / Manager</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Purchasing / Finance</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                {!infoOnly && (
                    <div className="pop-print-footer-note">
                        This is a computer-generated purchase request.
                        {company?.companyName && <> {company.companyName}</>}
                        {company?.email && <> · {company.email}</>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrPrintModal;

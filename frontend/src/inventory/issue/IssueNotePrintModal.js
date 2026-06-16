import React from 'react';
import { fmt, fmtDate, fmtDateTime } from '../inventoryConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand } from '../../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../../utils/printWindow';
import '../../procurement/po/PoPrint.css';

const n    = (v) => fmt(v ?? 0);
const dash = (v) => (v != null && v !== '') ? v : '—';

const IssueNotePrintModal = ({ issue, lines = [], onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Issue Note - ${issue.issueNo}`);

    const grandTotal = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0);
    const costingLabel = issue.costingType === 'INC_COSTING' ? 'Including Costing' : 'Excluding Costing';

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Issue Note — {issue.issueNo}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── Printable A4 document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column' }}>

                {/* 1. Company Header */}
                <CompanyHeaderBand company={company} loading={coLoading} />

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Stock Issue Note</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{issue.issueNo}</div>
                        <div className="pop-doc-status">{issue.status || 'Confirmed'}</div>
                    </div>
                </div>

                {/* 2. Info band — Job / Project | Issue Details */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Job / Project</div>
                        {issue.jobId && (
                            <div className="pop-info-val">{issue.jobId}</div>
                        )}
                        {issue.projectName && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Project:</span>
                                <span className="pop-info-row-val">{issue.projectName}</span>
                            </div>
                        )}
                        {issue.customerName && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Customer:</span>
                                <span className="pop-info-row-val">{issue.customerName}</span>
                            </div>
                        )}
                        {!issue.jobId && !issue.projectName && !issue.customerName && (
                            <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>No job linked</div>
                        )}
                    </div>
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Issue Details</div>
                        {issue.issuedTo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Issued To:</span>
                                <span className="pop-info-row-val">{issue.issuedTo}</span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Costing Type:</span>
                            <span className="pop-info-row-val">{costingLabel}</span>
                        </div>
                        {issue.modifiedBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Confirmed by:</span>
                                <span className="pop-info-row-val">{issue.modifiedBy}</span>
                            </div>
                        )}
                        {issue.modifiedDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Confirmed on:</span>
                                <span className="pop-info-row-val">{fmtDateTime(issue.modifiedDate)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Terms strip */}
                <div className="pop-terms-strip">
                    <div className="pop-term">
                        <div className="pop-term-label">Issue Date</div>
                        <div className="pop-term-val">{fmtDate(issue.issueDate)}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Issue No</div>
                        <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{issue.issueNo}</div>
                    </div>
                    {issue.jobId && (
                        <div className="pop-term">
                            <div className="pop-term-label">Job</div>
                            <div className="pop-term-val">{issue.jobId}</div>
                        </div>
                    )}
                    <div className="pop-term">
                        <div className="pop-term-label">Costing</div>
                        <div className="pop-term-val">{issue.costingType === 'INC_COSTING' ? 'INC' : 'EXC'}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Lines</div>
                        <div className="pop-term-val">{lines.length}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Status</div>
                        <div className="pop-term-val">Confirmed</div>
                    </div>
                </div>

                {/* 4. Line items table */}
                <table className="pop-lines-table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>#</th>
                            <th style={{ width: 90 }}>Code</th>
                            <th>Description</th>
                            <th className="num" style={{ width: 70 }}>Qty</th>
                            <th style={{ width: 50 }}>UOM</th>
                            <th className="num" style={{ width: 90 }}>Unit Cost</th>
                            <th className="num" style={{ width: 100 }}>Total Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No items
                                </td>
                            </tr>
                        ) : lines.map((l, i) => {
                            const lineTotal = (l.qty || 0) * (l.unitCost || 0);
                            return (
                                <tr key={l.issueLineId}>
                                    <td style={{ color: '#94a3b8', fontSize: 10 }}>{l.lineNum || i + 1}</td>
                                    <td className="code">{dash(l.itemCode)}</td>
                                    <td className="desc">
                                        {l.itemDesc || l.itemName || '—'}
                                        {l.notes && (
                                            <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                                                {l.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td className="num" style={{ fontWeight: 600, color: '#065f46' }}>
                                        {n(l.qty)}
                                    </td>
                                    <td style={{ color: '#475569' }}>{dash(l.uomName)}</td>
                                    <td className="num">{n(l.unitCost)}</td>
                                    <td className="num" style={{ fontWeight: 600 }}>{n(lineTotal)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* 5. Total */}
                <div className="pop-totals">
                    <div className="pop-totals-table">
                        <div className="pop-totals-row grand">
                            <span className="pop-totals-label">TOTAL COST</span>
                            <span className="pop-totals-val">{n(grandTotal)}</span>
                        </div>
                    </div>
                </div>

                {/* 6. Notes */}
                {issue.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Remarks</div>
                        {issue.notes}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* 7. Signature footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Issued by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{issue.createdBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Received by / Store Keeper</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{issue.issuedTo || 'Name / Signature & Date'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Authorised by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                <div className="pop-print-footer-note">
                    This is a computer-generated stock issue note.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default IssueNotePrintModal;

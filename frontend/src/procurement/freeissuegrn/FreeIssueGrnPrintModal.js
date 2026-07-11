import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmtDate } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand } from '../../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../../utils/printWindow';
import '../po/PoPrint.css';

const FreeIssueGrnPrintModal = ({ grn, onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}freeissuegrn/lines/${grn.freeIssueGrnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.freeIssueGrnId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Free Issue GRN - ${grn.freeIssueGrnNumber}`);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>
            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Free Issue GRN — {grn.freeIssueGrnNumber}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>🖨 Print / Save as PDF</button>
                </div>
            </div>

            {/* ── Printable document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column', minHeight: '297mm' }}>
                <CompanyHeaderBand company={company} loading={coLoading} />

                {/* Title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>GRN for Free Issue Material</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{grn.freeIssueGrnNumber}</div>
                        <div className="pop-doc-status">{grn.status}</div>
                        {grn.jobId && (
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                Job: <strong style={{ fontFamily: 'Courier New', color: '#0f4c81' }}>{grn.jobId}</strong>
                                {grn.jobTitle && <span style={{ color: '#64748b' }}> — {grn.jobTitle}</span>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info band: Customer / Job | Receipt details */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Customer / Job</div>
                        <div className="pop-info-val">{grn.customerName || '—'}</div>
                        {grn.jobId && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Job No:</span>
                                <span className="pop-info-row-val">{grn.jobId}{grn.jobTitle ? ` — ${grn.jobTitle}` : ''}</span>
                            </div>
                        )}
                        {grn.deliveredBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Delivered by:</span>
                                <span className="pop-info-row-val">{grn.deliveredBy}</span>
                            </div>
                        )}
                    </div>
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Receipt Details</div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Date of Receipt:</span>
                            <span className="pop-info-row-val">{fmtDate(grn.receiptDate)}</span>
                        </div>
                        {grn.receivedBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Received by:</span>
                                <span className="pop-info-row-val">{grn.receivedBy}</span>
                            </div>
                        )}
                        {grn.deliveryNoteFilePath && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Delivery Note:</span>
                                <span className="pop-info-row-val">{grn.deliveryNoteFilePath}</span>
                            </div>
                        )}
                        {grn.boeNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">BOE No:</span>
                                <span className="pop-info-row-val">{grn.boeNo}</span>
                            </div>
                        )}
                        {grn.boeDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">BOE Date:</span>
                                <span className="pop-info-row-val">{fmtDate(grn.boeDate)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Description */}
                <div className="pop-notes">
                    <div className="pop-notes-label">Brief Description</div>
                    {grn.briefDescription || '—'}
                </div>
                <div className="pop-notes" style={{ marginTop: 8 }}>
                    <div className="pop-notes-label">Detailed Description</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{grn.detailedDescription || '—'}</div>
                </div>

                {/* Optional material lines */}
                {!loading && lines.length > 0 && (
                    <table className="pop-lines-table" style={{ marginTop: 16 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 30 }}>#</th>
                                <th>Description</th>
                                <th className="num" style={{ width: 80 }}>Qty</th>
                                <th style={{ width: 70 }}>UOM</th>
                                <th>Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={l.freeIssueGrnDetailId}>
                                    <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                    <td className="desc">{l.description}</td>
                                    <td className="num">{l.qty ?? '—'}</td>
                                    <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                    <td style={{ color: '#64748b' }}>{l.remarks || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Notes */}
                {grn.remarks && (
                    <div className="pop-notes" style={{ marginTop: 12 }}>
                        <div className="pop-notes-label">Notes</div>
                        {grn.remarks}
                    </div>
                )}

                <div style={{ flex: 1 }} />

                {/* Signature footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Received by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{grn.receivedBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Store Keeper</div>
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
                    This is a computer-generated free issue goods receipt note.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default FreeIssueGrnPrintModal;

import React from 'react';
import { fmtDate, fmtDateTime } from './deliveryConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { CompanyHeaderBand, DraftWatermark, PreviewBanner } from '../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../utils/printWindow';
import '../procurement/po/PoPrint.css';

const dash = (v) => (v != null && v !== '') ? v : '—';

const DeliveryPrintModal = ({ delivery, lines = [], onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    // Until the note is Dispatched (or Delivered) it is only a preview — not a
    // valid carrier copy. Print it watermarked, like a Draft PO.
    const preview = !['Dispatched', 'Delivered'].includes(delivery.status);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc',
        `Delivery Note${preview ? ' (DRAFT)' : ''} - ${delivery.deliveryNo}`);

    const hasConsignee = delivery.consignee || delivery.consigneeAddress ||
                         delivery.consigneeLpoNo || delivery.consigneeTrn;

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Delivery Note — {delivery.deliveryNo}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── A4 Document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column' }}>

                {preview && <DraftWatermark />}
                {preview && <PreviewBanner text="PREVIEW ONLY — NOT VALID FOR DISPATCH · NOT A CARRIER COPY" />}

                {/* 1. Company Header */}
                <CompanyHeaderBand company={company} loading={coLoading} hideLogo={preview} nameOnly={preview} />

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Delivery Note</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{delivery.deliveryNo}</div>
                        <div className="pop-doc-status" style={{
                            background: delivery.status === 'Delivered'  ? '#ccfbf1' :
                                        delivery.status === 'Dispatched' ? '#dbeafe' :
                                        delivery.status === 'Approved'   ? '#dcfce7' :
                                        delivery.status === 'Cancelled'  ? '#fee2e2' : '#f1f5f9',
                            color:      delivery.status === 'Delivered'  ? '#0f766e' :
                                        delivery.status === 'Dispatched' ? '#1e40af' :
                                        delivery.status === 'Approved'   ? '#166534' :
                                        delivery.status === 'Cancelled'  ? '#991b1b' : '#475569',
                        }}>
                            {delivery.status}
                        </div>
                    </div>
                </div>

                {/* 2. Deliver To + Delivery Details */}
                <div className="pop-info-band">
                    {/* Left: Deliver To */}
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Deliver To</div>
                        <div className="pop-info-val">{dash(delivery.customerName)}</div>
                        {delivery.contactName && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Attention:</span>
                                <span className="pop-info-row-val">
                                    {delivery.contactName}
                                    {delivery.contactDesignation ? `, ${delivery.contactDesignation}` : ''}
                                </span>
                            </div>
                        )}
                        {delivery.contactPhone && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Phone:</span>
                                <span className="pop-info-row-val">{delivery.contactPhone}</span>
                            </div>
                        )}
                        {delivery.contactMobile && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Mobile:</span>
                                <span className="pop-info-row-val">{delivery.contactMobile}</span>
                            </div>
                        )}
                        {delivery.deliveryAddress && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#475569',
                                          lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                {delivery.deliveryAddress}
                            </div>
                        )}
                    </div>

                    {/* Right: Delivery Details */}
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Delivery Details</div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">DN No:</span>
                            <span className="pop-info-row-val" style={{ fontFamily: 'Courier New', fontWeight: 700 }}>
                                {delivery.deliveryNo}
                            </span>
                        </div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Date:</span>
                            <span className="pop-info-row-val">{fmtDate(delivery.deliveryDate)}</span>
                        </div>
                        {delivery.invoiceNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Invoice No:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {delivery.invoiceNo}
                                </span>
                            </div>
                        )}
                        {delivery.jobId && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Job Ref:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {delivery.jobId}
                                </span>
                            </div>
                        )}
                        {delivery.vehicleNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Vehicle No:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {delivery.vehicleNo}
                                </span>
                            </div>
                        )}
                        {delivery.deliveredBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Delivered By:</span>
                                <span className="pop-info-row-val">{delivery.deliveredBy}</span>
                            </div>
                        )}
                        {delivery.deliveredByDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Delivered Date:</span>
                                <span className="pop-info-row-val">{fmtDate(delivery.deliveredByDate)}</span>
                            </div>
                        )}
                        {delivery.buyerLpoNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Buyer LPO No:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {delivery.buyerLpoNo}
                                </span>
                            </div>
                        )}
                        {delivery.buyerLpoDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Buyer LPO Date:</span>
                                <span className="pop-info-row-val">{fmtDate(delivery.buyerLpoDate)}</span>
                            </div>
                        )}
                        {delivery.buyerTrnNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Buyer TRN:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {delivery.buyerTrnNo}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Consignee / Receiver (if present) */}
                {hasConsignee && (
                    <div className="pop-info-box" style={{ marginBottom: 20 }}>
                        <div className="pop-info-box-title">Consignee / Receiver</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                            {delivery.consignee && (
                                <div className="pop-info-row">
                                    <span className="pop-info-row-label">Consignee:</span>
                                    <span className="pop-info-row-val">{delivery.consignee}</span>
                                </div>
                            )}
                            {delivery.consigneeTrn && (
                                <div className="pop-info-row">
                                    <span className="pop-info-row-label">TRN:</span>
                                    <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                        {delivery.consigneeTrn}
                                    </span>
                                </div>
                            )}
                            {delivery.consigneeLpoNo && (
                                <div className="pop-info-row">
                                    <span className="pop-info-row-label">Consignee LPO No:</span>
                                    <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                        {delivery.consigneeLpoNo}
                                    </span>
                                </div>
                            )}
                            {delivery.consigneeLpoDate && (
                                <div className="pop-info-row">
                                    <span className="pop-info-row-label">Consignee LPO Date:</span>
                                    <span className="pop-info-row-val">{fmtDate(delivery.consigneeLpoDate)}</span>
                                </div>
                            )}
                        </div>
                        {delivery.consigneeAddress && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#475569',
                                          lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                               letterSpacing: '.06em', color: '#64748b' }}>
                                    Consignee Address:&nbsp;
                                </span>
                                {delivery.consigneeAddress}
                            </div>
                        )}
                    </div>
                )}

                {/* 4. Terms Strip */}
                <div className="pop-terms-strip">
                    <div className="pop-term">
                        <div className="pop-term-label">DN No</div>
                        <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{delivery.deliveryNo}</div>
                    </div>
                    <div className="pop-term">
                        <div className="pop-term-label">Delivery Date</div>
                        <div className="pop-term-val">{fmtDate(delivery.deliveryDate)}</div>
                    </div>
                    {delivery.invoiceNo && (
                        <div className="pop-term">
                            <div className="pop-term-label">Invoice No</div>
                            <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{delivery.invoiceNo}</div>
                        </div>
                    )}
                    {delivery.vehicleNo && (
                        <div className="pop-term">
                            <div className="pop-term-label">Vehicle No</div>
                            <div className="pop-term-val" style={{ fontFamily: 'Courier New' }}>{delivery.vehicleNo}</div>
                        </div>
                    )}
                    {delivery.deliveredBy && (
                        <div className="pop-term">
                            <div className="pop-term-label">Delivered By</div>
                            <div className="pop-term-val">{delivery.deliveredBy}</div>
                        </div>
                    )}
                    <div className="pop-term">
                        <div className="pop-term-label">Items</div>
                        <div className="pop-term-val">{lines.length}</div>
                    </div>
                </div>

                {/* 5. Line Items Table */}
                <table className="pop-lines-table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>#</th>
                            <th style={{ textAlign: 'left' }}>Description</th>
                            <th style={{ width: 60, textAlign: 'center' }}>UOM</th>
                            <th className="num" style={{ width: 80 }}>Qty</th>
                            <th style={{ textAlign: 'left', width: 200 }}>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '16px 0',
                                                          color: '#94a3b8', fontStyle: 'italic' }}>
                                    No items
                                </td>
                            </tr>
                        ) : lines.map((l, i) => (
                            <tr key={l.deliveryLineId}>
                                <td style={{ color: '#94a3b8', fontSize: 10 }}>{l.lineNum || i + 1}</td>
                                <td className="desc">{l.description}</td>
                                <td style={{ color: '#475569', textAlign: 'center' }}>{l.uomName || '—'}</td>
                                <td className="num">
                                    {Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                </td>
                                <td style={{ fontSize: 11, color: '#475569', fontStyle: l.remarks ? 'normal' : 'italic' }}>
                                    {l.remarks || '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* 6. Notes */}
                {delivery.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Remarks</div>
                        {delivery.notes}
                    </div>
                )}

                {/* 7. Audit strip */}
                <div className="pop-audit-strip">
                    <div className="pop-audit-item">
                        <div className="pop-audit-label">Created By</div>
                        <div className="pop-audit-val">{delivery.createdBy || '—'}</div>
                        <div className="pop-audit-date">{fmtDateTime(delivery.createdDate)}</div>
                    </div>
                    {delivery.modifiedBy && (
                        <div className="pop-audit-item">
                            <div className="pop-audit-label">Last Modified By</div>
                            <div className="pop-audit-val">{delivery.modifiedBy}</div>
                            <div className="pop-audit-date">{fmtDateTime(delivery.modifiedDate)}</div>
                        </div>
                    )}
                    <div className="pop-audit-item">
                        <div className="pop-audit-label">Status</div>
                        <div className="pop-audit-val">{delivery.status}</div>
                    </div>
                </div>

                <div style={{ flex: 1 }} />

                {/* 8. Signature Footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Prepared / Dispatched by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{delivery.deliveredBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Authorised by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Received by (Customer)</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                {preview && <PreviewBanner text="PREVIEW ONLY — NOT VALID FOR DISPATCH · NOT A CARRIER COPY" />}

                <div className="pop-print-footer-note">
                    This is a computer-generated delivery note.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default DeliveryPrintModal;

import React from 'react';
import { fmt, fmtDate, numberToWords } from './invoiceConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { CompanyHeaderBand, BankDetailsBlock, DraftWatermark, PreviewBanner } from '../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../utils/printWindow';
import '../procurement/po/PoPrint.css';

const dash = (v) => (v != null && v !== '') ? v : '—';

const InvoicePrintModal = ({ invoice, lines = [], onClose, preview }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Invoice${preview ? ' (DRAFT)' : ''} - ${invoice.invoiceNo}`);

    const subTotal   = lines.reduce((s, l) => s + (l.amount    || 0), 0);
    const taxTotal   = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const grandTotal = subTotal + taxTotal;

    const curr       = invoice.currencyShort || '';
    const vatGroups  = [...new Set(lines.map(l => l.vatPercent))].filter(v => v > 0);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Invoice — {invoice.invoiceNo}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── A4 Document ── */}
            <div className="po-print-doc" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {preview && <DraftWatermark />}
                {preview && <PreviewBanner />}

                {/* 1. Company Header */}
                <CompanyHeaderBand company={company} loading={coLoading} hideLogo={preview} nameOnly={preview} />

                {/* 2. Document title band */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Tax Invoice</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{invoice.invoiceNo}</div>
                        <div className="pop-doc-status">{invoice.status || 'Confirmed'}</div>
                    </div>
                </div>

                {/* 2. Bill To + Invoice Details — single source of truth for all fields */}
                <div className="pop-info-band">
                    {/* Left: customer */}
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Bill To</div>
                        <div className="pop-info-val">{dash(invoice.customerName)}</div>
                        {invoice.customerVatNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">VAT / TRN No:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {invoice.customerVatNo}
                                </span>
                            </div>
                        )}
                        {invoice.contactName && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Attention:</span>
                                <span className="pop-info-row-val">
                                    {invoice.contactName}
                                    {invoice.contactDesignation ? `, ${invoice.contactDesignation}` : ''}
                                </span>
                            </div>
                        )}
                        {invoice.contactPhone && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Phone:</span>
                                <span className="pop-info-row-val">{invoice.contactPhone}</span>
                            </div>
                        )}
                        {invoice.contactMobile && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Mobile:</span>
                                <span className="pop-info-row-val">{invoice.contactMobile}</span>
                            </div>
                        )}
                        {invoice.billingAddress && (
                            <div style={{ marginTop: 8, fontSize: 11, color: '#475569',
                                          lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                                {invoice.billingAddress}
                            </div>
                        )}
                    </div>

                    {/* Right: all invoice details — each field appears exactly once */}
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Invoice Details</div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Invoice No:</span>
                            <span className="pop-info-row-val" style={{ fontFamily: 'Courier New', fontWeight: 700 }}>
                                {invoice.invoiceNo}
                            </span>
                        </div>
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Invoice Date:</span>
                            <span className="pop-info-row-val">{fmtDate(invoice.invoiceDate)}</span>
                        </div>
                        {invoice.dueDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Due Date:</span>
                                <span className="pop-info-row-val">{fmtDate(invoice.dueDate)}</span>
                            </div>
                        )}
                        {invoice.lpoNo && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">LPO / PO No:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {invoice.lpoNo}
                                </span>
                            </div>
                        )}
                        {invoice.lpoDate && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">LPO Date:</span>
                                <span className="pop-info-row-val">{fmtDate(invoice.lpoDate)}</span>
                            </div>
                        )}
                        {invoice.jobId && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Job Ref:</span>
                                <span className="pop-info-row-val" style={{ fontFamily: 'Courier New' }}>
                                    {invoice.jobId}
                                </span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Currency:</span>
                            <span className="pop-info-row-val">
                                {curr}
                                {invoice.currencySymbol && curr !== invoice.currencySymbol
                                    ? ` (${invoice.currencySymbol})` : ''}
                                {invoice.exchangeRate && invoice.exchangeRate !== 1
                                    ? <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>
                                        @ {invoice.exchangeRate}
                                      </span>
                                    : null}
                            </span>
                        </div>
                        {invoice.createdBy && (
                            <div className="pop-info-row">
                                <span className="pop-info-row-label">Prepared by:</span>
                                <span className="pop-info-row-val">{invoice.createdBy}</span>
                            </div>
                        )}
                        <div className="pop-info-row">
                            <span className="pop-info-row-label">Line Items:</span>
                            <span className="pop-info-row-val">{lines.length}</span>
                        </div>
                    </div>
                </div>

                {/* 3. Line Items Table */}
                <table className="pop-lines-table">
                    <thead>
                        <tr>
                            <th style={{ width: 28 }}>#</th>
                            <th style={{ textAlign: 'left' }}>Description</th>
                            <th style={{ width: 55 }}>UOM</th>
                            <th className="num" style={{ width: 75 }}>Qty</th>
                            <th className="num" style={{ width: 100 }}>Unit Price</th>
                            <th className="num" style={{ width: 110 }}>Amount</th>
                            <th className="num" style={{ width: 55 }}>VAT %</th>
                            <th className="num" style={{ width: 100 }}>Tax Amt</th>
                            <th className="num" style={{ width: 110 }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '16px 0',
                                                          color: '#94a3b8', fontStyle: 'italic' }}>
                                    No items
                                </td>
                            </tr>
                        ) : lines.map((l, i) => {
                            const lineTotal = (l.amount || 0) + (l.taxAmount || 0);
                            return (
                                <tr key={l.invoiceLineId}>
                                    <td style={{ color: '#94a3b8', fontSize: 10 }}>{l.lineNum || i + 1}</td>
                                    <td className="desc">
                                        {l.description}
                                        {l.notes && (
                                            <div style={{ fontSize: 10, color: '#64748b',
                                                          fontStyle: 'italic', marginTop: 2 }}>
                                                {l.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ color: '#475569', textAlign: 'center' }}>
                                        {l.uomName || '—'}
                                    </td>
                                    <td className="num">
                                        {Number(l.qty).toLocaleString(undefined, {
                                            maximumFractionDigits: 4,
                                        })}
                                    </td>
                                    <td className="num">{fmt(l.unitPrice)}</td>
                                    <td className="num">{fmt(l.amount)}</td>
                                    <td className="num" style={{ color: '#64748b' }}>{l.vatPercent}%</td>
                                    <td className="num" style={{ color: '#64748b' }}>{fmt(l.taxAmount)}</td>
                                    <td className="num" style={{ fontWeight: 600 }}>{fmt(lineTotal)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* 5. Totals */}
                <div className="pop-totals">
                    <div className="pop-totals-table" style={{ width: 320 }}>
                        <div className="pop-totals-row">
                            <span className="pop-totals-label">Sub Total ({curr})</span>
                            <span className="pop-totals-val">{fmt(subTotal)}</span>
                        </div>
                        {vatGroups.map(vat => {
                            const vatAmt = lines
                                .filter(l => l.vatPercent === vat)
                                .reduce((s, l) => s + (l.taxAmount || 0), 0);
                            return (
                                <div key={vat} className="pop-totals-row">
                                    <span className="pop-totals-label">VAT {vat}%</span>
                                    <span className="pop-totals-val">{fmt(vatAmt)}</span>
                                </div>
                            );
                        })}
                        {taxTotal === 0 && (
                            <div className="pop-totals-row">
                                <span className="pop-totals-label">Tax Amount</span>
                                <span className="pop-totals-val">{fmt(0)}</span>
                            </div>
                        )}
                        <div className="pop-totals-row grand">
                            <span className="pop-totals-label">TOTAL ({curr})</span>
                            <span className="pop-totals-val">{fmt(grandTotal)}</span>
                        </div>
                    </div>
                </div>

                {/* 6. Amount in Words */}
                <div style={{ margin: '0 0 20px', padding: '10px 14px',
                               background: '#f8fafc', border: '1px solid #e2e8f0',
                               borderRadius: 6, fontSize: 12, color: '#1e293b' }}>
                    <span style={{ fontWeight: 700, color: '#64748b', marginRight: 6,
                                   fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Amount in Words:
                    </span>
                    {curr} {numberToWords(grandTotal)}
                    {taxTotal > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                            (Tax: {curr} {numberToWords(taxTotal)})
                        </div>
                    )}
                </div>

                {/* 7. Notes */}
                {invoice.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Remarks</div>
                        {invoice.notes}
                    </div>
                )}

                {/* 8. Bank Details — from DB */}
                {company?.banks?.length > 0 && (
                    <BankDetailsBlock banks={company.banks}
                        note={company.printNote}
                        headerBg="#1e3a5f" rowAlt="#f8fafc" />
                )}

                <div style={{ flex: 1 }} />

                {preview && <PreviewBanner />}

                {/* 9. Signature Footer */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Prepared by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{invoice.createdBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Approved by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Received by (Customer)</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Name / Signature &amp; Date</div>
                    </div>
                </div>

                <div className="pop-print-footer-note">
                    This is a computer-generated tax invoice.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>
            </div>
        </div>
    );
};

export default InvoicePrintModal;

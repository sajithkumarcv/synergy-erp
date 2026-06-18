import React from 'react';
import { fmt, fmtDate, numberToWords } from './invoiceConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { BankDetailsBlock, DraftWatermark, PreviewBanner } from '../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../utils/printWindow';
import '../procurement/po/PoPrint.css';   // overlay + toolbar styles
import './InvoicePrint2.css';             // ip2-* document styles

const dash = (v) => (v != null && v !== '') ? v : '—';

/* Inline status badge colours for the banner */
const bannerStatusStyle = (status) => {
    switch (status) {
        case 'Confirmed': return { background: '#0ea5e9', color: '#fff' };
        case 'Paid':      return { background: '#22c55e', color: '#fff' };
        case 'Cancelled': return { background: '#ef4444', color: '#fff' };
        case 'Overdue':   return { background: '#f97316', color: '#fff' };
        default:          return {};   /* uses ip2-banner-status default */
    }
};

const InvoicePrintModal2 = ({ invoice, lines = [], onClose, preview }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.ip2-doc', `Invoice${preview ? ' (DRAFT)' : ''} - ${invoice.invoiceNo}`);

    const subTotal   = lines.reduce((s, l) => s + (l.amount    || 0), 0);
    const taxTotal   = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const grandTotal = subTotal + taxTotal;

    const curr      = invoice.currencyShort || '';
    const vatGroups = [...new Set(lines.map(l => l.vatPercent))].filter(v => v > 0);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Invoice — {invoice.invoiceNo} &nbsp;
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.6)' }}>
                            Format 2 · Modern
                        </span>
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>
                        🖨 Print / Save as PDF
                    </button>
                </div>
            </div>

            {/* ── A4 Document ── */}
            <div className="ip2-doc" style={{ position: 'relative' }}>

                {preview && <DraftWatermark />}
                {preview && <PreviewBanner />}

                {/* 1. Full-width banner */}
                <div className="ip2-banner">
                    <div className="ip2-banner-left">
                        <div className="ip2-banner-company">
                            {coLoading ? '…' : (company?.companyName || '—')}
                        </div>
                        {!preview && (
                            <div className="ip2-banner-addr">
                                {(() => {
                                    const a = company?.addresses?.find(x => x.isPrimary) ?? company?.addresses?.[0];
                                    if (!a) return null;
                                    return [a.addressLine1, a.addressLine2, a.city, a.country].filter(Boolean).join('  ·  ');
                                })()}
                                {company?.phone && <><br />{company.phone}{company.fax ? `   Fax: ${company.fax}` : ''}{company.email ? `   ·   ${company.email}` : ''}</>}
                                {company?.trn   && <><br />TRN: {company.trn}{company.website ? `   ·   ${company.website}` : ''}</>}
                            </div>
                        )}
                    </div>
                    <div className="ip2-banner-right">
                        <div className="ip2-banner-doctype">Tax Invoice</div>
                        <div className="ip2-banner-docno">{invoice.invoiceNo}</div>
                        <span className="ip2-banner-status" style={bannerStatusStyle(invoice.status)}>
                            {invoice.status}
                        </span>
                    </div>
                </div>

                <div className="ip2-body">

                    {/* 2. Bill To + Invoice Meta */}
                    <div className="ip2-top-row">

                        {/* Left: customer */}
                        <div>
                            <div className="ip2-section-label">Bill To</div>
                            <div className="ip2-customer-name">{dash(invoice.customerName)}</div>
                            {invoice.customerVatNo && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">VAT / TRN No:</span>
                                    <span className="ip2-detail-val" style={{ fontFamily: 'Courier New' }}>
                                        {invoice.customerVatNo}
                                    </span>
                                </div>
                            )}
                            {invoice.contactName && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Attention:</span>
                                    <span className="ip2-detail-val">
                                        {invoice.contactName}
                                        {invoice.contactDesignation ? `, ${invoice.contactDesignation}` : ''}
                                    </span>
                                </div>
                            )}
                            {invoice.contactPhone && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Phone:</span>
                                    <span className="ip2-detail-val">{invoice.contactPhone}</span>
                                </div>
                            )}
                            {invoice.contactMobile && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Mobile:</span>
                                    <span className="ip2-detail-val">{invoice.contactMobile}</span>
                                </div>
                            )}
                            {invoice.billingAddress && (
                                <div className="ip2-address-block">{invoice.billingAddress}</div>
                            )}
                        </div>

                        {/* Right: invoice meta */}
                        <div>
                            <div className="ip2-section-label">Invoice Details</div>
                            <div className="ip2-detail-row">
                                <span className="ip2-detail-label">Invoice Date:</span>
                                <span className="ip2-detail-val">{fmtDate(invoice.invoiceDate)}</span>
                            </div>
                            {invoice.dueDate && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Due Date:</span>
                                    <span className="ip2-detail-val">{fmtDate(invoice.dueDate)}</span>
                                </div>
                            )}
                            {invoice.lpoNo && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">LPO / PO No:</span>
                                    <span className="ip2-detail-val" style={{ fontFamily: 'Courier New' }}>
                                        {invoice.lpoNo}
                                    </span>
                                </div>
                            )}
                            {invoice.lpoDate && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">LPO Date:</span>
                                    <span className="ip2-detail-val">{fmtDate(invoice.lpoDate)}</span>
                                </div>
                            )}
                            {invoice.jobId && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Job Ref:</span>
                                    <span className="ip2-detail-val" style={{ fontFamily: 'Courier New' }}>
                                        {invoice.jobId}
                                    </span>
                                </div>
                            )}
                            <div className="ip2-detail-row">
                                <span className="ip2-detail-label">Currency:</span>
                                <span className="ip2-detail-val">
                                    {curr}
                                    {invoice.exchangeRate && invoice.exchangeRate !== 1 && (
                                        <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>
                                            @ {invoice.exchangeRate}
                                        </span>
                                    )}
                                </span>
                            </div>
                            {invoice.createdBy && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Prepared by:</span>
                                    <span className="ip2-detail-val">{invoice.createdBy}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Line Items */}
                    <table className="ip2-table">
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}>#</th>
                                <th>Description</th>
                                <th className="c" style={{ width: 55 }}>UOM</th>
                                <th className="r" style={{ width: 75 }}>Qty</th>
                                <th className="r" style={{ width: 100 }}>Unit Price</th>
                                <th className="r" style={{ width: 105 }}>Amount</th>
                                <th className="r" style={{ width: 52 }}>VAT%</th>
                                <th className="r" style={{ width: 95 }}>Tax</th>
                                <th className="r" style={{ width: 110 }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '18px 0',
                                                              color: '#94a3b8', fontStyle: 'italic' }}>
                                        No line items
                                    </td>
                                </tr>
                            ) : lines.map((l, i) => {
                                const lineTotal = (l.amount || 0) + (l.taxAmount || 0);
                                return (
                                    <tr key={l.invoiceLineId}>
                                        <td style={{ color: '#94a3b8', fontSize: 10 }}>{l.lineNum || i + 1}</td>
                                        <td>
                                            {l.description}
                                            {l.notes && (
                                                <div style={{ fontSize: 10, color: '#64748b',
                                                              fontStyle: 'italic', marginTop: 2 }}>
                                                    {l.notes}
                                                </div>
                                            )}
                                        </td>
                                        <td className="c muted">{l.uomName || '—'}</td>
                                        <td className="r">
                                            {Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </td>
                                        <td className="r">{fmt(l.unitPrice)}</td>
                                        <td className="r">{fmt(l.amount)}</td>
                                        <td className="r muted">{l.vatPercent}%</td>
                                        <td className="r muted">{fmt(l.taxAmount)}</td>
                                        <td className="r bold">{fmt(lineTotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* 4. Totals */}
                    <div className="ip2-totals-wrap">
                        <div className="ip2-totals">
                            <div className="ip2-totals-row">
                                <span className="lbl">Sub Total ({curr})</span>
                                <span className="val">{fmt(subTotal)}</span>
                            </div>
                            {vatGroups.map(vat => {
                                const vatAmt = lines
                                    .filter(l => l.vatPercent === vat)
                                    .reduce((s, l) => s + (l.taxAmount || 0), 0);
                                return (
                                    <div key={vat} className="ip2-totals-row">
                                        <span className="lbl">VAT {vat}%</span>
                                        <span className="val">{fmt(vatAmt)}</span>
                                    </div>
                                );
                            })}
                            {taxTotal === 0 && (
                                <div className="ip2-totals-row">
                                    <span className="lbl">Tax Amount</span>
                                    <span className="val">{fmt(0)}</span>
                                </div>
                            )}
                            <div className="ip2-totals-row grand">
                                <span className="lbl">TOTAL ({curr})</span>
                                <span className="val">{fmt(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* 5. Amount in Words */}
                    <div className="ip2-words">
                        <div className="ip2-words-label">Amount in Words</div>
                        {curr} {numberToWords(grandTotal)}
                        {taxTotal > 0 && (
                            <div style={{ marginTop: 3, fontSize: 11, color: '#475569' }}>
                                (Tax: {curr} {numberToWords(taxTotal)})
                            </div>
                        )}
                    </div>

                    {/* 6. Notes */}
                    {invoice.notes && (
                        <div className="ip2-notes">
                            <div className="ip2-notes-label">Notes / Remarks</div>
                            {invoice.notes}
                        </div>
                    )}

                    {/* 7. Bank Details — from DB */}
                    {company?.banks?.length > 0 && (
                        <BankDetailsBlock banks={company.banks}
                            note={company.printNote}
                            headerBg="#0f4c75" rowAlt="#f0f9ff" />
                    )}

                    {/* 8. Signatures — 2 columns */}
                    <div className="ip2-footer">
                        <div>
                            <div className="ip2-sig-label">Authorised Signature</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">{invoice.createdBy || 'Name / Designation'}</div>
                        </div>
                        <div>
                            <div className="ip2-sig-label">Customer Acknowledgement</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">Name / Signature / Company Stamp</div>
                        </div>
                    </div>

                    {preview && <PreviewBanner />}

                    <div className="ip2-print-note">
                        This is a computer-generated tax invoice.
                        {company?.companyName && <> {company.companyName}</>}
                        {company?.email && <>&nbsp;·&nbsp;{company.email}</>}
                    </div>
                </div>

                {/* Teal accent strip at the bottom */}
                <div className="ip2-accent-strip" />
            </div>
        </div>
    );
};

export default InvoicePrintModal2;

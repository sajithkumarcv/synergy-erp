import React from 'react';
import { fmt, fmtDate, numberToWords } from './invoiceConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { getFileUrl } from '../Variable';
import { BankDetailsBlock, DraftWatermark, PreviewBanner } from '../components/print/PrintCompanyHeader';
import { openPrintWindow } from '../utils/printWindow';
import '../procurement/po/PoPrint.css';   // overlay + toolbar styles
import './InvoicePrint3.css';             // ip3-* document styles

const dash = (v) => (v != null && v !== '') ? v : '—';

/* Collapse a multi-line address into a single flowing line. */
const oneLineAddress = (addr) =>
    (addr || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .join('  ·  ');

const InvoicePrintModal3 = ({ invoice, lines = [], onClose, preview }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.ip3-doc', `Invoice${preview ? ' (DRAFT)' : ''} - ${invoice.invoiceNo}`);

    const subTotal   = lines.reduce((s, l) => s + (l.amount    || 0), 0);
    const taxTotal   = lines.reduce((s, l) => s + (l.taxAmount || 0), 0);
    const grandTotal = subTotal + taxTotal;

    const curr      = invoice.currencyShort || '';
    const vatGroups = [...new Set(lines.map(l => l.vatPercent))].filter(v => v > 0);

    // Company identity line under the name (address + tax ids), compact
    const primaryAddr = company?.addresses?.find(a => a.isPrimary) ?? company?.addresses?.[0];
    const companyMeta = [
        primaryAddr && [primaryAddr.addressLine1, primaryAddr.addressLine2,
                        primaryAddr.city, primaryAddr.country].filter(Boolean).join(', '),
        company?.gstNo && `GSTIN: ${company.gstNo}`,
        company?.trn   && `TRN: ${company.trn}`,
    ].filter(Boolean).join('  ·  ');

    const logoSrc = company?.logoPath ? getFileUrl(company.logoPath) : null;

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Invoice — {invoice.invoiceNo} &nbsp;
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.6)' }}>
                            Format 3 · Compact
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
            <div className="ip3-doc" style={{ position: 'relative' }}>

                {preview && <DraftWatermark />}
                {preview && <PreviewBanner />}

                {/* 1. Compact banner — logo + identity | doc type / no / status */}
                <div className="ip3-banner">
                    <div className="ip3-brand">
                        {logoSrc && <img src={logoSrc} alt="Logo" className="ip3-logo" />}
                        <div className="ip3-brand-text">
                            <div className="ip3-banner-company">
                                {coLoading ? '…' : (company?.companyName || '—')}
                            </div>
                            {!preview && companyMeta && (
                                <div className="ip3-banner-meta">{companyMeta}</div>
                            )}
                        </div>
                    </div>
                    <div className="ip3-banner-right">
                        <div className="ip3-banner-doctype">Tax Invoice</div>
                        <div className="ip3-banner-docno">{invoice.invoiceNo}</div>
                    </div>
                </div>

                <div className="ip3-body">

                    {/* 2. Bill To + Invoice Details — compact, equal-weight columns */}
                    <div className="ip3-parties">

                        {/* Left: customer */}
                        <div>
                            <div className="ip3-party-label">Bill To</div>
                            <div className="ip3-customer-name">{dash(invoice.customerName)}</div>
                            {invoice.customerVatNo && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">GST No</span>
                                    <span className="ip3-kv-val mono">{invoice.customerVatNo}</span>
                                </div>
                            )}
                            {invoice.contactName && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">Attention</span>
                                    <span className="ip3-kv-val">
                                        {invoice.contactName}
                                        {invoice.contactDesignation ? `, ${invoice.contactDesignation}` : ''}
                                    </span>
                                </div>
                            )}
                            {(invoice.contactPhone || invoice.contactMobile) && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">Phone</span>
                                    <span className="ip3-kv-val">
                                        {[invoice.contactPhone, invoice.contactMobile].filter(Boolean).join(' · ')}
                                    </span>
                                </div>
                            )}
                            {invoice.billingAddress && (
                                <div className="ip3-address">{oneLineAddress(invoice.billingAddress)}</div>
                            )}
                        </div>

                        {/* Right: invoice meta */}
                        <div>
                            <div className="ip3-party-label">Invoice Details</div>
                            <div className="ip3-kv">
                                <span className="ip3-kv-label">Invoice Date</span>
                                <span className="ip3-kv-val">{fmtDate(invoice.invoiceDate)}</span>
                            </div>
                            {invoice.dueDate && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">Due Date</span>
                                    <span className="ip3-kv-val">{fmtDate(invoice.dueDate)}</span>
                                </div>
                            )}
                            {invoice.lpoNo && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">LPO / PO No</span>
                                    <span className="ip3-kv-val mono">{invoice.lpoNo}</span>
                                </div>
                            )}
                            {invoice.lpoDate && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">LPO Date</span>
                                    <span className="ip3-kv-val">{fmtDate(invoice.lpoDate)}</span>
                                </div>
                            )}
                            {invoice.jobId && (
                                <div className="ip3-kv">
                                    <span className="ip3-kv-label">Job Ref</span>
                                    <span className="ip3-kv-val mono">{invoice.jobId}</span>
                                </div>
                            )}
                            <div className="ip3-kv">
                                <span className="ip3-kv-label">Currency</span>
                                <span className="ip3-kv-val">
                                    {curr}
                                    {invoice.exchangeRate && invoice.exchangeRate !== 1 && (
                                        <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>
                                            @ {invoice.exchangeRate}
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 3. Line Items */}
                    <table className="ip3-table">
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
                    <div className="ip3-totals-wrap">
                        <div className="ip3-totals">
                            <div className="ip3-totals-row">
                                <span className="lbl">Sub Total ({curr})</span>
                                <span className="val">{fmt(subTotal)}</span>
                            </div>
                            {vatGroups.map(vat => {
                                const vatAmt = lines
                                    .filter(l => l.vatPercent === vat)
                                    .reduce((s, l) => s + (l.taxAmount || 0), 0);
                                return (
                                    <div key={vat} className="ip3-totals-row">
                                        <span className="lbl">VAT {vat}%</span>
                                        <span className="val">{fmt(vatAmt)}</span>
                                    </div>
                                );
                            })}
                            {taxTotal === 0 && (
                                <div className="ip3-totals-row">
                                    <span className="lbl">Tax Amount</span>
                                    <span className="val">{fmt(0)}</span>
                                </div>
                            )}
                            <div className="ip3-totals-row grand">
                                <span className="lbl">TOTAL ({curr})</span>
                                <span className="val">{fmt(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* 5. Amount in Words */}
                    <div className="ip3-words">
                        <div className="ip3-words-label">Amount in Words</div>
                        {curr} {numberToWords(grandTotal)}
                        {taxTotal > 0 && (
                            <div style={{ marginTop: 3, fontSize: 11, color: '#475569' }}>
                                (Tax: {curr} {numberToWords(taxTotal)})
                            </div>
                        )}
                    </div>

                    {/* 6. Notes */}
                    {invoice.notes && (
                        <div className="ip3-notes">
                            <div className="ip3-notes-label">Notes / Remarks</div>
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
                    <div className="ip3-footer">
                        <div>
                            <div className="ip3-sig-label">Authorised Signature</div>
                            <div className="ip3-sig-line" />
                            <div className="ip3-sig-sub">Name / Designation</div>
                        </div>
                        <div>
                            <div className="ip3-sig-label">Customer Acknowledgement</div>
                            <div className="ip3-sig-line" />
                            <div className="ip3-sig-sub">Name / Signature / Company Stamp</div>
                        </div>
                    </div>

                    {preview && <PreviewBanner />}

                    <div className="ip3-print-note">
                        This is a computer-generated tax invoice.
                        {company?.companyName && <> {company.companyName}</>}
                        {company?.email && <>&nbsp;·&nbsp;{company.email}</>}
                    </div>
                </div>

                {/* Teal accent strip at the bottom */}
                <div className="ip3-accent-strip" />
            </div>
        </div>
    );
};

export default InvoicePrintModal3;

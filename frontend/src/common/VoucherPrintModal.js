import React from 'react';
import { fmt, fmtDate } from '../procurement/procurementConstants';
import useOwnerCompany from '../hooks/useOwnerCompany';
import { openPrintWindow } from '../utils/printWindow';
import '../procurement/po/PoPrint.css';      // overlay + toolbar styles + page footer
import '../invoice/InvoicePrint2.css';        // ip2-* document styles (reused)

// ── VoucherPrintModal ────────────────────────────────────────────────────────
// One component used by Receipt Voucher, Payment Voucher, Credit Note and Debit Note.
//   kind = 'RV' → Receipt Voucher  (cash in from customer)
//   kind = 'PV' → Payment Voucher  (cash out to supplier)
//   kind = 'CN' → Credit Note      (credit issued to customer)
//   kind = 'DN' → Debit Note       (debit raised on supplier)
//
// Props:
//   voucher  – the header object as returned by the detail SP
//   allocs   – list of allocations [{ allocationId, invoiceNo, invoiceDate, invoiceTotal,
//                                     allocatedAmount, supplierInvRef?, poNumber?, jobId?, reason? }]
//   onClose
const VoucherPrintModal = ({ kind, voucher, allocs = [], onClose }) => {
    const { company, loading: coLoading } = useOwnerCompany();

    const isRV = kind === 'RV';
    const isPV = kind === 'PV';
    const isCN = kind === 'CN';
    const isDN = kind === 'DN';

    const isCustomerSide   = isRV || isCN;   // allocate against customer invoices
    const isPaymentVoucher = isRV || isPV;   // has payment-mode / reference fields
    const isNote           = isCN || isDN;   // credit / debit note

    const cfg = {
        RV: { docNo: voucher.rvNumber, docDate: voucher.rvDate, amount: voucher.amountReceived,
              party: voucher.customerName, partyLabel: 'Received From', docTypeLabel: 'Receipt Voucher', verb: 'received from' },
        PV: { docNo: voucher.pvNumber, docDate: voucher.pvDate, amount: voucher.amountPaid,
              party: voucher.supplierName, partyLabel: 'Paid To', docTypeLabel: 'Payment Voucher', verb: 'paid to' },
        CN: { docNo: voucher.cnNumber, docDate: voucher.cnDate, amount: voucher.creditAmount,
              party: voucher.customerName, partyLabel: 'Credit To', docTypeLabel: 'Credit Note', verb: 'credited to' },
        DN: { docNo: voucher.dnNumber, docDate: voucher.dnDate, amount: voucher.debitAmount,
              party: voucher.supplierName, partyLabel: 'Debit To', docTypeLabel: 'Debit Note', verb: 'debited to' },
    }[kind] || {};

    const { docNo, docDate, amount, party, partyLabel, docTypeLabel, verb } = cfg;
    const noteType = isCN ? voucher.creditType : voucher.debitType;
    const curr = voucher.currencyShort || '';
    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.ip2-doc', `${docTypeLabel} - ${docNo}`);

    const totalAlloc = allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0);
    const unalloc    = Math.max(0, Number(amount || 0) - totalAlloc);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>
            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">
                        🖨 {docTypeLabel} — {docNo}
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
            <div className="ip2-doc">

                {/* Banner */}
                <div className="ip2-banner">
                    <div className="ip2-banner-left">
                        <div className="ip2-banner-company">
                            {coLoading ? '…' : (company?.companyName || '—')}
                        </div>
                        <div className="ip2-banner-addr">
                            {(() => {
                                const a = company?.addresses?.find(x => x.isPrimary) ?? company?.addresses?.[0];
                                if (!a) return null;
                                return [a.addressLine1, a.addressLine2, a.city, a.country].filter(Boolean).join('  ·  ');
                            })()}
                            {company?.phone && <><br />{company.phone}{company.fax ? `   Fax: ${company.fax}` : ''}{company.email ? `   ·   ${company.email}` : ''}</>}
                            {company?.trn   && <><br />TRN: {company.trn}{company.website ? `   ·   ${company.website}` : ''}</>}
                        </div>
                    </div>
                    <div className="ip2-banner-right">
                        <div className="ip2-banner-doctype">{docTypeLabel}</div>
                        <div className="ip2-banner-docno">{docNo}</div>
                        <span className="ip2-banner-status">{voucher.status}</span>
                    </div>
                </div>

                <div className="ip2-body" style={{ display: 'flex', flexDirection: 'column' }}>

                    {/* Party + Meta */}
                    <div className="ip2-top-row">
                        <div>
                            <div className="ip2-section-label">{partyLabel}</div>
                            <div className="ip2-customer-name">{party || '—'}</div>
                            {(voucher.customerAddress || voucher.supplierAddress) && (
                                <div className="ip2-address-block">
                                    {voucher.customerAddress || voucher.supplierAddress}
                                </div>
                            )}
                            {isPaymentVoucher && voucher.bankName && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Bank:</span>
                                    <span className="ip2-detail-val">{voucher.bankName}</span>
                                </div>
                            )}
                            {isNote && voucher.reason && (
                                <div className="ip2-address-block"><strong>Reason:</strong> {voucher.reason}</div>
                            )}
                            {voucher.notes && (
                                <div className="ip2-address-block">{voucher.notes}</div>
                            )}
                        </div>

                        <div>
                            <div className="ip2-section-label">
                                {isNote ? `${docTypeLabel} Details` : 'Voucher Details'}
                            </div>
                            <div className="ip2-detail-row">
                                <span className="ip2-detail-label">Date:</span>
                                <span className="ip2-detail-val">{fmtDate(docDate)}</span>
                            </div>

                            {isPaymentVoucher && (
                                <>
                                    <div className="ip2-detail-row">
                                        <span className="ip2-detail-label">Payment Mode:</span>
                                        <span className="ip2-detail-val">{voucher.paymentMode || '—'}</span>
                                    </div>
                                    {voucher.referenceNo && (
                                        <div className="ip2-detail-row">
                                            <span className="ip2-detail-label">
                                                {voucher.paymentMode?.toLowerCase() === 'cheque' ? 'Cheque No:' : 'Reference No:'}
                                            </span>
                                            <span className="ip2-detail-val" style={{ fontFamily: 'Courier New' }}>
                                                {voucher.referenceNo}
                                            </span>
                                        </div>
                                    )}
                                    {voucher.referenceDate && (
                                        <div className="ip2-detail-row">
                                            <span className="ip2-detail-label">Reference Date:</span>
                                            <span className="ip2-detail-val">{fmtDate(voucher.referenceDate)}</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {isNote && noteType && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">{isCN ? 'Credit Type:' : 'Debit Type:'}</span>
                                    <span className="ip2-detail-val">{noteType}</span>
                                </div>
                            )}

                            <div className="ip2-detail-row">
                                <span className="ip2-detail-label">Currency:</span>
                                <span className="ip2-detail-val">
                                    {curr}
                                    {voucher.exchangeRate && voucher.exchangeRate !== 1 && (
                                        <span style={{ color: '#64748b', fontSize: 10, marginLeft: 4 }}>
                                            @ {voucher.exchangeRate}
                                        </span>
                                    )}
                                </span>
                            </div>
                            {voucher.createdBy && (
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Prepared by:</span>
                                    <span className="ip2-detail-val">{voucher.createdBy}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Big amount line */}
                    <div style={{
                        marginTop: 14, padding: '14px 16px',
                        border: '1px solid #e2e8f0', borderRadius: 6,
                        background: '#f8fafc', display: 'flex',
                        justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>
                            Amount {verb} <strong>{party || '—'}</strong>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: 'Courier New' }}>
                            {curr} {fmt(amount)}
                        </div>
                    </div>

                    {/* Allocations table */}
                    <table className="ip2-table" style={{ marginTop: 14 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}>#</th>
                                <th>{isCustomerSide ? 'Invoice No' : 'Supplier Invoice'}</th>
                                {!isCustomerSide && <th>Supplier Ref</th>}
                                <th>Date</th>
                                {!isCustomerSide && <th>PO</th>}
                                {!isCustomerSide && <th>Job</th>}
                                <th className="r" style={{ width: 110 }}>Invoice Total</th>
                                <th className="r" style={{ width: 110 }}>{isNote ? 'Applied' : 'Allocated'}</th>
                                {!isCustomerSide && <th>Reason</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {allocs.length === 0 ? (
                                <tr><td colSpan={isCustomerSide ? 5 : 8} style={{ textAlign: 'center', padding: '18px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No invoices allocated against this {docTypeLabel.toLowerCase()}.
                                </td></tr>
                            ) : allocs.map((a, i) => (
                                <tr key={a.allocationId}>
                                    <td>{i + 1}</td>
                                    <td style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{a.invoiceNo || '—'}</td>
                                    {!isCustomerSide && <td style={{ fontFamily: 'Courier New' }}>{a.supplierInvRef || '—'}</td>}
                                    <td>{fmtDate(a.invoiceDate)}</td>
                                    {!isCustomerSide && <td style={{ fontFamily: 'Courier New' }}>{a.poNumber || (a.siCoversPoNumbers ? `auto · ${a.siCoversPoNumbers}` : '—')}</td>}
                                    {!isCustomerSide && <td style={{ fontFamily: 'Courier New' }}>{a.jobId || '—'}</td>}
                                    <td className="r">{fmt(a.invoiceTotal)}</td>
                                    <td className="r" style={{ fontWeight: 700 }}>{fmt(a.allocatedAmount)}</td>
                                    {!isCustomerSide && <td style={{ fontSize: 10, color: '#475569' }}>{a.reason || '—'}</td>}
                                </tr>
                            ))}
                        </tbody>
                        {allocs.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan={isCustomerSide ? 4 : 7} style={{ textAlign: 'right', fontWeight: 600, padding: '6px 8px' }}>
                                        {isNote ? 'Total Applied' : 'Total Allocated'}
                                    </td>
                                    <td className="r" style={{ fontWeight: 700 }}>{fmt(totalAlloc)}</td>
                                    {!isCustomerSide && <td />}
                                </tr>
                                {unalloc > 0 && (
                                    <tr>
                                        <td colSpan={isCustomerSide ? 4 : 7} style={{ textAlign: 'right', fontWeight: 600, padding: '6px 8px', color: '#92400e' }}>
                                            Unallocated
                                        </td>
                                        <td className="r" style={{ fontWeight: 700, color: '#92400e' }}>{fmt(unalloc)}</td>
                                        {!isCustomerSide && <td />}
                                    </tr>
                                )}
                            </tfoot>
                        )}
                    </table>

                    <div style={{ flex: 1 }} />

                    {/* Signatures — pinned to page bottom in print (margin-top:auto) */}
                    <div className="print-signatures" style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 20, paddingTop: 26, borderTop: '2px solid #0f4c75', marginTop: 28,
                    }}>
                        <div>
                            <div className="ip2-sig-label">Prepared by</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">{voucher.createdBy || 'Name / Signature'}</div>
                        </div>
                        <div>
                            <div className="ip2-sig-label">Authorised by</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">{voucher.finalActionBy || voucher.postedBy || 'Name / Signature'}</div>
                        </div>
                        <div>
                            <div className="ip2-sig-label">{isCustomerSide ? 'Received By' : 'Acknowledged By'}</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">Signature &amp; Date</div>
                        </div>
                    </div>

                    {/* Footer note (captured to per-page footer via CSS string-set) */}
                    <div className="ip2-print-note">
                        This is a computer-generated {docTypeLabel.toLowerCase()}.
                        {company?.companyName && <> {company.companyName}</>}
                        {company?.email && <>&nbsp;·&nbsp;{company.email}</>}
                    </div>
                </div>

                <div className="ip2-accent-strip" />
            </div>
        </div>
    );
};

export default VoucherPrintModal;

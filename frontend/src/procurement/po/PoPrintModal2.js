import React, { useState, useEffect, useMemo } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../procurementConstants';
import { numberToWords } from '../../invoice/invoiceConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { BankDetailsBlock, DraftWatermark, PreviewBanner } from '../../components/print/PrintCompanyHeader';
import consolidatePoLinesForPrint from './consolidatePoLinesForPrint';
import { openPrintWindow } from '../../utils/printWindow';
import './PoPrint.css';                       // overlay + toolbar
import '../../invoice/InvoicePrint2.css';     // ip2-* document styles (reused)

// ── Helpers ───────────────────────────────────────────────────
const n    = (v) => fmt(v ?? 0);
const dash = (v) => (v != null && v !== '') ? v : '—';

// ── Info row (label : value) ──────────────────────────────────
const InfoRow = ({ label, value, mono }) => {
    if (value == null || value === '') return null;
    return (
        <div className="ip2-detail-row">
            <span className="ip2-detail-label">{label}:</span>
            <span className="ip2-detail-val" style={mono ? { fontFamily: 'Courier New' } : {}}>
                {value}
            </span>
        </div>
    );
};

// ── Flag chip (document requirement / note flags) ─────────────
const FlagChip = ({ on, label }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 9px', borderRadius: 10, fontSize: 10, fontWeight: 600,
        background: on ? '#dcfce7' : '#f1f5f9',
        color:      on ? '#166534' : '#94a3b8',
        border:     `1px solid ${on ? '#bbf7d0' : '#e2e8f0'}`,
        marginRight: 4, marginBottom: 4,
    }}>
        {on ? '✓' : '✗'} {label}
    </span>
);

// ── Section divider ───────────────────────────────────────────
const SectionHeading = ({ label }) => (
    <div style={{
        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em',
        color: '#0f4c75', marginBottom: 8,
    }}>
        {label}
    </div>
);

// ══════════════════════════════════════════════════════════════
const PoPrintModal2 = ({ po, onClose, preview }) => {
    const [lines,        setLines]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [annexures,    setAnnexures]    = useState([]);  // [{ annexureId, annexureCode, title, notes, details:[], linkedLineIds:[] }]
    const { company, loading: coLoading } = useOwnerCompany();

    useEffect(() => {
        fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));

        // Annexures (header + spec rows + line links) — added later so older
        // PRs that have no annexures don't pay the extra fetch cost. The print
        // simply omits the annexure pages when this comes back empty.
        fetch(`${variables.API_URL}purchaseorder/${po.poId}/annexures`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { headers: [], details: [], links: [] })
            .then(d => {
                const headers = d.headers || [];
                const detailsByAnnex = {};
                (d.details || []).forEach(x => { (detailsByAnnex[x.annexureId] ??= []).push(x); });
                const linksByAnnex = {};
                (d.links || []).forEach(x => { (linksByAnnex[x.annexureId] ??= []).push(x.poLineId); });
                setAnnexures(headers.map(h => ({
                    ...h,
                    details:       (detailsByAnnex[h.annexureId] || []).sort((a, b) => a.lineNum - b.lineNum),
                    linkedLineIds: linksByAnnex[h.annexureId] || [],
                })));
            })
            .catch(() => setAnnexures([]));
    }, [po.poId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.ip2-doc', `Purchase Order${preview ? ' (DRAFT)' : ''} - ${po.poNumber}`);

    // Vendor-facing consolidation — see comments in PoPrintModal.js. Internal
    // PR↔PO traceability is preserved on the DB rows; this only affects what
    // the vendor sees on the printed PO.
    const printLines = useMemo(() => consolidatePoLinesForPrint(lines), [lines]);

    // ── Computed totals ───────────────────────────────────────
    const subtotal   = po.linesSubTotal ?? lines.reduce((s, l) => s + (l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0), 0);
    const discount   = po.discount > 0 ? subtotal * po.discount / 100 : 0;
    const taxAmt     = po.taxAmount    ?? lines.reduce((s, l) => {
        const base = l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0;
        return s + base * (l.taxPct ?? 0) / 100;
    }, 0);
    const grandTotal = po.totalAmount  ?? (subtotal - discount + taxAmt);

    const supplierName = po.supplierNameResolved || po.vendorName || '—';
    const currency     = po.currencyShort || po.currencyName || '';

    // ── Doc requirement + note flags ─────────────────────────
    const docFlags = [
        { key: 'isWarranty',      label: 'Warranty'              },
        { key: 'isPreInspection', label: 'Pre-Inspection'        },
        { key: 'isShipping',      label: 'Shipping Docs'         },
        { key: 'isCOO',           label: 'Cert. of Origin'       },
        { key: 'isDrawing',       label: 'Drawing'               },
        { key: 'isMTC',           label: 'Mill Test Certificate' },
        { key: 'isQtn',           label: 'Quotation'             },
        { key: 'isOthers',        label: 'Others'                },
    ];
    const noteFlags = [
        { key: 'isNote1', label: 'Note 1' },
        { key: 'isNote2', label: 'Note 2' },
        { key: 'isNote3', label: 'Note 3' },
    ];
    const anyDocFlag  = docFlags.some(f => po[f.key]);
    const anyNoteFlag = noteFlags.some(f => po[f.key]);

    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">
                        🖨 Purchase Order — {po.poNumber}&nbsp;
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

                {/* ══ 1. Full-width banner ══════════════════════════════════ */}
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
                                {(company?.gstNo || company?.pan || company?.cin || company?.trn || company?.website) && (
                                    <><br />
                                    {[
                                        company.gstNo && `GSTIN: ${company.gstNo}`,
                                        company.pan   && `PAN: ${company.pan}`,
                                        company.cin   && `CIN: ${company.cin}`,
                                        company.trn   && `TRN: ${company.trn}`,
                                        company.website,
                                    ].filter(Boolean).join('   ·   ')}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="ip2-banner-right">
                        <div className="ip2-banner-doctype">Purchase Order</div>
                        <div className="ip2-banner-docno">
                            {po.poNumber}
                            {po.revision > 0 && (
                                <span style={{ fontSize: 11, color: '#fca5a5', marginLeft: 8, fontWeight: 600 }}>
                                    Rev.{po.revision}
                                </span>
                            )}
                        </div>
                        {po.priority && (
                            <span style={{
                                marginLeft: 6, display: 'inline-block', padding: '2px 10px',
                                borderRadius: 20, fontSize: 10, fontWeight: 700,
                                background: po.priority === 'Urgent' ? '#fca5a5' :
                                            po.priority === 'High'   ? '#fed7aa' : 'rgba(255,255,255,.15)',
                                color:      po.priority === 'Urgent' ? '#7f1d1d' :
                                            po.priority === 'High'   ? '#78350f' : '#e0f2fe',
                            }}>
                                ⚡ {po.priority}
                            </span>
                        )}
                    </div>
                </div>

                <div className="ip2-body">

                    {/* ══ 2. Supplier + PO Details ══════════════════════════ */}
                    <div className="ip2-top-row">

                        {/* Left: Supplier / Vendor */}
                        <div>
                            <SectionHeading label="Supplier / Vendor" />
                            <div className="ip2-customer-name">{dash(supplierName)}</div>
                            {po.supplierAddress && (
                                <div style={{ fontSize: 11, color: '#475569', margin: '2px 0 6px', lineHeight: 1.5 }}>
                                    {po.supplierAddress}
                                </div>
                            )}
                            <InfoRow label="Contact"   value={po.contactName} />
                            <InfoRow label="Phone"     value={po.contactMobile || po.contactPhone} mono />
                            <InfoRow label="Email"     value={po.contactEmail} />
                        </div>

                        {/* Right: PO meta */}
                        <div>
                            <SectionHeading label="Order Details" />
                            <InfoRow label="PO Date"         value={fmtDate(po.poDate)} />
                            <InfoRow label="Vendor Quote Ref" value={po.vendorRef}   mono />
                            <InfoRow label="Quote Date"      value={fmtDate(po.vendorQuoteDate)} />
                            <InfoRow label="Currency"      value={currency} />
                            <InfoRow label="Payment Terms" value={
                                // "Other" is just a bucket — print the actual terms the user typed.
                                (po.paymentTermCode === 'OTHER' && po.paymentTermsOther)
                                    ? po.paymentTermsOther : po.paymentTermName
                            } />
                            <InfoRow label="Job Ref"       value={po.jobId || null} mono />
                            {po.discount > 0 && <InfoRow label="Discount" value={`${po.discount}%`} />}
                            <InfoRow label="Raised by"     value={po.createdBy} />

                            {/* Delivery sub-section */}
                            <div style={{ marginTop: 10 }}>
                                <SectionHeading label="Delivery" />
                                <InfoRow label="Delivery Terms" value={po.deliveryTerms} />
                                <InfoRow label="Delivery Addr"  value={po.deliveryAddr} />
                                <div className="ip2-detail-row">
                                    <span className="ip2-detail-label">Deliver to:</span>
                                    <span className="ip2-detail-val">{company?.companyName || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ══ 3. Approval / Audit strip ═════════════════════════ */}
                    {(po.approvedBy || po.holdBy || po.modifiedBy || po.createdBy) && (
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 0,
                            border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden',
                            marginBottom: 20, background: '#f8fafc',
                        }}>
                            {po.createdBy && (
                                <div style={{ flex: 1, minWidth: 150, padding: '7px 14px', borderRight: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#64748b' }}>Created by</div>
                                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b' }}>{po.createdBy}</div>
                                    {po.createdDate && <div style={{ fontSize: 10, color: '#64748b' }}>{fmtDate(po.createdDate)}</div>}
                                </div>
                            )}
                            {po.approvedBy && (
                                <div style={{ flex: 1, minWidth: 150, padding: '7px 14px', borderRight: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#166534' }}>Approved by</div>
                                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#166534' }}>{po.approvedBy}</div>
                                    {po.approvedDate && <div style={{ fontSize: 10, color: '#64748b' }}>{fmtDate(po.approvedDate)}</div>}
                                </div>
                            )}
                            {po.holdBy && (
                                <div style={{ flex: 1, minWidth: 150, padding: '7px 14px', borderRight: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#dc2626' }}>On Hold by</div>
                                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#dc2626' }}>{po.holdBy}</div>
                                    {po.holdDate && <div style={{ fontSize: 10, color: '#64748b' }}>{fmtDate(po.holdDate)}</div>}
                                </div>
                            )}
                            {po.modifiedBy && (
                                <div style={{ flex: 1, minWidth: 150, padding: '7px 14px' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#64748b' }}>Last Modified by</div>
                                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b' }}>{po.modifiedBy}</div>
                                    {po.modifiedDate && <div style={{ fontSize: 10, color: '#64748b' }}>{fmtDate(po.modifiedDate)}</div>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ 4. Line items table ═══════════════════════════════ */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                            Loading lines…
                        </div>
                    ) : (
                        <table className="ip2-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 28 }}>#</th>
                                    <th style={{ width: 88 }}>Code</th>
                                    <th>Description</th>
                                    <th className="c" style={{ width: 55 }}>UOM</th>
                                    <th className="r" style={{ width: 68 }}>Qty</th>
                                    <th className="r" style={{ width: 95 }}>Unit Price</th>
                                    <th className="r" style={{ width: 48 }}>Tax%</th>
                                    <th className="r" style={{ width: 96 }}>Line Total</th>
                                    <th className="r" style={{ width: 100 }}>Total+Tax</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printLines.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', padding: '18px 0',
                                                                  color: '#94a3b8', fontStyle: 'italic' }}>
                                            No items
                                        </td>
                                    </tr>
                                ) : printLines.map((l, i) => {
                                    const lineTotal    = l.lineTotal        ?? (l.orderedQty * l.unitPrice);
                                    const lineTotalTax = l.lineTotalWithTax ?? (lineTotal + lineTotal * (l.taxPct ?? 0) / 100);
                                    // Annexures this line is covered by — used to auto-suffix
                                    // the description with "(See Annexure-A, B…)".
                                    const linkedCodes = annexures
                                        .filter(a => a.linkedLineIds.includes(l.poLineId))
                                        .map(a => a.annexureCode);
                                    return (
                                        <tr key={`${l.poLineId}-${i}`}>
                                            <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f4c75' }}>
                                                {l.itemCode || '—'}
                                            </td>
                                            <td>
                                                <div>
                                                    {l.itemDesc || l.itemName || '—'}
                                                    {linkedCodes.length > 0 && (
                                                        <span style={{
                                                            marginLeft: 6, fontSize: 10, fontWeight: 600,
                                                            color: '#1e40af', background: '#dbeafe',
                                                            padding: '1px 6px', borderRadius: 3,
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            See Annexure-{linkedCodes.join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                                {l.itemNameAr && (
                                                    <div style={{ fontSize: 10, color: '#64748b', direction: 'rtl' }}>
                                                        {l.itemNameAr}
                                                    </div>
                                                )}
                                                {l.remarks && (
                                                    <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>
                                                        {l.remarks}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="c muted">{l.uomName || '—'}</td>
                                            <td className="r">{l.orderedQty}</td>
                                            <td className="r">{n(l.unitPrice)}</td>
                                            <td className="r muted">{l.taxPct ?? 0}%</td>
                                            <td className="r bold">{n(lineTotal)}</td>
                                            <td className="r bold" style={{ color: '#0f4c75' }}>{n(lineTotalTax)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* ══ 5. Totals ═════════════════════════════════════════ */}
                    <div className="ip2-totals-wrap">
                        <div className="ip2-totals">
                            <div className="ip2-totals-row">
                                <span className="lbl">Subtotal {currency && `(${currency})`}</span>
                                <span className="val">{n(subtotal)}</span>
                            </div>
                            {discount > 0 && (
                                <div className="ip2-totals-row">
                                    <span className="lbl">Discount ({po.discount}%)</span>
                                    <span className="val" style={{ color: '#dc2626' }}>− {n(discount)}</span>
                                </div>
                            )}
                            {taxAmt > 0 && (
                                <div className="ip2-totals-row">
                                    <span className="lbl">Tax Amount</span>
                                    <span className="val">{n(taxAmt)}</span>
                                </div>
                            )}
                            <div className="ip2-totals-row grand">
                                <span className="lbl">TOTAL {currency && `(${currency})`}</span>
                                <span className="val">{n(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ══ 6. Amount in Words ════════════════════════════════ */}
                    <div className="ip2-words">
                        <div className="ip2-words-label">Amount in Words</div>
                        {currency} {numberToWords(grandTotal)}
                        {taxAmt > 0 && (
                            <div style={{ marginTop: 3, fontSize: 11, color: '#475569' }}>
                                (Tax: {currency} {numberToWords(taxAmt)})
                            </div>
                        )}
                    </div>

                    {/* ══ 7. Document requirements + Note flags ════════════ */}
                    {(anyDocFlag || anyNoteFlag) && (
                        <div style={{
                            border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '12px 16px', background: '#f8fafc',
                            marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16,
                        }}>
                            {anyDocFlag && (
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                                  letterSpacing: '.07em', color: '#0f4c75',
                                                  marginBottom: 8, paddingBottom: 4,
                                                  borderBottom: '1px solid #e2e8f0' }}>
                                        Document Requirements
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                        {docFlags.map(f => <FlagChip key={f.key} on={!!po[f.key]} label={f.label} />)}
                                    </div>
                                </div>
                            )}
                            {anyNoteFlag && (
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                                  letterSpacing: '.07em', color: '#0f4c75',
                                                  marginBottom: 8, paddingBottom: 4,
                                                  borderBottom: '1px solid #e2e8f0' }}>
                                        Notes / Conditions
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                                        {noteFlags.map(f => <FlagChip key={f.key} on={!!po[f.key]} label={f.label} />)}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══ 8. Free-text notes ═══════════════════════════════ */}
                    {po.notes && (
                        <div className="ip2-notes">
                            <div className="ip2-notes-label">Notes / Terms &amp; Conditions</div>
                            {po.notes}
                        </div>
                    )}

                    {/* ══ 9. Invoice received flag ══════════════════════════ */}
                    {po.invoiceReceived && (
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                            borderRadius: 6, padding: '7px 14px', marginBottom: 20,
                            fontSize: 12, color: '#166534', fontWeight: 600,
                        }}>
                            ✓ Supplier invoice received
                        </div>
                    )}

                    {/* ══ 10. Bank Details ═════════════════════════════════ */}
                    {company?.banks?.length > 0 && (
                        <BankDetailsBlock banks={company.banks}
                            note={company.printNote}
                            headerBg="#0f4c75" rowAlt="#f0f9ff" />
                    )}

                    {/* ══ 11. Signatures — 3 columns ═══════════════════════ */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 20, paddingTop: 16,
                        borderTop: '2px solid #0f4c75', marginTop: 8,
                    }}>
                        <div>
                            <div className="ip2-sig-label">Prepared by</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">{po.createdBy || 'Name / Signature'}</div>
                        </div>
                        <div>
                            <div className="ip2-sig-label">Approved / Authorised by</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">{po.approvedBy || 'Name / Signature'}</div>
                        </div>
                        <div>
                            <div className="ip2-sig-label">Supplier Acknowledgement</div>
                            <div className="ip2-sig-line" />
                            <div className="ip2-sig-sub">Signature &amp; Date</div>
                        </div>
                    </div>

                    {preview && <PreviewBanner />}

                    <div className="ip2-print-note">
                        This is a computer-generated purchase order.
                        {company?.companyName && <> {company.companyName}</>}
                        {company?.email && <>&nbsp;·&nbsp;{company.email}</>}
                    </div>
                </div>

                {/* ══ ANNEXURES — one per printed page (sibling of .ip2-body so
                       Chromium honours the page-break out of the padded body box) ══ */}
                {annexures.map(a => {
                    const linkedLineNums = a.linkedLineIds
                        .map(id => printLines.findIndex(l => l.poLineId === id) + 1)
                        .filter(n => n > 0)
                        .sort((x, y) => x - y);
                    return (
                        <div key={a.annexureId} style={{
                            pageBreakBefore: 'always', breakBefore: 'page',
                            padding: '28px 40px 36px',
                        }}>
                            <div style={{
                                background: '#0f4c75', color: '#fff',
                                padding: '8px 14px', marginBottom: 12, borderRadius: 4,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.04em' }}>
                                    ANNEXURE-{a.annexureCode}
                                    {a.title ? <span style={{ fontWeight: 500, marginLeft: 8, opacity: .85 }}>— {a.title}</span> : null}
                                </span>
                                <span style={{ fontSize: 10.5, opacity: .8 }}>
                                    {po.poNumber}
                                </span>
                            </div>

                            {a.notes && (
                                <div style={{
                                    padding: '10px 14px', marginBottom: 12,
                                    border: '1px solid #e2e8f0', background: '#f8fafc',
                                    borderRadius: 4, fontSize: 12, color: '#334155',
                                    whiteSpace: 'pre-wrap',
                                }}>{a.notes}</div>
                            )}

                            {a.details.length > 0 && (
                                <table className="ip2-table" style={{ marginBottom: 12 }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}>#</th>
                                            <th>Description</th>
                                            <th style={{ width: 220 }}>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {a.details.map(d => (
                                            <tr key={d.annexureDetailId}>
                                                <td style={{ textAlign: 'center', color: '#64748b' }}>{d.lineNum}</td>
                                                <td style={{ whiteSpace: 'pre-wrap' }}>{d.description || '—'}</td>
                                                <td style={{ color: '#475569' }}>{d.remarks || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {linkedLineNums.length > 0 && (
                                <div style={{
                                    marginTop: 8, padding: '8px 12px',
                                    background: '#eff6ff', border: '1px solid #bfdbfe',
                                    borderRadius: 4, fontSize: 11.5, color: '#1e40af',
                                }}>
                                    <strong>Covers PO line{linkedLineNums.length > 1 ? 's' : ''}:</strong>{' '}
                                    {linkedLineNums.join(', ')}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Teal accent strip */}
                <div className="ip2-accent-strip" />
            </div>
        </div>
    );
};

export default PoPrintModal2;

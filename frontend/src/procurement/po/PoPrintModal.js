import React, { useState, useEffect, useMemo, useRef } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { CompanyHeaderBand, DraftWatermark, PreviewBanner } from '../../components/print/PrintCompanyHeader';
import consolidatePoLinesForPrint from './consolidatePoLinesForPrint';
import { openPrintWindow } from '../../utils/printWindow';
import './PoPrint.css';

// ── Helpers ──────────────────────────────────────────────────
const n   = (v) => fmt(v ?? 0);

// ── Small two-column info row ────────────────────────────────
const InfoRow = ({ label, value, highlight }) => {
    if (!value && value !== 0 && value !== false) return null;
    return (
        <div className="pop-info-row">
            <span className="pop-info-row-label">{label}:</span>
            <span className="pop-info-row-val" style={highlight ? { color: highlight, fontWeight: 600 } : {}}>
                {value === true ? '✓ Yes' : value === false ? '✗ No' : value}
            </span>
        </div>
    );
};

// ── Flag chip ────────────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────
const PoPrintModal = ({ po, onClose, preview, overBudget }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const [lines,     setLines]     = useState([]);
    const [annexures, setAnnexures] = useState([]);
    const [terms,     setTerms]     = useState([]);
    const [loading,   setLoading]   = useState(true);
    const docRef = useRef(null);

    useEffect(() => {
        fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));

        fetch(`${variables.API_URL}purchaseorder/${po.poId}/annexures`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { headers: [], details: [], links: [] })
            .then(d => {
                const headers = d.headers || [];
                const dByA = {};
                (d.details || []).forEach(x => { (dByA[x.annexureId] ??= []).push(x); });
                const lByA = {};
                (d.links || []).forEach(x => { (lByA[x.annexureId] ??= []).push(x.poLineId); });
                setAnnexures(headers.map(h => ({
                    ...h,
                    details:       (dByA[h.annexureId] || []).sort((a, b) => a.lineNum - b.lineNum),
                    linkedLineIds: lByA[h.annexureId] || [],
                })));
            })
            .catch(() => setAnnexures([]));

        fetch(`${variables.API_URL}purchaseorder/terms`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setTerms(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [po.poId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };
    const handlePrint    = () => openPrintWindow('.po-print-doc', `Purchase Order${preview ? ' (DRAFT)' : ''} - ${po.poNumber}`);

    // Vendor-facing consolidation: collapse rows that share item + price + tax + UOM
    // so the printed PO doesn't show the same SKU twice when multiple source PR
    // lines were imported. Internal traceability (PrLineId on the DB rows) is
    // unaffected — this is presentation only.
    const printLines = useMemo(() => consolidatePoLinesForPrint(lines), [lines]);

    // Computed totals (fall back to line-level calculation if pre-computed not available)
    const subtotal    = po.linesSubTotal  ?? lines.reduce((s, l) => s + (l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0), 0);
    const discount    = po.discount > 0   ? subtotal * po.discount / 100 : 0;
    const taxAmt      = po.taxAmount      ?? lines.reduce((s, l) => {
        const base = l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0;
        return s + base * (l.taxPct ?? 0) / 100;
    }, 0);
    const grandTotal  = po.totalAmount    ?? (subtotal - discount + taxAmt);

    const supplierName = po.supplierNameResolved || po.vendorName || '—';
    const currency     = po.currencyShort || po.currencyName || '';

    // T&C term text substitution
    const resolveTerm = (text) => (text || '').replace(/\{CompanyName\}/g, company?.companyName || '');

    // Doc requirement flags
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

            {/* ── Toolbar (hidden on print) ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Purchase Order — {po.poNumber}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close"  onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print"  onClick={handlePrint}>🖨 Print / Save as PDF</button>
                </div>
            </div>

            {/* ── Printable document ── */}
            <div className="po-print-doc" ref={docRef} style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>

                {preview && <DraftWatermark label={overBudget ? 'NO BUDGET' : 'DRAFT'} />}
                {preview && (
                    <PreviewBanner text={overBudget
                        ? 'NO BUDGET IN THIS CATEGORY — NOT VALID FOR ISSUE TO SUPPLIER'
                        : undefined} />
                )}

                {/* ══ 1. Company Header ════════════════════════════════════ */}
                <CompanyHeaderBand company={company} loading={coLoading} hideLogo={preview} nameOnly={preview} />

                {/* ══ 2. Document title band ═══════════════════════════════ */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'flex-start', marginBottom: 20 }}>
                    <div className="pop-doc-type" style={{ margin: 0 }}>Purchase Order</div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="pop-doc-number">{po.poNumber}</div>
                        {po.revision > 0 && (
                            <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
                                Rev. {po.revision}
                            </div>
                        )}
                        <div className="pop-doc-meta" style={{ textAlign: 'right' }}>
                            <InfoRow label="Priority"  value={po.priority} />
                            {po.jobId     && <InfoRow label="Job"      value={po.jobId} />}
                            <InfoRow label="Raised by" value={po.createdBy} />
                        </div>
                    </div>
                </div>

                {/* ══ 2. Supplier + Delivery band ══════════════════════════ */}
                <div className="pop-info-band">
                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Supplier / Vendor</div>
                        <div className="pop-info-val">{supplierName}</div>
                        {po.supplierAddress && <div style={{ fontSize: 11, color: '#475569', margin: '2px 0 4px', lineHeight: 1.5 }}>{po.supplierAddress}</div>}
                        {po.contactName    && <InfoRow label="Contact" value={po.contactName} />}
                        {(po.contactMobile || po.contactPhone) && <InfoRow label="Phone" value={po.contactMobile || po.contactPhone} />}
                        {po.contactEmail   && <InfoRow label="Email"   value={po.contactEmail} />}
                    </div>

                    <div className="pop-info-box">
                        <div className="pop-info-box-title">Order Details</div>
                        <InfoRow label="PO Date"           value={fmtDate(po.poDate)} />
                        {po.vendorRef       && <InfoRow label="Vendor Quote Ref" value={po.vendorRef} />}
                        {po.vendorQuoteDate && <InfoRow label="Quote Date"       value={fmtDate(po.vendorQuoteDate)} />}
                        <InfoRow label="Currency"     value={currency} />
                        <InfoRow label="Payment Terms" value={
                            // "Other" is just a bucket — print the actual terms the user typed.
                            (po.paymentTermCode === 'OTHER' && po.paymentTermsOther)
                                ? po.paymentTermsOther : po.paymentTermName
                        } />
                        <InfoRow label="Delivery Date" value={fmtDate(po.deliveryDate)} />
                        {po.deliveryTerms  && <InfoRow label="Del. Terms"  value={po.deliveryTerms} />}
                        {po.deliveryAddr   && <InfoRow label="Del. Address" value={po.deliveryAddr} />}
                    </div>
                </div>



                {/* ══ 5. Line items ════════════════════════════════════════ */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                        Loading lines…
                    </div>
                ) : (
                    <table className="pop-lines-table">
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}>#</th>
                                <th style={{ width: 90 }}>Code</th>
                                <th>Description</th>
                                <th className="num" style={{ width: 60 }}>Qty</th>
                                <th style={{ width: 50 }}>UOM</th>
                                <th className="num" style={{ width: 88 }}>Unit Price</th>
                                <th className="num" style={{ width: 48 }}>Tax %</th>
                                <th className="num" style={{ width: 96 }}>Line Total</th>
                                <th className="num" style={{ width: 96 }}>Total + Tax</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printLines.length === 0 ? (
                                <tr>
                                    <td colSpan={9} style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                                        No items
                                    </td>
                                </tr>
                            ) : printLines.map((l, i) => {
                                const lineTotal    = l.lineTotal        ?? (l.orderedQty * l.unitPrice);
                                const lineTotalTax = l.lineTotalWithTax ?? (lineTotal + lineTotal * (l.taxPct ?? 0) / 100);
                                const linkedCodes = annexures
                                    .filter(a => a.linkedLineIds.includes(l.poLineId))
                                    .map(a => a.annexureCode);
                                return (
                                    <tr key={`${l.poLineId}-${i}`}>
                                        <td style={{ color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                        <td className="code">{l.itemCode || '—'}</td>
                                        <td className="desc">
                                            <div>
                                                {l.itemDesc || l.itemName || '—'}
                                                {linkedCodes.length > 0 && (
                                                    <span style={{
                                                        marginLeft: 6, fontSize: 10, fontWeight: 600,
                                                        color: '#1e40af', background: '#dbeafe',
                                                        padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap',
                                                    }}>
                                                        See Annexure-{linkedCodes.join(', ')}
                                                    </span>
                                                )}
                                            </div>
                                            {l.itemNameAr && <div style={{ fontSize: 10, color: '#64748b', direction: 'rtl' }}>{l.itemNameAr}</div>}
                                            {l.remarks    && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>{l.remarks}</div>}
                                        </td>
                                        <td className="num">{l.orderedQty}</td>
                                        <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                        <td className="num">{n(l.unitPrice)}</td>
                                        <td className="num" style={{ color: '#64748b' }}>{l.taxPct ?? 0}%</td>
                                        <td className="num" style={{ fontWeight: 600 }}>{n(lineTotal)}</td>
                                        <td className="num" style={{ fontWeight: 600, color: '#1e40af' }}>{n(lineTotalTax)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ══ 6. Totals ════════════════════════════════════════════ */}
                <div className="pop-totals">
                    <div className="pop-totals-table">
                        <div className="pop-totals-row">
                            <span className="pop-totals-label">Subtotal</span>
                            <span className="pop-totals-val">{n(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="pop-totals-row">
                                <span className="pop-totals-label">Discount ({po.discount}%)</span>
                                <span className="pop-totals-val" style={{ color: '#dc2626' }}>− {n(discount)}</span>
                            </div>
                        )}
                        {taxAmt > 0 && (
                            <div className="pop-totals-row">
                                <span className="pop-totals-label">Tax</span>
                                <span className="pop-totals-val">{n(taxAmt)}</span>
                            </div>
                        )}
                        <div className="pop-totals-row grand">
                            <span className="pop-totals-label">TOTAL {currency && `(${currency})`}</span>
                            <span className="pop-totals-val">{n(grandTotal)}</span>
                        </div>
                    </div>
                </div>

                {/* ══ 7. Document Requirements + Notes/Conditions (Meta) ═══ */}
                {(anyDocFlag || anyNoteFlag) && (
                    <div className="pop-meta-section">
                        {anyDocFlag && (
                            <div className="pop-meta-group">
                                <div className="pop-meta-group-title">Document Requirements</div>
                                <div className="pop-meta-flags">
                                    {docFlags.map(f => <FlagChip key={f.key} on={!!po[f.key]} label={f.label} />)}
                                </div>
                            </div>
                        )}
                        {anyNoteFlag && (
                            <div className="pop-meta-group">
                                <div className="pop-meta-group-title">Notes / Conditions</div>
                                <div className="pop-meta-flags">
                                    {noteFlags.map(f => <FlagChip key={f.key} on={!!po[f.key]} label={f.label} />)}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ 8. Free-text notes ═══════════════════════════════════ */}
                {po.notes && (
                    <div className="pop-notes">
                        <div className="pop-notes-label">Notes / Terms &amp; Conditions</div>
                        {po.notes}
                    </div>
                )}

                {/* ══ 8a. Terms & Conditions ═══════════════════════════════ */}
                {terms.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse',
                                        border: '1px solid #cbd5e1', fontSize: 11 }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '7px 10px', textAlign: 'left',
                                                 fontWeight: 700, fontSize: 11.5,
                                                 background: '#fff', color: '#1e293b',
                                                 border: '1px solid #cbd5e1' }}>
                                        Terms &amp; Conditions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {terms.map((t, i) => (
                                    <tr key={t.termId}>
                                        <td style={{ padding: '5px 10px',
                                                     border: '1px solid #cbd5e1',
                                                     color: '#1e293b', lineHeight: 1.5 }}>
                                            {i + 1} : {resolveTerm(t.termText)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ══ 8b. ANNEXURES — one per printed page ═════════════════ */}
                {annexures.map(a => {
                    const linkedLineNums = a.linkedLineIds
                        .map(id => printLines.findIndex(l => l.poLineId === id) + 1)
                        .filter(n => n > 0)
                        .sort((x, y) => x - y);
                    return (
                        <div key={a.annexureId} style={{
                            pageBreakBefore: 'always', breakBefore: 'page',
                            paddingTop: 14, marginTop: 14, borderTop: '1px dashed #cbd5e1',
                        }}>
                            <div style={{
                                background: '#0f172a', color: '#fff',
                                padding: '8px 14px', marginBottom: 12, borderRadius: 4,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.04em' }}>
                                    ANNEXURE-{a.annexureCode}
                                    {a.title && <span style={{ fontWeight: 500, marginLeft: 8, opacity: .85 }}>— {a.title}</span>}
                                </span>
                                <span style={{ fontSize: 10.5, opacity: .8 }}>{po.poNumber}</span>
                            </div>
                            {a.notes && (
                                <div style={{
                                    padding: '10px 14px', marginBottom: 12,
                                    border: '1px solid #e2e8f0', background: '#f8fafc',
                                    borderRadius: 4, fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap',
                                }}>{a.notes}</div>
                            )}
                            {a.details.length > 0 && (
                                <table className="pop-table" style={{ marginBottom: 12 }}>
                                    <thead><tr>
                                        <th style={{ width: 40 }}>#</th>
                                        <th>Description</th>
                                        <th style={{ width: 220 }}>Remarks</th>
                                    </tr></thead>
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

                <div style={{ flex: 1 }} />

                {preview && (
                    <PreviewBanner text={overBudget
                        ? 'NO BUDGET IN THIS CATEGORY — NOT VALID FOR ISSUE TO SUPPLIER'
                        : undefined} />
                )}

                {/* ══ 9. Signature footer ══════════════════════════════════ */}
                <div className="pop-footer">
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Prepared by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{po.createdBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Approved / Authorised by</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">{po.approvedBy || 'Name / Signature'}</div>
                    </div>
                    <div className="pop-sig-box">
                        <div className="pop-sig-label">Supplier Acknowledgement</div>
                        <div className="pop-sig-line" />
                        <div className="pop-sig-sub">Signature &amp; Date</div>
                    </div>
                </div>

                <div className="pop-print-footer-note">
                    This is a computer-generated purchase order.
                    {company?.companyName && <> {company.companyName}</>}
                    {company?.email && <> · {company.email}</>}
                </div>

            </div>
        </div>
    );
};

export default PoPrintModal;

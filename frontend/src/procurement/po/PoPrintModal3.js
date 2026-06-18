import React, { useState, useEffect, useMemo } from 'react';
import { variables, authHeaders, getFileUrl } from '../../Variable';
import { fmt, fmtDate } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import consolidatePoLinesForPrint from './consolidatePoLinesForPrint';
import { openPrintWindow } from '../../utils/printWindow';
import { DraftWatermark, PreviewBanner } from '../../components/print/PrintCompanyHeader';
import './PoPrint.css';

// ── Helpers ───────────────────────────────────────────────────
const n = (v) => fmt(v ?? 0);

const fmtAuthorizedDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};

// ── Reusable label:value row ──────────────────────────────────
const KV = ({ label, value, mono }) => !value ? null : (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2.5, fontSize: 11 }}>
        <span style={{ color: '#64748b', minWidth: 96, flexShrink: 0 }}>{label}</span>
        <span style={{ color: '#1e293b', fontWeight: 500, fontFamily: mono ? 'Courier New' : undefined }}>
            {value}
        </span>
    </div>
);

// ═════════════════════════════════════════════════════════════
const PoPrintModal3 = ({ po, onClose, preview }) => {
    const { company, loading: coLoading } = useOwnerCompany();
    const [lines,   setLines]   = useState([]);
    const [terms,   setTerms]   = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoading(false));

        fetch(`${variables.API_URL}purchaseorder/terms`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setTerms(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [po.poId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    const handlePrint = () => openPrintWindow('.po3-doc', `Purchase Order${preview ? ' (DRAFT)' : ''} - ${po.poNumber}`);
    const printLines = useMemo(() => consolidatePoLinesForPrint(lines), [lines]);

    // ── Totals ────────────────────────────────────────────────
    const subtotal   = po.linesSubTotal ?? lines.reduce((s, l) => s + (l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0), 0);
    const discount   = po.discount > 0 ? subtotal * po.discount / 100 : 0;
    const grandTotal = po.totalAmount  ?? (subtotal - discount + (po.taxAmount ?? 0));

    // Group VAT by rate for display
    const vatGroups = useMemo(() => {
        const map = {};
        lines.forEach(l => {
            const pct = l.taxPct ?? 0;
            if (pct <= 0) return;
            map[pct] = (map[pct] || 0) + (l.taxAmount ?? (l.lineTotal ?? 0) * pct / 100);
        });
        return Object.entries(map).map(([pct, amt]) => ({ pct: Number(pct), amt }));
    }, [lines]);

    // ── Company info ──────────────────────────────────────────
    const supplierName = po.supplierNameResolved || po.vendorName || '—';
    const currency     = po.currencyShort || po.currencyName || '';
    const logoSrc      = getFileUrl(company?.logoPath);
    const primaryAddr  = company?.addresses?.find(a => a.isPrimary) ?? company?.addresses?.[0];
    const addrLine     = primaryAddr
        ? [primaryAddr.addressLine1, primaryAddr.addressLine2, primaryAddr.city, primaryAddr.country].filter(Boolean).join(', ')
        : null;

    // ── Footer info ───────────────────────────────────────────
    const authorizedBy   = po.approvedBy   || po.createdBy  || '';
    const authorizedDate = fmtAuthorizedDate(po.approvedDate || po.createdDate);

    // ── T&C term text substitution ────────────────────────────
    const resolveTerm = (text) => text.replace(/\{CompanyName\}/g, company?.companyName || '');


    return (
        <div className="po-print-overlay" onClick={handleBackdrop}>

            {/* ── Toolbar ── */}
            <div className="po-print-toolbar">
                <div className="po-print-toolbar-left">
                    <span className="po-print-title">🖨 Purchase Order — {po.poNumber}</span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.55)' }}>
                        Format 3
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="po-print-btn-close" onClick={onClose}>✕ Close</button>
                    <button className="po-print-btn-print" onClick={handlePrint}>🖨 Print / Save as PDF</button>
                </div>
            </div>

            {/* ══ A4 Document ══ */}
            <div className="po3-doc" style={{ position: 'relative' }}>

                {preview && <DraftWatermark />}
                {preview && <PreviewBanner />}

                {/* ── 1. Company header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'flex-start', paddingBottom: 10,
                               borderBottom: '2px solid #1e3a5f', marginBottom: 14 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a5f', marginBottom: 3 }}>
                            {coLoading ? '…' : (company?.companyName || '—')}
                        </div>
                        {!preview && addrLine && (
                            <div style={{ fontSize: 10.5, color: '#475569', marginBottom: 2 }}>{addrLine}</div>
                        )}
                        {!preview && (
                            <div style={{ fontSize: 10.5, color: '#475569', lineHeight: 1.6 }}>
                                {company?.phone && <>Tel: {company.phone}</>}
                                {company?.fax   && <>{company.phone ? '  |  ' : ''}Fax: {company.fax}</>}
                                {company?.trn   && <>{(company.phone || company.fax) ? '  |  ' : ''}TRN: {company.trn}</>}
                            </div>
                        )}
                    </div>
                    {preview ? null : logoSrc ? (
                        <img src={logoSrc} alt="Logo"
                             style={{ maxHeight: 56, maxWidth: 110, objectFit: 'contain' }}
                             onError={e => e.target.style.display = 'none'} />
                    ) : (
                        <div style={{
                            background: '#1e3a5f', color: '#fff', padding: '8px 12px',
                            borderRadius: 4, fontSize: 10, fontWeight: 700,
                            textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line',
                        }}>
                            {(company?.companyName || '').split(' ').slice(0, 3).join('\n')}
                        </div>
                    )}
                </div>

                {/* ── 2. Document title + status + PO number ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                               alignItems: 'center', marginBottom: 12 }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b',
                                      letterSpacing: '.04em', textTransform: 'uppercase' }}>
                            Purchase Order
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {po.revision > 0 && (
                            <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
                                Rev.{po.revision}
                            </span>
                        )}
                        <span style={{
                            fontSize: 16, fontWeight: 700, color: '#d97706',
                            fontFamily: 'Courier New', letterSpacing: '.02em',
                        }}>
                            {po.poNumber}
                        </span>
                    </div>
                </div>

                {/* ── 3. Quick info strip ── */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 4, marginBottom: 12, overflow: 'hidden',
                }}>
                    {[
                        ['PO DATE',          fmtDate(po.poDate)],
                        ['JOB',              po.jobId || '—'],
                        ['VENDOR QUOTE REF', po.lpoNo || po.vendorRef || '—'],
                    ].map(([label, value], i) => (
                        <div key={label} style={{
                            padding: '8px 12px',
                            borderRight: i < 2 ? '1px solid #e2e8f0' : 'none',
                        }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b',
                                          textTransform: 'uppercase', letterSpacing: '.06em',
                                          marginBottom: 3 }}>
                                {label}
                            </div>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b' }}>
                                {value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── 4. Supplier | Order Details ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                               gap: 16, marginBottom: 12 }}>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a5f',
                                      textTransform: 'uppercase', letterSpacing: '.08em',
                                      marginBottom: 6, paddingBottom: 4,
                                      borderBottom: '1px solid #e2e8f0' }}>
                            Supplier / Vendor
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                            {supplierName}
                        </div>
                        {po.supplierAddress && (
                            <div style={{ fontSize: 11, color: '#475569', margin: '2px 0 4px',
                                          lineHeight: 1.5, paddingLeft: 0 }}>
                                {po.supplierAddress}
                            </div>
                        )}
                        <KV label="Contact"    value={po.contactName} />
                        <KV label="Phone"      value={po.contactMobile || po.contactPhone} mono />
                        <KV label="Email"      value={po.contactEmail} />
                    </div>
                    <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a5f',
                                      textTransform: 'uppercase', letterSpacing: '.08em',
                                      marginBottom: 6, paddingBottom: 4,
                                      borderBottom: '1px solid #e2e8f0' }}>
                            Order Details
                        </div>
                        <KV label="Quote Date"       value={fmtDate(po.vendorQuoteDate)} />
                        <KV label="Currency"      value={currency} />
                        <KV label="Payment Terms" value={po.paymentTermName} />
                        <KV label="Del. Terms"    value={po.deliveryTerms} />
                        <KV label="Deliver To"    value={po.deliveryAddr} />
                    </div>
                </div>

                <hr style={{ border: 0, borderTop: '1px solid #cbd5e1', margin: '0 0 12px' }} />

                {/* ── 5. Line items table ── */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontSize: 13 }}>
                        Loading lines…
                    </div>
                ) : (
                    <table className="po3-table" style={{
                        width: '100%', borderCollapse: 'collapse',
                        marginBottom: 0, fontSize: 11.5,
                    }}>
                        <thead>
                            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                                {['#','Description','Qty','UOM','Unit Price','Total']
                                    .map((h, i) => (
                                    <th key={h} style={{
                                        padding: '8px 8px', textAlign: i >= 2 && i !== 3 ? 'right' : 'left',
                                        fontSize: 9.5, fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '.04em',
                                        whiteSpace: 'nowrap',
                                        ...(i === 0 ? { width: 24 } : {}),
                                        ...(i === 2 ? { width: 44 } : {}),
                                        ...(i === 3 ? { width: 44, textAlign: 'center' } : {}),
                                        ...(i === 4 ? { width: 78 } : {}),
                                        ...(i === 5 ? { width: 84 } : {}),
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {printLines.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '14px 0',
                                                              color: '#94a3b8', fontStyle: 'italic' }}>
                                        No items
                                    </td>
                                </tr>
                            ) : printLines.map((l, i) => {
                                const lineTotal    = l.lineTotal        ?? (l.orderedQty * l.unitPrice);
                                const lineTotalTax = l.lineTotalWithTax ?? (lineTotal + lineTotal * (l.taxPct ?? 0) / 100);
                                return (
                                    <tr key={`${l.poLineId}-${i}`}
                                        style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc',
                                                 borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                        <td style={{ padding: '7px 8px', lineHeight: 1.4 }}>
                                            <div>{l.itemDesc || l.itemName || '—'}</div>
                                            {l.remarks && (
                                                <div style={{ fontSize: 10, color: '#64748b',
                                                              fontStyle: 'italic', marginTop: 1 }}>
                                                    {l.remarks}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{l.orderedQty}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#475569' }}>
                                            {l.uomName || '—'}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right',
                                                     fontFamily: 'Courier New', fontSize: 11 }}>
                                            {n(l.unitPrice)}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right',
                                                     fontFamily: 'Courier New', fontSize: 11,
                                                     fontWeight: 600 }}>
                                            {n(lineTotalTax)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ── 6. Totals ── */}
                <div className="po3-totals" style={{ display: 'flex', justifyContent: 'flex-end',
                                                      marginBottom: 12, marginTop: 0 }}>
                    <div style={{ width: 300, border: '1px solid #e2e8f0',
                                  borderTop: 'none', borderRadius: '0 0 6px 6px',
                                  overflow: 'hidden' }}>
                        {/* Subtotal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                                      padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                            <span style={{ color: '#64748b' }}>Subtotal</span>
                            <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(subtotal)}</span>
                        </div>

                        {/* VAT rows grouped by % */}
                        {vatGroups.length > 0 ? vatGroups.map(g => (
                            <div key={g.pct} style={{ display: 'flex', justifyContent: 'space-between',
                                                       padding: '6px 14px', borderBottom: '1px solid #f1f5f9',
                                                       fontSize: 12 }}>
                                <span style={{ color: '#64748b' }}>VAT ({g.pct}% on applicable lines)</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(g.amt)}</span>
                            </div>
                        )) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between',
                                          padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                <span style={{ color: '#64748b' }}>VAT</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(0)}</span>
                            </div>
                        )}

                        {/* Discount */}
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                                      padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                            <span style={{ color: '#64748b' }}>Discount</span>
                            <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>
                                {discount > 0 ? `− ${n(discount)}` : n(0)}
                            </span>
                        </div>

                        {/* Grand Total */}
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                                      padding: '9px 14px', background: '#d97706', color: '#fff' }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>
                                TOTAL {currency && `(${currency})`}
                            </span>
                            <span style={{ fontFamily: 'Courier New', fontWeight: 800, fontSize: 14 }}>
                                {n(grandTotal)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Spacer: pushes notes + T&C + footer to bottom ── */}
                <div style={{ flex: 1, minHeight: 12 }} />

                {/* ── 7. Notes / Remarks ── */}
                {po.notes && (
                    <div className="po3-notes" style={{
                        borderLeft: '4px solid #f59e0b',
                        background: '#fffbeb',
                        padding: '10px 14px', marginBottom: 12,
                        borderRadius: '0 4px 4px 0',
                    }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e',
                                      textTransform: 'uppercase', letterSpacing: '.07em',
                                      marginBottom: 5 }}>
                            Notes / Remarks
                        </div>
                        <div style={{ fontSize: 11, color: '#1e293b', lineHeight: 1.6 }}>
                            {po.notes}
                        </div>
                    </div>
                )}

                {/* ── 8. Terms & Conditions ── */}
                {terms.length > 0 && (
                    <div className="po3-tc" style={{ marginBottom: 12 }}>
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

                {/* ── 9. Authorized footer ── */}
                <div className="po3-footer" style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    paddingTop: 8, borderTop: '1px solid #e2e8f0', marginTop: 4,
                }}>
                    <div style={{ fontSize: 11, color: '#1e293b', fontWeight: 500 }}>
                        {authorizedDate && (
                            <span>Authorized Date: <strong>{authorizedDate}</strong></span>
                        )}
                        {authorizedDate && authorizedBy && <span>{'   '}</span>}
                        {authorizedBy && (
                            <span>Authorized By: <strong>{authorizedBy}</strong></span>
                        )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8',
                                  fontStyle: 'italic', lineHeight: 1.5 }}>
                        This is a computer generated purchase order.<br />
                        {company?.companyName}
                    </div>
                </div>

                {preview && <PreviewBanner />}

            </div>
        </div>
    );
};

export default PoPrintModal3;

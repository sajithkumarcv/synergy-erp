import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate, statusBadgeCfg } from '../procurementConstants';
import useOwnerCompany from '../../hooks/useOwnerCompany';
import { useLookup } from '../../LookupContext';
import consolidatePoLinesForPrint from './consolidatePoLinesForPrint';
import { openPrintWindow } from '../../utils/printWindow';
import './PoPrint.css';

/**
 * Stand-alone, read-only, full-page PO detail view for approvers.
 *
 * Opened in a NEW TAB from My Approvals (👁 preview drawer → "Open full page")
 * so the approver can review every line/term/annexure without leaving the
 * approvals list in their original tab.
 *
 * The document is PoPrintModal3 (.po3-doc / PoPrint.css) with NO header block
 * at all — no company banner, no title bar. The PO number and revision move
 * into the info strip instead, so a printed page can still be identified.
 * Everything else — info strip, supplier/order details, lines, totals, notes,
 * annexures, T&C (with {CompanyName} substituted), footer — matches Format 3.
 *
 * The dark bar at the top is screen-only chrome: printing extracts .po3-doc,
 * so it never reaches the paper.
 *
 * Route: /purchase-orders/:poId/review
 */

// ── Helpers ───────────────────────────────────────────────────
const n = (v) => fmt(v ?? 0);

const fmtAuthorizedDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt)) return null;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};

const KV = ({ label, value, mono }) => !value ? null : (
    <div style={{ display: 'flex', gap: 6, marginBottom: 2.5, fontSize: 11 }}>
        <span style={{ color: '#64748b', minWidth: 96, flexShrink: 0 }}>{label}</span>
        <span style={{ color: '#1e293b', fontWeight: 500, fontFamily: mono ? 'Courier New' : undefined }}>
            {value}
        </span>
    </div>
);

// ═════════════════════════════════════════════════════════════
const PoApprovalPrintPage = () => {
    const { poId } = useParams();
    const { getStatusConfig, getSetting } = useLookup();
    const { company } = useOwnerCompany();
    const taxLabel = getSetting('Biz.Print.TAXLABEL', 'VAT');

    const [po,         setPo]        = useState(null);
    const [lines,      setLines]     = useState([]);
    const [terms,      setTerms]     = useState([]);
    const [annexures,  setAnnexures] = useState([]);
    const [loading,    setLoading]   = useState(true);
    const [error,      setError]     = useState('');

    const load = useCallback(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}purchaseorder/${poId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(setPo)
            .catch(() => setError('Failed to load purchase order.'))
            .finally(() => setLoading(false));

        fetch(`${variables.API_URL}purchaseorder/lines/${poId}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setLines(Array.isArray(d) ? d : []))
            .catch(() => setLines([]));

        fetch(`${variables.API_URL}purchaseorder/terms`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setTerms(Array.isArray(d) ? d : []))
            .catch(() => setTerms([]));

        fetch(`${variables.API_URL}purchaseorder/${poId}/annexures`, { headers: authHeaders() })
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
    }, [poId]);

    useEffect(() => { load(); }, [load]);

    const handlePrint = () => openPrintWindow('.po3-doc', `Purchase Order - ${po?.poNumber || poId}`);
    const handleClose = () => { window.close(); };

    const printLines = useMemo(() => consolidatePoLinesForPrint(lines), [lines]);

    const subtotal   = po?.linesSubTotal ?? lines.reduce((s, l) => s + (l.lineTotal ?? l.orderedQty * l.unitPrice ?? 0), 0);
    const discount   = po?.discount > 0 ? subtotal * po.discount / 100 : 0;
    const grandTotal = po?.totalAmount  ?? (subtotal - discount + (po?.taxAmount ?? 0));

    const vatGroups = useMemo(() => {
        const map = {};
        lines.forEach(l => {
            const pct = l.taxPct ?? 0;
            if (pct <= 0) return;
            map[pct] = (map[pct] || 0) + (l.taxAmount ?? (l.lineTotal ?? 0) * pct / 100);
        });
        return Object.entries(map).map(([pct, amt]) => ({ pct: Number(pct), amt }));
    }, [lines]);

    const supplierName   = po?.supplierNameResolved || po?.vendorName || '—';
    const currency        = po?.currencyShort || po?.currencyName || '';
    const authorizedBy   = po?.approvedBy   || po?.createdBy  || '';
    const authorizedDate = fmtAuthorizedDate(po?.approvedDate || po?.createdDate);
    const badge           = po ? statusBadgeCfg(getStatusConfig('PO', po.status)) : null;

    // Same term-text substitution Format 3 does — without it a term stored as
    // "…supplied to {CompanyName}…" prints the placeholder verbatim.
    const resolveTerm = (text) => (text || '').replace(/\{CompanyName\}/g, company?.companyName || '');

    if (loading) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                Loading purchase order…
            </div>
        );
    }
    if (error || !po) {
        return (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#991b1b', fontSize: 14 }}>
                ⚠ {error || 'Purchase order not found.'}
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
            {/* ── Toolbar (screen-only, not part of the printed doc) ── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 10,
                background: '#0f172a', color: '#fff',
                padding: '12px 24px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(0,0,0,.15)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>📦 Purchase Order Review</span>
                    <span style={{ fontFamily: 'Courier New', fontSize: 13, background: '#fde047', color: '#0f4c75',
                                   padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {po.poNumber}
                    </span>
                    {badge && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
                                       background: badge.bg || '#334155', color: badge.color || '#e2e8f0' }}>
                            {po.status}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handlePrint}
                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                                     padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        🖨 Print / Save as PDF
                    </button>
                    <button onClick={handleClose}
                            style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)',
                                     borderRadius: 6, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                        ✕ Close Tab
                    </button>
                </div>
            </div>

            {/* ══ A4-styled document — Format 3 body with no header block ══ */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 16px 48px' }}>
                <div className="po3-doc" style={{ position: 'relative' }}>

                    {/* ── Info strip. Carries PO No. (and revision) because there is
                           no header above it to state which document this is. ── */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                        background: '#f8fafc', border: '1px solid #e2e8f0',
                        borderRadius: 4, marginBottom: 12, overflow: 'hidden',
                    }}>
                        {[
                            ['PO NO.',           po.revision > 0 ? `${po.poNumber}  (Rev.${po.revision})` : po.poNumber],
                            ['PO DATE',          fmtDate(po.poDate)],
                            ['JOB',              po.jobId || '—'],
                            ['VENDOR QUOTE REF', po.lpoNo || po.vendorRef || '—'],
                            ['DELIVERY DATE',    fmtDate(po.deliveryDate)],
                        ].map(([label, value], i) => (
                            <div key={label} style={{ padding: '8px 12px', borderRight: i < 4 ? '1px solid #e2e8f0' : 'none' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b',
                                              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
                                    {label}
                                </div>
                                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1e293b',
                                              fontFamily: i === 0 ? 'Courier New' : undefined }}>
                                    {value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Supplier | Order details ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase',
                                          letterSpacing: '.08em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                                Supplier / Vendor
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{supplierName}</div>
                            {po.supplierAddress && (
                                <div style={{ fontSize: 11, color: '#475569', margin: '2px 0 4px', lineHeight: 1.5 }}>
                                    {po.supplierAddress}
                                </div>
                            )}
                            <KV label="Contact" value={po.contactName} />
                            <KV label="Phone"   value={po.contactMobile || po.contactPhone} mono />
                            <KV label="Email"   value={po.contactEmail} />
                        </div>
                        <div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase',
                                          letterSpacing: '.08em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
                                Order Details
                            </div>
                            <KV label="Quote Date"    value={fmtDate(po.vendorQuoteDate)} />
                            <KV label="Currency"      value={currency} />
                            <KV label="Payment Terms" value={
                                (po.paymentTermCode === 'OTHER' && po.paymentTermsOther) ? po.paymentTermsOther : po.paymentTermName
                            } />
                            <KV label="Del. Terms" value={po.deliveryTerms} />
                            <KV label="Deliver To" value={po.deliveryAddr} />
                        </div>
                    </div>

                    <hr style={{ border: 0, borderTop: '1px solid #cbd5e1', margin: '0 0 12px' }} />

                    {/* ── Line items ── */}
                    <table className="po3-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead>
                            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                                {['#','Item Code','Description','Qty','UOM','Unit Price','Tax%','Total'].map((h, i) => (
                                    <th key={h} style={{
                                        padding: '8px 8px', textAlign: i >= 3 && i !== 4 ? 'right' : 'left',
                                        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                                        whiteSpace: 'nowrap',
                                        ...(i === 0 ? { width: 24 } : {}),
                                        ...(i === 4 ? { width: 44, textAlign: 'center' } : {}),
                                        ...(i === 5 ? { width: 78 } : {}),
                                        ...(i === 6 ? { width: 44 } : {}),
                                        ...(i === 7 ? { width: 84 } : {}),
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {printLines.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '14px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                                        No items
                                    </td>
                                </tr>
                            ) : printLines.map((l, i) => {
                                const lineTotal = l.lineTotal ?? (l.orderedQty * l.unitPrice);
                                return (
                                    <tr key={`${l.poLineId}-${i}`}
                                        style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 10 }}>{i + 1}</td>
                                        <td style={{ padding: '7px 8px', fontFamily: 'Courier New', fontSize: 11 }}>{l.itemCode || '—'}</td>
                                        <td style={{ padding: '7px 8px', lineHeight: 1.4 }}>
                                            <div>{l.itemDesc || '—'}</div>
                                            {l.remarks && (
                                                <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 1 }}>
                                                    {l.remarks}
                                                </div>
                                            )}
                                            {(() => {
                                                const linkedCodes = annexures
                                                    .filter(a => a.linkedLineIds.includes(l.poLineId))
                                                    .map(a => a.annexureCode);
                                                return linkedCodes.length > 0 ? (
                                                    <div style={{ fontSize: 9.5, color: '#1e40af', fontStyle: 'italic', marginTop: 2 }}>
                                                        See Annexure-{linkedCodes.join(', ')}
                                                    </div>
                                                ) : null;
                                            })()}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>{l.orderedQty}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'center', color: '#475569' }}>{l.uomName || '—'}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'Courier New', fontSize: 11 }}>
                                            {n(l.unitPrice)}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'Courier New', fontSize: 11, color: '#64748b' }}>
                                            {l.taxPct > 0 ? `${l.taxPct}%` : '—'}
                                        </td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'Courier New', fontSize: 11, fontWeight: 600 }}>
                                            {n(lineTotal)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* ── Totals ── */}
                    <div className="po3-totals" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        <div style={{ width: 300, border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                <span style={{ color: '#64748b' }}>Subtotal</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(subtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                <span style={{ color: '#64748b' }}>{taxLabel}</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(vatGroups.reduce((s, g) => s + g.amt, 0))}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                <span style={{ color: '#64748b' }}>Discount</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{discount > 0 ? `− ${n(discount)}` : n(0)}</span>
                            </div>
                            {po.taxAmount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                                    <span style={{ color: '#64748b' }}>Tax Amount</span>
                                    <span style={{ fontFamily: 'Courier New', fontWeight: 600 }}>{n(po.taxAmount)}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: '#0f4c75', color: '#fff' }}>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>TOTAL {currency && `(${currency})`}</span>
                                <span style={{ fontFamily: 'Courier New', fontWeight: 800, fontSize: 14 }}>{n(grandTotal)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="po3-spacer" style={{ flex: 1, minHeight: 12 }} />

                    {/* ── Notes ── */}
                    {po.notes && (
                        <div className="po3-notes" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb',
                                                              padding: '10px 14px', marginBottom: 12, borderRadius: '0 4px 4px 0' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#92400e', textTransform: 'uppercase',
                                          letterSpacing: '.07em', marginBottom: 5 }}>
                                Notes / Remarks
                            </div>
                            <div style={{ fontSize: 11, color: '#1e293b', lineHeight: 1.6 }}>{po.notes}</div>
                        </div>
                    )}

                    {/* ── Annexures ── */}
                    {annexures.map(a => {
                        const linkedLineNums = a.linkedLineIds
                            .map(id => printLines.findIndex(l => l.poLineId === id) + 1)
                            .filter(x => x > 0)
                            .sort((x, y) => x - y);
                        return (
                            <div key={a.annexureId} style={{ pageBreakBefore: 'always', breakBefore: 'page',
                                                              paddingTop: 14, marginTop: 14, borderTop: '1px dashed #cbd5e1' }}>
                                <div style={{ background: '#1e3a5f', color: '#fff', padding: '8px 14px', marginBottom: 12,
                                              borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.04em' }}>
                                        ANNEXURE-{a.annexureCode}
                                        {a.title && <span style={{ fontWeight: 500, marginLeft: 8, opacity: .85 }}>— {a.title}</span>}
                                    </span>
                                    <span style={{ fontSize: 10.5, opacity: .8 }}>{po.poNumber}</span>
                                </div>
                                {a.notes && (
                                    <div style={{ padding: '10px 14px', marginBottom: 12, border: '1px solid #e2e8f0',
                                                  background: '#f8fafc', borderRadius: 4, fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap' }}>
                                        {a.notes}
                                    </div>
                                )}
                                {a.details.length > 0 && (
                                    <table className="po3-table" style={{ marginBottom: 12, fontSize: 11.5 }}>
                                        <thead>
                                            <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                                                <th style={{ padding: '7px 10px', width: 40, textAlign: 'center', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>#</th>
                                                <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Description</th>
                                                <th style={{ padding: '7px 10px', width: 220, textAlign: 'left', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {a.details.map((d, di) => (
                                                <tr key={d.annexureDetailId} style={{ background: di % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#64748b' }}>{d.lineNum}</td>
                                                    <td style={{ padding: '6px 10px', whiteSpace: 'pre-wrap' }}>{d.description || '—'}</td>
                                                    <td style={{ padding: '6px 10px', color: '#475569' }}>{d.remarks || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                {linkedLineNums.length > 0 && (
                                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
                                                  borderRadius: 4, fontSize: 11.5, color: '#1e40af' }}>
                                        <strong>Covers PO line{linkedLineNums.length > 1 ? 's' : ''}:</strong> {linkedLineNums.join(', ')}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* ── Terms & Conditions ── */}
                    {terms.length > 0 && (
                        <div className="po3-tc" style={{ marginBottom: 12 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #cbd5e1', fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11.5,
                                                     background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1' }}>
                                            Terms &amp; Conditions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {terms.map((t, i) => (
                                        <tr key={t.termId}>
                                            <td style={{ padding: '5px 10px', border: '1px solid #cbd5e1', color: '#1e293b', lineHeight: 1.5 }}>
                                                {i + 1} : {resolveTerm(t.termText)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── Footer ── */}
                    <div className="po3-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                                                          paddingTop: 8, borderTop: '1px solid #e2e8f0', marginTop: 4 }}>
                        <div style={{ fontSize: 11, color: '#1e293b', fontWeight: 500 }}>
                            {authorizedDate && <span>Last Action Date: <strong>{authorizedDate}</strong></span>}
                            {authorizedDate && authorizedBy && <span>{'   '}</span>}
                            {authorizedBy && <span>Last Action By: <strong>{authorizedBy}</strong></span>}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.5 }}>
                            This is a computer generated purchase order.<br />
                            {company?.companyName}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PoApprovalPrintPage;

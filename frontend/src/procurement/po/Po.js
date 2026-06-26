import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, PO_STATUS, PRIORITY_CONFIG, FormSection } from '../procurementConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [100, 200, 500];

const DEFAULT_FILTERS = { searchText: '', status: '', supplierId: '', jobId: '', priority: '', createdBy: '', dateFrom: '', dateTo: '' };


const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── Approval History Popup ────────────────────────────────────────
const ApprovalPopup = ({ poId, onClose, flipUp = false }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const ref = React.useRef(null);

    useEffect(() => {
        fetch(`${variables.API_URL}approval/status/PO/${poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setData(d))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [poId]);

    useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);

    const logs   = data?.log || [];
    const sorted = [...logs].sort((a, b) => new Date(b.actionDate) - new Date(a.actionDate));

    const actionColor = (a) => {
        if (!a) return '#64748b';
        if (['Approved','Auto-approved'].some(x => a.startsWith(x))) return '#16a34a';
        if (a === 'Rejected') return '#dc2626';
        if (a === 'Submitted') return '#1e40af';
        return '#92400e';
    };

    return (
        <div ref={ref} style={{
            position: 'absolute', zIndex: 500,
            ...(flipUp ? { bottom: '110%', top: 'auto' } : { top: '110%' }),
            left: '50%', transform: 'translateX(-50%)',
            background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            border: '1px solid #e2e8f0', minWidth: 300, maxWidth: 360, padding: 0, overflow: 'hidden'
        }}>
            <div style={{ background: '#1e3a5f', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Approval History</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: 12, maxHeight: 280, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: 16 }}>Loading…</div>
                ) : !data || logs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 16, fontStyle: 'italic' }}>
                        No approval activity yet.
                    </div>
                ) : (
                    <>
                        {data?.transaction && (
                            <div style={{ marginBottom: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 11 }}>
                                <span style={{ color: '#64748b' }}>Level </span>
                                <strong>{data.transaction.currentLevelNo} of {data.transaction.totalLevels}</strong>
                                <span style={{ marginLeft: 8, color: '#64748b' }}>· </span>
                                <strong>{data.transaction.policyName || '—'}</strong>
                                {data.transaction.currentStatus && (
                                    <span style={{ marginLeft: 8, color: '#64748b' }}>· {data.transaction.currentStatus}</span>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* ── Pending step — current level awaiting action ── */}
                            {data?.transaction && !data.transaction.finalAction && (
                                <div style={{ display: 'flex', gap: 8, fontSize: 11, paddingBottom: 8, borderBottom: '1px dashed #e2e8f0', marginBottom: 2 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', marginTop: 4, flexShrink: 0,
                                        boxShadow: '0 0 0 3px rgba(245,158,11,.2)' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 7px', borderRadius: 4, fontSize: 10 }}>
                                                ⏳ Awaiting Approval
                                            </span>
                                            <span style={{ color: '#94a3b8', fontSize: 10 }}>
                                                Level {data.transaction.currentLevelNo} of {data.transaction.totalLevels}
                                            </span>
                                        </div>
                                        {(data.transaction.levelName || data.transaction.approverName) && (
                                            <div style={{ color: '#92400e', fontWeight: 500, marginTop: 2 }}>
                                                {data.transaction.levelName}
                                                {data.transaction.approverName && data.transaction.approverName !== data.transaction.levelName
                                                    ? ` (${data.transaction.approverName})` : ''}
                                            </div>
                                        )}
                                        {data.transaction.approverUsers && (
                                            <div style={{ color: '#64748b', fontSize: 10, marginTop: 1 }}>
                                                Pending with: <strong>{data.transaction.approverUsers}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {sorted.map((log, i) => {
                                const d = log.actionDate ? new Date(log.actionDate) : null;
                                const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                                const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                                return (
                                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor(log.action), marginTop: 4, flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontWeight: 600, color: actionColor(log.action) }}>{log.action}</span>
                                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                                                <div style={{ color: '#64748b', fontSize: 10 }}>{dateStr}</div>
                                                <div style={{ color: '#94a3b8', fontSize: 10 }}>{timeStr}</div>
                                            </div>
                                        </div>
                                        <div style={{ color: '#475569' }}>{log.actionByName || log.actionBy}</div>
                                        {log.levelNo > 0 && <div style={{ color: '#94a3b8', fontSize: 10 }}>Level {log.levelNo}{log.levelName ? ` — ${log.levelName}` : ''}</div>}
                                        {log.remarks && <div style={{ color: '#64748b', fontSize: 10, fontStyle: 'italic' }}>{log.remarks}</div>}
                                    </div>
                                </div>
                                );
                            })}

                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Status Badge with popup ────────────────────────────────────────
const StatusBadge = ({ status, poId }) => {
    const { getStatusConfig } = useLookup();
    const [showPopup, setShowPopup] = React.useState(false);
    const [flipUp,    setFlipUp]    = React.useState(false);
    const badgeRef = React.useRef(null);
    const raw = getStatusConfig('PO', status);
    const cfg = raw
        ? { bg: raw.badgeBg, color: raw.badgeColor, dot: raw.badgeDot, label: raw.statusLabel }
        : (PO_STATUS[status] || PO_STATUS.Draft);

    const handleClick = (e) => {
        e.stopPropagation();
        if (!showPopup && badgeRef.current) {
            const rect = badgeRef.current.getBoundingClientRect();
            // Popup is ~300px tall — flip up if less than 320px below the badge
            setFlipUp(window.innerHeight - rect.bottom < 320);
        }
        setShowPopup(v => !v);
    };

    return (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={badgeRef}>
            <span className="po-status-badge"
                style={{ background: cfg.bg, color: cfg.color, cursor: 'pointer', userSelect: 'none' }}
                onClick={handleClick}
                title="Click to view approval history">
                <span className="po-status-dot" style={{ background: cfg.dot }} />
                {cfg.label}
            </span>
            {showPopup && (
                <ApprovalPopup
                    poId={poId}
                    flipUp={flipUp}
                    onClose={() => setShowPopup(false)}
                />
            )}
        </div>
    );
};

// ── PO Quick View Modal ────────────────────────────────────────────
const PoQuickView = ({ poId, onClose }) => {
    const [po,      setPo]      = useState(null);
    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);
    const { getStatusConfig } = useLookup();

    useEffect(() => {
        Promise.all([
            fetch(`${variables.API_URL}purchaseorder/${poId}`,          { headers: authHeaders() }).then(r => r.json()),
            fetch(`${variables.API_URL}purchaseorder/lines/${poId}`,    { headers: authHeaders() }).then(r => r.json()),
        ]).then(([poData, linesData]) => {
            setPo(poData);
            setLines(Array.isArray(linesData) ? linesData : []);
        }).catch(console.error)
        .finally(() => setLoading(false));
    }, [poId]);

    const raw = po ? getStatusConfig('PO', po.status) : null;
    const statusCfg = raw ? { bg: raw.badgeBg, color: raw.badgeColor, dot: raw.badgeDot, label: raw.statusLabel }
                           : (PO_STATUS[po?.status] || PO_STATUS.Draft);
    const grandTotal = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: '#fff', borderRadius: 12, width: 900, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>

                {/* Header */}
                <div style={{ background: '#1e3a5f', padding: '16px 24px', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {loading ? <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Loading…</span> : (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, fontFamily: 'Courier New' }}>{po?.poNumber}</span>
                                {po?.revision > 0 && <span style={{ background: 'rgba(255,255,255,.2)', color: '#fff', padding: '1px 8px', borderRadius: 6, fontSize: 11 }}>Rev {po.revision}</span>}
                                <span style={{ background: statusCfg.bg, color: statusCfg.color, padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{statusCfg.label}</span>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, marginTop: 4 }}>
                                {po?.vendorName} {po?.jobId ? `· Job: ${po.jobId}` : ''} {po?.poDate ? `· ${fmtDate(po.poDate)}` : ''}
                            </div>
                        </div>
                    )}
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>

                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading PO details…</div>
                ) : (
                    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                        {/* KPI strip */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                            {[
                                { label: 'Date',           val: fmtDate(po?.poDate) },
                                { label: 'Currency',       val: po?.currencyShort || '—' },
                                { label: 'Payment Terms',  val: po?.paymentTermsName || '—' },
                                { label: 'Delivery Date',  val: po?.deliveryDate ? fmtDate(po.deliveryDate) : '—' },
                                { label: 'Vendor Ref',     val: po?.vendorRef || '—' },
                                { label: 'Created By',     val: po?.createdBy || '—' },
                            ].map(({ label, val }) => (
                                <div key={label} style={{ minWidth: 120 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, marginTop: 2 }}>{val}</div>
                                </div>
                            ))}
                        </div>

                        {/* Lines table */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        {['#','Item Code','Description','Ordered','Received','UOM','Unit Price','Tax%','Line Total','Status'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: ['Ordered','Received','Unit Price','Tax%','Line Total'].includes(h) ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.length === 0 ? (
                                        <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No lines found.</td></tr>
                                    ) : lines.map((l, i) => (
                                        <tr key={l.poLineId} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#f8fafc' : '#fff' }}>
                                            <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{l.lineNum}</td>
                                            <td style={{ padding: '7px 10px' }}>
                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '1px 5px', borderRadius: 3 }}>{l.itemCode || '—'}</span>
                                            </td>
                                            <td style={{ padding: '7px 10px', color: '#1e293b' }}>{l.itemDesc}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.orderedQty)}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#16a34a' }}>{fmt(l.receivedQty)}</td>
                                            <td style={{ padding: '7px 10px', color: '#64748b' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.unitPrice)}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b' }}>{l.taxPct ? `${l.taxPct}%` : '—'}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(l.lineTotal)}</td>
                                            <td style={{ padding: '7px 10px' }}>
                                                {(() => {
                                                    const ls = l.lineStatus || 'Open';
                                                    const sc = { Open:'#f1f5f9', Partial:'#fef3c7', Received:'#d1fae5', Closed:'#f3f4f6', Cancelled:'#fee2e2' };
                                                    const tc = { Open:'#475569', Partial:'#92400e', Received:'#065f46', Closed:'#374151', Cancelled:'#991b1b' };
                                                    return <span style={{ background: sc[ls]||'#f1f5f9', color: tc[ls]||'#475569', padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>{ls}</span>;
                                                })()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {lines.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: '#f4f7fb', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ padding: '8px 10px', textAlign: 'right', fontSize: 11, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.03em' }}>Grand Total</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#1e3a5f', fontSize: 13 }}>{fmt(grandTotal)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {/* Notes */}
                        {po?.notes && (
                            <div style={{ marginTop: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#475569', borderLeft: '3px solid #cbd5e1' }}>
                                <strong>Notes:</strong> {po.notes}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '0 0 12px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                    <button onClick={onClose} style={{ padding: '7px 20px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#475569' }}>Close</button>
                </div>
            </div>
        </div>
    );
};

// ── New PO Form ───────────────────────────────────────────────────
const PoForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq }   = useFieldConfig('PO');
    const { currencies, paymentTerms, deliveryTerms } = lookups;
    const [budgetCategories, setBudgetCategories] = useState([]);

    const [form, setForm] = useState({
        poDate:              today(),
        supplierId:          '',
        supplierLabel:       '',
        vendorName:          '',
        vatNumber:           '',
        supplierContactId:   '',
        jobId:               '',
        jobLabel:            '',
        vendorRef:           '',
        currencyId:          '',
        exchangeRate:        '1',
        paymentTermsId:      '',
        deliveryDate:        '',
        deliveryAddr:        '',
        deliveryTerms:       '',
        discount:            '',
        notes:               '',
        expenseCategoryId:   '',
    });
    const [supplierSearch,   setSupplierSearch]   = useState('');
    const [supplierResults,  setSupplierResults]  = useState([]);
    const [contacts,         setContacts]         = useState([]);
    const [jobSearch,        setJobSearch]        = useState('');
    const [jobResults,       setJobResults]       = useState([]);
    const [errors,          setErrors]          = useState({});
    const [saving,          setSaving]          = useState(false);
    const [error,           setError]           = useState('');
    const [previewNo,       setPreviewNo]       = useState('');
    const [draftWarn,       setDraftWarn]       = useState(null);

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/PO`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        fetch(`${variables.API_URL}Lookup/budgetcategories`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setBudgetCategories(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    // ── Supplier live-search ──────────────────────────────────────
    useEffect(() => {
        if (!supplierSearch.trim()) { setSupplierResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(supplierSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setSupplierResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [supplierSearch]);

    // ── Supplier contacts ─────────────────────────────────────────
    useEffect(() => {
        if (!form.supplierId) { setContacts([]); return; }
        fetch(`${variables.API_URL}supplier/contacts/${form.supplierId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const list = Array.isArray(d) ? d.filter(c => c.isActive !== false) : [];
                setContacts(list);
                // Auto-select the primary contact
                const primary = list.find(c => c.isPrimary) || list[0] || null;
                setForm(p => ({ ...p, supplierContactId: primary ? String(primary.supplierContactId) : '' }));
                if (primary) setErrors(p => ({ ...p, supplierContactId: undefined }));
            })
            .catch(console.error);
    }, [form.supplierId]);

    // ── Job live-search ───────────────────────────────────────────
    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    // ── Field handlers ────────────────────────────────────────────
    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const handleCurrency = e => {
        const id = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
    };

    const validate = () => {
        const e = {};
        if (!form.poDate)                                      e.poDate         = 'PO date is required.';
        if (!form.jobId)                                       e.jobId          = 'Job is required.';
        if (!form.supplierId)                                  e.supplierId          = 'Supplier is required.';
        if (!form.supplierContactId)                           e.supplierContactId   = 'Contact is required.';
        if (!form.currencyId)                                  e.currencyId     = 'Currency is required.';
        if (!form.exchangeRate || Number(form.exchangeRate) <= 0)
                                                               e.exchangeRate   = 'Exchange rate must be greater than 0.';
        if (!form.paymentTermsId)                              e.paymentTermsId = 'Payment Terms is required.';
        if (!form.deliveryTerms)                               e.deliveryTerms  = 'Delivery Terms is required.';
        if (!form.expenseCategoryId)                           e.expenseCategoryId = 'Budget Category is required.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaseorder/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                poId:              0,
                poDate:            form.poDate,
                supplierId:        form.supplierId        ? Number(form.supplierId)        : null,
                supplierContactId: form.supplierContactId ? Number(form.supplierContactId) : null,
                vendorName:        form.vendorName        || null,
                jobId:             form.jobId             || null,
                vendorRef:         form.vendorRef.trim()  || null,
                currencyId:        form.currencyId        ? Number(form.currencyId)        : null,
                exchangeRate:      form.exchangeRate      ? Number(form.exchangeRate)       : 1,
                paymentTermsId:    form.paymentTermsId    ? Number(form.paymentTermsId)    : null,
                deliveryDate:      form.deliveryDate      || null,
                deliveryAddr:      form.deliveryAddr?.trim() || null,
                deliveryTerms:     form.deliveryTerms     || null,
                discount:          form.discount          ? Number(form.discount)          : null,
                notes:             form.notes.trim()      || null,
                expenseCategoryId: form.expenseCategoryId ? Number(form.expenseCategoryId) : null,
                createdBy:         currentUser,
                modifiedBy:        null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                onSaved(d.id);
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    // ── Shared dropdown style ─────────────────────────────────────
    const dropStyle  = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem   = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            {/* ── Draft POs warning modal ── */}
            {draftWarn && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 480, width: '92%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 22 }}>⚠️</span>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Draft POs already exist for this job</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Consider opening one of these before creating a new PO.</div>
                            </div>
                        </div>
                        <div style={{ borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', padding: '8px 0', marginBottom: 16 }}>
                            {draftWarn.map(r => (
                                <div key={r.poId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #fef3c7' }}>
                                    <span style={{ fontFamily: 'Courier New', fontSize: 12, fontWeight: 700, color: '#065f46', background: '#d1fae5', padding: '2px 7px', borderRadius: 4 }}>
                                        {r.poNumber}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {(() => { const lc = r.lineCount ?? 0; return lc === 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>No lines</span> : `${lc} line${lc !== 1 ? 's' : ''}`; })()}
                                        {r.poDate ? ` · ${fmtDate(r.poDate)}` : ''}
                                    </span>
                                    <a href={`/purchase-orders/${r.poId}`} target="_blank" rel="noreferrer"
                                        style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                                        Open ↗
                                    </a>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setDraftWarn(null)}
                                style={{ padding: '6px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Create Anyway
                            </button>
                            <button onClick={() => { setDraftWarn(null); setForm(p => ({ ...p, jobId: '', jobLabel: '' })); setJobSearch(''); }}
                                style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Purchase Order</div>
                        <div className="pf-header-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: 4, letterSpacing: '0.03em' }}>{previewNo}</span></>
                                : 'PO number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <FormSection label="Details" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>PO Date {isReq('poDate') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.poDate ? ' pf-input-err' : ''}`} type="date" name="poDate" value={form.poDate} onChange={handle} />
                            {errors.poDate && <span className="pf-field-err">{errors.poDate}</span>}
                        </div>
                    </div>

                    <FormSection label="Job" />
                    <div className="pf-row">
                        {/* ── Job live-search ── */}
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Job {isReq('jobId') && <span className="req">*</span>}</label>
                            {form.jobId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.jobLabel}
                                    </span>
                                    <button type="button"
                                        onClick={() => { setForm(p => ({ ...p, jobId: '', jobLabel: '' })); setJobSearch(''); }}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <input className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`} value={jobSearch}
                                        onChange={e => { setJobSearch(e.target.value); if (errors.jobId) setErrors(p => ({ ...p, jobId: undefined })); }}
                                        placeholder="Type job ID or description…" autoComplete="off" />
                                    {errors.jobId && <span className="pf-field-err">{errors.jobId}</span>}
                                    {jobResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {jobResults.map(j => (
                                                <div key={j.jobId} style={dropItem}
                                                    onClick={() => {
                                        setForm(p => ({ ...p, jobId: j.jobId, jobLabel: `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}` }));
                                        setJobSearch(''); setJobResults([]);
                                        if (errors.jobId) setErrors(p => ({ ...p, jobId: undefined }));
                                        fetch(`${variables.API_URL}purchaseorder/search?jobId=${encodeURIComponent(j.jobId)}&status=Draft&pageSize=50&page=1`, { headers: authHeaders() })
                                            .then(r => r.ok ? r.json() : null)
                                            .then(d => { const drafts = d?.data || []; if (drafts.length > 0) setDraftWarn(drafts); })
                                            .catch(() => {});
                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong>{j.jobId}</strong>
                                                    {j.projectName  && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                    {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, display: 'block' }}>
                                Purchase Requests are linked per line — add them after saving the PO header
                            </span>
                        </div>
                    </div>

                    <FormSection label="Budget Category" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Expense Category <span className="req">*</span> <span style={{ color: '#64748b', fontSize: 11, fontWeight: 400 }}>(for budget tracking)</span></label>
                            <select className={`pf-input${errors.expenseCategoryId ? ' pf-input-err' : ''}`}
                                name="expenseCategoryId" value={form.expenseCategoryId}
                                onChange={e => { handle(e); if (errors.expenseCategoryId) setErrors(p => ({ ...p, expenseCategoryId: undefined })); }}>
                                <option value="">— Select category —</option>
                                {budgetCategories.map(c => (
                                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                                ))}
                            </select>
                            {errors.expenseCategoryId && (
                                <span style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'block' }}>
                                    {errors.expenseCategoryId}
                                </span>
                            )}
                            <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, display: 'block' }}>
                                PO amount will appear as actual cost in this budget category
                            </span>
                        </div>
                    </div>

                    <FormSection label="Supplier" />
                    <div className="pf-row">
                        {/* ── Supplier live-search ── */}
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Supplier {isReq('supplierId') && <span className="req">*</span>}</label>
                            {form.supplierId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.supplierLabel}
                                    </span>
                                    <button type="button" onClick={() => { setForm(p => ({ ...p, supplierId: '', supplierLabel: '', vendorName: '', vatNumber: '', supplierContactId: '' })); setSupplierSearch(''); setContacts([]); if (errors.supplierId) setErrors(p => ({ ...p, supplierId: undefined })); }}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <input className={`pf-input${errors.supplierId ? ' pf-input-err' : ''}`} value={supplierSearch}
                                        onChange={e => { setSupplierSearch(e.target.value); if (errors.supplierId) setErrors(p => ({ ...p, supplierId: undefined })); }}
                                        placeholder="Type to search supplier…" autoComplete="off" />
                                    {supplierResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {supplierResults.map(s => (
                                                <div key={s.supplierId} style={dropItem}
                                                    onClick={() => { setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: `${s.supplierCode} — ${s.supplierName}`, vendorName: s.supplierName, vatNumber: s.vatNumber || '' })); setSupplierSearch(''); setSupplierResults([]); if (errors.supplierId) setErrors(p => ({ ...p, supplierId: undefined })); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong>{s.supplierCode}</strong> — {s.supplierName}
                                                    {s.supplierCategoryName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>{s.supplierCategoryName}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            {errors.supplierId && <span className="pf-field-err">{errors.supplierId}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Contact Person <span className="req">*</span></label>
                            <select className={`pf-input${errors.supplierContactId ? ' pf-input-err' : ''}`} name="supplierContactId" value={form.supplierContactId} onChange={handle} disabled={!form.supplierId}>
                                <option value="">— Select contact —</option>
                                {contacts.map(c => (
                                    <option key={c.supplierContactId} value={c.supplierContactId}>
                                        {c.contactName}{c.designation ? ` (${c.designation})` : ''}{c.mobile ? ` · ${c.mobile}` : c.phone ? ` · ${c.phone}` : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.supplierContactId && <span className="pf-field-err">{errors.supplierContactId}</span>}
                        </div>
                        <div className="pf-field">
                            <label>VAT / TRN No.</label>
                            <input
                                className="pf-input"
                                value={form.vatNumber || '—'}
                                readOnly
                                style={{ background: '#f8fafc', color: form.vatNumber ? '#1e293b' : '#94a3b8', cursor: 'default' }}
                            />
                        </div>
                        <div className="pf-field">
                            <label>Vendor / Quote Ref</label>
                            <input className="pf-input" type="text" name="vendorRef" value={form.vendorRef} onChange={handle} placeholder="Quotation or ref #" />
                        </div>
                    </div>

                    <FormSection label="Financial & Delivery" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Currency {isReq('currencyId') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`} name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                                <option value="">— Select —</option>
                                {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                            </select>
                            {errors.currencyId && <span className="pf-field-err">{errors.currencyId}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 120px' }}>
                            <label>Exch. Rate {isReq('exchangeRate') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.exchangeRate ? ' pf-input-err' : ''}`} type="number" name="exchangeRate" value={form.exchangeRate} onChange={handle} step="0.000001" />
                            {errors.exchangeRate && <span className="pf-field-err">{errors.exchangeRate}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Payment Terms {isReq('paymentTermsId') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.paymentTermsId ? ' pf-input-err' : ''}`} name="paymentTermsId" value={form.paymentTermsId} onChange={handle}>
                                <option value="">— Select —</option>
                                {paymentTerms.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                            </select>
                            {errors.paymentTermsId && <span className="pf-field-err">{errors.paymentTermsId}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 110px' }}>
                            <label>Discount %</label>
                            <input className="pf-input" type="number" name="discount" value={form.discount} onChange={handle} placeholder="0.00" />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Expected Delivery</label>
                            <input className="pf-input" type="date" name="deliveryDate" value={form.deliveryDate} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Delivery Terms {isReq('deliveryTerms') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.deliveryTerms ? ' pf-input-err' : ''}`} name="deliveryTerms" value={form.deliveryTerms} onChange={handle}>
                                <option value="">— Select —</option>
                                {deliveryTerms.map(dt => (
                                    <option key={dt.id} value={dt.code}>{dt.code} — {dt.name}</option>
                                ))}
                            </select>
                            {errors.deliveryTerms && <span className="pf-field-err">{errors.deliveryTerms}</span>}
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Delivery Address</label>
                            <input className="pf-input" type="text" name="deliveryAddr" value={form.deliveryAddr} onChange={handle} placeholder="Delivery location or address" />
                        </div>
                    </div>

                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes / Terms</label>
                            <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} placeholder="Additional terms, notes…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create PO'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ─────────────────────────────────────────────────
export const Po = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getModuleStatuses, getVList } = useLookup();
    const { canDo } = usePermission();
    const canAdd    = canDo('/purchase-orders', 'ADD');

    const [rows,        setRows]       = useState([]);
    const [loading,     setLoading]   = useState(false);
    const [totalRows,   setTotal]     = useState(0);
    const [totalPages,  setPages]     = useState(1);
    const [page,        setPage]      = useState(1);
    const [pageSize,    setPageSize]  = useState(20);
    const [sortCol,     setSortCol]   = useState('PoDate');
    const [sortDir,     setSortDir]   = useState('DESC');
    const [quickViewId, setQuickView] = useState(null);
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'PoDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    // Fetch active jobs for the Job ID filter dropdown
    const [jobOptions,      setJobOptions]      = useState([]);
    const [supplierOptions, setSupplierOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobOptions((d.data || []).map(j => ({
                value: j.jobId,
                label: j.jobId + (j.projectName ? ' — ' + j.projectName : ''),
            })))).catch(console.error);

        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions((d.data || []).map(s => ({
                value: String(s.supplierId),
                label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName,
            })))).catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)  q.set('searchText',  af.searchText);
        if (af.status)      q.set('status',      af.status);
        if (af.supplierId)  q.set('supplierId',  af.supplierId);
        if (af.jobId)       q.set('jobId',       af.jobId);
        if (af.priority)    q.set('priority',    af.priority);
        if (af.createdBy)   q.set('createdBy',   af.createdBy);
        if (af.dateFrom)    q.set('dateFrom',    af.dateFrom);
        if (af.dateTo)      q.set('dateTo',      af.dateTo);
        fetch(`${variables.API_URL}purchaseorder/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    // Build filter defs — called with latest options snapshots
    const buildDefs = (jobOpts, supplierOpts) => ({
        searchText:  { label: 'Search',     type: 'text',   placeholder: 'PO #, vendor, ref…' },
        status:      { label: 'Status',     type: 'multiselect',
                       options: getModuleStatuses('PO').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        supplierId:  { label: 'Supplier',   type: 'select', placeholder: 'All Suppliers', options: supplierOpts },
        jobId:       { label: 'Job ID',     type: 'select', placeholder: 'All Jobs',      options: jobOpts },
        priority:    { label: 'Priority',   type: 'select', placeholder: 'All Priorities', options: getVList('Procurement', 'Priority') },
        createdBy:   { label: 'Created By', type: 'text',   placeholder: 'Username…' },
        dateFrom:    { label: 'Date From',  type: 'date' },
        dateTo:      { label: 'Date To',    type: 'date' },
    });

    // Register filter panel on mount
    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('purchaseorder', buildDefs([], []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('purchaseorder');
    }, []); // eslint-disable-line

    // Patch options whenever jobs or suppliers finish loading (does NOT reset applied filters)
    useEffect(() => {
        updateFilterDefs('purchaseorder', buildDefs(jobOptions, supplierOptions));
    }, [jobOptions, supplierOptions, getModuleStatuses, getVList]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = (newId) => {
        setShowForm(false);
        // Navigate straight to Lines tab so user can immediately import from PR
        navigate(`/purchase-orders/${newId}?tab=lines`);
    };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {showForm && <PoForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
            {quickViewId && <PoQuickView poId={quickViewId} onClose={() => setQuickView(null)} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Purchase Orders</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New PO</button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <span className="po-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="PoNumber">PO #</Th>
                                <Th col="PoDate">Date</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="VendorName">Vendor</Th>
                                <Th col="Status">Status</Th>
                                <Th col="Priority">Priority</Th>
                                <Th col="CurrencyShort">Currency</Th>
                                <Th col="TotalAmount">Total</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No purchase orders found. Use the filters on the left or create a new PO.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.poId} style={r.status === 'Draft' ? { background: '#fffbeb' } : undefined}>
                                    <td>
                                        <RowLink className="po-num-link" to={`/purchase-orders/${r.poId}`}>
                                            {r.poNumber}
                                        </RowLink>
                                    </td>
                                    <td>{fmtDate(r.poDate)}</td>
                                    <td>
                                        {r.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>
                                        }
                                    </td>
                                    <td>{r.vendorName || '—'}</td>
                                    <td><StatusBadge status={r.status} poId={r.poId} /></td>
                                    <td>
                                        {r.priority ? (() => {
                                            const pc = PRIORITY_CONFIG[r.priority] || {};
                                            return <span style={{ background: pc.bg, color: pc.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{r.priority}</span>;
                                        })() : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>{r.currencyShort || r.currencyName || '—'}</td>
                                    <td className="po-num-cell">{fmt(r.totalAmount)}</td>
                                    <td style={{ display: 'flex', gap: 4 }}>
                                        <button className="po-act-btn po-act-open"
                                            onClick={() => setQuickView(r.poId)}
                                            title="Quick view — see PO details without leaving this page">
                                            👁 View
                                        </button>
                                        <RowLink className="po-act-btn" to={`/purchase-orders/${r.poId}`}
                                            style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}
                                            title="Open full detail page">
                                            ↗
                                        </RowLink>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}           disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}    disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn ${n === page ? 'po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}    disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)}  disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Po;

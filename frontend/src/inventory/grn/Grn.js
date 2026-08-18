import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useFilters } from '../../FilterContext';
import { useInitialFilters } from '../../utils/useInitialFilters';
import { usePermission } from '../../PermissionContext';
import { useFieldConfig } from '../../FieldConfigContext';
import { DOC_STATUS, RECEIPT_TYPE, fmt, fmtDate } from '../inventoryConstants';
import { useLookup } from '../../LookupContext';
import '../../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', receiptType: '', status: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col
        ? <span className="po-sort-none">⇅</span>
        : <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

const StatusBadge = ({ status }) => {
    const s = DOC_STATUS[status] || { label: status, color: '#64748b', bg: '#f1f5f9' };
    return (
        <span className="po-status-badge" style={{ background: s.bg, color: s.color }}>
            <span className="po-status-dot" style={{ background: s.color }} />
            {s.label}
        </span>
    );
};

const TypeTag = ({ type }) => {
    const t = RECEIPT_TYPE[type] || { label: type, color: '#64748b', bg: '#f1f5f9' };
    return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 600, background: t.bg, color: t.color }}>
            {t.label}
        </span>
    );
};

// ── New GRN slide-over ──────────────────────────────────────────
const NewGrnSlideOver = ({ onClose, onCreated }) => {
    const currentUser = useCurrentUser();
    const { isReq }   = useFieldConfig('STOCK_RECEIPT');
    const { getVList } = useLookup();
    const receiptTypeOptions = getVList('Inventory', 'ReceiptType');

    const [form, setForm] = useState({
        receiptDate:  new Date().toISOString().slice(0, 10),
        receiptType:  'STORE',
        jobId:        '',
        supplierId:   '',
        supplierName: '',
        supplierRef:  '',
        poNumber:     '',
        notes:        '',
    });
    const [errors,    setErrors]    = useState({});
    const [saving,    setSaving]    = useState(false);
    const [saveError, setSaveError] = useState('');
    const [supplierOptions, setSupplierOptions] = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions((d.data || []).map(s => ({
                value: String(s.supplierId),
                label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName,
                name:  s.supplierName,
            }))))
            .catch(console.error);
    }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const validate = () => {
        const e = {};
        if (!form.receiptDate) e.receiptDate = 'Date is required.';
        if (form.receiptType === 'JOB' && !form.jobId.trim()) e.jobId = 'Job ID is required for Job Purchase.';
        return e;
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length) return;
        setSaving(true); setSaveError('');
        try {
            const res = await fetch(`${variables.API_URL}stockreceipt/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    receiptId:    0,
                    receiptDate:  form.receiptDate  || null,
                    receiptType:  form.receiptType,
                    jobId:        form.jobId        || null,
                    supplierId:   form.supplierId   ? Number(form.supplierId) : null,
                    supplierName: form.supplierName || null,
                    supplierRef:  form.supplierRef  || null,
                    poNumber:     form.poNumber     || null,
                    notes:        form.notes        || null,
                    createdBy:    currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setSaveError(d?.message || 'Save failed.'); return; }
            onCreated(d.receiptId);
        } catch { setSaveError('Network error.'); }
        finally { setSaving(false); }
    };

    const Lbl = ({ children, req }) => (
        <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>
            {children}{req && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
        </div>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ width: 460, background: '#fff', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-8px 0 40px rgba(0,0,0,.18)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '18px 22px 16px', background: 'var(--primary,#2e5fa3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>+ New GRN</div>
                        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>Create a Goods Receipt Note</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px', background: '#f9fbfd' }}>
                    {saveError && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 14 }}>
                            ❌ {saveError}
                        </div>
                    )}

                    {/* Section: Receipt Type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary,#2e5fa3)', textTransform: 'uppercase', letterSpacing: '.7px', whiteSpace: 'nowrap' }}>Receipt Details</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--primary-light,#dde8f5)' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: '0 0 160px' }}>
                            <Lbl req={isReq('receiptDate')}>Receipt Date</Lbl>
                            <input className={`pf-input${errors.receiptDate ? ' pf-input-err' : ''}`} type="date"
                                value={form.receiptDate} onChange={e => set('receiptDate', e.target.value)} />
                            {errors.receiptDate && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{errors.receiptDate}</div>}
                        </div>
                        <div style={{ flex: 1 }}>
                            <Lbl req={isReq('receiptType')}>Receipt Type</Lbl>
                            <select className="pf-input" value={form.receiptType} onChange={e => set('receiptType', e.target.value)}>
                                {receiptTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {form.receiptType === 'JOB' && (
                        <div style={{ marginBottom: 10 }}>
                            <Lbl req>Job ID</Lbl>
                            <input className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`}
                                placeholder="e.g. JOB-2026-0001"
                                value={form.jobId} onChange={e => set('jobId', e.target.value)} />
                            {errors.jobId && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{errors.jobId}</div>}
                        </div>
                    )}

                    {/* Section: Supplier */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary,#2e5fa3)', textTransform: 'uppercase', letterSpacing: '.7px', whiteSpace: 'nowrap' }}>Supplier</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--primary-light,#dde8f5)' }} />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                        <Lbl>Supplier</Lbl>
                        <select className="pf-input"
                            value={form.supplierId}
                            onChange={e => {
                                const opt = supplierOptions.find(o => o.value === e.target.value);
                                setForm(f => ({ ...f, supplierId: e.target.value, supplierName: opt?.name || '' }));
                            }}>
                            <option value="">— Select supplier —</option>
                            {supplierOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                            <Lbl>Supplier Ref</Lbl>
                            <input className="pf-input" placeholder="Delivery order / invoice no."
                                value={form.supplierRef} onChange={e => set('supplierRef', e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Lbl>PO Number</Lbl>
                            <input className="pf-input" placeholder="Linked purchase order"
                                value={form.poNumber} onChange={e => set('poNumber', e.target.value)} />
                        </div>
                    </div>

                    {/* Section: Notes */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary,#2e5fa3)', textTransform: 'uppercase', letterSpacing: '.7px', whiteSpace: 'nowrap' }}>Notes</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--primary-light,#dde8f5)' }} />
                    </div>
                    <div style={{ marginBottom: 10 }}>
                        <textarea className="pf-input" rows={3} placeholder="Optional notes…"
                            value={form.notes} onChange={e => set('notes', e.target.value)}
                            style={{ resize: 'vertical', minHeight: 64 }} />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 22px', background: '#f0f4f9', borderTop: '1px solid #dde6f0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <button className="pf-btn-sec" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create GRN'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main GRN List Page ──────────────────────────────────────────
export const Grn = () => {
    const navigate  = useNavigate();
    const { getModuleStatuses, getVList } = useLookup();
    const { canDo } = usePermission();
    const canAdd    = canDo('/inventory-grn', 'ADD');
    const { registerFilters, unregisterFilters } = useFilters();
    // Restored from this tab's last applied filters, so opening a receipt and
    // coming back keeps the search; DEFAULT_FILTERS on the first visit.
    const initialFilters = useInitialFilters(DEFAULT_FILTERS, 'inventory-grn');

    const [rows,       setRows]      = useState([]);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(200);
    const [sortCol,    setSortCol]   = useState('ReceiptDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [loading,    setLoading]   = useState(false);
    const [applied,    setApplied]   = useState({ ...initialFilters });
    const [showNew,    setShowNew]   = useState(false);
    const [listError,  setListError] = useState('');

    const gridRef = useRef({ pageSize: 200, sortCol: 'ReceiptDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setListError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortColumn: sc, sortDirection: sd });
        if (af.searchText)  q.set('searchText',  af.searchText);
        if (af.receiptType) q.set('receiptType',  af.receiptType);
        if (af.status)      q.set('status',       af.status);
        if (af.dateFrom)    q.set('dateFrom',     af.dateFrom);
        if (af.dateTo)      q.set('dateTo',       af.dateTo);
        fetch(`${variables.API_URL}stockreceipt/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                setRows(res.data || []);
                setTotal(res.totalRows || 0);
                setPages(Math.ceil((res.totalRows || 0) / ps) || 1);
            })
            .catch(e => setListError(e.message || 'Failed to load GRNs.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, initialFilters); }, [load]); // eslint-disable-line

    const buildDefs = () => ({
        searchText:  { label: 'Search',       type: 'text',   placeholder: 'GRN no., supplier, job…' },
        receiptType: { label: 'Receipt Type', type: 'select', placeholder: 'All Types',
                       options: getVList('Inventory', 'ReceiptType') },
        status:      { label: 'Status',       type: 'select', placeholder: 'All Statuses',
                       options: getModuleStatuses('RCPT').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        dateFrom:    { label: 'Date From',    type: 'date' },
        dateTo:      { label: 'Date To',      type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        // Key is 'inventory-grn', not 'grn' — /grn (procurement receipts) is a
        // different page with a different filter set, and both share this
        // registry. Sibling inventory pages key off their route the same way.
        registerFilters('inventory-grn', buildDefs(), initialFilters, onApply);
        return () => unregisterFilters('inventory-grn');
    }, [getModuleStatuses, getVList]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage = (p) => {
        const pg = Math.max(1, Math.min(p, totalPages));
        setPage(pg);
        load(pg, pageSize, sortCol, sortDir, applied);
    };

    const changePageSize = (ps) => {
        setPageSize(ps); setPage(1);
        load(1, ps, sortCol, sortDir, applied);
    };

    const Th = ({ col, children, style }) => (
        <th className="po-th-sortable" style={style} onClick={() => handleSort(col)}>
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
            {showNew && (
                <NewGrnSlideOver
                    onClose={() => setShowNew(false)}
                    onCreated={id => { setShowNew(false); navigate(`/inventory-grn/${id}`); }}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Goods Receipt Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" style={{ width: 110 }} value={pageSize}
                                onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && (
                                <button className="po-btn-pri" onClick={() => setShowNew(true)}>+ New GRN</button>
                            )}
                        </div>
                    </div>
                </div>

                {listError && (
                    <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 16px', fontSize: 12.5, borderBottom: '1px solid #fecaca' }}>
                        ⚠ {listError}
                    </div>
                )}

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
                                <Th col="ReceiptNo">GRN No.</Th>
                                <Th col="ReceiptDate">Date</Th>
                                <th>Type</th>
                                <Th col="SupplierName">Supplier</Th>
                                <th>Job</th>
                                <th>PO No.</th>
                                <th style={{ textAlign: 'center' }}>Lines</th>
                                <Th col="TotalCost" style={{ textAlign: 'right' }}>Total Cost</Th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={10} className="po-empty">
                                        No GRNs found. Use the filters on the left or create a new GRN.
                                    </td>
                                </tr>
                            ) : rows.map(r => (
                                <tr key={r.receiptId}>
                                    <td>
                                        <button className="po-num-link" onClick={() => navigate(`/inventory-grn/${r.receiptId}`)}>
                                            {r.receiptNo}
                                        </button>
                                    </td>
                                    <td>{fmtDate(r.receiptDate)}</td>
                                    <td><TypeTag type={r.receiptType} /></td>
                                    <td style={{ color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.supplierName || '—'}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 600, color: r.jobId ? '#1e40af' : '#94a3b8' }}>
                                        {r.jobId || '—'}
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{r.poNumber || '—'}</td>
                                    <td style={{ textAlign: 'center', color: '#64748b' }}>{r.lineCount}</td>
                                    <td className="po-num-cell" style={{ fontWeight: 600 }}>{fmt(r.totalCost)}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td>
                                        <button className="po-act-btn po-act-open"
                                            onClick={() => navigate(`/inventory-grn/${r.receiptId}`)}>
                                            Open
                                        </button>
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
                        <button className="po-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n}
                                className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`}
                                onClick={() => goPage(n)}>
                                {n}
                            </button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Grn;

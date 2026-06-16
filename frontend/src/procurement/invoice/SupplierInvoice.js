import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, FormSection, statusBadgeCfg } from '../procurementConstants';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_FILTERS = { searchText: '', supplierId: '', status: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── New Invoice Form (quick create) ──────────────────────────────────
const InvoiceForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups, baseCurrency } = useLookup();
    const { currencies, paymentTerms } = lookups;

    const INITIAL = {
        supplierSearch: '', supplierId: '', supplierName: '',
        supplierInvRef: '', invoiceDate: today(),
        currencyId: '', exchangeRate: '1',
        paymentTermsId: '', dueDate: '', notes: '',
    };

    const [form,            setForm]            = useState(INITIAL);
    const [supplierResults, setSupplierResults] = useState([]);
    const [errors,          setErrors]          = useState({});
    const [saving,          setSaving]          = useState(false);
    const [serverError,     setServerError]     = useState('');

    // Default to base currency once currencies are loaded
    useEffect(() => {
        if (baseCurrency && !form.currencyId) {
            setForm(p => ({
                ...p,
                currencyId:   String(baseCurrency.id),
                exchangeRate: String(baseCurrency.exchangeRate ?? 1),
            }));
        }
    }, [baseCurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!form.supplierSearch.trim() || form.supplierId) { setSupplierResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(form.supplierSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setSupplierResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [form.supplierSearch, form.supplierId]);

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const handleCurrency = e => {
        const id  = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
    };

    const selectSupplier = s => {
        setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierName: s.supplierName, supplierSearch: '' }));
        setSupplierResults([]);
        if (errors.supplierId) setErrors(p => ({ ...p, supplierId: undefined }));
    };

    const clearSupplier = () => setForm(p => ({ ...p, supplierId: '', supplierName: '', supplierSearch: '' }));

    const validate = f => {
        const e = {};
        if (!f.supplierId)             e.supplierId      = 'Supplier is required.';
        if (!f.invoiceDate)            e.invoiceDate     = 'Invoice date is required.';
        if (!f.supplierInvRef.trim())  e.supplierInvRef  = 'Supplier invoice reference is required.';
        if (!f.currencyId)             e.currencyId      = 'Currency is required.';
        if (!f.exchangeRate || Number(f.exchangeRate) <= 0) e.exchangeRate = 'Exchange rate must be > 0.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setServerError(''); setSaving(true);
        fetch(`${variables.API_URL}supplierinvoice/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                supplierInvoiceId: 0,
                supplierInvRef:    form.supplierInvRef.trim() || null,
                invoiceDate:       form.invoiceDate,
                supplierId:        Number(form.supplierId),
                currencyId:        Number(form.currencyId),
                exchangeRate:      Number(form.exchangeRate),
                paymentTermsId:    form.paymentTermsId ? Number(form.paymentTermsId) : null,
                dueDate:           form.dueDate || null,
                subTotal: 0, taxAmount: 0, totalAmount: 0,
                notes:             form.notes.trim() || null,
                createdBy:         currentUser,
                modifiedBy:        null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerError(d.message || 'Error saving.'); return; }
                onSaved(d.id);
            })
            .catch(() => setServerError('Network error.'))
            .finally(() => setSaving(false));
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 640 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Supplier Invoice</div>
                        <div className="pf-header-sub">Invoice number will be assigned automatically.</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverError && <div className="pf-err">{serverError}</div>}

                    <FormSection label="Supplier" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Supplier <span className="req">*</span></label>
                            {form.supplierId ? (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="pf-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>✓ {form.supplierName}</span>
                                    <button type="button" onClick={clearSupplier} style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <div style={{ position: 'relative' }}>
                                    <input className={`pf-input${errors.supplierId ? ' pf-input-err' : ''}`}
                                        name="supplierSearch" value={form.supplierSearch}
                                        onChange={handle} placeholder="Search supplier…" autoComplete="off" />
                                    {supplierResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {supplierResults.map(s => (
                                                <div key={s.supplierId} style={dropItem}
                                                    onClick={() => selectSupplier(s)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    {s.supplierCode ? `${s.supplierCode} — ` : ''}{s.supplierName}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <FieldErr msg={errors.supplierId} />
                        </div>
                    </div>

                    <FormSection label="Invoice Details" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Invoice Date <span className="req">*</span></label>
                            <input className={`pf-input${errors.invoiceDate ? ' pf-input-err' : ''}`}
                                type="date" name="invoiceDate" value={form.invoiceDate} onChange={handle} />
                            <FieldErr msg={errors.invoiceDate} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Supplier Invoice Ref <span className="req">*</span></label>
                            <input className={`pf-input${errors.supplierInvRef ? ' pf-input-err' : ''}`} type="text" name="supplierInvRef"
                                value={form.supplierInvRef} onChange={handle} placeholder="Supplier's invoice number" />
                            <FieldErr msg={errors.supplierInvRef} />
                        </div>
                    </div>

                    <FormSection label="Currency & Payment" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Currency <span className="req">*</span></label>
                            <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`}
                                name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                                <option value="">— Select —</option>
                                {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                            </select>
                            <FieldErr msg={errors.currencyId} />
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 130px' }}>
                            <label>Exchange Rate <span className="req">*</span></label>
                            <input className={`pf-input${errors.exchangeRate ? ' pf-input-err' : ''}`}
                                type="number" name="exchangeRate" value={form.exchangeRate}
                                onChange={handle} step="0.000001" min="0.000001" />
                            <FieldErr msg={errors.exchangeRate} />
                        </div>
                        <div className="pf-field">
                            <label>Payment Terms</label>
                            <select className="pf-input" name="paymentTermsId" value={form.paymentTermsId} onChange={handle}>
                                <option value="">— None —</option>
                                {paymentTerms.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                            </select>
                        </div>
                        <div className="pf-field">
                            <label>Due Date</label>
                            <input className="pf-input" type="date" name="dueDate" value={form.dueDate} onChange={handle} />
                        </div>
                    </div>

                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <textarea className="pf-input pf-textarea" rows={2} name="notes"
                                value={form.notes} onChange={handle} placeholder="Optional notes…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────────────
const SupplierInvoice = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd   = canDo('/supplier-invoice', 'ADD');

    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(20);
    const [sortCol,    setSortCol]  = useState('InvoiceDate');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm] = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'InvoiceDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [supplierOptions, setSupplierOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions((d.data || []).map(s => ({
                value: String(s.supplierId),
                label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName
            }))))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.supplierId) q.set('supplierId', af.supplierId);
        if (af.status)     q.set('status',     af.status);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}supplierinvoice/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (supplierOpts) => ({
        searchText: { label: 'Search',    type: 'text',        placeholder: 'Invoice #, supplier ref…' },
        supplierId: { label: 'Supplier',  type: 'select',      placeholder: 'All Suppliers', options: supplierOpts },
        status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('SINV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        dateFrom:   { label: 'Date From', type: 'date' },
        dateTo:     { label: 'Date To',   type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('supplier-invoice', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('supplier-invoice');
    }, [getModuleStatuses]); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('supplier-invoice', buildDefs(supplierOptions));
    }, [supplierOptions, getModuleStatuses]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

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
            {showForm && (
                <InvoiceForm
                    onClose={() => setShowForm(false)}
                    onSaved={id => { setShowForm(false); navigate(`/supplier-invoice/${id}`); }}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Supplier Invoices</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Invoice</button>}
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
                                <Th col="InvoiceNo">Invoice #</Th>
                                <Th col="InvoiceDate">Date</Th>
                                <Th col="SupplierName">Supplier</Th>
                                <Th col="SupplierInvRef">Supplier Ref</Th>
                                <Th col="DueDate">Due Date</Th>
                                <Th col="Status">Status</Th>
                                <Th col="SubTotal">Sub Total</Th>
                                <Th col="TaxAmount">Tax</Th>
                                <Th col="TotalAmount">Total</Th>
                                <Th col="PaidAmount">Paid</Th>
                                <Th col="BalanceAmount">Balance</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={12} className="po-empty">No supplier invoices found.</td></tr>
                            ) : rows.map(r => {
                                const statusCfg = statusBadgeCfg(getStatusConfig('SINV', r.status));
                                return (
                                    <tr key={r.supplierInvoiceId}>
                                        <td>
                                            <RowLink className="po-num-link" to={`/supplier-invoice/${r.supplierInvoiceId}`}>
                                                {r.invoiceNo || `#${r.supplierInvoiceId}`}
                                            </RowLink>
                                        </td>
                                        <td>{fmtDate(r.invoiceDate)}</td>
                                        <td>{r.supplierName}</td>
                                        <td>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 12 }}>
                                                {r.supplierInvRef || '—'}
                                            </span>
                                        </td>
                                        <td>{r.dueDate ? fmtDate(r.dueDate) : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                                                <span className="po-status-dot" style={{ background: statusCfg.dot }} />
                                                {statusCfg.label || r.status}
                                            </span>
                                        </td>
                                        <td className="po-num-cell">{fmt(r.subTotal)}</td>
                                        <td className="po-num-cell">{fmt(r.taxAmount)}</td>
                                        <td className="po-num-cell">{fmt(r.totalAmount)}</td>
                                        <td className="po-num-cell" style={{ color: Number(r.paidAmount) > 0 ? '#0f766e' : '#94a3b8' }}>
                                            {Number(r.paidAmount) > 0 ? fmt(r.paidAmount) : '—'}
                                        </td>
                                        <td className="po-num-cell" style={{
                                            color: r.balanceAmount == null ? '#94a3b8'
                                                 : Number(r.balanceAmount) <= 0 ? '#166534'
                                                 : '#b45309',
                                            fontWeight: 600,
                                        }}>
                                            {r.balanceAmount == null ? '—' : fmt(r.balanceAmount)}
                                        </td>
                                        <td>
                                            <RowLink className="po-act-btn po-act-open" to={`/supplier-invoice/${r.supplierInvoiceId}`}>
                                                Open
                                            </RowLink>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn ${n === page ? 'po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupplierInvoice;

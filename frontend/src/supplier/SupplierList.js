import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable.js';
import { useLookup } from '../LookupContext';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { fmt } from './supplierConstants';
import { useFieldConfig } from '../FieldConfigContext';
import '../jobs/JobDetail.css';
import './Supplier.css';
import RowLink from '../common/RowLink';
import ValidationModal from '../common/ValidationModal';
import AmountInput from '../common/AmountInput';

const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Letter of Credit (LC)', 'Online Transfer'];


const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = {
    searchText: '', categoryId: '', supplierType: '', currencyId: '',
    paymentTermsId: '', isActive: '',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="sort-icon sort-none">⇅</span>;
    return <span className="sort-icon sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ─── Create Supplier slide-over ──────────────────────────────────
const SupplierCreateForm = ({ onClose, onCreated }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq } = useFieldConfig('SUPPLIER');
    const { currencies, paymentTerms } = lookups;
    const [supplierCategories, setSupplierCategories] = useState([]);

    const [form, setForm] = useState({
        supplierId: 0, supplierName: '', supplierShortName: '',
        supplierRef: '', supplierType: '', supplierCategoryId: '', accountManager: '',
        phone: '', mobile: '', email: '', web: '',
        currencyId: '', paymentTermsId: '', creditLimit: 0, creditDays: 0,
        paymentMode: '',
        isApprovedVendor: false, isOnHold: false, leadTimeDays: '',
        tradeLicenseNo: '', tradeLicenseExpiry: '',
        countryId: '', rating: '',
        vatNumber: '', taxNumber: '', remarks: '',
        isActive: true,
    });
    const [saving, setSaving]     = useState(false);
    const [validErrors, setValidErrors] = useState(null);

    useEffect(() => {
        fetch(variables.API_URL + 'supplier/categories', { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierCategories(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    useEffect(() => {
        setForm(f => ({
            ...f,
            currencyId:        f.currencyId        || (currencies.length        ? String(currencies[0].id)        : ''),
            paymentTermsId:    f.paymentTermsId    || (paymentTerms.length      ? String(paymentTerms[0].id)      : ''),
            supplierCategoryId: f.supplierCategoryId || (supplierCategories.length ? String(supplierCategories[0].supplierCategoryId) : ''),
        }));
    }, [currencies, paymentTerms, supplierCategories]); // eslint-disable-line

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = () => {
        const errs = [];
        if (!form.supplierName.trim()) errs.push('Supplier Name is required.');
        if (!form.currencyId)          errs.push('Currency is required.');
        if (!form.paymentTermsId)      errs.push('Payment Terms are required.');
        if (errs.length) { setValidErrors(errs); return; }
        setSaving(true);
        const payload = {
            ...form,
            supplierId:         0,
            supplierCategoryId: form.supplierCategoryId ? parseInt(form.supplierCategoryId) : null,
            currencyId:         form.currencyId         ? parseInt(form.currencyId)         : null,
            paymentTermsId:     form.paymentTermsId     ? parseInt(form.paymentTermsId)     : null,
            creditLimit:        form.creditLimit        ? parseFloat(form.creditLimit)       : null,
            creditDays:         form.creditDays         ? parseInt(form.creditDays)          : null,
            countryId:          form.countryId          ? parseInt(form.countryId)           : null,
            rating:             form.rating             ? parseInt(form.rating)              : null,
            leadTimeDays:       form.leadTimeDays       ? parseInt(form.leadTimeDays)        : null,
            tradeLicenseExpiry: form.tradeLicenseExpiry || null,
            createdBy: currentUser, modifiedBy: null,
        };
        fetch(variables.API_URL + 'supplier/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(r => r.json().then(data => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
                if (!ok) { setValidErrors([data.message || 'Failed to save supplier.']); return; }
                onCreated(data.id);
                onClose();
            })
            .catch(() => setValidErrors(['Network error. Please try again.']))
            .finally(() => setSaving(false));
    };

    const Sec = ({ label }) => (
        <div className="jf-section">
            <span className="jf-section-label">{label}</span>
            <div className="jf-section-line" />
        </div>
    );

    return (
        <div className="jf-overlay">
            <div className="jf-panel" onClick={e => e.stopPropagation()}>
                <div className="jf-header">
                    <div>
                        <div className="jf-header-title">+ Add Supplier</div>
                        <div className="jf-header-sub">Fill in the details to create a new supplier</div>
                    </div>
                    <button className="jf-close" onClick={onClose}>✕</button>
                </div>
                <div className="jf-body">

                    <Sec label="Identity" />
                    <div className="jf-row">
                        <div className="jf-field jf-f2">
                            <label>Supplier Name {isReq('supplierName') && <span className="req">*</span>}</label>
                            <input name="supplierName" className="jf-input" value={form.supplierName} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>Short Name</label>
                            <input name="supplierShortName" className="jf-input" value={form.supplierShortName} onChange={handle} />
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>Reference</label>
                            <input name="supplierRef" className="jf-input" value={form.supplierRef} onChange={handle} placeholder="e.g. REF-001" />
                        </div>
                        <div className="jf-field">
                            <label>Account Manager</label>
                            <input name="accountManager" className="jf-input" value={form.accountManager} onChange={handle} />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 100px' }}>
                            <label>&nbsp;</label>
                            <label className="tab-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label>
                        </div>
                    </div>

                    <Sec label="Classification" />
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Category</label>
                            <select name="supplierCategoryId" className="jf-input" value={form.supplierCategoryId} onChange={handle}>
                                <option value="">— Select —</option>
                                {supplierCategories.map(c => <option key={c.supplierCategoryId} value={String(c.supplierCategoryId)}>{c.categoryName}</option>)}
                            </select>
                        </div>
                        <div className="jf-field">
                            <label>Supplier Type</label>
                            <input name="supplierType" className="jf-input" value={form.supplierType} onChange={handle} placeholder="e.g. Manufacturer" />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>Rating (1–5)</label>
                            <select name="rating" className="jf-input" value={form.rating} onChange={handle}>
                                <option value="">— None —</option>
                                {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
                            </select>
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>&nbsp;</label>
                            <label className="tab-check"><input type="checkbox" name="isApprovedVendor" checked={!!form.isApprovedVendor} onChange={handle} /><span>AVL Approved</span></label>
                        </div>
                    </div>

                    <Sec label="Contact" />
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Phone</label>
                            <input name="phone" className="jf-input" value={form.phone} onChange={handle} placeholder="04-XXXXXXX" />
                        </div>
                        <div className="jf-field">
                            <label>Mobile</label>
                            <input name="mobile" className="jf-input" value={form.mobile} onChange={handle} placeholder="05X-XXXXXXX" />
                        </div>
                        <div className="jf-field jf-f2">
                            <label>Email</label>
                            <input name="email" type="email" className="jf-input" value={form.email} onChange={handle} placeholder="email@company.com" />
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field jf-f2">
                            <label>Website</label>
                            <input name="web" className="jf-input" value={form.web} onChange={handle} placeholder="www.company.com" />
                        </div>
                    </div>

                    <Sec label="Financial" />
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Currency {isReq('currencyId') && <span className="req">*</span>}</label>
                            <select name="currencyId" className="jf-input" value={form.currencyId} onChange={handle}>
                                <option value="">— Select —</option>
                                {currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="jf-field">
                            <label>Payment Terms {isReq('paymentTermsId') && <span className="req">*</span>}</label>
                            <select name="paymentTermsId" className="jf-input" value={form.paymentTermsId} onChange={handle}>
                                <option value="">— Select —</option>
                                {paymentTerms.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="jf-field">
                            <label>Payment Mode</label>
                            <select name="paymentMode" className="jf-input" value={form.paymentMode} onChange={handle}>
                                <option value="">— Select —</option>
                                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>Credit Limit</label>
                            <AmountInput name="creditLimit" className="jf-input" value={form.creditLimit} onChange={v => handle({ target: { name: 'creditLimit', value: v } })} placeholder="0.00" />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 110px' }}>
                            <label>Credit Days</label>
                            <input name="creditDays" type="number" className="jf-input" value={form.creditDays} onChange={handle} placeholder="0" />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 120px' }}>
                            <label>Lead Time (days)</label>
                            <input name="leadTimeDays" type="number" className="jf-input" value={form.leadTimeDays} onChange={handle} placeholder="e.g. 14" />
                        </div>
                    </div>

                    <Sec label="Compliance" />
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Trade License No.</label>
                            <input name="tradeLicenseNo" className="jf-input" value={form.tradeLicenseNo} onChange={handle} />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>License Expiry</label>
                            <input name="tradeLicenseExpiry" type="date" className="jf-input" value={form.tradeLicenseExpiry} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>VAT Number</label>
                            <input name="vatNumber" className="jf-input" value={form.vatNumber} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>Tax Number</label>
                            <input name="taxNumber" className="jf-input" value={form.taxNumber} onChange={handle} />
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field jf-f2">
                            <label>Remarks</label>
                            <input name="remarks" className="jf-input" value={form.remarks} onChange={handle} />
                        </div>
                    </div>

                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Supplier'}</button>
                </div>
            </div>
            {validErrors && <ValidationModal errors={validErrors} onClose={() => setValidErrors(null)} />}
        </div>
    );
};

// ─── MAIN SUPPLIER LIST ──────────────────────────────────────────
const SupplierList = () => {
    const navigate = useNavigate();
    const { canDo } = usePermission();
    const canAdd    = canDo('/suppliers', 'ADD');
    const { lookups } = useLookup();
    const { currencies, paymentTerms } = lookups;
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();

    const [supplierCategories, setSupplierCategories] = useState([]);
    const [rows, setRows]             = useState([]);
    const [totalRows, setTotalRows]   = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage]             = useState(1);
    const [pageSize, setPageSize]     = useState(200);
    const [sortCol, setSortCol]       = useState('SupplierName');
    const [sortDir, setSortDir]       = useState('ASC');
    const [loading, setLoading]       = useState(false);
    const [applied, setApplied]       = useState({ ...DEFAULT_FILTERS });
    const [showCreate, setShowCreate] = useState(false);

    const gridRef = useRef({ pageSize: 200, sortCol: 'SupplierName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    useEffect(() => {
        fetch(variables.API_URL + 'supplier/categories', { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierCategories(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)        q.set('searchText',    af.searchText);
        if (af.categoryId)        q.set('categoryId',    af.categoryId);
        if (af.supplierType)      q.set('supplierType',  af.supplierType);
        if (af.currencyId)        q.set('currencyId',    af.currencyId);
        if (af.paymentTermsId)    q.set('paymentTermsId', af.paymentTermsId);
        if (af.isActive !== '')   q.set('isActive',      af.isActive);
        fetch(`${variables.API_URL}supplier/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotalRows(res.totalRows || 0); setTotalPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS);
        // eslint-disable-next-line
    }, [load]);

    // Mount-only: register with empty options to avoid re-render loop
    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals });
            setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('supplier', {
            searchText:     { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:       { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            categoryId:     { label: 'Category',      type: 'select', placeholder: 'All Categories', options: [] },
            supplierType:   { label: 'Supplier Type', type: 'text',   placeholder: 'e.g. Manufacturer' },
            currencyId:     { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: [] },
            paymentTermsId: { label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: [] },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('supplier');
    }, []); // eslint-disable-line

    // Patch dropdown options once lookups are ready (never re-registers)
    useEffect(() => {
        updateFilterDefs('supplier', {
            searchText:     { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:       { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            categoryId:     { label: 'Category',      type: 'select', placeholder: 'All Categories', options: supplierCategories.map(c => ({ value: String(c.supplierCategoryId), label: c.categoryName })) },
            supplierType:   { label: 'Supplier Type', type: 'text',   placeholder: 'e.g. Manufacturer' },
            currencyId:     { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: currencies.map(c => ({ value: String(c.id), label: c.name })) },
            paymentTermsId: { label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: paymentTerms.map(p => ({ value: String(p.id), label: p.name })) },
        });
    }, [supplierCategories, currencies, paymentTerms]); // eslint-disable-line

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
        <th className="th-sortable" style={style} onClick={() => handleSort(col)}>
            <span className="th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></span>
        </th>
    );

    const pageNums = () => {
        const total = totalPages, cur = page, range = 5;
        let start = Math.max(1, cur - Math.floor(range / 2));
        let end   = Math.min(total, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="supp-page">
            {showCreate && (
                <SupplierCreateForm
                    onClose={() => setShowCreate(false)}
                    onCreated={(id) => { load(page, pageSize, sortCol, sortDir, applied); navigate(`/suppliers/${id}`); }}
                />
            )}

            <div className="supp-grid-wrap">
                <div className="supp-grid-header">
                    <div className="supp-title-row">
                        <div>
                            <h2 className="supp-page-title">Suppliers</h2>
                            <div className="job-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="supp-toolbar">
                            <select className="filter-select" style={{ width: 110 }} value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="btn-pri" onClick={() => setShowCreate(true)}>+ Add Supplier</button>}
                        </div>
                    </div>
                </div>

                <div className="supp-table-wrap">
                    {loading && (
                        <div className="grid-loading-overlay">
                            <div className="grid-spinner">
                                <div className="spinner-ring" />
                                <span className="spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`supp-table${loading ? ' tbl-loading' : ''}`}>
                        <thead><tr>
                            <Th col="SupplierCode">Code</Th>
                            <Th col="SupplierName">Supplier Name</Th>
                            <Th col="SupplierType">Type</Th>
                            <Th col="SupplierCategoryName">Category</Th>
                            <Th col="Mobile">Mobile</Th>
                            <Th col="Email">Email</Th>
                            <Th col="CreditLimit" style={{ textAlign: 'right' }}>Credit Limit</Th>
                            <Th col="AccountManager">Account Manager</Th>
                            <Th col="StatusLabel">Status</Th>
                            <th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {rows.length === 0 && !loading
                                ? <tr><td colSpan="10" className="sub-empty">No suppliers found. Use filters on the left to search.</td></tr>
                                : rows.map(supp => (
                                    <tr key={supp.supplierId}>
                                        <td className="td-code">
                                            <RowLink className="supp-name-link" style={{ display: 'block' }} to={`/suppliers/${supp.supplierId}`}>
                                                {supp.supplierCode}
                                            </RowLink>
                                        </td>
                                        <td className="td-name">
                                            <RowLink className="supp-name-link" style={{ display: 'block' }} to={`/suppliers/${supp.supplierId}`}>
                                                {supp.supplierName}
                                            </RowLink>
                                        </td>
                                        <td>{supp.supplierType || '—'}</td>
                                        <td>{supp.supplierCategoryName || '—'}</td>
                                        <td>{supp.mobile || '—'}</td>
                                        <td className="td-email">{supp.email || '—'}</td>
                                        <td className="td-num">{supp.creditLimit != null ? fmt(supp.creditLimit) : '—'}</td>
                                        <td>{supp.accountManager || '—'}</td>
                                        <td><span className={`pill ${supp.isActive ? 'pill-green' : 'pill-red'}`}>{supp.statusLabel || (supp.isActive ? 'Active' : 'Inactive')}</span></td>
                                        <td className="td-actions">
                                            <RowLink className="act-btn act-edit" to={`/suppliers/${supp.supplierId}`}>Open</RowLink>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>

                <div className="pagination-bar">
                    <div className="page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> &nbsp;·&nbsp; {totalRows} total</div>
                    <div className="page-controls">
                        <button className="page-btn" onClick={() => goPage(1)}           disabled={page === 1}>«</button>
                        <button className="page-btn" onClick={() => goPage(page - 1)}    disabled={page === 1}>‹</button>
                        {pageNums().map(n => <button key={n} className={`page-btn ${n === page ? 'page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>)}
                        <button className="page-btn" onClick={() => goPage(page + 1)}    disabled={page >= totalPages}>›</button>
                        <button className="page-btn" onClick={() => goPage(totalPages)}  disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export { SupplierList };
export default SupplierList;

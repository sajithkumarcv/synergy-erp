import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable.js';
import { useLookup } from '../LookupContext';
import AlertModal from '../common/AlertModal';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { getFlag, fmt } from './customerConstants';
import { useFieldConfig } from '../FieldConfigContext';
import RowLink from '../common/RowLink';
import ValidationModal from '../common/ValidationModal';
import AmountInput from '../common/AmountInput';
import '../jobs/JobDetail.css';
import './Customer.css';

const PAGE_SIZES = [50, 100, 200, 300, 500];
const DEFAULT_FILTERS = {
    searchText: '', categoryId: '', customerType: '', currencyId: '',
    paymentTermsId: '', creditHold: '', isActive: '', creditFlag: '',
};

// ─── Shared UI bits ─────────────────────────────────────────────
const CreditFlagBadge = ({ flag, label }) => {
    const cfg = getFlag(flag);
    return (
        <span className="credit-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
            <span className="credit-flag-dot" style={{ background: cfg.dot }} />
            {label || cfg.label}
        </span>
    );
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="sort-icon sort-none">⇅</span>;
    return <span className="sort-icon sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ─── Credit Hold Modal ───────────────────────────────────────────
const CreditHoldModal = ({ customer, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isOnHold = customer.creditHold;
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);
    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'customer/credithold', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ customerId: customer.customerId, creditHold: !isOnHold, creditHoldBy: currentUser, creditHoldNote: note.trim() || null })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to update credit hold.'); return; }
            onSaved(); onClose();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };
    return (
        <div className="modal-backdrop">
            <div className="modal-box">
                <div className={`modal-header ${isOnHold ? 'modal-header-green' : 'modal-header-black'}`}>
                    <span>{isOnHold ? 'Release Credit Hold' : 'Place on Credit Hold'}</span>
                    <button className="cf-close" onClick={onClose}>&#10005;</button>
                </div>
                <div className="modal-body">
                    <div className="modal-customer-name">{customer.customerName}</div>
                    <div className="modal-customer-code">{customer.customerCode}</div>
                    {isOnHold && customer.creditHoldNote && (
                        <div className="modal-current-note"><span className="modal-note-label">Current reason: </span>{customer.creditHoldNote}</div>
                    )}
                    {!isOnHold && (
                        <><label className="modal-field-label">Reason for hold</label>
                        <textarea className="cf-input modal-textarea" rows="3" placeholder="e.g. Overdue invoices…" value={note} onChange={e => setNote(e.target.value)} /></>
                    )}
                    {isOnHold && <p className="modal-release-msg">This will release the credit hold and allow transactions.</p>}
                </div>
                <div className="modal-footer">
                    <button className="btn-sec" onClick={onClose}>Cancel</button>
                    <button className={isOnHold ? 'btn-teal' : 'btn-black'} onClick={submit} disabled={saving}>
                        {saving ? 'Saving…' : (isOnHold ? 'Release Hold' : 'Confirm Hold')}
                    </button>
                </div>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── Create Customer slide-over ──────────────────────────────────
const CustomerCreateForm = ({ onClose, onCreated }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList } = useLookup();
    const { isReq } = useFieldConfig('CUSTOMER');
    const { currencies, paymentTerms, customerCategories } = lookups;
    const customerTypes = getVList('Customer', 'CustomerType');

    const [form, setForm] = useState({
        customerId: 0, customerCode: '', customerName: '', customerShortName: '',
        customerRef: '', customerType: '', customerCategoryId: '', salesPerson: '',
        phone: '', mobile: '', email: '', web: '',
        currencyId: '', paymentTermsId: '', creditLimit: 0, creditDays: 0,
        vatNumber: '', taxNumber: '', remarks: '',
        isActive: true,
    });
    const [saving, setSaving]     = useState(false);
    const [validErrors, setValidErrors] = useState(null);

    useEffect(() => {
        setForm(f => ({
            ...f,
            currencyId:         f.currencyId         || (currencies.length         ? String(currencies[0].id)         : ''),
            paymentTermsId:     f.paymentTermsId     || (paymentTerms.length       ? String(paymentTerms[0].id)       : ''),
            customerCategoryId: f.customerCategoryId || (customerCategories.length ? String(customerCategories[0].id) : ''),
            customerType:       f.customerType       || (customerTypes.length      ? customerTypes[0].value           : ''),
        }));
    }, [currencies, paymentTerms, customerCategories, customerTypes]); // eslint-disable-line

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = async () => {
        const errs = [];
        if (!form.customerCode.trim()) errs.push('Customer Code is required.');
        if (!form.customerName.trim()) errs.push('Customer Name is required.');
        if (!form.currencyId)          errs.push('Currency is required.');
        if (!form.paymentTermsId)      errs.push('Payment Terms are required.');
        if (!form.customerType)        errs.push('Customer Type is required.');
        if (errs.length) { setValidErrors(errs); return; }
        setSaving(true);
        try {
            const payload = { ...form, createdBy: currentUser, modifiedBy: null };
            const res = await fetch(variables.API_URL + 'customer/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
            const d = await res.json();
            if (!res.ok) { setValidErrors([d?.message || 'Failed to create customer.']); return; }
            if (d.id) onCreated(d.id);
            onClose();
        } catch { setValidErrors(['Network error. Please try again.']); }
        finally { setSaving(false); }
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
                        <div className="jf-header-title">+ Add Customer</div>
                        <div className="jf-header-sub">Fill in the details to create a new customer</div>
                    </div>
                    <button className="jf-close" onClick={onClose}>✕</button>
                </div>
                <div className="jf-body">

                    <Sec label="Identity" />
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 150px' }}>
                            <label>Code {isReq('customerCode') && <span className="req">*</span>}</label>
                            <input name="customerCode" className="jf-input" value={form.customerCode} onChange={handle} placeholder="CUST-001" />
                        </div>
                        <div className="jf-field jf-f2">
                            <label>Customer Name {isReq('customerName') && <span className="req">*</span>}</label>
                            <input name="customerName" className="jf-input" value={form.customerName} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>Short Name</label>
                            <input name="customerShortName" className="jf-input" value={form.customerShortName} onChange={handle} />
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>Reference</label>
                            <input name="customerRef" className="jf-input" value={form.customerRef} onChange={handle} placeholder="e.g. REF-001" />
                        </div>
                        <div className="jf-field">
                            <label>Sales Person</label>
                            <input name="salesPerson" className="jf-input" value={form.salesPerson} onChange={handle} />
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
                            <select name="customerCategoryId" className="jf-input" value={form.customerCategoryId} onChange={handle}>
                                <option value="">— Select —</option>
                                {customerCategories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="jf-field">
                            <label>Type {isReq('customerType') && <span className="req">*</span>}</label>
                            <select name="customerType" className="jf-input" value={form.customerType} onChange={handle}>
                                <option value="">— Select —</option>
                                {customerTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}
                            </select>
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
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>Credit Limit</label>
                            <AmountInput name="creditLimit" className="jf-input" value={form.creditLimit} onChange={v => handle({ target: { name: 'creditLimit', value: v } })} placeholder="0.00" />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 110px' }}>
                            <label>Credit Days</label>
                            <input name="creditDays" type="number" className="jf-input" value={form.creditDays} onChange={handle} placeholder="0" />
                        </div>
                    </div>

                    <Sec label="Tax" />
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>VAT Number</label>
                            <input name="vatNumber" className="jf-input" value={form.vatNumber} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>Tax Number</label>
                            <input name="taxNumber" className="jf-input" value={form.taxNumber} onChange={handle} />
                        </div>
                        <div className="jf-field jf-f2">
                            <label>Remarks</label>
                            <input name="remarks" className="jf-input" value={form.remarks} onChange={handle} />
                        </div>
                    </div>

                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Customer'}</button>
                </div>
            </div>
            {validErrors && <ValidationModal errors={validErrors} onClose={() => setValidErrors(null)} />}
        </div>
    );
};

// ─── MAIN CUSTOMER LIST ──────────────────────────────────────────
const CustomerList = () => {
    const navigate = useNavigate();
    const { canDo } = usePermission();
    const canAdd    = canDo('/customers', 'ADD');
    const canEdit   = canDo('/customers', 'EDIT');
    const { lookups, getVList } = useLookup();
    const { currencies, paymentTerms, customerCategories } = lookups;
    // useMemo stabilises the reference — getVList returns `|| []` (new ref each render)
    // before vlist loads, which would otherwise cause the updateFilterDefs effect to loop.
    const customerTypes = useMemo(() => getVList('Customer', 'CustomerType'), [getVList]);
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();

    const [rows, setRows]             = useState([]);
    const [totalRows, setTotalRows]   = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage]             = useState(1);
    const [pageSize, setPageSize]     = useState(20);
    const [sortCol, setSortCol]       = useState('CustomerName');
    const [sortDir, setSortDir]       = useState('ASC');
    const [loading, setLoading]       = useState(false);
    const [applied, setApplied]       = useState({ ...DEFAULT_FILTERS });
    const [showCreate, setShowCreate] = useState(false);
    const [holdCust, setHoldCust]     = useState(null);

    const gridRef = useRef({ pageSize: 20, sortCol: 'CustomerName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)        q.set('searchText',    af.searchText);
        if (af.categoryId)        q.set('categoryId',    af.categoryId);
        if (af.customerType)      q.set('customerType',  af.customerType);
        if (af.currencyId)        q.set('currencyId',    af.currencyId);
        if (af.paymentTermsId)    q.set('paymentTermsId', af.paymentTermsId);
        if (af.isActive   !== '') q.set('isActive',      af.isActive);
        if (af.creditHold !== '') q.set('creditHold',    af.creditHold);
        if (af.creditFlag)        q.set('creditFlag',    af.creditFlag);
        fetch(`${variables.API_URL}customer/search?${q}`, { headers: authHeaders() })
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
        registerFilters('customer', {
            searchText:     { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:       { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            creditFlag:     { label: 'Credit Flag',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'GREEN', label: '🟢 Good Standing' }, { value: 'YELLOW', label: '🟡 Warning' }, { value: 'RED', label: '🔴 Overdue' }, { value: 'BLACK', label: '⚫ Credit Hold' }] },
            creditHold:     { label: 'Hold Status',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'On Hold' }, { value: 'false', label: 'Not on Hold' }] },
            categoryId:     { label: 'Category',      type: 'select', placeholder: 'All Categories', options: [] },
            customerType:   { label: 'Customer Type', type: 'select', placeholder: 'All Types',      options: [] },
            currencyId:     { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: [] },
            paymentTermsId: { label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: [] },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('customer');
    }, []); // eslint-disable-line

    // Patch dropdown options once lookups are ready (never re-registers)
    useEffect(() => {
        updateFilterDefs('customer', {
            searchText:     { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:       { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            creditFlag:     { label: 'Credit Flag',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'GREEN', label: '🟢 Good Standing' }, { value: 'YELLOW', label: '🟡 Warning' }, { value: 'RED', label: '🔴 Overdue' }, { value: 'BLACK', label: '⚫ Credit Hold' }] },
            creditHold:     { label: 'Hold Status',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'On Hold' }, { value: 'false', label: 'Not on Hold' }] },
            categoryId:     { label: 'Category',      type: 'select', placeholder: 'All Categories', options: customerCategories.map(c => ({ value: String(c.id), label: c.name })) },
            customerType:   { label: 'Customer Type', type: 'select', placeholder: 'All Types',      options: customerTypes.map(t => ({ value: t.value, label: t.label })) },
            currencyId:     { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: currencies.map(c => ({ value: String(c.id), label: c.name })) },
            paymentTermsId: { label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: paymentTerms.map(p => ({ value: String(p.id), label: p.name })) },
        });
    }, [customerCategories, customerTypes, currencies, paymentTerms]); // eslint-disable-line

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
        <div className="cust-page">
            {holdCust && (
                <CreditHoldModal
                    customer={holdCust}
                    onClose={() => setHoldCust(null)}
                    onSaved={() => { load(page, pageSize, sortCol, sortDir, applied); setHoldCust(null); }}
                />
            )}
            {showCreate && (
                <CustomerCreateForm
                    onClose={() => setShowCreate(false)}
                    onCreated={(id) => { load(page, pageSize, sortCol, sortDir, applied); navigate(`/customers/${id}`); }}
                />
            )}

            <div className="cust-grid-wrap">
                <div className="cust-grid-header">
                    <div className="cust-title-row">
                        <div>
                            <h2 className="cust-page-title">Customers</h2>
                            <div className="job-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="cust-toolbar">
                            <select className="filter-select" style={{ width: 110 }} value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="btn-pri" onClick={() => setShowCreate(true)}>+ Add Customer</button>}
                        </div>
                    </div>
                </div>

                <div className="cust-table-wrap">
                    {loading && (
                        <div className="grid-loading-overlay">
                            <div className="grid-spinner">
                                <div className="spinner-ring" />
                                <span className="spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`cust-table${loading ? ' tbl-loading' : ''}`}>
                        <thead><tr>
                            <Th col="CustomerCode">Code</Th>
                            <Th col="CustomerName">Customer Name</Th>
                            <Th col="CustomerType">Type</Th>
                            <Th col="CustomerCategoryName">Category</Th>
                            <Th col="Mobile">Mobile</Th>
                            <Th col="Email">Email</Th>
                            <Th col="CreditLimit" style={{ textAlign: 'right' }}>Credit Limit</Th>
                            <Th col="SalesPerson">Sales Person</Th>
                            <Th col="StatusLabel">Status</Th>
                            <Th col="CreditFlag">Credit Flag</Th>
                            <th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {rows.length === 0 && !loading
                                ? <tr><td colSpan="11" className="sub-empty">No customers found. Use filters on the left to search.</td></tr>
                                : rows.map(cust => {
                                    const flag = cust.creditFlag || 'GREEN';
                                    return (
                                        <tr key={cust.customerId} className={flag === 'BLACK' ? 'row-on-hold' : ''}>
                                            <td className="td-code">
                                                <RowLink className="cust-name-link" style={{ display: 'block' }} to={`/customers/${cust.customerId}`}>
                                                    {cust.customerCode}
                                                </RowLink>
                                            </td>
                                            <td className="td-name">
                                                <RowLink className="cust-name-link" style={{ display: 'block' }} to={`/customers/${cust.customerId}`}>
                                                    {cust.customerName}
                                                    {cust.creditHold && <span className="hold-tag" title={cust.creditHoldNote}>⚑</span>}
                                                </RowLink>
                                            </td>
                                            <td>{cust.customerType || '—'}</td>
                                            <td>{cust.customerCategoryName || '—'}</td>
                                            <td>{cust.mobile || '—'}</td>
                                            <td className="td-email">{cust.email || '—'}</td>
                                            <td className="td-num">{cust.creditLimit != null ? fmt(cust.creditLimit) : '—'}</td>
                                            <td>{cust.salesPerson || '—'}</td>
                                            <td><span className={`pill ${cust.isActive ? 'pill-green' : 'pill-red'}`}>{cust.statusLabel || (cust.isActive ? 'Active' : 'Inactive')}</span></td>
                                            <td><CreditFlagBadge flag={flag} label={cust.creditFlagLabel} /></td>
                                            <td className="td-actions">
                                                <RowLink className="act-btn act-edit" to={`/customers/${cust.customerId}`}>Open</RowLink>
                                                {canEdit && <button className={`act-btn ${cust.creditHold ? 'act-release' : 'act-hold'}`} onClick={() => setHoldCust(cust)}>
                                                    {cust.creditHold ? '🔓' : '🔒'}
                                                </button>}
                                            </td>
                                        </tr>
                                    );
                                })}
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

export default CustomerList;

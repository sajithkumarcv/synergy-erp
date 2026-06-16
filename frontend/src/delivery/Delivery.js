import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import { fmtDate, today, FormSection, getDeliveryStatusConfig } from './deliveryConstants';
import '../procurement/Procurement.css';
import RowLink from '../common/RowLink';

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_FILTERS = { searchText: '', customerId: '', status: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── New Delivery Form ─────────────────────────────────────────────────
const DeliveryForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();

    const INITIAL = {
        customerId: '', customerName: '', customerSearch: '',
        contactId: '',
        invoiceId: '', invoiceLabel: '',
        jobId: '', jobIdFromInvoice: false,
        deliveryDate: today(),
        deliveryAddress: '',
        consignee: '', consigneeAddress: '',
        consigneeLpoNo: '', consigneeLpoDate: '', consigneeTrn: '',
        vehicleNo: '', deliveredBy: '', deliveredByDate: '',
        buyerLpoNo: '', buyerLpoDate: '', buyerTrnNo: '',
        notes: '',
    };

    const [form,            setForm]            = useState(INITIAL);
    const [customerResults, setCustomerResults] = useState([]);
    const [contacts,        setContacts]        = useState([]);
    const [invoiceResults,  setInvoiceResults]  = useState([]);
    const [errors,          setErrors]          = useState({});
    const [saving,          setSaving]          = useState(false);
    const [serverError,     setServerError]     = useState('');
    const [previewNo,       setPreviewNo]       = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/DN`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    // Customer live search
    useEffect(() => {
        if (!form.customerSearch.trim() || form.customerId) { setCustomerResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}customer/search?searchText=${encodeURIComponent(form.customerSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setCustomerResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [form.customerSearch, form.customerId]);

    // Load invoices once customer selected
    useEffect(() => {
        if (!form.customerId || form.invoiceId) { setInvoiceResults([]); return; }
        fetch(`${variables.API_URL}delivery/invoices/${form.customerId}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setInvoiceResults(Array.isArray(d) ? d : [])).catch(console.error);
    }, [form.customerId, form.invoiceId]);

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const selectCustomer = c => {
        setForm(p => ({ ...p, customerId: String(c.customerId), customerName: c.customerName,
            customerSearch: '', contactId: '', invoiceId: '', invoiceLabel: '' }));
        setCustomerResults([]);
        if (errors.customerId) setErrors(p => ({ ...p, customerId: undefined }));
        // Load contacts for this customer
        fetch(`${variables.API_URL}invoice/customer/${c.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const conts = d.contacts || [];
                setContacts(conts);
                const primary = conts.find(ct => ct.isPrimary);
                if (primary) setForm(p => ({ ...p, contactId: String(primary.customerContactId) }));
            })
            .catch(console.error);
    };

    const clearCustomer = () => {
        setForm(p => ({ ...p, customerId: '', customerName: '', customerSearch: '',
            contactId: '', invoiceId: '', invoiceLabel: '' }));
        setContacts([]);
    };

    const selectInvoice = inv => {
        setForm(p => ({
            ...p,
            invoiceId:        String(inv.invoiceId),
            invoiceLabel:     `${inv.invoiceNo}${inv.jobId ? ' — ' + inv.jobId : ''}`,
            jobId:            inv.jobId || '',
            jobIdFromInvoice: !!inv.jobId,
        }));
        setInvoiceResults([]);
    };
    const clearInvoice = () => setForm(p => ({
        ...p, invoiceId: '', invoiceLabel: '', jobId: '', jobIdFromInvoice: false,
    }));

    const validate = f => {
        const e = {};
        if (!f.customerId)   e.customerId   = 'Customer is required.';
        if (!f.deliveryDate) e.deliveryDate = 'Delivery date is required.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setServerError(''); setSaving(true);
        fetch(`${variables.API_URL}delivery/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                deliveryId:       0,
                deliveryNo:       '',
                deliveryDate:     form.deliveryDate,
                invoiceId:        form.invoiceId        ? Number(form.invoiceId)  : null,
                customerId:       Number(form.customerId),
                jobId:            form.jobId.trim()              || null,
                deliveryAddress:  form.deliveryAddress.trim()    || null,
                contactId:        form.contactId        ? Number(form.contactId)  : null,
                consignee:        form.consignee.trim()          || null,
                consigneeAddress: form.consigneeAddress.trim()   || null,
                consigneeLpoNo:   form.consigneeLpoNo.trim()     || null,
                consigneeLpoDate: form.consigneeLpoDate          || null,
                consigneeTrn:     form.consigneeTrn.trim()       || null,
                vehicleNo:        form.vehicleNo.trim()          || null,
                deliveredBy:      form.deliveredBy.trim()        || null,
                deliveredByDate:  form.deliveredByDate           || null,
                buyerTrnNo:       form.buyerTrnNo.trim()         || null,
                buyerLpoNo:       form.buyerLpoNo.trim()         || null,
                buyerLpoDate:     form.buyerLpoDate              || null,
                notes:            form.notes.trim()              || null,
                createdBy:        currentUser,
                modifiedBy:       null,
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
            <div className="pf-panel" style={{ maxWidth: 700 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Delivery Note</div>
                        <div className="pf-header-sub">
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: 4 }}>{previewNo}</span></>
                                : 'Number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverError && <div className="pf-err">{serverError}</div>}

                    {/* ── Customer ── */}
                    <FormSection label="Customer" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Customer <span className="req">*</span></label>
                            {form.customerId ? (
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <span className="pf-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>✓ {form.customerName}</span>
                                    <button type="button" onClick={clearCustomer} style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <div style={{ position: 'relative' }}>
                                    <input className={`pf-input${errors.customerId ? ' pf-input-err' : ''}`}
                                        name="customerSearch" value={form.customerSearch} onChange={handle}
                                        placeholder="Search customer…" autoComplete="off" />
                                    {customerResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {customerResults.map(c => (
                                                <div key={c.customerId} style={dropItem}
                                                    onClick={() => selectCustomer(c)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    {c.customerCode ? `${c.customerCode} — ` : ''}{c.customerName}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <FieldErr msg={errors.customerId} />
                        </div>
                        <div className="pf-field">
                            <label>Contact Person</label>
                            <select className="pf-input" name="contactId" value={form.contactId}
                                onChange={handle} disabled={!form.customerId || contacts.length === 0}>
                                <option value="">— None —</option>
                                {contacts.map(c => (
                                    <option key={c.customerContactId} value={c.customerContactId}>
                                        {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Linked Invoice ── */}
                    {form.customerId && (
                        <>
                            <FormSection label="Linked Invoice (optional)" />
                            <div className="pf-row">
                                <div className="pf-field pf-f3">
                                    <label>Invoice <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>(select to import lines after creation)</span></label>
                                    {form.invoiceId ? (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <span className="pf-input" style={{ flex: 1, background: '#f0f9ff', color: '#1e40af', fontWeight: 500 }}>✓ {form.invoiceLabel}</span>
                                            <button type="button" onClick={clearInvoice} style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                        </div>
                                    ) : (
                                        <select className="pf-input" onChange={e => {
                                            const inv = invoiceResults.find(i => String(i.invoiceId) === e.target.value);
                                            if (inv) selectInvoice(inv);
                                        }} defaultValue="">
                                            <option value="">— Select invoice (optional) —</option>
                                            {invoiceResults.map(i => (
                                                <option key={i.invoiceId} value={i.invoiceId}>
                                                    {i.invoiceNo}{i.jobId ? ` — ${i.jobId}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Delivery Details ── */}
                    <FormSection label="Delivery Details" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Delivery Date <span className="req">*</span></label>
                            <input className={`pf-input${errors.deliveryDate ? ' pf-input-err' : ''}`}
                                type="date" name="deliveryDate" value={form.deliveryDate} onChange={handle} />
                            <FieldErr msg={errors.deliveryDate} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Job ID</label>
                            {form.jobIdFromInvoice ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ flex: 1, background: '#fefce8', color: '#854d0e', fontWeight: 600, cursor: 'default' }}>📋 {form.jobId}</span>
                                    <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>from invoice</span>
                                </div>
                            ) : (
                                <input className="pf-input" type="text" name="jobId" value={form.jobId} onChange={handle} placeholder="Job reference" />
                            )}
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Delivery Address</label>
                            <textarea className="pf-input pf-textarea" rows={2} name="deliveryAddress" value={form.deliveryAddress} onChange={handle} placeholder="Delivery location" />
                        </div>
                    </div>

                    {/* ── Consignee / Receiver ── */}
                    <FormSection label="Consignee / Receiver" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Consignee Name</label>
                            <input className="pf-input" type="text" name="consignee" value={form.consignee} onChange={handle} placeholder="Receiver name" />
                        </div>
                        <div className="pf-field">
                            <label>Consignee TRN</label>
                            <input className="pf-input" type="text" name="consigneeTrn" value={form.consigneeTrn} onChange={handle} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Consignee Address</label>
                            <textarea className="pf-input pf-textarea" rows={2} name="consigneeAddress" value={form.consigneeAddress} onChange={handle} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Consignee LPO No</label>
                            <input className="pf-input" type="text" name="consigneeLpoNo" value={form.consigneeLpoNo} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Consignee LPO Date</label>
                            <input className="pf-input" type="date" name="consigneeLpoDate" value={form.consigneeLpoDate} onChange={handle} />
                        </div>
                    </div>

                    {/* ── Dispatch ── */}
                    <FormSection label="Dispatch" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Vehicle No</label>
                            <input className="pf-input" type="text" name="vehicleNo" value={form.vehicleNo} onChange={handle} placeholder="Vehicle / truck #" />
                        </div>
                        <div className="pf-field">
                            <label>Delivered By</label>
                            <input className="pf-input" type="text" name="deliveredBy" value={form.deliveredBy} onChange={handle} placeholder="Driver / courier name" />
                        </div>
                        <div className="pf-field">
                            <label>Delivered Date</label>
                            <input className="pf-input" type="date" name="deliveredByDate" value={form.deliveredByDate} onChange={handle} />
                        </div>
                    </div>

                    {/* ── Buyer LPO / TRN ── */}
                    <FormSection label="Buyer LPO / TRN" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Buyer LPO No</label>
                            <input className="pf-input" type="text" name="buyerLpoNo" value={form.buyerLpoNo} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Buyer LPO Date</label>
                            <input className="pf-input" type="date" name="buyerLpoDate" value={form.buyerLpoDate} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Buyer TRN No</label>
                            <input className="pf-input" type="text" name="buyerTrnNo" value={form.buyerTrnNo} onChange={handle} />
                        </div>
                    </div>

                    {/* ── Notes ── */}
                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <textarea className="pf-input pf-textarea" rows={2} name="notes" value={form.notes} onChange={handle} placeholder="Optional notes…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create Delivery Note'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────────────
const Delivery = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getModuleStatuses } = useLookup();
    const { canDo } = usePermission();
    const canAdd   = canDo('/delivery', 'ADD');

    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(20);
    const [sortCol,    setSortCol]  = useState('DeliveryDate');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm] = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'DeliveryDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [customerOptions, setCustomerOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}customer/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setCustomerOptions((d.data || []).map(c => ({
                value: String(c.customerId),
                label: c.customerCode ? `${c.customerCode} — ${c.customerName}` : c.customerName
            }))))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.customerId) q.set('customerId', af.customerId);
        if (af.status)     q.set('status',     af.status);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}delivery/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (custOpts) => ({
        searchText: { label: 'Search',    type: 'text',        placeholder: 'DN #, invoice #, customer…' },
        customerId: { label: 'Customer',  type: 'select',      placeholder: 'All Customers', options: custOpts },
        status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('DLV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        dateFrom:   { label: 'Date From', type: 'date' },
        dateTo:     { label: 'Date To',   type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('delivery', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('delivery');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('delivery', buildDefs(customerOptions));
    }, [customerOptions, getModuleStatuses]); // eslint-disable-line

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

    const statusCfg = s => getDeliveryStatusConfig(s);

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
                <DeliveryForm
                    onClose={() => setShowForm(false)}
                    onSaved={id => { setShowForm(false); navigate(`/delivery/${id}`); }}
                />
            )}
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Delivery Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Delivery Note</button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="DeliveryNo">DN #</Th>
                                <Th col="DeliveryDate">Date</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="InvoiceNo">Invoice</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="VehicleNo">Vehicle</Th>
                                <Th col="DeliveredBy">Delivered By</Th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No delivery notes found.</td></tr>
                            ) : rows.map(r => {
                                const cfg = statusCfg(r.status);
                                return (
                                    <tr key={r.deliveryId}>
                                        <td><RowLink className="po-num-link" to={`/delivery/${r.deliveryId}`}>{r.deliveryNo || `#${r.deliveryId}`}</RowLink></td>
                                        <td>{fmtDate(r.deliveryDate)}</td>
                                        <td>{r.customerName}</td>
                                        <td>
                                            {r.invoiceNo
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.invoiceNo}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td>
                                            {r.jobId
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td><span style={{ fontFamily: 'Courier New', fontSize: 12 }}>{r.vehicleNo || '—'}</span></td>
                                        <td>{r.deliveredBy || '—'}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                                                <span className="po-status-dot" style={{ background: cfg.dot }} />
                                                {r.status}
                                            </span>
                                        </td>
                                        <td><RowLink className="po-act-btn po-act-open" to={`/delivery/${r.deliveryId}`}>Open</RowLink></td>
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

export default Delivery;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInitialFilters } from '../utils/useInitialFilters';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { fmt, fmtDate, today, addDays, statusBadgeCfg, FormSection } from './invoiceConstants';
import LookupSelect from '../common/LookupSelect';
import '../procurement/Procurement.css';
import { useFieldConfig } from '../FieldConfigContext';
import RowLink from '../common/RowLink';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
// Rows pulled per customer/job lookup. Higher than the old 8 because the field
// is now browsable on click, not just typed into — but still capped, since the
// dropdown scrolls rather than showing the whole master list.
const LOOKUP_PAGE_SIZE = 25;

const DEFAULT_FILTERS = {
    searchText: '', status: '', customerId: '', jobId: '', dateFrom: '', dateTo: '',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── New Invoice Slide-over Form ──────────────────────────────────────
const InvForm = ({ onClose, onSaved }) => {
    const currentUser    = useCurrentUser();
    const { lookups }    = useLookup();
    const currencies     = useMemo(() => lookups?.currencies || [], [lookups?.currencies]); // eslint-disable-line
    const { isReq }      = useFieldConfig('INVOICE');

    const [form, setForm] = useState({
        invoiceDate:    today(),
        customerId:     '',
        customerLabel:  '',
        billingAddress: '',
        currencyId:     '',
        exchangeRate:   '1',
        dueDate:        '',
        jobId:          '',
        jobLabel:       '',
        lpoNo:          '',
        lpoDate:        '',
        contactId:      '',
        notes:          '',
    });

    const [errors,     setErrors]    = useState({});
    const [saving,     setSaving]    = useState(false);
    const [error,      setError]     = useState('');
    const [previewNo,  setPreviewNo] = useState('');

    const [custCredit,  setCustCredit]  = useState(null);   // credit flag / hold of the picked customer
    // Customer sub-data
    const [contacts,   setContacts]   = useState([]);
    const [addresses,  setAddresses]  = useState([]);

    // Fetch document series preview
    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/INV`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    // Auto-select base currency
    useEffect(() => {
        if (!currencies.length) return;
        const base = currencies.find(c => c.isBaseCurrency);
        if (base) setForm(p => ({ ...p, currencyId: String(base.id), exchangeRate: '1' }));
    }, [currencies]); // eslint-disable-line

    const selectCustomer = (c) => {
        setForm(p => ({ ...p, customerId: String(c.customerId), customerLabel: c.customerName, contactId: '' }));
        if (errors.customerId) setErrors(p => ({ ...p, customerId: undefined }));
        setCustCredit({
            flag:      (c.creditFlag || 'GREEN').toUpperCase(),
            flagLabel: c.creditFlagLabel || 'Good Standing',
            hold:      !!c.creditHold,
            holdNote:  c.creditHoldNote || null,
        });
        fetch(`${variables.API_URL}invoice/customer/${c.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const cust    = d.customer;
                const addrs   = d.addresses || [];
                const conts   = d.contacts  || [];
                const defAddr = addrs.find(a => a.isDefault) || addrs[0];
                setContacts(conts); setAddresses(addrs);
                const cur = cust?.currencyId
                    ? currencies.find(x => String(x.id) === String(cust.currencyId))
                    : null;
                setForm(p => ({
                    ...p,
                    currencyId:     cur ? String(cur.id) : p.currencyId,
                    exchangeRate:   cur ? (cur.isBaseCurrency ? '1' : String(cur.exchangeRate ?? p.exchangeRate)) : p.exchangeRate,
                    billingAddress: defAddr?.fullAddress || '',
                    dueDate:        cust?.creditDays ? addDays(p.invoiceDate, cust.creditDays) : p.dueDate,
                    contactId:      (() => { const pri = conts.find(ct => ct.isPrimary); return pri ? String(pri.customerContactId) : ''; })(),
                }));
            })
            .catch(console.error);
    };

    const selectJob = (j) => {
        // Auto-fill LPO No / LPO Date from the chosen job — only if the user
        // hasn't already typed something in those fields (don't overwrite input).
        const lpoFromJob     = j.lpoRef  || j.LpoRef  || '';
        const lpoDateFromJob = j.lpoDate || j.LpoDate || '';
        const lpoDateOnly    = lpoDateFromJob ? String(lpoDateFromJob).slice(0, 10) : '';
        setForm(p => ({
            ...p,
            jobId:    j.jobId,
            jobLabel: `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`,
            lpoNo:    p.lpoNo   ? p.lpoNo   : lpoFromJob,
            lpoDate:  p.lpoDate ? p.lpoDate : lpoDateOnly,
        }));
        setErrors(prev => ({ ...prev, jobId: undefined }));
    };

    const onCurrencyChange = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        setForm(p => ({
            ...p,
            currencyId:   id,
            exchangeRate: cur?.isBaseCurrency ? '1' : String(cur?.exchangeRate ?? p.exchangeRate),
        }));
        if (errors.currencyId) setErrors(p => ({ ...p, currencyId: undefined }));
    };

    const set = (k, v) => {
        setForm(p => ({ ...p, [k]: v }));
        if (errors[k]) setErrors(p => ({ ...p, [k]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (!form.customerId)  e.customerId  = 'Customer is required.';
        if (!form.contactId)   e.contactId   = 'Contact person is required.';
        if (!form.invoiceDate) e.invoiceDate = 'Invoice date is required.';
        if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate)
                               e.dueDate     = 'Due date must be on or after the invoice date.';
        if (!form.currencyId)  e.currencyId  = 'Currency is required.';
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                               e.exchangeRate = 'Exchange rate must be a number greater than 0.';
        if (!form.jobId)       e.jobId       = 'Job is required.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}invoice/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                invoiceId:      0,
                invoiceDate:    form.invoiceDate,
                customerId:     Number(form.customerId),
                billingAddress: form.billingAddress || null,
                currencyId:     Number(form.currencyId),
                exchangeRate:   Number(form.exchangeRate) || 1,
                dueDate:        form.dueDate   || null,
                jobId:          form.jobId     || null,
                lpoNo:          form.lpoNo     || null,
                lpoDate:        form.lpoDate   || null,
                contactId:      form.contactId ? Number(form.contactId) : null,
                notes:          form.notes     || null,
                createdBy:      currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d?.message || 'Error saving.'); return; }
                onSaved(d.invoiceId);
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const selectedCur = currencies.find(c => String(c.id) === String(form.currencyId));
    const isBase      = selectedCur?.isBaseCurrency === true;

    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Invoice</div>
                        <div className="pf-header-sub">
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: 4 }}>{previewNo}</span></>
                                : 'Invoice number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <FormSection label="Customer" />
                    <div className="pf-row">
                        {/* Customer live-search */}
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Customer {isReq('customerId') && <span className="req">*</span>}</label>
                            <LookupSelect
                                value={form.customerId}
                                label={form.customerLabel}
                                error={errors.customerId}
                                tone="blue"
                                placeholder="Select or search by name / code…"
                                buildUrl={t => `${variables.API_URL}customer/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}`}
                                itemKey={c => c.customerId}
                                renderItem={c => {
                                    const f = (c.creditFlag || 'GREEN').toUpperCase();
                                    const dot = c.creditHold ? '#dc2626' : f === 'RED' ? '#dc2626' : f === 'YELLOW' ? '#ca8a04' : '#16a34a';
                                    return (
                                        <>
                                            <strong>{c.customerName}</strong>
                                            {c.customerCode && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>{c.customerCode}</span>}
                                            <span title={c.creditHold ? 'On credit hold' : (c.creditFlagLabel || '')}
                                                  style={{ marginLeft: 'auto', width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                                        </>
                                    );
                                }}
                                onSelect={c => selectCustomer(c)}
                                onClear={() => {
                                    setForm(p => ({ ...p, customerId: '', customerLabel: '' }));
                                    setContacts([]); setAddresses([]); setCustCredit(null);
                                }}
                            />
                            {errors.customerId && <span className="pf-field-err">{errors.customerId}</span>}
                            {/* ── Credit warning for the picked customer ── */}
                            {custCredit && (custCredit.hold || custCredit.flag !== 'GREEN') && (() => {
                                const danger = custCredit.hold || custCredit.flag === 'RED';
                                const cc = danger
                                    ? { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: '⛔' }
                                    : { bg: '#fffbeb', border: '#fde68a', color: '#92400e', icon: '⚠' };
                                return (
                                    <div style={{ marginTop: 8, background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: cc.color, lineHeight: 1.5 }}>
                                        <strong>{cc.icon} {custCredit.hold ? 'Customer is on CREDIT HOLD' : `Credit flag: ${custCredit.flagLabel}`}</strong>
                                        {custCredit.hold && custCredit.holdNote && <div style={{ marginTop: 2 }}>Reason: {custCredit.holdNote}</div>}
                                        <div style={{ marginTop: 2, fontWeight: 500 }}>
                                            {custCredit.hold
                                                ? 'Invoicing is blocked for customers on credit hold — release the hold or get approval first.'
                                                : danger
                                                    ? 'This customer is overdue. Please review the account before invoicing.'
                                                    : 'Proceed with caution — this customer is not in good standing.'}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="pf-field">
                            <label>Contact Person <span className="req">*</span></label>
                            <select className={`pf-input${errors.contactId ? ' pf-input-err' : ''}`} value={form.contactId}
                                onChange={e => set('contactId', e.target.value)}
                                disabled={contacts.length === 0}>
                                <option value="">
                                    {!form.customerId ? '— Select a customer first —'
                                        : contacts.length === 0 ? '— No contacts on file — add one first —'
                                        : '— Select contact —'}
                                </option>
                                {contacts.map(c => (
                                    <option key={c.customerContactId} value={c.customerContactId}>
                                        {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.contactId && <span className="pf-field-err">{errors.contactId}</span>}
                        </div>
                    </div>

                    <FormSection label="Dates" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Invoice Date {isReq('invoiceDate') && <span className="req">*</span>}</label>
                            <input type="date" className={`pf-input${errors.invoiceDate ? ' pf-input-err' : ''}`}
                                value={form.invoiceDate}
                                onChange={e => set('invoiceDate', e.target.value)} />
                            {errors.invoiceDate && <span className="pf-field-err">{errors.invoiceDate}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Due Date</label>
                            <input type="date" className={`pf-input${errors.dueDate ? ' pf-input-err' : ''}`}
                                value={form.dueDate}
                                min={form.invoiceDate || undefined}
                                onChange={e => set('dueDate', e.target.value)} />
                            {errors.dueDate && <span className="pf-field-err">{errors.dueDate}</span>}
                        </div>
                    </div>

                    <FormSection label="Currency" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Currency {isReq('currencyId') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`}
                                value={form.currencyId}
                                onChange={e => onCurrencyChange(e.target.value)}>
                                <option value="">— Select —</option>
                                {currencies.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.shortName}{c.name ? ` — ${c.name}` : ''}{c.isBaseCurrency ? ' (Base)' : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.currencyId && <span className="pf-field-err">{errors.currencyId}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 150px' }}>
                            <label>
                                Exch. Rate
                                {isBase && (
                                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 10 }}>
                                        Base
                                    </span>
                                )}
                            </label>
                            <input type="number" min="0.000001" step="any" className="pf-input"
                                value={form.exchangeRate}
                                onChange={e => set('exchangeRate', e.target.value)}
                                disabled={isBase}
                                style={isBase ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : undefined} />
                            {isBase && <span style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'block' }}>Always 1 for base currency</span>}
                        </div>
                    </div>

                    <FormSection label="Reference" />
                    {/* Job — picked FIRST so LPO No / LPO Date below can auto-fill from it */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Job <span className="req">*</span></label>
                            <LookupSelect
                                value={form.jobId}
                                label={form.jobLabel}
                                error={errors.jobId}
                                tone="green"
                                placeholder="Select or type job ID / description…"
                                buildUrl={t => `${variables.API_URL}job/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}&approvalStatus=Approved`}
                                itemKey={j => j.jobId}
                                renderItem={j => (
                                    <>
                                        <strong>{j.jobId}</strong>
                                        {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                        {j.projectName  && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>— {j.projectName}</span>}
                                    </>
                                )}
                                onSelect={j => selectJob(j)}
                                onClear={() => setForm(p => ({ ...p, jobId: '', jobLabel: '', lpoNo: '', lpoDate: '' }))}
                            />
                            {errors.jobId && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{errors.jobId}</div>}
                        </div>
                    </div>
                    {/* LPO No / LPO Date — pre-filled from the Job, fully editable */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>LPO / PO No
                                {form.jobId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: '#64748b' }}>(from job — editable)</span>}
                            </label>
                            <input className="pf-input" placeholder="e.g. LPO-2024-001"
                                value={form.lpoNo} onChange={e => set('lpoNo', e.target.value)} />
                        </div>
                        <div className="pf-field">
                            <label>LPO Date
                                {form.jobId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: '#64748b' }}>(from job — editable)</span>}
                            </label>
                            <input type="date" className="pf-input" value={form.lpoDate}
                                onChange={e => set('lpoDate', e.target.value)} />
                        </div>
                    </div>

                    {addresses.length > 1 && (
                        <>
                            <FormSection label="Billing Address" />
                            <div className="pf-row">
                                <div className="pf-field pf-f3">
                                    <label>Select Address</label>
                                    <select className="pf-input"
                                        value={addresses.findIndex(a => a.fullAddress === form.billingAddress)}
                                        onChange={e => set('billingAddress', addresses[Number(e.target.value)]?.fullAddress || '')}>
                                        {addresses.map((a, i) => (
                                            <option key={a.customerAddressId} value={i}>
                                                {a.addressType || `Address ${i + 1}`}{a.isDefault ? ' (Default)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes / Remarks</label>
                            <textarea className="pf-input pf-textarea" rows={3}
                                value={form.notes} onChange={e => set('notes', e.target.value)}
                                placeholder="Internal notes or additional terms…" />
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

// ── Main List Page ──────────────────────────────────────────────────
export const Invoice = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/invoices', 'ADD');
    // Seeded from dashboard tiles (e.g. "Open Invoices" → status='Confirmed')
    // — see [[weberp-synergy-fork]]. Falls back to DEFAULT_FILTERS untouched
    // when this route was reached any other way.
    const initialFilters = useInitialFilters(DEFAULT_FILTERS);

    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(200);
    const [sortCol,    setSortCol]  = useState('InvoiceDate');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [applied,    setApplied]  = useState(initialFilters);
    const [showForm,   setShowForm] = useState(false);

    const gridRef = useRef({ pageSize: 200, sortCol: 'InvoiceDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.customerId) q.set('customerId', af.customerId);
        if (af.jobId)      q.set('jobId',      af.jobId);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}invoice/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'InvoiceDate', 'DESC', initialFilters); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        const defs = {
            searchText: { label: 'Search',    type: 'text',        placeholder: 'Invoice No, Customer, LPO…' },
            status:     { label: 'Status',    type: 'multiselect',
                          options: getModuleStatuses('INV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
            jobId:      { label: 'Job',       type: 'text',        placeholder: 'Job ID…' },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
        };
        registerFilters('invoice', defs, initialFilters, onApply);
        return () => unregisterFilters('invoice');
    }, [getModuleStatuses]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage = p => {
        const pg = Math.max(1, Math.min(p, totalPages));
        setPage(pg);
        load(pg, pageSize, sortCol, sortDir, applied);
    };

    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = (newId) => { setShowForm(false); navigate(`/invoices/${newId}`); };

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

    const InvStatusBadge = ({ status }) => {
        const cfg = statusBadgeCfg(getStatusConfig('INV', status));
        return (
            <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                <span className="po-status-dot" style={{ background: cfg.dot }} />
                {cfg.label || status}
            </span>
        );
    };

    return (
        <div className="po-page">
            {showForm && <InvForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Invoices</div>
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
                                <Th col="InvoiceNo">Invoice No</Th>
                                <Th col="InvoiceDate">Date</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="LpoNo">LPO No</Th>
                                <Th col="DueDate">Due Date</Th>
                                <Th col="CurrencyShort">Curr</Th>
                                <Th col="TotalAmount">Total</Th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={9} className="po-empty">
                                        No invoices found. Use the filters on the left or create a new invoice.
                                    </td>
                                </tr>
                            ) : rows.map(r => (
                                <tr key={r.invoiceId}>
                                    <td>
                                        <RowLink className="po-num-link" to={`/invoices/${r.invoiceId}`}>
                                            {r.invoiceNo}
                                        </RowLink>
                                    </td>
                                    <td>{fmtDate(r.invoiceDate)}</td>
                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {r.customerName || '—'}
                                    </td>
                                    <td>
                                        {r.lpoNo
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{r.lpoNo}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ color: r.dueDate && new Date(r.dueDate) < new Date() && r.status === 'Draft' ? '#dc2626' : undefined }}>
                                        {fmtDate(r.dueDate)}
                                    </td>
                                    <td style={{ fontSize: 11, color: '#475569' }}>{r.currencyShort || '—'}</td>
                                    <td className="po-num-cell">{fmt(r.totalAmount)}</td>
                                    <td><InvStatusBadge status={r.status} /></td>
                                    <td>
                                        <RowLink className="po-act-btn po-act-open" to={`/invoices/${r.invoiceId}`}>Open</RowLink>
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
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Invoice;

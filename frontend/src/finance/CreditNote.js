import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import AmountInput from '../common/AmountInput';
import LookupSelect from '../common/LookupSelect';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import '../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const LOOKUP_PAGE_SIZE = 25;
const DEFAULT_FILTERS = { searchText: '', status: '', dateFrom: '', dateTo: '' };

const fmt = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);


const STATUS_CFG = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    PendingL1:       { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Rejected' },
    Cancelled:       { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Cancelled' },
};
const StatusBadge = ({ s }) => {
    const c = STATUS_CFG[s] || STATUS_CFG.Draft;
    return <span className="po-status-badge" style={{ background: c.bg, color: c.color }}>
        <span className="po-status-dot" style={{ background: c.dot }} />{c.label}
    </span>;
};

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col ? <span className="po-sort-none">⇅</span>
                    : <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

// ── New CN slide-over ──────────────────────────────────────────────────────────
const CnForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList } = useLookup();
    const currencies = lookups.currencies || [];
    const creditTypes = getVList('CreditNote', 'CreditType');

    const [form, setForm] = useState({
        cnDate: today(), customerId: '', customerLabel: '',
        currencyId: '', exchangeRate: '1',
        creditAmount: '', creditType: '',
        reason: '', notes: '',
    });
    const [errors, setErrors]  = useState({});
    const [saving, setSaving]  = useState(false);
    const [error, setError]    = useState('');

    // Auto-select base currency
    useEffect(() => {
        if (currencies.length && !form.currencyId) {
            const base = currencies.find(c => c.isBaseCurrency) || currencies[0];
            if (base) setForm(p => ({ ...p, currencyId: String(base.id), exchangeRate: String(base.exchangeRate || 1) }));
        }
    }, [currencies]); // eslint-disable-line


    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(p => ({ ...p, [k]: undefined })); };

    const pickCurrency = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        set('currencyId', id);
        if (cur) set('exchangeRate', String(cur.exchangeRate || 1));
    };

    const pickCustomer = (c) => {
        setForm(p => ({ ...p, customerId: String(c.customerId), customerLabel: c.customerName }));
        setErrors(p => ({ ...p, customerId: undefined }));
    };

    const save = () => {
        const e = {};
        if (!form.customerId)               e.customerId   = 'Customer is required.';
        if (!form.currencyId)               e.currencyId   = 'Currency is required.';
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                            e.exchangeRate = 'Exchange rate must be a number greater than 0.';
        if (!(Number(form.creditAmount) > 0)) e.creditAmount = 'Amount must be greater than zero.';
        if (!form.creditType)               e.creditType   = 'Credit type is required.';
        if (!form.reason.trim())            e.reason       = 'Reason is required.';
        setErrors(e); if (Object.keys(e).length) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}creditnote/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                cnId: 0, cnDate: form.cnDate,
                customerId:   Number(form.customerId),
                currencyId:   Number(form.currencyId),
                exchangeRate: Number(form.exchangeRate) || 1,
                creditAmount: Number(form.creditAmount),
                creditType:   form.creditType || null,
                reason:       form.reason || null,
                notes:        form.notes  || null,
                createdBy:    currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setError(d?.message || 'Error saving.'); return; } onSaved(d.cnId); })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };


    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Credit Note</div>
                        <div className="pf-header-sub">Record a credit given to a customer. After approval you can allocate it against open invoices.</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    {/* Row 1 — Customer + Date */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Customer <span className="req">*</span></label>
                            <LookupSelect
                                value={form.customerId}
                                label={form.customerLabel}
                                error={errors.customerId}
                                tone="blue"
                                placeholder="Select or search by name / code…"
                                buildUrl={t => `${variables.API_URL}customer/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}`}
                                itemKey={c => c.customerId}
                                renderItem={c => (
                                    <>
                                        <strong>{c.customerName}</strong>
                                        {c.customerCode && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>{c.customerCode}</span>}
                                    </>
                                )}
                                onSelect={pickCustomer}
                                onClear={() => setForm(p => ({ ...p, customerId: '', customerLabel: '' }))}
                            />
                            {errors.customerId && <span className="pf-field-err">{errors.customerId}</span>}
                        </div>
                        <div className="pf-field">
                            <label>CN Date</label>
                            <input type="date" className="pf-input" value={form.cnDate} onChange={e => set('cnDate', e.target.value)} />
                        </div>
                    </div>

                    {/* Row 2 — Currency + Exchange Rate + Credit Amount */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Currency <span className="req">*</span></label>
                            <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`}
                                value={form.currencyId} onChange={e => pickCurrency(e.target.value)}>
                                <option value="">— select —</option>
                                {currencies.map(c => (
                                    <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>
                                ))}
                            </select>
                            {errors.currencyId && <span className="pf-field-err">{errors.currencyId}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 130px' }}>
                            <label>Exchange Rate</label>
                            <input type="number" min="0" step="0.000001" className="pf-input"
                                value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} />
                        </div>
                        <div className="pf-field">
                            <label>Credit Amount <span className="req">*</span></label>
                            <AmountInput
                                className={`pf-input${errors.creditAmount ? ' pf-input-err' : ''}`}
                                value={form.creditAmount}
                                onChange={v => set('creditAmount', v)}
                                error={!!errors.creditAmount}
                            />
                            {errors.creditAmount && <span className="pf-field-err">{errors.creditAmount}</span>}
                        </div>
                    </div>

                    {/* Row 3 — Credit Type */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Credit Type <span className="req">*</span></label>
                            <select className={`pf-input${errors.creditType ? ' pf-input-err' : ''}`}
                                value={form.creditType} onChange={e => set('creditType', e.target.value)}>
                                <option value="">— select —</option>
                                {creditTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            {errors.creditType && <span className="pf-field-err">{errors.creditType}</span>}
                        </div>
                    </div>

                    {/* Row 4 — Reason (required) */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Reason <span className="req">*</span></label>
                            <textarea className={`pf-input pf-textarea${errors.reason ? ' pf-input-err' : ''}`} rows={2}
                                value={form.reason} onChange={e => set('reason', e.target.value)}
                                placeholder="Reason for issuing this credit note…" />
                            {errors.reason && <span className="pf-field-err">{errors.reason}</span>}
                        </div>
                    </div>

                    {/* Row 5 — Notes */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create Credit Note'}</button>
                </div>
            </div>
        </div>
    );
};

// ── List page ──────────────────────────────────────────────────────────────────
const CreditNote = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();
    const { getModuleStatuses } = useLookup();
    const { canDo } = usePermission();
    const canAdd = canDo('/credit-notes', 'ADD');

    const [rows, setRows]         = useState([]);
    const [loading, setLoading]   = useState(false);
    const [totalRows, setTotal]   = useState(0);
    const [totalPages, setPages]  = useState(1);
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [sortCol, setSortCol]   = useState('CnDate');
    const [sortDir, setSortDir]   = useState('DESC');
    const [applied, setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm, setShowForm] = useState(false);

    const gridRef = useRef({ pageSize: 200, sortCol: 'CnDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status', af.status);
        if (af.dateFrom)   q.set('dateFrom', af.dateFrom);
        if (af.dateTo)     q.set('dateTo', af.dateTo);
        fetch(`${variables.API_URL}creditnote/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'CnDate', 'DESC', DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            searchText: { label: 'Search', type: 'text', placeholder: 'CN No, Customer, Reason…' },
            status:     { label: 'Status', type: 'multiselect',
                          options: getModuleStatuses('CN').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
        };
        registerFilters('creditnote', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('creditnote');
    }, [getModuleStatuses]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage = (p) => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };
    const handleSaved = (id) => { setShowForm(false); navigate(`/credit-notes/${id}`); };

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)} style={right ? { textAlign: 'right' } : undefined}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {showForm && <CnForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Credit Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Credit Note</button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && <div className="po-loading-overlay"><div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div></div>}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="CnNumber">CN No</Th>
                                <Th col="CnDate">Date</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="CreditAmount" right>Credit Amount</Th>
                                <th style={{ textAlign: 'right' }}>Allocated</th>
                                <th style={{ textAlign: 'right' }}>Unallocated</th>
                                <th>Type</th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No credit notes found. Use the filters on the left or create one.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.cnId}>
                                    <td><span className="po-num-link" onClick={() => navigate(`/credit-notes/${r.cnId}`)}>{r.cnNumber}</span></td>
                                    <td>{fmtDate(r.cnDate)}</td>
                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName || '—'}</td>
                                    <td className="po-num-cell">{fmt(r.creditAmount)}</td>
                                    <td className="po-num-cell">{fmt(r.allocatedAmount)}</td>
                                    <td className="po-num-cell" style={{ color: r.unallocatedAmount > 0 ? '#b45309' : '#166534' }}>{fmt(r.unallocatedAmount)}</td>
                                    <td style={{ fontSize: 11, color: '#475569' }}>{r.creditType || '—'}</td>
                                    <td><StatusBadge s={r.status} /></td>
                                    <td><button className="po-act-btn po-act-open" onClick={() => navigate(`/credit-notes/${r.cnId}`)}>Open</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)} disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>)}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreditNote;
export { CreditNote };

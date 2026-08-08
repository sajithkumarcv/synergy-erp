import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import AmountInput from '../common/AmountInput';
import '../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', status: '', dateFrom: '', dateTo: '' };

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today   = () => new Date().toISOString().slice(0, 10);

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
    return (
        <span className="po-status-badge" style={{ background: c.bg, color: c.color }}>
            <span className="po-status-dot" style={{ background: c.dot }} />{c.label}
        </span>
    );
};

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col ? <span className="po-sort-none">⇅</span>
                    : <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

// ── New PV slide-over ─────────────────────────────────────────────────────────
const PvForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList } = useLookup();

    const currencies = lookups.currencies || [];
    const payModes   = getVList('Payment', 'PaymentMode');

    const [form, setForm] = useState({
        pvDate: today(), supplierId: '', supplierLabel: '',
        currencyId: '', exchangeRate: '1',
        amountPaid: '', paymentMode: '',
        referenceNo: '', referenceDate: '', bankName: '', notes: '',
    });
    const [suppSearch,  setSuppSearch]  = useState('');
    const [suppResults, setSuppResults] = useState([]);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    // Auto-select base currency
    useEffect(() => {
        if (currencies.length && !form.currencyId) {
            const base = currencies.find(c => c.isBaseCurrency) || currencies[0];
            if (base) setForm(p => ({ ...p, currencyId: String(base.id), exchangeRate: String(base.exchangeRate || 1) }));
        }
    }, [currencies]); // eslint-disable-line

    // Auto-select first payment mode
    useEffect(() => {
        if (payModes.length && !form.paymentMode)
            setForm(p => ({ ...p, paymentMode: payModes[0]?.value || 'Cash' }));
    }, [payModes]); // eslint-disable-line

    // Supplier search debounce
    useEffect(() => {
        if (!suppSearch.trim()) { setSuppResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(suppSearch)}&pageSize=8`,
                { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setSuppResults(d.data || []))
                .catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [suppSearch]);

    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(p => ({ ...p, [k]: undefined })); };

    const pickCurrency = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        set('currencyId', id);
        if (cur) set('exchangeRate', String(cur.exchangeRate || 1));
    };

    const pickSupplier = (s) => {
        setSuppSearch(''); setSuppResults([]);
        setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: s.supplierName }));
        setErrors(p => ({ ...p, supplierId: undefined }));
    };

    const isCheque = form.paymentMode?.toLowerCase() === 'cheque';

    const save = () => {
        const e = {};
        if (!form.supplierId)                     e.supplierId  = 'Supplier is required.';
        if (!form.currencyId)                     e.currencyId  = 'Currency is required.';
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                                  e.exchangeRate = 'Exchange rate must be a number greater than 0.';
        if (!(Number(form.amountPaid) > 0))       e.amountPaid  = 'Amount must be greater than zero.';
        if (isCheque && !form.referenceNo.trim()) e.referenceNo = 'Cheque No is required.';
        setErrors(e); if (Object.keys(e).length) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}paymentvoucher/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                pvId: 0, pvDate: form.pvDate,
                supplierId:   Number(form.supplierId),
                currencyId:   Number(form.currencyId),
                exchangeRate: Number(form.exchangeRate) || 1,
                amountPaid:   Number(form.amountPaid),
                paymentMode:  form.paymentMode  || null,
                referenceNo:  form.referenceNo  || null,
                referenceDate:form.referenceDate || null,
                bankName:     form.bankName      || null,
                notes:        form.notes         || null,
                createdBy:    currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setError(d?.message || 'Error saving.'); return; } onSaved(d.pvId); })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Payment Voucher</div>
                        <div className="pf-header-sub">Record the payment made to a supplier. After approval you can allocate it against invoices.</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    {/* Row 1 — Supplier + Date */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Supplier <span className="req">*</span></label>
                            {form.supplierId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>✓ {form.supplierLabel}</span>
                                    <button type="button" onClick={() => setForm(p => ({ ...p, supplierId: '', supplierLabel: '' }))}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <input className={`pf-input${errors.supplierId ? ' pf-input-err' : ''}`}
                                        value={suppSearch} onChange={e => setSuppSearch(e.target.value)}
                                        placeholder="Search by supplier name…" autoComplete="off" />
                                    {errors.supplierId && <span className="pf-field-err">{errors.supplierId}</span>}
                                    {suppResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {suppResults.map(s => (
                                                <div key={s.supplierId} style={dropItem}
                                                    onClick={() => pickSupplier(s)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <strong>{s.supplierName}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="pf-field">
                            <label>PV Date</label>
                            <input type="date" className="pf-input" value={form.pvDate} onChange={e => set('pvDate', e.target.value)} />
                        </div>
                    </div>

                    {/* Row 2 — Currency + Exchange Rate + Amount */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Currency <span className="req">*</span></label>
                            <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`}
                                value={form.currencyId} onChange={e => pickCurrency(e.target.value)}>
                                <option value="">— select —</option>
                                {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>)}
                            </select>
                            {errors.currencyId && <span className="pf-field-err">{errors.currencyId}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 130px' }}>
                            <label>Exchange Rate</label>
                            <input type="number" min="0" step="0.000001" className="pf-input"
                                value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} />
                        </div>
                        <div className="pf-field">
                            <label>Amount Paid <span className="req">*</span></label>
                            <AmountInput
                                className={`pf-input${errors.amountPaid ? ' pf-input-err' : ''}`}
                                value={form.amountPaid}
                                onChange={v => set('amountPaid', v)}
                            />
                            {errors.amountPaid && <span className="pf-field-err">{errors.amountPaid}</span>}
                        </div>
                    </div>

                    {/* Row 3 — Payment Mode + Cheque / Reference No */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Payment Mode</label>
                            <select className="pf-input" value={form.paymentMode}
                                onChange={e => { set('paymentMode', e.target.value); set('referenceNo', ''); }}>
                                {payModes.length > 0
                                    ? payModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)
                                    : ['Cash', 'Cheque', 'Bank Transfer'].map(m => <option key={m} value={m}>{m}</option>)
                                }
                            </select>
                        </div>
                        <div className="pf-field">
                            <label>{isCheque ? <>Cheque No <span className="req">*</span></> : 'Reference No'}</label>
                            <input className={`pf-input${errors.referenceNo ? ' pf-input-err' : ''}`}
                                value={form.referenceNo} onChange={e => set('referenceNo', e.target.value)}
                                placeholder={isCheque ? 'Cheque number' : 'Transaction / ref number'} />
                            {errors.referenceNo && <span className="pf-field-err">{errors.referenceNo}</span>}
                        </div>
                    </div>

                    {/* Row 4 — Reference Date + Bank */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Reference Date</label>
                            <input type="date" className="pf-input" value={form.referenceDate} onChange={e => set('referenceDate', e.target.value)} />
                        </div>
                        <div className="pf-field">
                            <label>Bank</label>
                            <input className="pf-input" value={form.bankName} onChange={e => set('bankName', e.target.value)} />
                        </div>
                    </div>

                    {/* Row 5 — Notes */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2}
                                value={form.notes} onChange={e => set('notes', e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── List page ─────────────────────────────────────────────────────────────────
const PaymentVoucher = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();
    const { getModuleStatuses } = useLookup();
    const { canDo } = usePermission();
    const canAdd = canDo('/payment-vouchers', 'ADD');

    const [rows,      setRows]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [totalRows, setTotal]     = useState(0);
    const [totalPages,setPages]     = useState(1);
    const [page,      setPage]      = useState(1);
    const [pageSize,  setPageSize]  = useState(200);
    const [sortCol,   setSortCol]   = useState('PvDate');
    const [sortDir,   setSortDir]   = useState('DESC');
    const [applied,   setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,  setShowForm]  = useState(false);
    const [listError, setListError] = useState('');

    const gridRef = useRef({ pageSize: 200, sortCol: 'PvDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setListError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status', af.status);
        if (af.dateFrom)   q.set('dateFrom', af.dateFrom);
        if (af.dateTo)     q.set('dateTo', af.dateTo);
        fetch(`${variables.API_URL}paymentvoucher/search?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => setListError(e.message || 'Failed to load payment vouchers.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'PvDate', 'DESC', DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            searchText: { label: 'Search', type: 'text', placeholder: 'PV No, Supplier, Reference…' },
            status:     { label: 'Status', type: 'multiselect',
                          options: getModuleStatuses('PV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
        };
        registerFilters('paymentvoucher', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('paymentvoucher');
    }, [getModuleStatuses]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage        = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize= (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };
    const handleSaved   = (id) => { setShowForm(false); navigate(`/payment-vouchers/${id}`); };

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)} style={right ? { textAlign: 'right' } : undefined}>
            <div className="po-th-inner" style={right ? { justifyContent: 'flex-end' } : undefined}>{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
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
            {showForm && <PvForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Payment Vouchers</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Payment</button>}
                        </div>
                    </div>
                </div>

                {listError && (
                    <div style={{ margin: '0 0 12px', padding: '10px 16px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
                        ⚠ {listError}
                    </div>
                )}
                <div className="po-table-wrap">
                    {loading && <div className="po-loading-overlay"><div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div></div>}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="PvNumber">PV No</Th>
                                <Th col="PvDate">Date</Th>
                                <Th col="SupplierName">Supplier</Th>
                                <th style={{ textAlign: 'center', width: 55 }}>Ccy</th>
                                <Th col="AmountPaid" right>Amount Paid</Th>
                                <th style={{ textAlign: 'right' }}>Allocated</th>
                                <th style={{ textAlign: 'right' }}>Balance</th>
                                <th>Mode</th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={10} className="po-empty">No payment vouchers found. Use the filters or create one.</td></tr>
                            ) : rows.map(r => {
                                const ccy = r.currencyShort || '';
                                return (
                                <tr key={r.pvId}>
                                    <td><span className="po-num-link" onClick={() => navigate(`/payment-vouchers/${r.pvId}`)}>{r.pvNumber}</span></td>
                                    <td>{fmtDate(r.pvDate)}</td>
                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.supplierName || '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {ccy && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1e40af', background: '#eff6ff', padding: '2px 7px', borderRadius: 10 }}>{ccy}</span>}
                                    </td>
                                    <td className="po-num-cell">{fmt(r.amountPaid)}</td>
                                    <td className="po-num-cell" style={{ color: Number(r.allocatedAmount) > 0 ? '#0f766e' : '#94a3b8' }}>
                                        {Number(r.allocatedAmount) > 0 ? fmt(r.allocatedAmount) : '—'}
                                    </td>
                                    <td className="po-num-cell" style={{
                                        color: r.unallocatedAmount == null ? '#94a3b8'
                                             : Number(r.unallocatedAmount) <= 0 ? '#166534'
                                             : '#b45309',
                                        fontWeight: 600,
                                    }}>
                                        {r.unallocatedAmount == null ? '—' : fmt(r.unallocatedAmount)}
                                    </td>
                                    <td style={{ fontSize: 11, color: '#475569' }}>{r.paymentMode || '—'}</td>
                                    <td><StatusBadge s={r.status} /></td>
                                    <td><button className="po-act-btn po-act-open" onClick={() => navigate(`/payment-vouchers/${r.pvId}`)}>Open</button></td>
                                </tr>
                                );
                            })}
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

export default PaymentVoucher;
export { PaymentVoucher };

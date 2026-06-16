import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, FormSection, statusBadgeCfg } from '../procurementConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [100, 200, 500];
const DEFAULT_FILTERS = {
    searchText: '', status: '', supplierId: '', jobId: '',
    poNumber: '', createdBy: '', dateFrom: '', dateTo: '',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── Reusable locked-field chip ────────────────────────────────
const LockedChip = ({ value, bg = '#f0f9ff', color = '#1e40af' }) => (
    <div className="pf-input" style={{ background: bg, color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
        <span style={{ opacity: .55, fontSize: 10 }}>🔒</span> {value || '—'}
    </div>
);

// ── LiveSearch widget ─────────────────────────────────────────
// Supports item._render (JSX) for rich rows; falls back to item._label (string).
const LiveSearch = ({ label, value, search, setSearch, results, setResults, onSelect, onClear, confirmBg = '#f0f9ff', confirmColor = '#1e40af' }) => {
    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
    return (
        <div style={{ position: 'relative' }}>
            {value ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="pf-input" style={{ flex: 1, background: confirmBg, color: confirmColor, fontWeight: 500 }}>✓ {value}</span>
                    <button type="button" onClick={onClear} style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                </div>
            ) : (
                <>
                    <input className="pf-input" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={`Search ${label.toLowerCase()}…`} autoComplete="off" />
                    {results.length > 0 && (
                        <div style={dropStyle}>
                            {results.map(item => (
                                <div key={item._key} style={dropItem}
                                    onClick={() => { onSelect(item); setSearch(''); setResults([]); }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                    {item._render ?? item._label}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ── PO status badge (inline, for dropdown rows) ───────────────
const PoStatusBadge = ({ status }) => {
    const cfg = {
        Draft:     { bg: '#f1f5f9', color: '#475569' },
        Approved:  { bg: '#dcfce7', color: '#166534' },
        Sent:      { bg: '#dbeafe', color: '#1e40af' },
        Partial:   { bg: '#fef3c7', color: '#92400e' },
        Received:  { bg: '#d1fae5', color: '#065f46' },
        Hold:      { bg: '#fff7ed', color: '#9a3412' },
        Closed:    { bg: '#f3f4f6', color: '#374151' },
        Cancelled: { bg: '#fce7f3', color: '#9d174d' },
    }[status] || { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{
            marginLeft: 8, padding: '1px 8px', borderRadius: 10, fontSize: 10,
            fontWeight: 700, background: cfg.bg, color: cfg.color,
            verticalAlign: 'middle', letterSpacing: '.03em',
        }}>
            {status}
        </span>
    );
};

// ── Field-level error helper ──────────────────────────────────
const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── New GRN Form ──────────────────────────────────────────────────
const GrnForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq }   = useFieldConfig('GRN');
    const { currencies } = lookups;

    const INITIAL = {
        poId: '', poLabel: '', poStatus: '',
        supplierId: '', supplierLabel: '',
        jobId: '', jobLabel: '',
        currencyId: '', exchangeRate: '1',
        grnDate: today(), receivedDate: '',
        doNo: '', receivedBy: '', receivedFrom: '',
        shipmentBy: '', deliveryTerms: '', deliveryLocation: '', shipmentDetails: '',
        invoiceNo: '', invoiceDate: '',
        boeNo: '', boeDate: '', isRegistered: '0',
        remarks: '',
    };

    const [form,            setForm]            = useState(INITIAL);
    const [errors,          setErrors]          = useState({});
    const [poSearch,        setPoSearch]        = useState('');
    const [poResults,       setPoResults]       = useState([]);
    const [supplierSearch,  ]  = useState('');
    const [,                setSupplierResults] = useState([]);
    const [saving,          setSaving]          = useState(false);
    const [serverError,     setServerError]     = useState('');
    const [previewNo,       setPreviewNo]       = useState('');

    // Fetch preview number once on mount
    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/GRN`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    const poLinked = !!form.poId;

    // PO live-search
    useEffect(() => {
        if (!poSearch.trim()) { setPoResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}purchaseorder/search?searchText=${encodeURIComponent(poSearch)}&status=Approved,Sent,Partial&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setPoResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [poSearch]);

    // Supplier live-search (only when no PO linked)
    useEffect(() => {
        if (poLinked || !supplierSearch.trim()) { setSupplierResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(supplierSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setSupplierResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [supplierSearch, poLinked]);

    // When PO selected → fetch full PO → auto-fill locked fields
    const handlePoSelect = async (p) => {
        setPoSearch(''); setPoResults([]);
        setErrors(e => ({ ...e, poId: undefined, supplierId: undefined }));
        setForm(f => ({ ...f, poId: String(p.poId), poLabel: `${p.poNumber}${p.vendorName ? ' — ' + p.vendorName : ''}`, poStatus: p.status || '' }));
        try {
            const r  = await fetch(`${variables.API_URL}purchaseorder/${p.poId}`, { headers: authHeaders() });
            const po = await r.json();
            setForm(f => ({
                ...f,
                poStatus:      po.status || '',
                supplierId:    po.supplierId ? String(po.supplierId) : '',
                supplierLabel: po.supplierId
                    ? `${po.supplierCode ? po.supplierCode + ' — ' : ''}${po.supplierNameResolved || po.vendorName || ''}`
                    : '',
                jobId:         po.jobId || '',
                jobLabel:      po.jobId ? `${po.jobId}${po.jobTitle ? ' — ' + po.jobTitle : ''}` : '',
                currencyId:    po.currencyId ? String(po.currencyId) : '',
                exchangeRate:  po.exchangeRate != null ? String(po.exchangeRate) : '1',
            }));
        } catch { setServerError('Failed to load PO details. Please try again.'); }
    };

    const handlePoClear = () => {
        setForm(f => ({ ...f, poId: '', poLabel: '', poStatus: '', supplierId: '', supplierLabel: '', jobId: '', jobLabel: '', currencyId: '', exchangeRate: '1' }));
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const handleCurrency = e => {
        if (poLinked) return;
        const id  = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
        if (errors.currencyId) setErrors(p => ({ ...p, currencyId: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.poId)                                   e.poId         = 'Purchase Order is required.';
        if (!f.supplierId)                             e.supplierId   = 'Supplier is required.';
        if (!f.grnDate)                                e.grnDate      = 'GRN Date is required.';
        if (f.receivedDate && f.receivedDate < f.grnDate)
                                                       e.receivedDate = 'Received Date cannot be before GRN Date.';
        if (!f.currencyId)                             e.currencyId   = 'Currency is required.';
        if (!f.exchangeRate || Number(f.exchangeRate) <= 0)
                                                       e.exchangeRate = 'Exchange rate must be greater than 0.';
        if (f.boeDate && f.grnDate && f.boeDate < f.grnDate)
                                                       e.boeDate      = 'BOE Date cannot be before GRN Date.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setServerError(''); setSaving(true);
        fetch(`${variables.API_URL}grn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                grnId:            0,
                poId:             form.poId         ? Number(form.poId)         : null,
                supplierId:       form.supplierId   ? Number(form.supplierId)   : null,
                jobId:            form.jobId        || null,
                grnDate:          form.grnDate,
                receivedDate:     form.receivedDate || null,
                doNo:             form.doNo.trim()  || null,
                receivedBy:       form.receivedBy.trim()       || null,
                receivedFrom:     form.receivedFrom.trim()     || null,
                shipmentBy:       form.shipmentBy.trim()       || null,
                deliveryTerms:    form.deliveryTerms           || null,
                deliveryLocation: form.deliveryLocation.trim() || null,
                shipmentDetails:  form.shipmentDetails.trim()  || null,
                invoiceNo:        form.invoiceNo.trim()        || null,
                invoiceDate:      form.invoiceDate             || null,
                currencyId:       form.currencyId  ? Number(form.currencyId)   : null,
                exchangeRate:     form.exchangeRate ? Number(form.exchangeRate) : 1,
                boeNo:            form.boeNo.trim() || null,
                boeDate:          form.boeDate      || null,
                isRegistered:     form.isRegistered === '1',
                registeredBy:     null, registeredDate: null, totalAmount: null,
                remarks:          form.remarks.trim() || null,
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

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 700 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Goods Receipt Note</div>
                        <div className="pf-header-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: 4, letterSpacing: '0.03em' }}>{previewNo}</span></>
                                : 'GRN number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverError && <div className="pf-err">{serverError}</div>}

                    {/* ── 1. Purchase Order (mandatory — drives Supplier, Job & Currency) ── */}
                    <FormSection label="Purchase Order" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Purchase Order {isReq('poId') && <span className="req">*</span>} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(auto-fills Supplier, Job &amp; Currency)</span></label>
                            <LiveSearch
                                label="PO"
                                value={form.poLabel}
                                search={poSearch} setSearch={setPoSearch}
                                results={poResults.map(p => ({
                                    ...p,
                                    _key:   p.poId,
                                    _label: `${p.poNumber} — ${p.vendorName || p.supplierNameResolved || ''}`,
                                    _render: (
                                        <span>
                                            <strong>{p.poNumber}</strong>
                                            {(p.vendorName || p.supplierNameResolved) && (
                                                <span style={{ color: '#475569', marginLeft: 6 }}>
                                                    {p.vendorName || p.supplierNameResolved}
                                                </span>
                                            )}
                                            {p.status && <PoStatusBadge status={p.status} />}
                                            {p.jobId && (
                                                <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b', fontFamily: 'Courier New' }}>
                                                    {p.jobId}
                                                </span>
                                            )}
                                        </span>
                                    ),
                                }))}
                                setResults={setPoResults}
                                onSelect={handlePoSelect}
                                onClear={handlePoClear}
                                confirmBg="#f0fdf4" confirmColor="#166534"
                            />
                            {/* Warning when selected PO has a problematic status */}
                            {form.poId && ['Hold','Closed','Cancelled'].includes(form.poStatus) && (
                                <div style={{
                                    marginTop: 6, padding: '7px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                    background: form.poStatus === 'Hold' ? '#fff7ed' : '#fef2f2',
                                    color:      form.poStatus === 'Hold' ? '#9a3412' : '#991b1b',
                                    border:     `1px solid ${form.poStatus === 'Hold' ? '#fdba74' : '#fecaca'}`,
                                }}>
                                    {form.poStatus === 'Hold'      && '⚠ This PO is currently on Hold — GRN creation will be blocked by the server.'}
                                    {form.poStatus === 'Closed'    && '⚠ This PO is Closed — GRN creation will be blocked by the server.'}
                                    {form.poStatus === 'Cancelled' && '⚠ This PO is Cancelled — GRN creation will be blocked by the server.'}
                                </div>
                            )}
                            <FieldErr msg={errors.poId} />
                        </div>
                    </div>

                    {/* ── 2. Supplier & Job (always locked — filled from PO) ── */}
                    <FormSection label="Supplier & Job" />
                    {poLinked ? (
                        <div className="pf-row">
                            <div className="pf-field pf-f2">
                                <label>Supplier {isReq('supplierId') && <span className="req">*</span>} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(from PO)</span></label>
                                <LockedChip value={form.supplierLabel || '—'} bg="#f0fdf4" color="#166534" />
                            </div>
                            <div className="pf-field pf-f2">
                                <label>Job <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(from PO)</span></label>
                                <LockedChip value={form.jobLabel || '—'} bg="#f0f9ff" color="#1e40af" />
                            </div>
                        </div>
                    ) : (
                        <div className="pf-row">
                            <div className="pf-field pf-f3">
                                <div style={{ padding: '9px 12px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, color: '#94a3b8', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 16 }}>↑</span> Select a Purchase Order above — Supplier and Job will be filled automatically.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 3. Receipt Dates ── */}
                    <FormSection label="Receipt Details" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>GRN Date {isReq('grnDate') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.grnDate ? ' pf-input-err' : ''}`} type="date" name="grnDate" value={form.grnDate} onChange={handle} />
                            <FieldErr msg={errors.grnDate} />
                        </div>
                        <div className="pf-field">
                            <label>Received Date</label>
                            <input className={`pf-input${errors.receivedDate ? ' pf-input-err' : ''}`} type="date" name="receivedDate" value={form.receivedDate} onChange={handle} />
                            <FieldErr msg={errors.receivedDate} />
                        </div>
                        <div className="pf-field">
                            <label>D.O. No</label>
                            <input className="pf-input" type="text" name="doNo" value={form.doNo} onChange={handle} placeholder="Delivery order #" />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Received By</label>
                            <input className="pf-input" type="text" name="receivedBy" value={form.receivedBy} onChange={handle} placeholder="Name of receiver" />
                        </div>
                        <div className="pf-field">
                            <label>Received From</label>
                            <input className="pf-input" type="text" name="receivedFrom" value={form.receivedFrom} onChange={handle} placeholder="Person who delivered" />
                        </div>
                        <div className="pf-field">
                            <label>Shipment By</label>
                            <input className="pf-input" type="text" name="shipmentBy" value={form.shipmentBy} onChange={handle} placeholder="Carrier / courier" />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: '0 0 140px' }}>
                            <label>Delivery Terms</label>
                            <input className="pf-input" type="text" name="deliveryTerms" value={form.deliveryTerms} onChange={handle} placeholder="FOB, CIF…" />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Delivery Location</label>
                            <input className="pf-input" type="text" name="deliveryLocation" value={form.deliveryLocation} onChange={handle} placeholder="Warehouse / site" />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Shipment Details</label>
                            <input className="pf-input" type="text" name="shipmentDetails" value={form.shipmentDetails} onChange={handle} placeholder="Container #, tracking, etc." />
                        </div>
                    </div>

                    {/* ── 4. Currency (locked when PO linked) ── */}
                    <FormSection label="Currency" />
                    {poLinked ? (
                        <div className="pf-row">
                            <div className="pf-field pf-f2">
                                <label>Currency {isReq('currencyId') && <span className="req">*</span>} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(from PO)</span></label>
                                <LockedChip
                                    value={currencies.find(c => String(c.id) === form.currencyId)?.shortName || form.currencyId || '—'}
                                    bg="#fefce8" color="#854d0e"
                                />
                            </div>
                            <div className="pf-field" style={{ flex: '0 0 140px' }}>
                                <label>Exchange Rate <span style={{ fontSize: 10, color: '#64748b', fontWeight: 400 }}>(from PO)</span></label>
                                <LockedChip value={form.exchangeRate} bg="#fefce8" color="#854d0e" />
                            </div>
                        </div>
                    ) : (
                        <div className="pf-row">
                            <div className="pf-field">
                                <label>Currency {isReq('currencyId') && <span className="req">*</span>}</label>
                                <select className={`pf-input${errors.currencyId ? ' pf-input-err' : ''}`} name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                                    <option value="">— Select —</option>
                                    {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                                </select>
                                <FieldErr msg={errors.currencyId} />
                            </div>
                            <div className="pf-field" style={{ flex: '0 0 140px' }}>
                                <label>Exchange Rate {isReq('exchangeRate') && <span className="req">*</span>}</label>
                                <input className={`pf-input${errors.exchangeRate ? ' pf-input-err' : ''}`} type="number" name="exchangeRate" value={form.exchangeRate} onChange={handle} step="0.000001" min="0.000001" />
                                <FieldErr msg={errors.exchangeRate} />
                            </div>
                        </div>
                    )}

                    {/* ── 5. Invoice ── */}
                    <FormSection label="Invoice" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Invoice No</label>
                            <input className="pf-input" type="text" name="invoiceNo" value={form.invoiceNo} onChange={handle} placeholder="Supplier invoice #" />
                        </div>
                        <div className="pf-field">
                            <label>Invoice Date</label>
                            <input className="pf-input" type="date" name="invoiceDate" value={form.invoiceDate} onChange={handle} />
                        </div>
                    </div>

                    {/* ── 6. BOE & Registration ── */}
                    <FormSection label="BOE & Registration" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>BOE No</label>
                            <input className="pf-input" type="text" name="boeNo" value={form.boeNo} onChange={handle} placeholder="Bill of entry #" />
                        </div>
                        <div className="pf-field">
                            <label>BOE Date</label>
                            <input className={`pf-input${errors.boeDate ? ' pf-input-err' : ''}`} type="date" name="boeDate" value={form.boeDate} onChange={handle} />
                            <FieldErr msg={errors.boeDate} />
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 150px' }}>
                            <label>Registered?</label>
                            <select className="pf-input" name="isRegistered" value={form.isRegistered} onChange={handle}>
                                <option value="0">No</option>
                                <option value="1">Yes</option>
                            </select>
                        </div>
                    </div>

                    {/* ── 7. Remarks ── */}
                    <FormSection label="Remarks" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Remarks</label>
                            <textarea className="pf-input pf-textarea" rows={2} name="remarks" value={form.remarks} onChange={handle} placeholder="Optional notes…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create GRN'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────────
const Grn = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/grn', 'ADD');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('GrnDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'GrnDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [jobOptions,      setJobOptions]      = useState([]);
    const [supplierOptions, setSupplierOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobOptions((d.data || []).map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : '') })))).catch(console.error);
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setSupplierOptions((d.data || []).map(s => ({ value: String(s.supplierId), label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName })))).catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.supplierId) q.set('supplierId', af.supplierId);
        if (af.jobId)      q.set('jobId',      af.jobId);
        if (af.poNumber)   q.set('poNumber',   af.poNumber);
        if (af.createdBy)  q.set('createdBy',  af.createdBy);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}grn/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (jobOpts, supplierOpts) => ({
        searchText: { label: 'Search',     type: 'text',        placeholder: 'GRN #, D.O., invoice…' },
        status:     { label: 'Status',     type: 'multiselect', options: getModuleStatuses('GRN').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        supplierId: { label: 'Supplier',   type: 'select',      placeholder: 'All Suppliers', options: supplierOpts },
        jobId:      { label: 'Job ID',     type: 'select',      placeholder: 'All Jobs',      options: jobOpts },
        poNumber:   { label: 'PO Number',  type: 'text',        placeholder: 'PO-XXXX…' },
        createdBy:  { label: 'Created By', type: 'text',        placeholder: 'Username…' },
        dateFrom:   { label: 'Date From',  type: 'date' },
        dateTo:     { label: 'Date To',    type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('grn', buildDefs([], []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('grn');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('grn', buildDefs(jobOptions, supplierOptions));
    }, [jobOptions, supplierOptions, getModuleStatuses]); // eslint-disable-line

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
            {showForm && <GrnForm onClose={() => setShowForm(false)} onSaved={id => { setShowForm(false); navigate(`/grn/${id}`); }} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Goods Receipt Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New GRN</button>}
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
                                <Th col="GrnNumber">GRN #</Th>
                                <Th col="GrnDate">Date</Th>
                                <Th col="PoNumber">PO #</Th>
                                <Th col="SupplierName">Supplier</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="DoNo">D.O. No</Th>
                                <Th col="InvoiceNo">Invoice</Th>
                                <Th col="Status">Status</Th>
                                <Th col="TotalAmount">Total</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={10} className="po-empty">No GRNs found. Use the filters or create a new GRN.</td></tr>
                            ) : rows.map(r => {
                                const statusCfg = statusBadgeCfg(getStatusConfig('GRN', r.status));
                                return (
                                    <tr key={r.grnId}>
                                        <td><RowLink className="po-num-link" to={`/grn/${r.grnId}`}>{r.grnNumber}</RowLink></td>
                                        <td>{fmtDate(r.grnDate)}</td>
                                        <td>
                                            {r.poNumber
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.poNumber}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td>{r.supplierName || '—'}</td>
                                        <td>
                                            {r.jobId
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td><span style={{ fontFamily: 'Courier New', fontSize: 12 }}>{r.doNo || '—'}</span></td>
                                        <td><span style={{ fontFamily: 'Courier New', fontSize: 12 }}>{r.invoiceNo || '—'}</span></td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                                                <span className="po-status-dot" style={{ background: statusCfg.dot }} />
                                                {statusCfg.label || r.status}
                                            </span>
                                        </td>
                                        <td className="po-num-cell">{fmt(r.totalAmount)}</td>
                                        <td><RowLink className="po-act-btn po-act-open" to={`/grn/${r.grnId}`}>Open</RowLink></td>
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

export default Grn;

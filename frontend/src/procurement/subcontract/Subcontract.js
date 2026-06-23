import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate } from '../procurementConstants';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [20, 50, 100, 200];

const DEFAULT_FILTERS = {
    searchText:      '',
    status:          '',
    subcontractType: '',
    vendorId:        '',
    jobId:           '',
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const StatusBadge = ({ status }) => {
    const { getStatusConfig } = useLookup();
    const cfg = getStatusConfig('SCO', status) || { badgeBg: '#f1f5f9', badgeColor: '#475569', badgeDot: '#94a3b8' };
    return (
        <span className="po-status-badge" style={{ background: cfg.badgeBg, color: cfg.badgeColor }}>
            <span className="po-status-dot" style={{ background: cfg.badgeDot }} />
            {status}
        </span>
    );
};

// ── New Subcontract Form ──────────────────────────────────────────────────────
const NewSubcontractForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { getVList } = useLookup();
    const [form, setForm] = useState({
        poId:               '',
        poLabel:            '',
        subcontractType:    'MATERIAL_OUT',
        vendorId:           '',
        vendorLabel:        '',
        outputItemId:       '',
        outputItemLabel:    '',
        outputQty:          '',
        outputUomId:        '',
        serviceDescription: '',
        expectedDate:       '',
        jobId:              '',
        jobLabel:           '',
    });

    // PO live-search
    const [poSearch,    setPoSearch]    = useState('');
    const [poResults,   setPoResults]   = useState([]);
    // Vendor live-search (shown only when no PO linked)
    const [vendorSearch,  setVendorSearch]  = useState('');
    const [vendorResults, setVendorResults] = useState([]);
    // Item live-search
    const [itemSearch,  setItemSearch]  = useState('');
    const [itemResults, setItemResults] = useState([]);
    // Job live-search (shown only when no PO linked)
    const [jobSearch,   setJobSearch]   = useState('');
    const [jobResults,  setJobResults]  = useState([]);

    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    const [errors, setErrors] = useState({});
    const [previewNo, setPreviewNo] = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/SCO`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    // PO search
    useEffect(() => {
        if (!poSearch.trim()) { setPoResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}purchaseorder/search?search=${encodeURIComponent(poSearch)}&pageSize=10&page=1&isSubcontractOnly=true&status=Approved`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setPoResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [poSearch]);

    // Vendor search (manual)
    useEffect(() => {
        if (!vendorSearch.trim()) { setVendorResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(vendorSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setVendorResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [vendorSearch]);

    // Item search
    useEffect(() => {
        if (!itemSearch.trim()) { setItemResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(itemSearch)}&pageSize=10`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setItemResults(Array.isArray(d) ? d : (d.data || []))).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [itemSearch]);

    // Job search (manual)
    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const selectPo = (po) => {
        setForm(f => ({
            ...f,
            poId:      String(po.poId),
            poLabel:   `${po.poNumber}${po.vendorName ? ' — ' + po.vendorName : ''}`,
            // pre-fill vendor from PO
            vendorId:    po.supplierId ? String(po.supplierId) : f.vendorId,
            vendorLabel: po.supplierId
                ? (po.supplierCode ? `${po.supplierCode} — ` : '') + (po.supplierNameResolved || po.vendorName || '')
                : f.vendorLabel,
            // pre-fill job from PO
            jobId:    po.jobId || f.jobId,
            jobLabel: po.jobId || f.jobLabel,
            // pre-fill expected date from PO delivery date
            expectedDate: po.deliveryDate ? po.deliveryDate.slice(0, 10) : f.expectedDate,
        }));
        setPoSearch(''); setPoResults([]);
        setErrors(p => ({ ...p, poId: undefined }));
    };

    const clearPo = () => {
        setForm(f => ({ ...f, poId: '', poLabel: '', vendorId: '', vendorLabel: '', jobId: '', jobLabel: '', expectedDate: '' }));
        setVendorSearch(''); setJobSearch('');
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    const validate = () => {
        const e = {};
        if (!form.poId)         e.poId         = 'PO is required.';
        if (!form.vendorId)     e.vendorId     = 'Vendor is required.';
        if (!form.outputItemId) e.outputItemId = 'Output item is required.';
        if (!form.outputQty || Number(form.outputQty) <= 0) e.outputQty = 'Output quantity must be > 0.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = async () => {
        if (!validate()) return;
        setSaving(true); setError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    subcontractType:    form.subcontractType,
                    vendorId:           Number(form.vendorId),
                    jobId:              form.jobId || null,
                    outputItemId:       Number(form.outputItemId),
                    outputQty:          Number(form.outputQty),
                    outputUomId:        form.outputUomId ? Number(form.outputUomId) : null,
                    serviceDescription: form.serviceDescription || null,
                    expectedDate:       form.expectedDate || null,
                    poId:               form.poId ? Number(form.poId) : null,
                    actionBy:           currentUser,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Failed to create.');
            onSaved(d.subcontractId || d.id);
        } catch (e) { setError(e.message); }
        finally { setSaving(false); }
    };

    const hasPo = !!form.poId;

    return (
        <div className="pf-overlay">
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Subcontract Order</div>
                        <div className="pf-header-sub">
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: 4 }}>{previewNo}</span></>
                                : 'SC number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    {/* PO Link */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Linked PO <span className="req">*</span></label>
                            {hasPo
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#eff6ff', color: '#1e40af', fontWeight: 600, flex: 1, fontFamily: 'Courier New', fontSize: 12 }}>
                                        🔗 {form.poLabel}
                                    </span>
                                    <button type="button" onClick={clearPo}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                  </div>
                                : <>
                                    <input className={`pf-input${errors.poId ? ' pf-input-err' : ''}`}
                                        placeholder="Search PO number or vendor…"
                                        value={poSearch}
                                        onChange={e => { setPoSearch(e.target.value); if (errors.poId) setErrors(p => ({ ...p, poId: undefined })); }}
                                        autoComplete="off" />
                                    {errors.poId && <span className="pf-field-err">{errors.poId}</span>}
                                    {poResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {poResults.map(p => (
                                                <div key={p.poId} style={dropItem}
                                                    onClick={() => selectPo(p)}
                                                    onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong style={{ fontFamily: 'Courier New', fontSize: 12 }}>{p.poNumber}</strong>
                                                    {p.vendorName && <span style={{ marginLeft: 8, color: '#334155' }}>{p.vendorName}</span>}
                                                    {p.jobId && <span style={{ marginLeft: 8, color: '#64748b', fontSize: 11 }}>Job: {p.jobId}</span>}
                                                    <span style={{ marginLeft: 8, fontSize: 11, color: p.status === 'Approved' ? '#166534' : '#64748b' }}>{p.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                  </>
                            }
                        </div>
                    </div>

                    {/* Type */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Type</label>
                            <select className="pf-input" value={form.subcontractType}
                                onChange={e => setForm(f => ({ ...f, subcontractType: e.target.value }))}>
                                {getVList('Subcontract', 'SubcontractType').map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Vendor — read-only chip if from PO, searchable otherwise */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Vendor <span className="req">*</span></label>
                            {form.vendorId
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.vendorLabel}
                                    </span>
                                    {!hasPo && (
                                        <button type="button" onClick={() => setForm(f => ({ ...f, vendorId: '', vendorLabel: '' }))}
                                            style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                    )}
                                  </div>
                                : <>
                                    <input className={`pf-input${errors.vendorId ? ' pf-input-err' : ''}`}
                                        placeholder="Search vendor…" value={vendorSearch}
                                        onChange={e => { setVendorSearch(e.target.value); if (errors.vendorId) setErrors(p => ({ ...p, vendorId: undefined })); }}
                                        autoComplete="off" />
                                    {errors.vendorId && <span className="pf-field-err">{errors.vendorId}</span>}
                                    {vendorResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {vendorResults.map(v => (
                                                <div key={v.supplierId} style={dropItem}
                                                    onClick={() => { setForm(f => ({ ...f, vendorId: String(v.supplierId), vendorLabel: `${v.supplierCode} — ${v.supplierName}` })); setVendorSearch(''); setVendorResults([]); setErrors(p => ({ ...p, vendorId: undefined })); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong>{v.supplierCode}</strong> — {v.supplierName}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                  </>
                            }
                        </div>
                    </div>

                    {/* Output Item */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Output Item (Finished Good) <span className="req">*</span></label>
                            {form.outputItemId
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.outputItemLabel}
                                    </span>
                                    <button type="button" onClick={() => setForm(f => ({ ...f, outputItemId: '', outputItemLabel: '' }))}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                  </div>
                                : <>
                                    <input className={`pf-input${errors.outputItemId ? ' pf-input-err' : ''}`}
                                        placeholder="Search item…" value={itemSearch}
                                        onChange={e => { setItemSearch(e.target.value); if (errors.outputItemId) setErrors(p => ({ ...p, outputItemId: undefined })); }}
                                        autoComplete="off" />
                                    {errors.outputItemId && <span className="pf-field-err">{errors.outputItemId}</span>}
                                    {itemResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {itemResults.map(i => (
                                                <div key={i.itemId} style={dropItem}
                                                    onClick={() => { setForm(f => ({ ...f, outputItemId: String(i.itemId), outputItemLabel: `${i.itemCode} — ${i.itemName}`, outputUomId: i.baseUomId ? String(i.baseUomId) : '' })); setItemSearch(''); setItemResults([]); setErrors(p => ({ ...p, outputItemId: undefined })); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong>{i.itemCode}</strong> — {i.itemName}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                  </>
                            }
                        </div>
                    </div>

                    {/* Qty + Date */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Output Qty <span className="req">*</span></label>
                            <input className={`pf-input${errors.outputQty ? ' pf-input-err' : ''}`}
                                type="number" min="0" step="any"
                                value={form.outputQty}
                                onChange={e => { setForm(f => ({ ...f, outputQty: e.target.value })); if (errors.outputQty) setErrors(p => ({ ...p, outputQty: undefined })); }} />
                            {errors.outputQty && <span className="pf-field-err">{errors.outputQty}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Expected Date</label>
                            <input className="pf-input" type="date" value={form.expectedDate}
                                onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} />
                        </div>
                    </div>

                    {/* Job — read-only chip if from PO, searchable otherwise */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Job Ref</label>
                            {form.jobId
                                ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.jobLabel || form.jobId}
                                    </span>
                                    {!hasPo && (
                                        <button type="button" onClick={() => { setForm(f => ({ ...f, jobId: '', jobLabel: '' })); setJobSearch(''); }}
                                            style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                    )}
                                  </div>
                                : <>
                                    <input className="pf-input" placeholder="Type job ID or description… (optional)"
                                        value={jobSearch} onChange={e => setJobSearch(e.target.value)} autoComplete="off" />
                                    {jobResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {jobResults.map(j => (
                                                <div key={j.jobId} style={dropItem}
                                                    onClick={() => { setForm(f => ({ ...f, jobId: j.jobId, jobLabel: `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}` })); setJobSearch(''); setJobResults([]); }}
                                                    onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                    <strong>{j.jobId}</strong>
                                                    {j.projectName && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                  </>
                            }
                        </div>
                    </div>

                    {/* Description */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Description / Scope</label>
                            <textarea className="pf-input pf-textarea" rows={3}
                                placeholder="What is being fabricated or the service scope…"
                                value={form.serviceDescription}
                                onChange={e => setForm(f => ({ ...f, serviceDescription: e.target.value }))} />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create Subcontract Order'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────────────────────
export const Subcontract = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const { getVList, getModuleStatuses } = useLookup();
    const canAdd    = canDo('/subcontracts', 'ADD');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('CreatedDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'CreatedDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

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
        if (af.searchText)      q.set('search',          af.searchText);
        if (af.status)          q.set('status',          af.status);
        if (af.subcontractType) q.set('subcontractType', af.subcontractType);
        if (af.vendorId)        q.set('vendorId',        af.vendorId);
        if (af.jobId)           q.set('jobId',           af.jobId);
        fetch(`${variables.API_URL}subcontract/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (jobOpts, supplierOpts) => ({
        searchText:      { label: 'Search',     type: 'text',   placeholder: 'SC #, vendor, item…' },
        status:          { label: 'Status',     type: 'select', placeholder: 'All Statuses',
                           options: getModuleStatuses('SCO').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        subcontractType: { label: 'Type',       type: 'select', placeholder: 'All Types',
                           options: getVList('Subcontract', 'SubcontractType') },
        vendorId:        { label: 'Vendor',     type: 'select', placeholder: 'All Vendors',  options: supplierOpts },
        jobId:           { label: 'Job ID',     type: 'select', placeholder: 'All Jobs',      options: jobOpts },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('subcontracts', buildDefs([], []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('subcontracts');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('subcontracts', buildDefs(jobOptions, supplierOptions));
    }, [jobOptions, supplierOptions]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = (id) => { setShowForm(false); navigate(`/subcontracts/${id}`); };

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
            {showForm && <NewSubcontractForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Subcontract Orders</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && (
                                <button className="po-btn-pri" onClick={() => setShowForm(true)}>
                                    + New Subcontract
                                </button>
                            )}
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
                                <Th col="SubcontractNo">SC No</Th>
                                <Th col="SubcontractType">Type</Th>
                                <Th col="VendorName">Vendor</Th>
                                <Th col="OutputItemName">Output Item</Th>
                                <Th col="OutputQty">Output Qty</Th>
                                <Th col="TotalReceivedQty">Received</Th>
                                <Th col="ExpectedDate">Expected</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="Status">Status</Th>
                                <Th col="CreatedDate">Created</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={11} className="po-empty">No subcontract orders found. Use the filters on the left or create a new order.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.subcontractId}>
                                    <td>
                                        <RowLink className="po-num-link" to={`/subcontracts/${r.subcontractId}`}>
                                            {r.subcontractNo}
                                        </RowLink>
                                    </td>
                                    <td>
                                        <span style={{ fontSize: 11, fontWeight: 600,
                                            color: r.subcontractType === 'MATERIAL_OUT' ? '#1e40af' : '#6d28d9',
                                            background: r.subcontractType === 'MATERIAL_OUT' ? '#dbeafe' : '#ede9fe',
                                            padding: '2px 7px', borderRadius: 4 }}>
                                            {r.subcontractType === 'MATERIAL_OUT' ? 'Material Out' : 'Service Only'}
                                        </span>
                                    </td>
                                    <td>{r.vendorName || '—'}</td>
                                    <td>
                                        {r.outputItemCode
                                            ? <span>
                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '1px 5px', borderRadius: 3 }}>{r.outputItemCode}</span>
                                                <span style={{ marginLeft: 6, fontSize: 12 }}>{r.outputItemName}</span>
                                              </span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>
                                        }
                                    </td>
                                    <td className="po-num-cell">{Number(r.outputQty || 0).toLocaleString()}</td>
                                    <td className="po-num-cell" style={{ color: Number(r.totalReceivedQty) >= Number(r.outputQty) ? '#16a34a' : undefined }}>
                                        {Number(r.totalReceivedQty || 0).toLocaleString()}
                                    </td>
                                    <td>{fmtDate(r.expectedDate)}</td>
                                    <td>
                                        {r.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>
                                        }
                                    </td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{fmtDate(r.createdDate)}</td>
                                    <td>
                                        <RowLink className="po-act-btn" to={`/subcontracts/${r.subcontractId}`}
                                            style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}
                                            title="Open detail page">
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

export default Subcontract;

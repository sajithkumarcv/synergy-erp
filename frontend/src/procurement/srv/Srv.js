import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { useLookup } from '../../LookupContext';
import { fmt, fmtDate, today } from '../procurementConstants';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [10, 20, 50];

const DEFAULT_FILTERS = { searchText: '', status: '', jobId: '', dateFrom: '', dateTo: '' };

const STATUS_CFG = {
    Draft:     { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8'  },
    Confirmed: { bg: '#dcfce7', color: '#166534', dot: '#16a34a'  },
    Cancelled: { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626'  },
};

const StatusBadge = ({ status }) => {
    const c = STATUS_CFG[status] || STATUS_CFG.Draft;
    return (
        <span className="po-status-badge" style={{ background: c.bg, color: c.color }}>
            <span className="po-status-dot" style={{ background: c.dot }} />
            {status}
        </span>
    );
};

// ── New SRV Form ──────────────────────────────────────────────────────────────
const SrvForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [form, setForm] = useState({ srvDate: today(), poId: '', poLabel: '', supplierName: '', notes: '' });
    const [poSearch,   setPoSearch]   = useState('');
    const [poResults,  setPoResults]  = useState([]);
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState('');
    const [previewNo,  setPreviewNo]  = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/SRV`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(() => {});
    }, []);

    // PO live-search (approved/sent/partial POs)
    useEffect(() => {
        if (!poSearch.trim()) { setPoResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}purchaseorder/search?searchText=${encodeURIComponent(poSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setPoResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [poSearch]);

    const selectPo = (po) => {
        setForm(f => ({
            ...f,
            poId:         String(po.poId),
            poLabel:      `${po.poNumber}${po.vendorName ? ' — ' + po.vendorName : ''}`,
            supplierName: po.vendorName || '',
        }));
        setPoSearch(''); setPoResults([]);
    };

    const save = async () => {
        if (!form.poId) { setError('Select a Purchase Order.'); return; }
        setSaving(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}servicereceipt/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    srvId: 0,
                    srvDate: form.srvDate,
                    poId: Number(form.poId),
                    supplierName: form.supplierName || null,
                    notes: form.notes.trim() || null,
                    createdBy: currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Error.'); return; }
            onSaved(d.id);
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 560 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Service Receipt</div>
                        <div className="pf-header-sub">
                            {previewNo
                                ? <>Next: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: 4 }}>{previewNo}</span></>
                                : 'Number assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>SRV Date <span className="req">*</span></label>
                            <input className="pf-input" type="date" value={form.srvDate}
                                onChange={e => setForm(f => ({ ...f, srvDate: e.target.value }))} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                            <label>Purchase Order <span className="req">*</span></label>
                            {form.poId ? (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, flex: 1 }}>✓ {form.poLabel}</span>
                                    <button type="button" onClick={() => setForm(f => ({ ...f, poId: '', poLabel: '', supplierName: '' }))}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <input className="pf-input" value={poSearch}
                                        onChange={e => setPoSearch(e.target.value)}
                                        placeholder="Type PO number or vendor…" autoComplete="off" />
                                    {poResults.length > 0 && (
                                        <div style={dropStyle}>
                                            {poResults.map(po => (
                                                <div key={po.poId} style={dropItem}
                                                    onClick={() => selectPo(po)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <strong>{po.poNumber}</strong>
                                                    {po.vendorName && <span style={{ marginLeft: 8, color: '#475569' }}>{po.vendorName}</span>}
                                                    <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>{po.status}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                                Only non-stockable lines (Subcontract, Service, Labour, Hire) will be shown
                            </span>
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2} value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Work completion notes…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create SRV'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────────────────────
export const Srv = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();
    const { getModuleStatuses } = useLookup();
    const { canDo } = usePermission();
    const canAdd    = canDo('/service-receipts', 'ADD');

    const [rows,      setRows]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [totalRows, setTotal]     = useState(0);
    const [totalPages,setPages]     = useState(1);
    const [page,      setPage]      = useState(1);
    const [pageSize,  setPageSize]  = useState(20);
    const [sortCol,   setSortCol]   = useState('SrvDate');
    const [sortDir,   setSortDir]   = useState('DESC');
    const [applied,   setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,  setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'SrvDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.jobId)      q.set('jobId',       af.jobId);
        if (af.dateFrom)   q.set('dateFrom',    af.dateFrom);
        if (af.dateTo)     q.set('dateTo',      af.dateTo);
        fetch(`${variables.API_URL}servicereceipt/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = () => ({
        searchText: { label: 'Search',    type: 'text',        placeholder: 'SRV #, PO #, vendor…' },
        status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('SRV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        jobId:      { label: 'Job ID',    type: 'text',        placeholder: 'Job ID…' },
        dateFrom:   { label: 'Date From', type: 'date' },
        dateTo:     { label: 'Date To',   type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('servicereceipt', buildDefs(), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('servicereceipt');
    }, [getModuleStatuses]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = (id) => { setShowForm(false); navigate(`/service-receipts/${id}`); };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
        return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
    };
    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} /></div>
        </th>
    );

    const pageNums = () => {
        let start = Math.max(1, page - 2), end = Math.min(totalPages, start + 4);
        if (end - start < 4) start = Math.max(1, end - 4);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {showForm && <SrvForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Service Receipts</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New SRV</button>}
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
                                <Th col="SrvNo">SRV #</Th>
                                <Th col="SrvDate">Date</Th>
                                <Th col="PoNumber">PO #</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="SupplierName">Supplier / Vendor</Th>
                                <Th col="Status">Status</Th>
                                <Th col="LineCount">Lines</Th>
                                <Th col="TotalCost">Total Cost</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No service receipts found.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.srvId}>
                                    <td><RowLink className="po-num-link" to={`/service-receipts/${r.srvId}`}>{r.srvNo}</RowLink></td>
                                    <td>{fmtDate(r.srvDate)}</td>
                                    <td>
                                        {r.poNumber
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.poNumber}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>
                                        {r.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>{r.supplierName || '—'}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ textAlign: 'center', color: '#475569' }}>{r.lineCount}</td>
                                    <td className="po-num-cell">{fmt(r.totalCost)}</td>
                                    <td><RowLink className="po-act-btn po-act-open" to={`/service-receipts/${r.srvId}`}>Open</RowLink></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>)}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Srv;

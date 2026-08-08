import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useFilters } from '../../FilterContext';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import '../../procurement/Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { itemTypeId: '', categoryId: '', subCategoryId: '', itemId: '', searchText: '', status: '', reason: '', dateFrom: '', dateTo: '' };

const fmt     = n => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col ? <span className="po-sort-none">⇅</span>
                    : <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

const StatusBadge = ({ status }) => {
    const cfg = {
        Draft:           { bg: '#e0f2fe', color: '#0369a1', dot: '#38bdf8' },
        PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
        Approved:        { bg: '#dcfce7', color: '#166534', dot: '#4ade80' },
        Posted:          { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
        Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#f87171' },
    }[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
            <span className="po-status-dot" style={{ background: cfg.dot }} />
            {status}
        </span>
    );
};

export const Adjustment = () => {
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { getVList, getModuleStatuses } = useLookup();
    const { canDo }   = usePermission();
    const canAdd      = canDo('/inventory-adjustment', 'ADD');
    const { registerFilters, unregisterFilters, updateFilterDefs, setFilter } = useFilters();

    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(false);
    const [totalRows, setTotal] = useState(0);
    const [totalPages, setPages] = useState(1);
    const [page, setPage]       = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [sortCol, setSortCol] = useState('AdjustmentDate');
    const [sortDir, setSortDir] = useState('DESC');
    const [applied, setApplied] = useState({ ...DEFAULT_FILTERS });
    const [creating,   setCreating]   = useState(false);
    const [showNew,    setShowNew]    = useState(false);
    const [newForm,    setNewForm]    = useState({ adjustmentDate: '', reason: '', notes: '' });
    const [error,      setError]      = useState('');

    const gridRef = useRef({ pageSize: 200, sortCol: 'AdjustmentDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const reasons = getVList('Inventory', 'AdjustmentReason');

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.itemTypeId)    q.set('itemTypeId',    af.itemTypeId);
        if (af.categoryId)    q.set('categoryId',    af.categoryId);
        if (af.subCategoryId) q.set('subCategoryId', af.subCategoryId);
        if (af.itemId)        q.set('itemId',        af.itemId);
        if (af.searchText)    q.set('searchText',    af.searchText);
        if (af.status)        q.set('status',        af.status);
        if (af.reason)        q.set('reason',        af.reason);
        if (af.dateFrom)      q.set('dateFrom',      af.dateFrom);
        if (af.dateTo)        q.set('dateTo',        af.dateTo);
        fetch(`${variables.API_URL}stockadjustment/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const allCatsRef = useRef([]);

    const buildDefs = (types, cats, subcats, reasonOpts, onCatChange) => ({
        itemTypeId:    { label: 'Item Type',    type: 'select',            placeholder: 'All Types',          options: types },
        categoryId:    { label: 'Category',     type: 'select',            placeholder: 'All Categories',     options: cats, onChange: onCatChange },
        subCategoryId: { label: 'Sub-Category', type: 'select',            placeholder: 'All Sub-Categories', options: subcats },
        itemId:        { label: 'Item',         type: 'searchable-select', placeholder: 'Search item…' },
        searchText:    { label: 'Search',       type: 'text',              placeholder: 'Adj #, notes…' },
        status:        { label: 'Status',       type: 'multiselect',       options: getModuleStatuses('ADJ').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        reason:        { label: 'Reason',       type: 'select',            placeholder: 'All Reasons',        options: reasonOpts },
        dateFrom:      { label: 'Date From',    type: 'date' },
        dateTo:        { label: 'Date To',      type: 'date' },
    });

    const makeCatChangeHandler = (allCats, types, reasonOpts) => (catVal) => {
        const subcats = catVal
            ? allCats.filter(c => String(c.parentCategoryId) === String(catVal))
                     .map(c => ({ value: String(c.categoryId), label: c.categoryName }))
            : [];
        const topCats = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
        setFilter('adjustment', 'subCategoryId', '');
        updateFilterDefs('adjustment', buildDefs(types, topCats, subcats, reasonOpts, makeCatChangeHandler(allCats, types, reasonOpts)));
    };

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('adjustment', buildDefs([], [], [], [], () => {}), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('adjustment');
    }, []); // eslint-disable-line

    // Load types + categories; re-run when reasons arrive (vlist may lag slightly)
    useEffect(() => {
        Promise.all([
            fetch(`${variables.API_URL}item/types`,      { headers: authHeaders() }).then(r => r.json()).catch(() => []),
            fetch(`${variables.API_URL}item/categories`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
        ]).then(([types, cats]) => {
            const allCats  = Array.isArray(cats) ? cats : [];
            allCatsRef.current = allCats;
            const topCats  = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
            const typeOpts = (Array.isArray(types) ? types : []).map(t => ({ value: String(t.itemTypeId), label: t.typeName }));
            const rsnOpts  = reasons.map(r => ({ value: r.value, label: r.label }));
            updateFilterDefs('adjustment', buildDefs(typeOpts, topCats, [], rsnOpts, makeCatChangeHandler(allCats, typeOpts, rsnOpts)));
        });
    }, [reasons.length]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage = p => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const openNewModal = () => {
        setNewForm({ adjustmentDate: new Date().toISOString().slice(0, 10), reason: '', notes: '' });
        setError('');
        setShowNew(true);
    };

    const createNew = async () => {
        if (!newForm.adjustmentDate) { setError('Adjustment Date is required.'); return; }
        setCreating(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}stockadjustment/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    adjustmentId:   0,
                    adjustmentDate: newForm.adjustmentDate,
                    reason:         newForm.reason  || null,
                    notes:          newForm.notes.trim() || null,
                    createdBy:      currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Error creating adjustment.'); return; }
            navigate(`/inventory-adjustment/${d.adjustmentId}`);
        } catch { setError('Network error.'); }
        finally { setCreating(false); }
    };

    // One-click opening-stock load: creates a Draft adjustment pre-tagged with the
    // Opening Balance reason and lands straight on the Lines tab with the Excel
    // importer open.
    const createOpeningStock = async () => {
        setCreating(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}stockadjustment/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    adjustmentId:   0,
                    adjustmentDate: new Date().toISOString().slice(0, 10),
                    reason:         'OPENING_BALANCE',
                    notes:          'Opening stock load',
                    createdBy:      currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Error creating adjustment.'); return; }
            navigate(`/inventory-adjustment/${d.adjustmentId}?tab=lines&import=1`);
        } catch { setError('Network error.'); }
        finally { setCreating(false); }
    };

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)} style={right ? { textAlign: 'right' } : {}}>
            <div className="po-th-inner" style={right ? { justifyContent: 'flex-end' } : {}}>
                {children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
            </div>
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
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock Adjustments</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            {error && <span style={{ fontSize: 12, color: '#dc2626', marginRight: 8 }}>{error}</span>}
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && (
                                <button className="po-btn-pri" onClick={createOpeningStock} disabled={creating}
                                    style={{ background: '#0f766e', borderColor: '#0f766e' }}
                                    title="Create an Opening Balance adjustment and import opening stock from Excel">
                                    📦 Opening Stock
                                </button>
                            )}
                            {canAdd && (
                                <button className="po-btn-pri" onClick={openNewModal}
                                    style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>
                                    + New Adjustment
                                </button>
                            )}
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
                                <Th col="AdjustmentNo">Adj #</Th>
                                <Th col="AdjustmentDate">Date</Th>
                                <th>Reason</th>
                                <th style={{ textAlign: 'center' }}>Lines</th>
                                <Th col="TotalValue" right>Value</Th>
                                <Th col="Status">Status</Th>
                                <th>Created By</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={8} className="po-empty">No adjustments found.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.adjustmentId}>
                                    <td><RowLink className="po-num-link" to={`/inventory-adjustment/${r.adjustmentId}`}>{r.adjustmentNo}</RowLink></td>
                                    <td>{fmtDate(r.adjustmentDate)}</td>
                                    <td style={{ fontSize: 12, color: '#475569' }}>{r.reason || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                    <td style={{ textAlign: 'center' }}>{r.lineCount}</td>
                                    <td className="po-num-cell" style={{ fontWeight: 600 }}>{fmt(r.totalValue)}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{r.createdBy || '—'}</td>
                                    <td><RowLink className="po-act-btn po-act-open" to={`/inventory-adjustment/${r.adjustmentId}`}>Open</RowLink></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
            {/* ── New Adjustment Modal ── */}
            {showNew && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 20 }}>New Stock Adjustment</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>Adjustment Date *</div>
                                <input
                                    type="date"
                                    className="pf-input"
                                    value={newForm.adjustmentDate}
                                    onChange={e => setNewForm(p => ({ ...p, adjustmentDate: e.target.value }))}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>Reason</div>
                                <select
                                    className="pf-input"
                                    value={newForm.reason}
                                    onChange={e => setNewForm(p => ({ ...p, reason: e.target.value }))}
                                >
                                    <option value="">— Select Reason —</option>
                                    {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>Notes</div>
                                <textarea
                                    className="pf-input"
                                    rows={3}
                                    value={newForm.notes}
                                    onChange={e => setNewForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Optional notes…"
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        {error && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>⚠ {error}</div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                            <button className="pf-btn-sec" onClick={() => { setShowNew(false); setError(''); }} disabled={creating}>
                                Cancel
                            </button>
                            <button className="po-btn-pri" style={{ background: '#7c3aed', borderColor: '#7c3aed' }} onClick={createNew} disabled={creating}>
                                {creating ? 'Creating…' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Adjustment;

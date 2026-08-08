import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { useLookup } from '../../LookupContext';
import { fmt, fmtDate } from '../procurementConstants';
import '../Procurement.css';
import RowLink from '../../common/RowLink';
import NewRtvModal from './NewRtvModal';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', status: '', supplierId: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── Status badge (matches GRN/PO pattern) ─────────────────────────────────────
const StatusBadge = ({ status }) => {
    const cfg = {
        Draft:     { bg: '#e0f2fe', color: '#0369a1', dot: '#38bdf8' },
        Posted:    { bg: '#dcfce7', color: '#166534', dot: '#4ade80' },
        Cancelled: { bg: '#fee2e2', color: '#991b1b', dot: '#f87171' },
    }[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
            <span className="po-status-dot" style={{ background: cfg.dot }} />
            {status}
        </span>
    );
};

// ── Main List Page ─────────────────────────────────────────────────────────────
export const Rtv = () => {
    const navigate     = useNavigate();
    const { canDo }    = usePermission();
    const canAdd       = canDo('/rtv', 'ADD');
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getModuleStatuses } = useLookup();

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(200);
    const [sortCol,    setSortCol]   = useState('RtvDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showNew,    setShowNew]   = useState(false);
    const [error,      setError]     = useState('');

    const gridRef = useRef({ pageSize: 200, sortCol: 'RtvDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [supplierOptions, setSupplierOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierOptions(
                (d.data || []).map(s => ({
                    value: String(s.supplierId),
                    label: s.supplierCode ? `${s.supplierCode} — ${s.supplierName}` : s.supplierName
                }))
            ))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.supplierId) q.set('supplierId', af.supplierId);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}rtv/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (supplierOpts) => ({
        searchText: { label: 'Search',    type: 'text',        placeholder: 'RTV #, supplier, GRN…' },
        status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('RTV').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        supplierId: { label: 'Supplier',  type: 'select',      placeholder: 'All Suppliers', options: supplierOpts },
        dateFrom:   { label: 'Date From', type: 'date' },
        dateTo:     { label: 'Date To',   type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('rtv', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('rtv');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('rtv', buildDefs(supplierOptions));
    }, [supplierOptions, getModuleStatuses]); // eslint-disable-line

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

    const changePageSize = ps => {
        setPageSize(ps); setPage(1);
        load(1, ps, sortCol, sortDir, applied);
    };

    const createNew = () => { setError(''); setShowNew(true); };

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
            {showNew && (
                <NewRtvModal
                    onClose={() => setShowNew(false)}
                    onSaved={id => { setShowNew(false); navigate(`/rtv/${id}`); }}
                />
            )}
            <div className="po-grid-wrap">
                {/* ── Header ── */}
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Return to Vendor (RTV)</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            {error && <span style={{ fontSize: 12, color: '#dc2626', marginRight: 8 }}>{error}</span>}
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={createNew}
                                style={{ background: '#0f766e', borderColor: '#0f766e' }}>
                                + New RTV
                            </button>}
                        </div>
                    </div>
                </div>

                {/* ── Table ── */}
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
                                <Th col="RtvNumber">RTV #</Th>
                                <Th col="RtvDate">Date</Th>
                                <Th col="SupplierName">Supplier</Th>
                                <Th col="GrnNumber">Source GRN</Th>
                                <Th col="PoNumber">PO #</Th>
                                <Th col="TotalAmount" right>Total Amount</Th>
                                <Th col="Status">Status</Th>
                                <Th col="CreatedBy">Created By</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={9} className="po-empty">
                                        No RTVs found. Adjust the filters or create a new RTV.
                                    </td>
                                </tr>
                            ) : rows.map(r => (
                                <tr key={r.rtvId}>
                                    <td>
                                        <RowLink className="po-num-link" to={`/rtv/${r.rtvId}`}>
                                            {r.rtvNumber}
                                        </RowLink>
                                    </td>
                                    <td>{fmtDate(r.rtvDate)}</td>
                                    <td>{r.supplierName || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                    <td>
                                        {r.grnNumber
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.grnNumber}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td>
                                        {r.poNumber
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{r.poNumber}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td className="po-num-cell" style={{ fontWeight: 600 }}>{fmt(r.totalAmount)}</td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{r.createdBy || '—'}</td>
                                    <td>
                                        <RowLink className="po-act-btn po-act-open" to={`/rtv/${r.rtvId}`}>Open</RowLink>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total
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

export default Rtv;

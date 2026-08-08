import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../../Variable';
import { useFilters } from '../../FilterContext';
import { fmt, fmtDate } from '../inventoryConstants';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const DEFAULT_FILTERS = {
    itemTypeId: '', categoryId: '', subCategoryId: '', itemId: '',
    stockType: '', dateFrom: '', dateTo: '', zeroStock: '', budgetCategoryId: '',
};

// ── Job Stock Breakdown popover ────────────────────────────────
// Rendered via a portal into document.body with fixed positioning computed
// from the trigger element's own bounding box — a table cell inside a
// horizontally-scrolling wrapper (.po-table-wrap { overflow-x: auto }) both
// clips and out-stacks a normal position:absolute popover, which is exactly
// why this was rendering underneath the sticky table header. Same pattern
// already used for the item-search dropdown elsewhere in the app.
const JobBreakdownPopover = ({ itemId, anchorEl, onClose }) => {
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [rect, setRect]       = useState(() => anchorEl?.getBoundingClientRect() ?? null);
    const ref = useRef(null);

    useEffect(() => {
        fetch(`${variables.API_URL}stockbalance/item/${itemId}/job-breakdown`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [itemId]);

    useEffect(() => {
        const update = () => anchorEl && setRect(anchorEl.getBoundingClientRect());
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [anchorEl]);

    useEffect(() => {
        const h = e => {
            if (ref.current && !ref.current.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose, anchorEl]);

    if (!rect) return null;

    return ReactDOM.createPortal(
        <div className="bal-popover" ref={ref} style={{
            position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 9999,
        }}>
            <div className="bal-popover-title">📦 Job Stock Breakdown</div>
            {loading ? <div style={{ fontSize: 12, color: '#64748b' }}>Loading…</div> :
             rows.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>No job stock found.</div> :
             rows.map(r => (
                <div key={r.jobId} className="bal-popover-row">
                    <span style={{ fontWeight: 700, color: '#1e40af' }}>{r.jobId}</span>
                    <span style={{ color: '#374151' }}>{fmt(r.qtyBalance, 4)} units</span>
                </div>
             ))}
        </div>,
        document.body
    );
};

// ── Ledger Drawer ──────────────────────────────────────────────
const LedgerDrawer = ({ item, onClose }) => {
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [page,    setPage]    = useState(1);
    const [total,   setTotal]   = useState(0);
    const pageSize = 50;

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}stockbalance/item/${item.itemId}/ledger?page=${page}&pageSize=${pageSize}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setRows(d.data || []); setTotal(d.totalRows || 0); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [item.itemId, page]);

    useEffect(() => { load(); }, [load]);

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="bal-ledger-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="bal-ledger-panel">
                <div className="bal-ledger-header">
                    <div>
                        <div className="bal-ledger-title">📒 Stock Ledger — {item.itemCode}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{item.itemName}</div>
                    </div>
                    <button className="bal-ledger-close" onClick={onClose} title="Click here to close this window">×</button>
                </div>
                <div className="bal-ledger-body">
                    {loading ? (
                        <div className="inv-loading"><div className="inv-spinner" />Loading ledger…</div>
                    ) : rows.length === 0 ? (
                        <div className="inv-empty">
                            <div className="inv-empty-icon">📒</div>
                            <div className="inv-empty-title">No transactions found</div>
                        </div>
                    ) : (
                        <>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                        {[
                                            { h: 'Date',        right: false },
                                            { h: 'Type',        right: false },
                                            { h: 'Ref No.',     right: false },
                                            { h: 'In',          right: true  },
                                            { h: 'Out',         right: true  },
                                            { h: 'Cost',        right: true  },
                                            { h: 'Job',         right: false },
                                            { h: 'Job Stock',   right: true  },
                                            { h: 'Store Stock', right: true  },
                                            { h: 'Total Stock', right: true  },
                                        ].map(({ h, right }) => (
                                            <th key={h} style={{ padding: '7px 10px', textAlign: right ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.ledgerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDate(r.transDate)}</td>
                                            <td style={{ padding: '7px 10px' }}>
                                                <span style={{
                                                    padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                    background: ['GRN','RECEIPT','RETURN'].includes(r.transType) ? '#dcfce7' : '#fee2e2',
                                                    color:      ['GRN','RECEIPT','RETURN'].includes(r.transType) ? '#166534' : '#991b1b',
                                                }}>{r.transType}</span>
                                            </td>
                                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 600 }}>{r.refNo}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#166534', fontWeight: 600 }}>{r.qtyIn  > 0 ? `+${fmt(r.qtyIn,  4)}` : '—'}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{r.qtyOut > 0 ? `-${fmt(r.qtyOut, 4)}` : '—'}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(r.unitCost)}</td>
                                            <td style={{ padding: '7px 10px', color: '#64748b', fontSize: 11 }}>{r.jobId || '—'}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#1e40af', fontWeight: 600 }}>{fmt(r.jobStock,   4)}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>{fmt(r.storeStock, 4)}</td>
                                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#1e293b', fontWeight: 700, borderLeft: '2px solid #e2e8f0' }}>{fmt(r.totalStock, 4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {totalPages > 1 && (
                                <div className="inv-pagination" style={{ marginTop: 10 }}>
                                    <span className="inv-page-info">{total} transactions</span>
                                    <div className="inv-page-btns">
                                        <button className="inv-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                                        <span style={{ padding: '4px 8px', fontSize: 12 }}>{page}/{totalPages}</span>
                                        <button className="inv-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Stock Balance Row ──────────────────────────────────────────
const BalanceRow = ({ row, idx }) => {
    const [showJobPop, setShowJobPop] = useState(false);
    const [showLedger, setShowLedger] = useState(false);
    const jobStockRef = useRef(null);

    return (
        <>
            <tr style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td onClick={() => setShowLedger(true)} title="Click to view ledger"
                    style={{ cursor: 'pointer', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{row.itemCode}</div>
                    <div title={row.itemName}
                        style={{ fontSize: 11, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.itemName}
                    </div>
                </td>
                <td className="po-num-cell">
                    <span className="bal-qty-total">{fmt(row.qtyOnHand, 4)}</span>
                </td>
                <td className="po-num-cell">
                    {row.qtyJobStock > 0 ? (
                        <div className="bal-popover-wrap">
                            <span ref={jobStockRef} className="bal-qty-job" onClick={() => setShowJobPop(v => !v)}>
                                {fmt(row.qtyJobStock, 4)} ↓
                            </span>
                            {showJobPop && (
                                <JobBreakdownPopover itemId={row.itemId} anchorEl={jobStockRef.current} onClose={() => setShowJobPop(false)} />
                            )}
                        </div>
                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td className="po-num-cell">
                    <span className="bal-qty-store">{fmt(row.qtyStoreStock, 4)}</span>
                </td>
                <td className="po-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(row.stockValue)}</td>
                <td>{row.categoryName || '—'}</td>
                <td>{row.itemTypeName || '—'}</td>
                <td>{row.baseUom || '—'}</td>
                <td className="po-num-cell">{fmt(row.avgUnitCost)}</td>
                <td style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {row.lastReceiptDate ? fmtDate(row.lastReceiptDate) : '—'}
                </td>
            </tr>
            {showLedger && <LedgerDrawer item={row} onClose={() => setShowLedger(false)} />}
        </>
    );
};

const PAGE_SIZE = 50;

// ── Main Page ──────────────────────────────────────────────────
const StockBalance = () => {
    const { registerFilters, unregisterFilters, updateFilterDefs, setFilter } = useFilters();

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotalRows] = useState(0);
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [sortKey,    setSortKey]   = useState('itemCode');
    const [sortDir,    setSortDir]   = useState('asc');
    const [page,       setPage]      = useState(1);

    const gridRef = useRef({ applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { applied }; }, [applied]);

    const load = useCallback((af) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (af.itemTypeId)    params.set('itemTypeId',    af.itemTypeId);
        if (af.categoryId)    params.set('categoryId',    af.categoryId);
        if (af.subCategoryId) params.set('subCategoryId', af.subCategoryId);
        if (af.itemId)        params.set('itemId',        af.itemId);
        if (af.stockType)     params.set('stockType',     af.stockType);
        if (af.dateFrom)      params.set('dateFrom',      af.dateFrom);
        if (af.dateTo)        params.set('dateTo',        af.dateTo);
        if (af.zeroStock)          params.set('zeroStock',          '1');
        if (af.budgetCategoryId)   params.set('budgetCategoryId',   af.budgetCategoryId);
        fetch(`${variables.API_URL}stockbalance?${params}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { const list = Array.isArray(d) ? d : []; setRows(list); setTotalRows(list.length); setPage(1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(DEFAULT_FILTERS); }, [load]);

    // allCategories holds the full flat list for subcategory derivation
    const allCatsRef = useRef([]);

    const buildDefs = (types, cats, subcats, onCatChange, budgetCats) => ({
        itemTypeId:       { label: 'Item Type',      type: 'select',            placeholder: 'All Types',          options: types },
        categoryId:       { label: 'Category',       type: 'select',            placeholder: 'All Categories',     options: cats, onChange: onCatChange },
        subCategoryId:    { label: 'Sub-Category',   type: 'select',            placeholder: 'All Sub-Categories', options: subcats },
        itemId:           { label: 'Item',           type: 'searchable-select', placeholder: 'Search item…' },
        budgetCategoryId: { label: 'Budget Header',  type: 'select',            placeholder: 'All Budget Headers', options: budgetCats },
        stockType:        { label: 'Stock Type',     type: 'select',            placeholder: 'All',
            options: [{ value: 'JOB', label: 'Job Stock Only' }, { value: 'STORE', label: 'Store Stock Only' }] },
        dateFrom:         { label: 'Receipt From',   type: 'date' },
        dateTo:           { label: 'Receipt To',     type: 'date' },
        zeroStock:        { label: 'Zero Stock',     type: 'select',            placeholder: 'In Stock Only',
            options: [{ value: '1', label: 'Include Zero Stock' }] },
    });

    const makeCatChangeHandler = (allCats, types, budgetCats) => (catVal) => {
        const subcats = catVal
            ? allCats.filter(c => String(c.parentCategoryId) === String(catVal))
                     .map(c => ({ value: String(c.categoryId), label: c.categoryName }))
            : [];
        const topCats = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
        setFilter('stock-balance', 'subCategoryId', '');
        updateFilterDefs('stock-balance', buildDefs(types, topCats, subcats, makeCatChangeHandler(allCats, types, budgetCats), budgetCats));
    };

    useEffect(() => {
        const onApply = (vals) => { setApplied({ ...vals }); load(vals); };
        registerFilters('stock-balance', buildDefs([], [], [], () => {}, []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('stock-balance');
    }, []); // eslint-disable-line

    useEffect(() => {
        Promise.all([
            fetch(`${variables.API_URL}item/types`,         { headers: authHeaders() }).then(r => r.json()).catch(() => []),
            fetch(`${variables.API_URL}item/categories`,    { headers: authHeaders() }).then(r => r.json()).catch(() => []),
            fetch(`${variables.API_URL}lookup/budgetcategories`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
        ]).then(([types, cats, budgets]) => {
            const allCats    = Array.isArray(cats) ? cats : [];
            allCatsRef.current = allCats;
            const topCats    = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
            const typeOpts   = (Array.isArray(types) ? types : []).map(t => ({ value: String(t.itemTypeId), label: t.typeName }));
            const budgetOpts = (Array.isArray(budgets) ? budgets : []).map(b => ({ value: String(b.id), label: b.name }));
            updateFilterDefs('stock-balance', buildDefs(typeOpts, topCats, [], makeCatChangeHandler(allCats, typeOpts, budgetOpts), budgetOpts));
        });
    }, []); // eslint-disable-line

    const totalValue  = rows.reduce((s, r) => s + (r.stockValue    || 0), 0);
    const totalJob    = rows.reduce((s, r) => s + (r.qtyJobStock   || 0), 0);
    const totalStore  = rows.reduce((s, r) => s + (r.qtyStoreStock || 0), 0);

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
        setPage(1);
    };
    const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const sortedRows = React.useMemo(() => {
        if (!sortKey) return rows;
        return [...rows].sort((a, b) => {
            let va = a[sortKey], vb = b[sortKey];
            if (va == null) va = sortKey === 'itemCode' ? '' : 0;
            if (vb == null) vb = sortKey === 'itemCode' ? '' : 0;
            if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [rows, sortKey, sortDir]);

    const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
    const pagedRows  = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const SortTH = ({ children, col, right = false }) => (
        <th className={right ? 'right' : ''}
            onClick={() => cycleSort(col)}
            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                color: sortKey === col ? '#1e40af' : undefined,
                background: sortKey === col ? '#e8f0fe' : undefined }}>
            {children}{sortIcon(col)}
        </th>
    );

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                {/* Header */}
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock Balance</div>
                            <div className="po-page-sub">{totalRows} item{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                    </div>

                    {/* Summary stat cards */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Items Shown',       value: totalRows,          decimals: 0, accent: '#1e293b', bg: '#f1f5f9', border: '#e2e8f0', sub: 'matching filters' },
                            { label: 'Total Stock Value',  value: totalValue,         decimals: 2, accent: '#166534', bg: '#f0fdf4', border: '#bbf7d0', sub: 'at avg unit cost', prefix: '' },
                            { label: 'Job Stock',          value: totalJob,           decimals: 4, accent: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', sub: 'reserved for jobs' },
                            { label: 'Store Stock',        value: totalStore,         decimals: 4, accent: '#0369a1', bg: '#f0f9ff', border: '#bae6fd', sub: 'unreserved / general' },
                        ].map(({ label, value, decimals, accent, bg, border, sub, prefix }) => (
                            <div key={label} style={{
                                background: bg, border: `1.5px solid ${border}`,
                                borderRadius: 10, padding: '14px 20px', minWidth: 160,
                                display: 'flex', flexDirection: 'column', gap: 3,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1, letterSpacing: '-0.5px' }}>
                                    {prefix !== undefined ? prefix : ''}{fmt(value, decimals)}
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <SortTH col="itemCode">Item</SortTH>
                                <SortTH col="qtyOnHand"    right>On Hand</SortTH>
                                <SortTH col="qtyJobStock"  right>Job Stock ↓</SortTH>
                                <SortTH col="qtyStoreStock" right>Store Stock</SortTH>
                                <SortTH col="stockValue"   right>Stock Value</SortTH>
                                <SortTH col="categoryName">Category</SortTH>
                                <SortTH col="itemTypeName">Type</SortTH>
                                <SortTH col="baseUom">UOM</SortTH>
                                <SortTH col="avgUnitCost"  right>Avg Cost</SortTH>
                                <SortTH col="lastReceiptDate">Last Receipt</SortTH>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={10} className="po-empty">No items match the current filters.</td></tr>
                            ) : pagedRows.map((r, i) => (
                                <BalanceRow key={r.itemId} row={r} idx={i} />
                            ))}
                        </tbody>
                    </table>
                    {totalPages > 1 && (
                        <div className="inv-pagination" style={{ padding: '10px 16px' }}>
                            <span className="inv-page-info">{sortedRows.length} items · page {page} of {totalPages}</span>
                            <div className="inv-page-btns">
                                <button className="inv-page-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                                <button className="inv-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                                <span style={{ padding: '4px 10px', fontSize: 12 }}>{page} / {totalPages}</span>
                                <button className="inv-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                                <button className="inv-page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StockBalance;

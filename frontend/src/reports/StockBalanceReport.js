import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmt, fmtDate } from '../inventory/inventoryConstants';
import './Reports.css';

const today    = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    itemTypeId:    '',
    categoryId:    '',
    subCategoryId: '',
    itemId:        '',
    zeroStock:     '1',
};

const exportCsv = (rows) => {
    const headers = ['#', 'Item Code', 'Item Name', 'Category', 'Sub Category', 'Type', 'UOM', 'On Hand', 'Job Stock', 'Store Stock', 'Avg Cost', 'Stock Value', 'Last Receipt'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.itemCode, r.itemName, r.categoryName, r.itemTypeName, r.baseUom,
            r.qtyOnHand, r.qtyJobStock, r.qtyStoreStock, r.avgUnitCost, r.stockValue,
            r.lastReceiptDate ? fmtDate(r.lastReceiptDate) : '',
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `StockBalance_Report_${today()}.csv`;
    a.click();
};

const SortIcon = ({ col, sc, sd }) => (
    <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>
        {sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}
    </span>
);

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">
                Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)}</strong> of <strong>{totalRows}</strong>
            </div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)} disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) => p === '…'
                    ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
                    : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>
                )}
                <button className="rpt-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">
                Rows: <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>
    );
};

const StockBalanceReport = () => {
    const navigate = useNavigate();

    const [filters, setFilters]   = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    const [sortCol, setSortCol]   = useState('itemCode');
    const [sortDir, setSortDir]   = useState('asc');
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(200);

    const [allCategories, setAllCategories] = useState([]);
    const [itemTypes, setItemTypes]         = useState([]);
    const [items, setItems]                 = useState([]);
    const [itemsLoading, setItemsLoading]   = useState(false);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}item/categories`, { headers: h })
            .then(r => r.json()).then(d => setAllCategories(Array.isArray(d) ? d : [])).catch(() => {});
        fetch(`${variables.API_URL}item/types`, { headers: h })
            .then(r => r.json()).then(d => setItemTypes(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    // Parent = no parentCategoryId; Sub = has a parentCategoryId
    const parentCategories = useMemo(
        () => allCategories
            .filter(c => !c.parentCategoryId)
            .sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || '')),
        [allCategories]
    );

    const subCategories = useMemo(() => {
        if (!filters.categoryId) return [];
        return allCategories
            .filter(c => c.parentCategoryId && String(c.parentCategoryId) === String(filters.categoryId))
            .sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || ''));
    }, [allCategories, filters.categoryId]);

    // Load items scoped to the selected type / category / sub-category (max 500).
    useEffect(() => {
        const catId = filters.subCategoryId || filters.categoryId;
        if (!catId && !filters.itemTypeId) { setItems([]); return; }
        setItemsLoading(true);
        const p = new URLSearchParams();
        if (catId)              p.set('categoryId', catId);
        if (filters.itemTypeId) p.set('itemTypeId', filters.itemTypeId);
        p.set('isActive', 'true'); p.set('pageSize', '500'); p.set('sortCol', 'ItemCode'); p.set('sortDir', 'ASC');
        fetch(`${variables.API_URL}item/search?${p}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setItems(d.data || []))
            .catch(() => setItems([]))
            .finally(() => setItemsLoading(false));
    }, [filters.itemTypeId, filters.categoryId, filters.subCategoryId]);

    const handleTypeChange     = (val) => setFilters(f => ({ ...f, itemTypeId: val, itemId: '' }));
    const handleCategoryChange = (val) => setFilters(f => ({ ...f, categoryId: val, subCategoryId: '', itemId: '' }));
    const handleSubCatChange   = (val) => setFilters(f => ({ ...f, subCategoryId: val, itemId: '' }));

    const itemScopeActive = !!(filters.subCategoryId || filters.categoryId || filters.itemTypeId);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.itemTypeId)    p.set('itemTypeId', filters.itemTypeId);
        // subCategoryId takes priority; fall back to parent categoryId
        const catId = filters.subCategoryId || filters.categoryId;
        if (catId)                 p.set('categoryId', catId);
        if (filters.itemId)        p.set('itemId',     filters.itemId);
        p.set('zeroStock', filters.zeroStock === '1' ? 'true' : 'false');
        try {
            const res  = await fetch(`${variables.API_URL}reports/stock-balance?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => {
        setPage(1);
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => {
        if (!rows) return [];
        return [...rows].sort((a, b) => {
            let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
            if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
            return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [rows, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return {
            count:      rows.length,
            stockValue: rows.reduce((s, r) => s + (r.stockValue    || 0), 0),
            jobStock:   rows.reduce((s, r) => s + (r.qtyJobStock   || 0), 0),
            storeStock: rows.reduce((s, r) => s + (r.qtyStoreStock || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#e0f2fe,#bae6fd)' }}>📦</div>
                <div>
                    <div className="rpt-header-title">Stock Balance Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} item${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>
                    )}
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">

                    {/* 1. Item Type */}
                    <div className="rpt-filter-group w180">
                        <span className="rpt-filter-label">Item Type</span>
                        <select className="rpt-filter-select" value={filters.itemTypeId} onChange={e => handleTypeChange(e.target.value)}>
                            <option value="">All Types</option>
                            {itemTypes.map(t => <option key={t.itemTypeId} value={t.itemTypeId}>{t.typeName}</option>)}
                        </select>
                    </div>

                    {/* 2. Category */}
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Category</span>
                        <select className="rpt-filter-select" value={filters.categoryId} onChange={e => handleCategoryChange(e.target.value)}>
                            <option value="">All Categories</option>
                            {parentCategories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                        </select>
                    </div>

                    {/* 3. Sub Category — only shown when a parent is selected */}
                    <div className="rpt-filter-group w220">
                        <span className="rpt-filter-label">Sub Category</span>
                        <select
                            className="rpt-filter-select"
                            value={filters.subCategoryId}
                            onChange={e => handleSubCatChange(e.target.value)}
                            disabled={subCategories.length === 0}
                        >
                            <option value="">{filters.categoryId ? 'All Sub Categories' : '— select category first —'}</option>
                            {subCategories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                        </select>
                    </div>

                    {/* 4. Item master (dropdown, scoped to type/category) */}
                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Item</span>
                        <select className="rpt-filter-select" value={filters.itemId}
                            onChange={e => setF('itemId', e.target.value)}
                            disabled={!itemScopeActive || itemsLoading}>
                            <option value="">
                                {!itemScopeActive ? '— select type or category first —'
                                    : itemsLoading ? 'Loading items…'
                                    : `All Items (${items.length})`}
                            </option>
                            {items.map(it => (
                                <option key={it.itemId} value={it.itemId}>{it.itemCode} — {it.itemName}</option>
                            ))}
                        </select>
                    </div>

                    {/* 5. Zero Stock toggle */}
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Zero Stock</span>
                        <select className="rpt-filter-select" value={filters.zeroStock} onChange={e => setF('zeroStock', e.target.value)}>
                            <option value="0">Exclude Zero</option>
                            <option value="1">Include Zero</option>
                        </select>
                    </div>

                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runReport} disabled={loading}>
                                {loading ? '⏳ Running…' : '▶ Run Report'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Items</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Stock Value</div>
                        <div className="rpt-summary-val green">{fmt(totals.stockValue)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Job Stock</div>
                        <div className="rpt-summary-val blue">{fmt(totals.jobStock, 4)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Store Stock</div>
                        <div className="rpt-summary-val blue">{fmt(totals.storeStock, 4)}</div>
                    </div>
                </div>
            )}

            <div className="rpt-content">
                {loading && (
                    <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>
                )}
                {!loading && rows === null && !error && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">📊</div>
                        <span>Set your filters above and click <strong>Run Report</strong></span>
                    </div>
                )}
                {!loading && rows !== null && rows.length === 0 && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">🔍</div>
                        <span>No items match the selected filters.</span>
                    </div>
                )}
                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="itemCode"        label="Item Code"    />
                                        <Th col="itemName"        label="Item Name"    />
                                        <Th col="categoryName"    label="Category"     />
                                        <Th col="itemTypeName"    label="Type"         />
                                        <Th col="baseUom"         label="UOM"          />
                                        <Th col="qtyOnHand"       label="On Hand"      cls="r" />
                                        <Th col="qtyJobStock"     label="Job Stock"    cls="r" />
                                        <Th col="qtyStoreStock"   label="Store Stock"  cls="r" />
                                        <Th col="avgUnitCost"     label="Avg Cost"     cls="r" />
                                        <Th col="stockValue"      label="Stock Value"  cls="r" />
                                        <Th col="lastReceiptDate" label="Last Receipt"          />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.itemId} onClick={() => navigate(`/items/${r.itemId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td>
                                                <span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#1e40af', fontSize: 11.5 }}>
                                                    {r.itemCode}
                                                </span>
                                            </td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.itemName}</td>
                                            <td style={{ fontSize: 12, color: '#475569' }}>{r.categoryName || <span className="muted">—</span>}</td>
                                            <td style={{ fontSize: 12, color: '#475569' }}>{r.itemTypeName || <span className="muted">—</span>}</td>
                                            <td style={{ fontSize: 12, color: '#475569' }}>{r.baseUom      || <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: r.qtyOnHand === 0 ? '#dc2626' : '#1e293b' }}>
                                                {fmt(r.qtyOnHand, 4)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#1e40af' }}>{fmt(r.qtyJobStock,   4)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#0369a1' }}>{fmt(r.qtyStoreStock, 4)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#475569' }}>{fmt(r.avgUnitCost)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{fmt(r.stockValue)}</td>
                                            <td style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                {r.lastReceiptDate ? fmtDate(r.lastReceiptDate) : <span className="muted">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={6} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} items
                                            </td>
                                            <td colSpan={4} />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#166534', fontWeight: 700 }}>
                                                {fmt(totals.stockValue)}
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <Pagination
                            page={page} totalPages={totalPages} pageSize={pageSize} totalRows={sorted.length}
                            onPage={p => setPage(p)} onPageSize={s => { setPageSize(s); setPage(1); }}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default StockBalanceReport;

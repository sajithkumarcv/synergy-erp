import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    jobId: '', dateFrom: firstOfMonth(), dateTo: today(),
    itemTypeId: '', categoryId: '', subCategoryId: '',
    itemId: '', status: '',
};

const exportCsv = (rows) => {
    const headers = ['#', 'Receipt No', 'Date', 'Type', 'Job', 'Supplier', 'PO No', 'Item Code', 'Description', 'Qty', 'UOM', 'Unit Cost', 'Line Total'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.receiptNo, r.receiptDate ? fmtDate(r.receiptDate) : '', r.receiptType, r.jobId,
            r.supplierName, r.poNumber, r.itemCode, r.itemDesc, r.qty, r.uomName, r.unitCost, r.lineTotal,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PurchaseDetails_Report_${today()}.csv`;
    a.click();
};

const SortIcon = ({ col, sc, sd }) => (
    <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>{sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}</span>
);

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalRows)}</strong> of <strong>{totalRows}</strong></div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)} disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) => p === '…'
                    ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
                    : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>)}
                <button className="rpt-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">Rows: <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>{PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
    );
};

const TYPE_STYLE = {
    STORE: { bg: '#dbeafe', color: '#1e40af' },
    JOB:   { bg: '#dcfce7', color: '#166534' },
};

const PurchaseDetailsReport = () => {
    const navigate = useNavigate();

    const [filters, setFilters]   = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    const [sortCol, setSortCol]   = useState('receiptDate');
    const [sortDir, setSortDir]   = useState('desc');
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [jobs, setJobs]                   = useState([]);
    const [allCategories, setAllCategories] = useState([]);
    const [itemTypes, setItemTypes]         = useState([]);
    const [items, setItems]                 = useState([]);
    const [itemsLoading, setItemsLoading]   = useState(false);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] }).then(d => setJobs(d.data || [])).catch(() => {});
        fetch(`${variables.API_URL}item/categories`, { headers: h })
            .then(r => r.json()).then(d => setAllCategories(Array.isArray(d) ? d : [])).catch(() => {});
        fetch(`${variables.API_URL}item/types`, { headers: h })
            .then(r => r.json()).then(d => setItemTypes(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

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
    // Disabled until at least a type or category is chosen (item master is large).
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
        if (filters.jobId)       p.set('jobId',       filters.jobId);
        if (filters.dateFrom)    p.set('dateFrom',    filters.dateFrom);
        if (filters.dateTo)      p.set('dateTo',      filters.dateTo);
        if (filters.itemTypeId)  p.set('itemTypeId',  filters.itemTypeId);
        const catId = filters.subCategoryId || filters.categoryId;
        if (catId)               p.set('categoryId',  catId);
        if (filters.itemId)      p.set('itemId',      filters.itemId);
        if (filters.status)      p.set('status',      filters.status);
        try {
            const res  = await fetch(`${variables.API_URL}reports/purchase-details?${p}`, { headers: authHeaders() });
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
            lines:    rows.length,
            qty:      rows.reduce((s, r) => s + (r.qty       || 0), 0),
            value:    rows.reduce((s, r) => s + (r.lineTotal || 0), 0),
            items:    new Set(rows.map(r => r.itemId).filter(Boolean)).size,
            receipts: new Set(rows.map(r => r.receiptId).filter(Boolean)).size,
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)' }}>📥</div>
                <div>
                    <div className="rpt-header-title">Purchase Details Report</div>
                    <div className="rpt-header-sub">
                        {rows == null ? 'Set filters and click Run Report' : `${rows.length} line${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>}
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    {/* 1. Job No */}
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Job No</span>
                        <select className="rpt-filter-select" value={filters.jobId} onChange={e => setF('jobId', e.target.value)}>
                            <option value="">All Jobs</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                    </div>

                    {/* 2. Dates */}
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date From</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} />
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date To</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} />
                    </div>

                    {/* 3. Item Type */}
                    <div className="rpt-filter-group w180">
                        <span className="rpt-filter-label">Item Type</span>
                        <select className="rpt-filter-select" value={filters.itemTypeId} onChange={e => handleTypeChange(e.target.value)}>
                            <option value="">All Types</option>
                            {itemTypes.map(t => <option key={t.itemTypeId} value={t.itemTypeId}>{t.typeName}</option>)}
                        </select>
                    </div>

                    {/* 4. Category */}
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Category</span>
                        <select className="rpt-filter-select" value={filters.categoryId} onChange={e => handleCategoryChange(e.target.value)}>
                            <option value="">All Categories</option>
                            {parentCategories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                        </select>
                    </div>

                    {/* 5. Sub Category */}
                    <div className="rpt-filter-group w220">
                        <span className="rpt-filter-label">Sub Category</span>
                        <select className="rpt-filter-select" value={filters.subCategoryId}
                            onChange={e => handleSubCatChange(e.target.value)}
                            disabled={subCategories.length === 0}>
                            <option value="">{filters.categoryId ? 'All Sub Categories' : '— select category first —'}</option>
                            {subCategories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                        </select>
                    </div>

                    {/* 6. Item master (dropdown, scoped to type/category) */}
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

                    {/* Status */}
                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select" value={filters.status} onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {['Draft', 'Confirmed', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runReport} disabled={loading}>{loading ? '⏳ Running…' : '▶ Run Report'}</button>
                        </div>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Lines</div><div className="rpt-summary-val">{totals.lines}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Distinct Items</div><div className="rpt-summary-val">{totals.items}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Receipts</div><div className="rpt-summary-val">{totals.receipts}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Qty</div><div className="rpt-summary-val blue">{fmt(totals.qty, 4)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Value</div><div className="rpt-summary-val green">{fmt(totals.value)}</div></div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows === null && !error && (
                    <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>
                )}
                {!loading && rows !== null && rows.length === 0 && (
                    <div className="rpt-state"><div className="rpt-state-icon">🔍</div><span>No purchase lines match the selected filters.</span></div>
                )}
                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="receiptNo"    label="Receipt No"  />
                                        <Th col="receiptDate"  label="Date"        />
                                        <Th col="receiptType"  label="Type"        />
                                        <Th col="jobId"        label="Job"         />
                                        <Th col="supplierName" label="Supplier"    />
                                        <Th col="itemCode"     label="Item Code"   />
                                        <Th col="itemDesc"     label="Description" />
                                        <Th col="qty"          label="Qty"      cls="r" />
                                        <Th col="uomName"      label="UOM"         />
                                        <Th col="unitCost"     label="Unit Cost" cls="r" />
                                        <Th col="lineTotal"    label="Line Total" cls="r" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.receiptLineId} onClick={() => navigate(`/inventory-grn/${r.receiptId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td>
                                                <span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#166534', fontSize: 11.5, background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>{r.receiptNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.receiptDate)}</td>
                                            <td>
                                                {(() => {
                                                    const ts = TYPE_STYLE[r.receiptType] || { bg: '#f1f5f9', color: '#475569' };
                                                    return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, background: ts.bg, color: ts.color }}>{r.receiptType || '—'}</span>;
                                                })()}
                                            </td>
                                            <td>
                                                {r.jobId
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                    : <span className="muted">—</span>}
                                            </td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.supplierName || <span className="muted">—</span>}</td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11.5, color: '#2563eb' }}>{r.itemCode || <span className="muted">—</span>}</td>
                                            <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>{r.itemDesc}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e293b' }}>{fmt(r.qty, 4)}</td>
                                            <td style={{ fontSize: 12, color: '#64748b' }}>{r.uomName || <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#475569' }}>{fmt(r.unitCost)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#166534' }}>{fmt(r.lineTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>Totals — {totals.lines} line{totals.lines !== 1 ? 's' : ''}</td>
                                            <td className="r" style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.qty, 4)}</td>
                                            <td colSpan={2} />
                                            <td className="r" style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#166534', fontWeight: 700 }}>{fmt(totals.value)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={sorted.length}
                            onPage={p => setPage(p)} onPageSize={s => { setPageSize(s); setPage(1); }} />
                    </>
                )}
            </div>
        </div>
    );
};

export default PurchaseDetailsReport;

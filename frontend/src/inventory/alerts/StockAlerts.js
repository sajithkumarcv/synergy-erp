import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useFilters } from '../../FilterContext';
import { fmt, fmtDate } from '../inventoryConstants';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const ALERT_TABS = [
    { key: '',              label: 'All Alerts'      },
    { key: 'BELOW_MIN',     label: 'Below Min Stock' },
    { key: 'BELOW_REORDER', label: 'Below Reorder'   },
    { key: 'ZERO_STOCK',    label: 'Zero Stock'      },
];

const ALERT_CONFIG = {
    ZERO_STOCK:    { label: 'Zero Stock',    bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    BELOW_MIN:     { label: 'Below Min',     bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
    BELOW_REORDER: { label: 'Below Reorder', bg: '#eff6ff', color: '#1e40af', dot: '#3b82f6' },
};

const AlertBadge = ({ type }) => {
    const cfg = ALERT_CONFIG[type] || { label: type, bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
            background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
        </span>
    );
};

const DEFAULT_FILTERS = { itemTypeId: '', categoryId: '', subCategoryId: '', itemId: '' };

const PAGE_SIZE = 50;

const StockAlerts = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, setFilter, updateFilterDefs } = useFilters();

    const [rows,      setRows]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [activeTab, setActiveTab] = useState('');
    const [applied,   setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [sortKey,   setSortKey]   = useState('alertType');
    const [sortDir,   setSortDir]   = useState('asc');
    const [page,      setPage]      = useState(1);

    const load = useCallback((tab, af) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (tab)              params.set('alertType',    tab);
        if (af.itemTypeId)    params.set('itemTypeId',   af.itemTypeId);
        if (af.categoryId)    params.set('categoryId',   af.categoryId);
        if (af.subCategoryId) params.set('subCategoryId', af.subCategoryId);
        if (af.itemId)        params.set('itemId',       af.itemId);
        fetch(`${variables.API_URL}stockbalance/alerts?${params}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setRows(Array.isArray(d) ? d : []); setPage(1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load('', DEFAULT_FILTERS); }, [load]);

    const allCatsRef = useRef([]);

    const buildDefs = (types, cats, subcats, onCatChange) => ({
        itemTypeId:    { label: 'Item Type',    type: 'select',            placeholder: 'All Types',          options: types },
        categoryId:    { label: 'Category',     type: 'select',            placeholder: 'All Categories',     options: cats, onChange: onCatChange },
        subCategoryId: { label: 'Sub-Category', type: 'select',            placeholder: 'All Sub-Categories', options: subcats },
        itemId:        { label: 'Item',         type: 'searchable-select', placeholder: 'Search item…' },
    });

    const makeCatChangeHandler = (allCats, types) => (catVal) => {
        const subcats = catVal
            ? allCats.filter(c => String(c.parentCategoryId) === String(catVal))
                     .map(c => ({ value: String(c.categoryId), label: c.categoryName }))
            : [];
        const topCats = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
        setFilter('stock-alerts', 'subCategoryId', '');
        updateFilterDefs('stock-alerts', buildDefs(types, topCats, subcats, makeCatChangeHandler(allCats, types)));
    };

    useEffect(() => {
        const onApply = (vals) => { setApplied({ ...vals }); load(activeTab, vals); };
        registerFilters('stock-alerts', buildDefs([], [], [], () => {}), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('stock-alerts');
    }, []); // eslint-disable-line

    useEffect(() => {
        Promise.all([
            fetch(`${variables.API_URL}item/types`,      { headers: authHeaders() }).then(r => r.json()).catch(() => []),
            fetch(`${variables.API_URL}item/categories`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
        ]).then(([types, cats]) => {
            const allCats  = Array.isArray(cats) ? cats : [];
            allCatsRef.current = allCats;
            const topCats  = allCats.filter(c => !c.parentCategoryId).map(c => ({ value: String(c.categoryId), label: c.categoryName }));
            const typeOpts = (Array.isArray(types) ? types : []).map(t => ({ value: String(t.itemTypeId), label: t.typeName }));
            updateFilterDefs('stock-alerts', buildDefs(typeOpts, topCats, [], makeCatChangeHandler(allCats, typeOpts)));
        });
    }, []); // eslint-disable-line

    const handleTabChange = (key) => {
        setActiveTab(key);
        setPage(1);
        load(key, applied);
    };

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
        setPage(1);
    };
    const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const sortedRows = React.useMemo(() => {
        return [...rows].sort((a, b) => {
            let va = a[sortKey], vb = b[sortKey];
            if (va == null) va = typeof va === 'string' ? '' : 0;
            if (vb == null) vb = typeof vb === 'string' ? '' : 0;
            if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            return sortDir === 'asc' ? va - vb : vb - va;
        });
    }, [rows, sortKey, sortDir]);

    const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
    const pagedRows  = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const SortTH = ({ children, col, right = false, center = false }) => (
        <th className={right ? 'right' : ''}
            onClick={() => cycleSort(col)}
            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                textAlign: center ? 'center' : undefined,
                color: sortKey === col ? '#1e40af' : undefined,
                background: sortKey === col ? '#e8f0fe' : undefined }}>
            {children}{sortIcon(col)}
        </th>
    );

    // Counts per type across the current full result set (only meaningful on "All")
    const counts = rows.reduce((acc, r) => {
        acc[r.alertType] = (acc[r.alertType] || 0) + 1;
        return acc;
    }, {});

    const statCards = [
        { label: 'Total Alerts',    value: rows.length, accent: '#1e293b', bg: '#f1f5f9', border: '#e2e8f0' },
        { label: 'Zero Stock',       value: counts.ZERO_STOCK    || 0, accent: '#991b1b', bg: '#fee2e2', border: '#fca5a5' },
        { label: 'Below Min Stock',  value: counts.BELOW_MIN     || 0, accent: '#92400e', bg: '#fef3c7', border: '#fde68a' },
        { label: 'Below Reorder',    value: counts.BELOW_REORDER || 0, accent: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
    ];

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                {/* Header */}
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock Alerts</div>
                            <div className="po-page-sub">{rows.length} item{rows.length !== 1 ? 's' : ''} need attention</div>
                        </div>
                    </div>

                    {/* Summary stat cards */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                        {statCards.map(({ label, value, accent, bg, border }) => (
                            <div key={label} style={{
                                background: bg, border: `1.5px solid ${border}`,
                                borderRadius: 10, padding: '14px 20px', minWidth: 150,
                                display: 'flex', flexDirection: 'column', gap: 3,
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1, letterSpacing: '-0.5px' }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 16, borderBottom: '2px solid #e2e8f0' }}>
                        {ALERT_TABS.map(tab => (
                            <button key={tab.key}
                                onClick={() => handleTabChange(tab.key)}
                                style={{
                                    padding: '7px 16px', fontSize: 12, fontWeight: 600,
                                    border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0',
                                    background: activeTab === tab.key ? '#fff' : 'transparent',
                                    color: activeTab === tab.key ? '#1e40af' : '#64748b',
                                    borderBottom: activeTab === tab.key ? '2px solid #1e40af' : '2px solid transparent',
                                    marginBottom: -2,
                                    transition: 'color .15s',
                                }}>
                                {tab.label}
                                {tab.key === '' && rows.length > 0 &&
                                    <span style={{ marginLeft: 6, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>{rows.length}</span>
                                }
                            </button>
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
                                <SortTH col="categoryName">Category</SortTH>
                                <SortTH col="itemTypeName">Type</SortTH>
                                <SortTH col="baseUom">UOM</SortTH>
                                <SortTH col="qtyOnHand"      right>On Hand</SortTH>
                                <SortTH col="minStockLevel"  right>Min Stock</SortTH>
                                <SortTH col="reorderLevel"   right>Reorder Level</SortTH>
                                <SortTH col="shortage"       right>Shortage</SortTH>
                                <SortTH col="leadTimeDays"   right>Lead Time</SortTH>
                                <SortTH col="lastReceiptDate">Last Receipt</SortTH>
                                <SortTH col="alertType">Alert</SortTH>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={11} className="po-empty">
                                        {activeTab === ''
                                            ? 'No stock alerts — all items are within safe levels.'
                                            : `No items match the "${ALERT_TABS.find(t => t.key === activeTab)?.label}" filter.`}
                                    </td>
                                </tr>
                            ) : pagedRows.map((r, i) => (
                                <tr key={r.itemId} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', cursor: 'pointer' }}
                                    onClick={() => navigate(`/items/${r.itemId}`)}>
                                    <td>
                                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{r.itemCode}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{r.itemName}</div>
                                    </td>
                                    <td>{r.categoryName || '—'}</td>
                                    <td>{r.itemTypeName || '—'}</td>
                                    <td>{r.baseUom || '—'}</td>
                                    <td className="po-num-cell">
                                        <span style={{
                                            fontWeight: 700,
                                            color: r.qtyOnHand === 0 ? '#dc2626' : r.qtyOnHand < r.minStockLevel ? '#d97706' : '#0369a1',
                                        }}>{fmt(r.qtyOnHand, 4)}</span>
                                    </td>
                                    <td className="po-num-cell" style={{ color: '#64748b' }}>
                                        {r.minStockLevel > 0 ? fmt(r.minStockLevel, 4) : '—'}
                                    </td>
                                    <td className="po-num-cell" style={{ color: '#64748b' }}>
                                        {r.reorderLevel > 0 ? fmt(r.reorderLevel, 4) : '—'}
                                    </td>
                                    <td className="po-num-cell">
                                        {r.shortage > 0
                                            ? <span style={{ color: '#dc2626', fontWeight: 700 }}>-{fmt(r.shortage, 4)}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td className="po-num-cell" style={{ color: '#64748b' }}>
                                        {r.leadTimeDays > 0 ? `${r.leadTimeDays}d` : '—'}
                                    </td>
                                    <td style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                        {r.lastReceiptDate ? fmtDate(r.lastReceiptDate) : '—'}
                                    </td>
                                    <td><AlertBadge type={r.alertType} /></td>
                                </tr>
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

export default StockAlerts;

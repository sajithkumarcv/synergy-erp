import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../inventoryConstants';
import '../Inventory.css';
import '../../procurement/Procurement.css';

// ── Item typeahead (uses the existing item/search endpoint) ─────────────────
// Scoped by itemTypeId + categoryId (categoryId = subcategory when chosen).
const ItemPicker = ({ value, onPick, itemTypeId, categoryId }) => {
    const [term,    setTerm]    = useState('');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        const h = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Fetch when the search term OR the type/category scope changes. With a scope
    // set we list items even before the user types, so they can browse the group.
    useEffect(() => {
        const scoped = itemTypeId || categoryId;
        if (!term.trim() && !scoped) { setResults([]); return; }
        const t = setTimeout(() => {
            const q = new URLSearchParams({ pageSize: '25', isActive: 'true' });
            if (term.trim())  q.set('searchText', term.trim());
            if (itemTypeId)   q.set('itemTypeId', itemTypeId);
            if (categoryId)   q.set('categoryId', categoryId);
            fetch(`${variables.API_URL}item/search?${q}`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setResults(d.data || []))
                .catch(() => setResults([]));
        }, 250);
        return () => clearTimeout(t);
    }, [term, itemTypeId, categoryId]);

    return (
        <div ref={boxRef} style={{ position: 'relative', minWidth: 320 }}>
            <input
                value={open ? term : (value ? `${value.itemCode} — ${value.itemName}` : term)}
                onChange={e => { setTerm(e.target.value); setOpen(true); }}
                onFocus={() => { setTerm(''); setOpen(true); }}
                placeholder="Search item by code or name…"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            {open && results.length > 0 && (
                <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 2, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                    {results.map(it => (
                        <div key={it.itemId}
                             onClick={() => { onPick(it); setOpen(false); setTerm(''); }}
                             style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                             onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                             onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <span style={{ fontWeight: 700, color: '#1e40af' }}>{it.itemCode}</span>
                            <span style={{ color: '#64748b', marginLeft: 8 }}>{it.itemName}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const KpiCard = ({ label, value, sub, accent, bg, border }) => (
    <div style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '14px 20px', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
    </div>
);

const ItemPriceAnalysis = () => {
    const [item,     setItem]     = useState(null);
    // Default to the last 12 months. "What has this item cost us over the past
    // year" is the question people actually open this screen to answer; leaving
    // the range empty showed all history and made the trend line flatten out
    // across years of data. Clear both fields to get the full history back.
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
    });
    const [dateTo,   setDateTo]   = useState('');
    const [mode,     setMode]     = useState('item');   // 'item' | 'variance'
    const [varRows,  setVarRows]  = useState([]);
    const [varBusy,  setVarBusy]  = useState(false);
    const [data,     setData]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');

    // ── Item Type / Category / Sub-Category cascade ──────────────────────────
    const [types,         setTypes]         = useState([]);
    const [allCats,       setAllCats]       = useState([]);
    const [itemTypeId,    setItemTypeId]    = useState('');
    const [categoryId,    setCategoryId]    = useState('');
    const [subCategoryId, setSubCategoryId] = useState('');

    useEffect(() => {
        Promise.all([
            fetch(`${variables.API_URL}item/types`,      { headers: authHeaders() }).then(r => r.json()).catch(() => []),
            fetch(`${variables.API_URL}item/categories`, { headers: authHeaders() }).then(r => r.json()).catch(() => []),
        ]).then(([t, c]) => {
            setTypes(Array.isArray(t) ? t : []);
            setAllCats(Array.isArray(c) ? c : []);
        });
    }, []);

    const topCats = allCats.filter(c => !c.parentCategoryId);
    const subCats = categoryId ? allCats.filter(c => String(c.parentCategoryId) === String(categoryId)) : [];
    // Effective category passed to the item search: subcategory narrows, else category
    const effectiveCategoryId = subCategoryId || categoryId;

    const load = useCallback(() => {
        if (!item) return;
        setLoading(true); setError('');
        const q = new URLSearchParams({ itemId: item.itemId });
        if (dateFrom) q.set('dateFrom', dateFrom);
        if (dateTo)   q.set('dateTo', dateTo);
        fetch(`${variables.API_URL}priceanalysis/po?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(d => setData(d))
            .catch(e => setError(e.message || 'Failed to load price analysis.'))
            .finally(() => setLoading(false));
    }, [item, dateFrom, dateTo]);

    // Cross-item variance. Runs only in that mode, and needs no item selected.
    useEffect(() => {
        if (mode !== 'variance') return;
        let live = true;
        setVarBusy(true);
        const q = new URLSearchParams();
        if (dateFrom) q.set('dateFrom', dateFrom);
        if (dateTo)   q.set('dateTo',   dateTo);
        fetch(`${variables.API_URL}priceanalysis/variance?${q}`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : []))
            .then(d => { if (live) setVarRows(Array.isArray(d) ? d : []); })
            .catch(() => { if (live) setVarRows([]); })
            .finally(() => { if (live) setVarBusy(false); });
        return () => { live = false; };
    }, [mode, dateFrom, dateTo]);

    useEffect(() => { if (item) load(); }, [item, load]);

    const s        = data?.summary;
    const monthly  = (data?.monthly || []).map(m => ({
        ...m,
        avgPrice:    Number(m.avgPrice),
        weightedAvg: Number(m.weightedAvg),
    }));
    const detail   = data?.detail  || [];
    const vendors  = data?.vendors || [];
    const hasData  = s && s.orderLines > 0;

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Item Price Analysis</div>
                            <div className="po-page-sub">Purchase-order unit price · base currency</div>
                        </div>
                    </div>

                    {/* Controls */}
                    {(() => {
                        const sel = { padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 };
                        return (
                            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                                {/* Mode toggle. "All items" answers "where did our prices
                                    move and what did it cost", without opening items one
                                    by one; the single-item view is the drill-down. */}
                                <div style={{ display: 'inline-flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                                    {[['item', 'One item'], ['variance', 'All items — price movement']].map(([k, label]) => (
                                        <button key={k} type="button" onClick={() => setMode(k)}
                                            style={{ padding: '7px 12px', fontSize: 12.5, border: 'none', cursor: 'pointer',
                                                     background: mode === k ? '#2e5fa3' : '#fff',
                                                     color:      mode === k ? '#fff' : '#475569',
                                                     fontWeight: mode === k ? 700 : 500 }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <select value={itemTypeId} onChange={e => setItemTypeId(e.target.value)} style={sel}
                                    disabled={mode === 'variance'}>
                                    <option value="">All types</option>
                                    {types.map(t => <option key={t.itemTypeId} value={t.itemTypeId}>{t.typeName}</option>)}
                                </select>
                                <select value={categoryId}
                                        onChange={e => { setCategoryId(e.target.value); setSubCategoryId(''); }}
                                        style={sel}>
                                    <option value="">All categories</option>
                                    {topCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                                </select>
                                <select value={subCategoryId} onChange={e => setSubCategoryId(e.target.value)}
                                        style={{ ...sel, opacity: subCats.length ? 1 : 0.6 }} disabled={!subCats.length}>
                                    <option value="">{subCats.length ? 'All sub-categories' : 'No sub-categories'}</option>
                                    {subCats.map(c => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
                                </select>
                                <ItemPicker value={item} onPick={setItem} itemTypeId={itemTypeId} categoryId={effectiveCategoryId} />
                                <span style={{ fontSize: 12, color: '#64748b' }}>From</span>
                                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={sel} />
                                <span style={{ fontSize: 12, color: '#64748b' }}>To</span>
                                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={sel} />
                            </div>
                        );
                    })()}
                </div>

                {error && <div className="recv-error" style={{ margin: 12 }}>⚠ {error}</div>}

                {mode === 'variance' ? (
                    varBusy ? (
                        <div className="inv-loading" style={{ padding: 40 }}><div className="inv-spinner" />Loading…</div>
                    ) : varRows.length === 0 ? (
                        <div className="po-empty" style={{ padding: 50 }}>
                            No item has been purchased more than once in this period, so there is nothing to
                            compare. Widen the date range.
                        </div>
                    ) : (
                        <div style={{ padding: '4px 16px 20px' }}>
                            <div style={{ fontSize: 12, color: '#64748b', margin: '6px 0 10px' }}>
                                Each item's <strong>latest purchase</strong> compared against the weighted average
                                of everything bought before it, in base currency. Ranked by what the change cost,
                                not by percentage — a large % on a cheap item is rarely the money that matters.
                                Click a row for its full history.
                            </div>
                            <table className="po-table" style={{ fontSize: 12.5 }}>
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th>Category</th>
                                        <th className="right">Qty</th>
                                        <th className="right">Now</th>
                                        <th className="right">Before</th>
                                        <th className="right">Change</th>
                                        <th className="right">Cost of change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {varRows.map((r, i) => {
                                        const up = r.extraSpend > 0;
                                        return (
                                            <tr key={`${r.itemId}-${r.uomId}-${i}`}
                                                onClick={() => { setMode('item'); setItem({ itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName }); }}
                                                title="Open this item's price history"
                                                style={{ background: i % 2 ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: '#1e40af' }}>{r.itemCode}</span>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>{r.itemName}</div>
                                                </td>
                                                <td style={{ color: '#64748b' }}>{r.budgetCategory || '—'}</td>
                                                <td className="po-num-cell">{fmt(r.qtyNow, 2)} {r.uomCode || ''}</td>
                                                <td className="po-num-cell">{fmt(r.priceNow)}</td>
                                                <td className="po-num-cell" style={{ color: '#64748b' }}>{fmt(r.priceBefore)}</td>
                                                <td className="po-num-cell" style={{ fontWeight: 600, color: up ? '#b45309' : '#166534' }}>
                                                    {up ? '▲' : '▼'} {Math.abs(r.changePct).toFixed(1)}%
                                                </td>
                                                <td className="po-num-cell" style={{ fontWeight: 700, color: up ? '#b91c1c' : '#166534' }}>
                                                    {up ? '+' : '−'}{fmt(Math.abs(r.extraSpend))}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : !item ? (
                    <div className="po-empty" style={{ padding: 50 }}>Pick an item above to see its PO price history.</div>
                ) : loading ? (
                    <div className="inv-loading" style={{ padding: 40 }}><div className="inv-spinner" />Loading…</div>
                ) : !hasData ? (
                    <div className="po-empty" style={{ padding: 50 }}>No confirmed purchase orders for this item in the selected period.</div>
                ) : (
                    <div style={{ padding: '4px 16px 20px' }}>
                        {/* KPI cards */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                            <KpiCard label="Last Price"    value={fmt(s.lastPrice)}   sub={`${s.lastSupplier || '—'} · ${s.lastPriceDate ? fmtDate(s.lastPriceDate) : ''}`} accent="#1e293b" bg="#f1f5f9" border="#e2e8f0" />
                            <KpiCard label="Weighted Avg"  value={fmt(s.weightedAvg)} sub="by qty purchased" accent="#1e40af" bg="#eff6ff" border="#bfdbfe" />
                            <KpiCard label="Lowest"        value={fmt(s.minPrice)}    sub={s.minSupplier || '—'} accent="#166534" bg="#f0fdf4" border="#bbf7d0" />
                            <KpiCard label="Highest"       value={fmt(s.maxPrice)}    sub={s.maxSupplier || '—'} accent="#9a3412" bg="#fff7ed" border="#fed7aa" />
                            <KpiCard label="Change"        value={`${s.changePct > 0 ? '+' : ''}${fmt(s.changePct)}%`} sub="first → last in period" accent={s.changePct > 0 ? '#dc2626' : '#166534'} bg={s.changePct > 0 ? '#fef2f2' : '#f0fdf4'} border={s.changePct > 0 ? '#fecaca' : '#bbf7d0'} />
                        </div>

                        {/* Trend chart */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 14px 6px', marginBottom: 20 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Unit price trend (monthly)</div>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <LineChart data={monthly} margin={{ top: 6, right: 16, left: 0, bottom: 4 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                        <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: '#64748b' }} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={64} />
                                        <Tooltip formatter={(v) => fmt(v)} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Line type="monotone" dataKey="weightedAvg" name="Weighted avg" stroke="#185FA5" strokeWidth={2} dot={{ r: 3 }} />
                                        <Line type="monotone" dataKey="avgPrice"    name="Simple avg"   stroke="#1D9E75" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Vendor comparison */}
                        {vendors.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>By vendor</div>
                                <table className="po-table" style={{ fontSize: 12.5 }}>
                                    <thead>
                                        <tr>
                                            <th>Supplier</th>
                                            <th className="right">Orders</th>
                                            <th className="right">Total Qty</th>
                                            <th className="right">Weighted Avg</th>
                                            <th className="right">Lowest</th>
                                            <th className="right">Highest</th>
                                            <th>Last Order</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vendors.map((v, i) => (
                                            <tr key={v.supplierId} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                                                <td style={{ fontWeight: 600 }}>{v.supplierName || '—'}</td>
                                                <td className="po-num-cell">{v.orderLines}</td>
                                                <td className="po-num-cell">{fmt(v.totalQty, 4)}</td>
                                                <td className="po-num-cell" style={{ fontWeight: 700, color: '#1e40af' }}>{fmt(v.weightedAvg)}</td>
                                                <td className="po-num-cell" style={{ color: '#166534' }}>{fmt(v.minPrice)}</td>
                                                <td className="po-num-cell" style={{ color: '#9a3412' }}>{fmt(v.maxPrice)}</td>
                                                <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{v.lastOrderDate ? fmtDate(v.lastOrderDate) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Detail */}
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Purchase order lines ({detail.length})</div>
                            <table className="po-table" style={{ fontSize: 12.5 }}>
                                <thead>
                                    <tr>
                                        <th>PO No</th>
                                        <th>Date</th>
                                        <th>Supplier</th>
                                        <th className="right">Qty</th>
                                        <th>UOM</th>
                                        <th className="right">Unit Price</th>
                                        <th>Ccy</th>
                                        <th className="right">FX</th>
                                        <th className="right">Unit Price (Base)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.map((d, i) => (
                                        <tr key={`${d.poId}-${i}`} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                                            <td style={{ fontWeight: 600 }}>
                                                {/* Opens the headerless PO print page (PoApprovalPrintPage).
                                                    New tab so the analysis and its filters survive. */}
                                                <a href={`/purchase-orders/${d.poId}/review`}
                                                   target="_blank" rel="noopener noreferrer"
                                                   title={`Open ${d.poNumber} print view`}
                                                   style={{ color: '#1e40af', textDecoration: 'none', borderBottom: '1px dotted #1e40af' }}>
                                                    {d.poNumber}
                                                </a>
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.poDate)}</td>
                                            <td>{d.supplierName || '—'}</td>
                                            <td className="po-num-cell">{fmt(d.orderedQty, 4)}</td>
                                            <td style={{ color: '#64748b' }}>{d.uomName || '—'}</td>
                                            <td className="po-num-cell">{fmt(d.unitPrice)}</td>
                                            <td style={{ color: '#64748b' }}>{d.currencyShort || '—'}</td>
                                            <td className="po-num-cell" style={{ color: '#94a3b8' }}>{fmt(d.exchangeRate)}</td>
                                            <td className="po-num-cell" style={{ fontWeight: 700 }}>{fmt(d.unitPriceBase)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ItemPriceAnalysis;

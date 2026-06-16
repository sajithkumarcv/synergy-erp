import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { variables, authHeaders } from '../../Variable';
import { fmt, fmtDate } from '../inventoryConstants';
import '../Inventory.css';
import '../../procurement/Procurement.css';

// ── Item drill-down rows (lazy-loaded when a job is expanded) ───────────────
const JobItemRows = ({ jobId, colSpan }) => {
    const [rows,    setRows]    = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}stockbalance/job-items?jobId=${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [jobId]);

    if (loading) return (
        <tr><td colSpan={colSpan} style={{ padding: '8px 28px', background: '#f8fafc', color: '#64748b', fontSize: 12 }}>Loading items…</td></tr>
    );
    if (!rows || rows.length === 0) return (
        <tr><td colSpan={colSpan} style={{ padding: '8px 28px', background: '#f8fafc', color: '#94a3b8', fontSize: 12 }}>No item stock on this job.</td></tr>
    );

    return (
        <tr>
            <td colSpan={colSpan} style={{ padding: 0, background: '#f8fafc' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ color: '#64748b' }}>
                            {['Item', 'Category', 'UOM', 'Qty Balance', 'Avg Cost', 'Stock Value', 'Last Movement'].map((h, i) => (
                                <th key={h} style={{ padding: '6px 12px', textAlign: i >= 3 && i <= 5 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #e2e8f0', paddingLeft: i === 0 ? 28 : 12 }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(it => (
                            <tr key={it.itemId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 12px 6px 28px' }}>
                                    <span style={{ fontWeight: 700, color: '#1e40af' }}>{it.itemCode}</span>
                                    <span style={{ color: '#64748b', marginLeft: 8 }}>{it.itemName}</span>
                                </td>
                                <td style={{ padding: '6px 12px', color: '#475569' }}>{it.categoryName || '—'}</td>
                                <td style={{ padding: '6px 12px', color: '#475569' }}>{it.baseUom || '—'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(it.qtyBalance, 4)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b' }}>{fmt(it.avgUnitCost)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>{fmt(it.stockValue)}</td>
                                <td style={{ padding: '6px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{it.lastMovementDate ? fmtDate(it.lastMovementDate) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </td>
        </tr>
    );
};

const GROUP_OPTIONS = [
    { value: '',              label: 'No grouping' },
    { value: 'jobTypeName',   label: 'Job Type' },
    { value: 'customerName',  label: 'Customer' },
    { value: 'jobStatusName', label: 'Status' },
];

const COL_SPAN = 8;

const StockByJob = () => {
    const [rows,     setRows]     = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [search,   setSearch]   = useState('');
    const [jobType,  setJobType]  = useState('');
    const [job,      setJob]      = useState('');
    const [groupBy,  setGroupBy]  = useState('');
    const [expanded, setExpanded] = useState({});   // jobId → bool

    const load = useCallback(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}stockbalance/by-job`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(e => setError(e.message || 'Failed to load stock by job.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const jobTypeOptions = useMemo(() => {
        const seen = new Map();
        rows.forEach(r => { if (r.jobTypeName) seen.set(r.jobTypeName, true); });
        return Array.from(seen.keys()).sort();
    }, [rows]);

    // Job dropdown options — only jobs holding stock, narrowed by the Job Type filter
    const jobOptions = useMemo(() => {
        return rows
            .filter(r => !jobType || r.jobTypeName === jobType)
            .map(r => ({ id: r.jobId, label: r.projectName ? `${r.jobId} — ${r.projectName}` : r.jobId }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [rows, jobType]);

    // Clear a selected job if it falls outside the current Job Type filter
    useEffect(() => {
        if (job && !jobOptions.some(o => o.id === job)) setJob('');
    }, [jobOptions, job]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (jobType && r.jobTypeName !== jobType) return false;
            if (job && r.jobId !== job) return false;
            if (!q) return true;
            return [r.jobId, r.projectName, r.customerName, r.jobTypeName]
                .some(v => (v || '').toLowerCase().includes(q));
        });
    }, [rows, search, jobType, job]);

    // KPI totals (over filtered set)
    const kpiJobs   = filtered.length;
    const kpiItems  = filtered.reduce((s, r) => s + (r.itemCount  || 0), 0);
    const kpiValue  = filtered.reduce((s, r) => s + (r.totalValue || 0), 0);

    // Group the filtered rows for rendering
    const groups = useMemo(() => {
        if (!groupBy) return [{ key: '', label: null, rows: filtered }];
        const map = new Map();
        filtered.forEach(r => {
            const k = r[groupBy] || '— (none)';
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(r);
        });
        return Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([label, grpRows]) => ({ key: label, label, rows: grpRows }));
    }, [filtered, groupBy]);

    const toggle = (jobId) => setExpanded(p => ({ ...p, [jobId]: !p[jobId] }));

    const JobRow = ({ r, idx }) => {
        const open = !!expanded[r.jobId];
        return (
            <>
                <tr style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="po-act-btn" style={{ marginRight: 6, padding: '1px 7px' }} onClick={() => toggle(r.jobId)}>{open ? '▾' : '▸'}</button>
                        <span style={{ fontWeight: 700, color: '#1e40af' }}>{r.jobId}</span>
                        {r.projectName && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1, marginLeft: 28, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.projectName}</div>}
                    </td>
                    <td>{r.jobTypeName || '—'}</td>
                    <td>{r.customerName || '—'}</td>
                    <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#eef2ff', color: '#3730a3' }}>{r.jobStatusName || '—'}</span>
                    </td>
                    <td className="po-num-cell">{r.itemCount}</td>
                    <td className="po-num-cell">{fmt(r.totalQty, 4)}</td>
                    <td className="po-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(r.totalValue)}</td>
                </tr>
                {open && <JobItemRows jobId={r.jobId} colSpan={COL_SPAN - 1} />}
            </>
        );
    };

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock by Job</div>
                            <div className="po-page-sub">Current job-direct stock on hand</div>
                        </div>
                    </div>

                    {/* KPI cards */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Jobs with Stock',      value: kpiJobs,  decimals: 0, accent: '#1e293b', bg: '#f1f5f9', border: '#e2e8f0', sub: 'matching filters' },
                            { label: 'Items Held',           value: kpiItems, decimals: 0, accent: '#1e40af', bg: '#eff6ff', border: '#bfdbfe', sub: 'distinct item lines' },
                            { label: 'Total Job Stock Value', value: kpiValue, decimals: 2, accent: '#166534', bg: '#f0fdf4', border: '#bbf7d0', sub: 'net ledger cost' },
                        ].map(({ label, value, decimals, accent, bg, border, sub }) => (
                            <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: '14px 20px', minWidth: 170, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.1, letterSpacing: '-0.5px' }}>{fmt(value, decimals)}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Inline controls */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search job / project / customer…"
                               style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, minWidth: 260 }} />
                        <select value={jobType} onChange={e => setJobType(e.target.value)}
                                style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
                            <option value="">All job types</option>
                            {jobTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select value={job} onChange={e => setJob(e.target.value)}
                                style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, maxWidth: 320 }}>
                            <option value="">All jobs</option>
                            {jobOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>Group by</span>
                        <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                                style={{ padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}>
                            {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                {error && <div className="recv-error" style={{ margin: 12 }}>⚠ {error}</div>}

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay"><div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div></div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <th>Job</th>
                                <th>Job Type</th>
                                <th>Customer</th>
                                <th>Status</th>
                                <th className="right">Items</th>
                                <th className="right">Total Qty</th>
                                <th className="right">Stock Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && !loading ? (
                                <tr><td colSpan={COL_SPAN - 1} className="po-empty">No job stock matches the current filters.</td></tr>
                            ) : groups.map(g => (
                                <React.Fragment key={g.key || 'all'}>
                                    {g.label != null && (
                                        <tr>
                                            <td colSpan={COL_SPAN - 1} style={{ background: '#eef2ff', padding: '7px 14px', fontWeight: 700, color: '#3730a3', fontSize: 12 }}>
                                                {g.label}
                                                <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 8 }}>
                                                    · {g.rows.length} job{g.rows.length !== 1 ? 's' : ''} · value {fmt(g.rows.reduce((s, r) => s + (r.totalValue || 0), 0))}
                                                </span>
                                            </td>
                                        </tr>
                                    )}
                                    {g.rows.map((r, i) => <JobRow key={r.jobId} r={r} idx={i} />)}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StockByJob;

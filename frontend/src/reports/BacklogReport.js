import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today = () => new Date().toISOString().slice(0, 10);

const PAGE_SIZES = [50, 100, 200, 500, 1000];

// ── Shared helpers ──────────────────────────────────────────────────────────
const esc = v => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
};

const SortIcon = ({ col, sc, sd }) => (
    <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>
        {sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}
    </span>
);

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta))
            pages.push(i);
        else if (pages[pages.length - 1] !== '…')
            pages.push('…');
    }
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalRows);
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">
                Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong> records
            </div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)}        disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) =>
                    p === '…'
                        ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
                        : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>
                )}
                <button className="rpt-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">
                Rows:
                <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>
    );
};

// ── Status badge config ──────────────────────────────────────────────────────
const STATUS_CFG = {
    Pending:         { bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' },
    PRPartial:       { bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    PRRaised:        { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
    POPartial:       { bg: '#ede9fe', color: '#6d28d9', dot: '#8b5cf6' },
    PartialReceived: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
    Draft:           { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
    Approved:        { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    Issued:          { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Cancelled:       { bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
    Received:        { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
};
const StatusBadge = ({ status }) => {
    const cfg = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {status}
        </span>
    );
};

const CriticalBadge = ({ v }) => v
    ? <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700 }}>Critical</span>
    : <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700 }}>Normal</span>;

// ── Tab header colours ───────────────────────────────────────────────────────
const TAB_CFG = [
    { key: 'bom',   label: '📋 BOM → PR',   grad: 'linear-gradient(135deg,#fef9c3,#fde68a)', accent: '#b45309' },
    { key: 'pr',    label: '📄 PR → PO',    grad: 'linear-gradient(135deg,#ede9fe,#ddd6fe)', accent: '#6d28d9' },
    { key: 'po',    label: '🚚 PO → GRN',   grad: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', accent: '#1e40af' },
    { key: 'issue', label: '📦 Issue Items', grad: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', accent: '#166534' },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 1 — BOM → PR Backlog
// ═══════════════════════════════════════════════════════════════════════════════
const BomToPrTab = ({ jobs }) => {
    const navigate = useNavigate();
    const [jobId,    setJobId]    = useState('');
    const [critical, setCritical] = useState('');
    const [rows,     setRows]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('jobId');
    const [sortDir,  setSortDir]  = useState('asc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(200);

    const run = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (jobId)    p.set('jobId', jobId);
        if (critical !== '') p.set('critical', critical);
        try {
            const res  = await fetch(`${variables.API_URL}reports/backlog/bom-to-pr?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [jobId, critical]);

    const handleSort = col => {
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

    const totals = useMemo(() => {
        if (!rows || !rows.length) return null;
        return {
            items:        rows.length,
            pendingQty:   rows.reduce((s, r) => s + (r.pendingQty   || 0), 0),
            pendingValue: rows.reduce((s, r) => s + (r.pendingValue || 0), 0),
            critical:     rows.filter(r => r.isCritical).length,
        };
    }, [rows]);

    const exportCsv = () => {
        const hdrs = ['#','Job','Project','Section','Item Code','Item Name','UOM','BOM Qty','PR Qty','Pending Qty','Unit Price','Pending Value','Status','Critical','Req Date','Exp Delivery','Remarks'];
        const lines = [hdrs.join(','), ...sorted.map((r,i) => [
            i+1, r.jobId, r.projectName, r.sectionName, r.itemCode, r.itemName,
            r.uomName, r.bomRequestedQty, r.prCreatedQty, r.pendingQty,
            r.bomPrice, r.pendingValue, r.lineStatus,
            r.isCritical ? 'Yes' : 'No',
            r.itemReqDate ? fmtDate(r.itemReqDate) : '',
            r.expectedDelivery ? fmtDate(r.expectedDelivery) : '',
            r.remarks,
        ].map(esc).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href = url; a.download = `BOM_PR_Backlog_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    return (
        <div>
            {/* Filter bar */}
            <div className="rpt-filter-bar">
                <div className="rpt-filter-group">
                    <label>Job</label>
                    <select value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} – {j.projectName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Critical</label>
                    <select value={critical} onChange={e => setCritical(e.target.value)}>
                        <option value="">All</option>
                        <option value="1">Critical Only</option>
                        <option value="0">Normal Only</option>
                    </select>
                </div>
                <div className="rpt-filter-actions">
                    <button className="rpt-btn-run" onClick={run} disabled={loading}>
                        {loading ? '⏳ Loading…' : '▶ Run Report'}
                    </button>
                    <button className="rpt-btn-clear" onClick={() => { setJobId(''); setCritical(''); setRows(null); setPage(1); }}>
                        ✕ Clear
                    </button>
                </div>
            </div>

            {error && <div className="rpt-error">{error}</div>}

            {/* Summary strip */}
            {totals && (
                <div className="rpt-summary-strip">
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Pending Lines</span><span className="rpt-sum-val">{totals.items}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Critical Lines</span><span className="rpt-sum-val" style={{ color: '#dc2626' }}>{totals.critical}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Pending Qty</span><span className="rpt-sum-val">{fmt(totals.pendingQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Pending Value</span><span className="rpt-sum-val">{fmt(totals.pendingValue, 2)}</span></div>
                </div>
            )}

            {rows === null && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📋</div><div>Set filters and click <strong>Run Report</strong></div></div>
            )}
            {rows && rows.length === 0 && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">✅</div><div>No pending BOM items found</div></div>
            )}

            {rows && rows.length > 0 && (
                <>
                    <div className="rpt-toolbar">
                        <span className="rpt-row-count">{sorted.length} line{sorted.length !== 1 ? 's' : ''}</span>
                        <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>
                    </div>
                    <div className="rpt-table-wrap">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th className="rpt-th-num">#</th>
                                    <Th col="jobId"           label="Job"          cls="rpt-th-sm" />
                                    <Th col="projectName"     label="Project"      />
                                    <Th col="sectionName"     label="Section"      />
                                    <Th col="itemCode"        label="Item Code"    cls="rpt-th-sm" />
                                    <Th col="itemName"        label="Description"  cls="rpt-th-lg" />
                                    <Th col="uomName"         label="UOM"          cls="rpt-th-xs" />
                                    <Th col="bomRequestedQty" label="BOM Qty"      cls="rpt-th-num" />
                                    <Th col="prCreatedQty"    label="PR Qty"       cls="rpt-th-num" />
                                    <Th col="pendingQty"      label="Pending Qty"  cls="rpt-th-num" />
                                    <Th col="pendingValue"    label="Pending Val"  cls="rpt-th-num" />
                                    <Th col="lineStatus"      label="Status"       cls="rpt-th-sm" />
                                    <Th col="isCritical"      label="Priority"     cls="rpt-th-sm" />
                                    <Th col="itemReqDate"     label="Req Date"     cls="rpt-th-sm" />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((r, i) => (
                                    <tr key={`${r.bomHeaderId}-${i}`} className="rpt-row-link" onClick={() => navigate(`/jobs/${r.jobId}`)}>
                                        <td className="rpt-td-num">{(page - 1) * pageSize + i + 1}</td>
                                        <td><span className="rpt-code-chip">{r.jobId}</span></td>
                                        <td>{r.projectName}</td>
                                        <td className="rpt-td-muted">{r.sectionName}</td>
                                        <td><span className="rpt-code-chip">{r.itemCode}</span></td>
                                        <td className="rpt-td-desc">{r.itemName}</td>
                                        <td className="rpt-td-center rpt-td-muted">{r.uomName}</td>
                                        <td className="rpt-td-num">{fmt(r.bomRequestedQty, 2)}</td>
                                        <td className="rpt-td-num">{fmt(r.prCreatedQty, 2)}</td>
                                        <td className="rpt-td-num rpt-qty-warn">{fmt(r.pendingQty, 2)}</td>
                                        <td className="rpt-td-num rpt-amount">{fmt(r.pendingValue, 2)}</td>
                                        <td><StatusBadge status={r.lineStatus} /></td>
                                        <td><CriticalBadge v={r.isCritical} /></td>
                                        <td className="rpt-td-center">{r.itemReqDate ? fmtDate(r.itemReqDate) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} pageSize={pageSize}
                        totalRows={sorted.length} onPage={setPage} onPageSize={v => { setPageSize(v); setPage(1); }} />
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 2 — PR → PO Backlog
// ═══════════════════════════════════════════════════════════════════════════════
const PrToPoTab = ({ jobs }) => {
    const navigate = useNavigate();
    const [jobId,    setJobId]    = useState('');
    const [rows,     setRows]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('prDate');
    const [sortDir,  setSortDir]  = useState('desc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(200);

    const run = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (jobId) p.set('jobId', jobId);
        try {
            const res  = await fetch(`${variables.API_URL}reports/backlog/pr-to-po?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [jobId]);

    const handleSort = col => {
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

    const totals = useMemo(() => {
        if (!rows || !rows.length) return null;
        return {
            items:        rows.length,
            prs:          new Set(rows.map(r => r.prId)).size,
            pendingQty:   rows.reduce((s, r) => s + (r.pendingQty   || 0), 0),
            pendingValue: rows.reduce((s, r) => s + (r.pendingValue || 0), 0),
        };
    }, [rows]);

    const exportCsv = () => {
        const hdrs = ['#','PR Number','PR Date','Job','Project','Priority','PR Status','Line #','Item Code','Description','UOM','Required Qty','PO Qty','Pending Qty','Est Unit Price','Pending Value','Required Date','Remarks'];
        const lines = [hdrs.join(','), ...sorted.map((r,i) => [
            i+1, r.prNumber, r.prDate ? fmtDate(r.prDate) : '', r.jobId, r.projectName,
            r.priority, r.prStatus, r.lineNum, r.itemCode, r.itemDesc,
            r.uomName, r.requiredQty, r.poCreatedQty, r.pendingQty,
            r.estUnitPrice, r.pendingValue,
            r.requiredDate ? fmtDate(r.requiredDate) : '', r.remarks,
        ].map(esc).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href = url; a.download = `PR_PO_Backlog_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    return (
        <div>
            <div className="rpt-filter-bar">
                <div className="rpt-filter-group">
                    <label>Job</label>
                    <select value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} – {j.projectName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-actions">
                    <button className="rpt-btn-run" onClick={run} disabled={loading}>
                        {loading ? '⏳ Loading…' : '▶ Run Report'}
                    </button>
                    <button className="rpt-btn-clear" onClick={() => { setJobId(''); setRows(null); setPage(1); }}>
                        ✕ Clear
                    </button>
                </div>
            </div>

            {error && <div className="rpt-error">{error}</div>}

            {totals && (
                <div className="rpt-summary-strip">
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Pending Lines</span><span className="rpt-sum-val">{totals.items}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">PRs Affected</span><span className="rpt-sum-val">{totals.prs}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Pending Qty</span><span className="rpt-sum-val">{fmt(totals.pendingQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Estimated Value</span><span className="rpt-sum-val">{fmt(totals.pendingValue, 2)}</span></div>
                </div>
            )}

            {rows === null && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📄</div><div>Set filters and click <strong>Run Report</strong></div></div>
            )}
            {rows && rows.length === 0 && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">✅</div><div>No pending PR items found</div></div>
            )}

            {rows && rows.length > 0 && (
                <>
                    <div className="rpt-toolbar">
                        <span className="rpt-row-count">{sorted.length} line{sorted.length !== 1 ? 's' : ''}</span>
                        <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>
                    </div>
                    <div className="rpt-table-wrap">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th className="rpt-th-num">#</th>
                                    <Th col="prNumber"     label="PR Number"     cls="rpt-th-sm" />
                                    <Th col="prDate"       label="PR Date"       cls="rpt-th-sm" />
                                    <Th col="jobId"        label="Job"           cls="rpt-th-xs" />
                                    <Th col="projectName"  label="Project"       />
                                    <Th col="priority"     label="Priority"      cls="rpt-th-xs" />
                                    <Th col="prStatus"     label="Status"        cls="rpt-th-sm" />
                                    <Th col="itemCode"     label="Item Code"     cls="rpt-th-sm" />
                                    <Th col="itemDesc"     label="Description"   cls="rpt-th-lg" />
                                    <Th col="uomName"      label="UOM"           cls="rpt-th-xs" />
                                    <Th col="requiredQty"  label="Req Qty"       cls="rpt-th-num" />
                                    <Th col="poCreatedQty" label="PO Qty"        cls="rpt-th-num" />
                                    <Th col="pendingQty"   label="Pending Qty"   cls="rpt-th-num" />
                                    <Th col="pendingValue" label="Pending Val"   cls="rpt-th-num" />
                                    <Th col="requiredDate" label="Req Date"      cls="rpt-th-sm" />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((r, i) => (
                                    <tr key={`${r.prLineId}-${i}`} className="rpt-row-link" onClick={() => navigate(`/purchase-requests/${r.prId}`)}>
                                        <td className="rpt-td-num">{(page - 1) * pageSize + i + 1}</td>
                                        <td><span className="rpt-code-chip">{r.prNumber}</span></td>
                                        <td className="rpt-td-center">{r.prDate ? fmtDate(r.prDate) : '—'}</td>
                                        <td><span className="rpt-code-chip">{r.jobId}</span></td>
                                        <td>{r.projectName}</td>
                                        <td className="rpt-td-center">{r.priority && <span className={`rpt-priority-${(r.priority || '').toLowerCase()}`}>{r.priority}</span>}</td>
                                        <td><StatusBadge status={r.prStatus} /></td>
                                        <td><span className="rpt-code-chip">{r.itemCode}</span></td>
                                        <td className="rpt-td-desc">{r.itemDesc}</td>
                                        <td className="rpt-td-center rpt-td-muted">{r.uomName}</td>
                                        <td className="rpt-td-num">{fmt(r.requiredQty, 2)}</td>
                                        <td className="rpt-td-num">{fmt(r.poCreatedQty, 2)}</td>
                                        <td className="rpt-td-num rpt-qty-warn">{fmt(r.pendingQty, 2)}</td>
                                        <td className="rpt-td-num rpt-amount">{fmt(r.pendingValue, 2)}</td>
                                        <td className="rpt-td-center">{r.requiredDate ? fmtDate(r.requiredDate) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} pageSize={pageSize}
                        totalRows={sorted.length} onPage={setPage} onPageSize={v => { setPageSize(v); setPage(1); }} />
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 3 — PO → GRN Backlog
// ═══════════════════════════════════════════════════════════════════════════════
const PoToGrnTab = ({ jobs, suppliers }) => {
    const navigate = useNavigate();
    const [jobId,      setJobId]      = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [rows,       setRows]       = useState(null);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [sortCol,    setSortCol]    = useState('poDate');
    const [sortDir,    setSortDir]    = useState('desc');
    const [page,       setPage]       = useState(1);
    const [pageSize,   setPageSize]   = useState(200);

    const run = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (jobId)      p.set('jobId',      jobId);
        if (supplierId) p.set('supplierId', supplierId);
        try {
            const res  = await fetch(`${variables.API_URL}reports/backlog/po-to-grn?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [jobId, supplierId]);

    const handleSort = col => {
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

    const totals = useMemo(() => {
        if (!rows || !rows.length) return null;
        return {
            items:        rows.length,
            pos:          new Set(rows.map(r => r.poId)).size,
            pendingQty:   rows.reduce((s, r) => s + (r.pendingQty   || 0), 0),
            pendingValue: rows.reduce((s, r) => s + (r.pendingValue || 0), 0),
        };
    }, [rows]);

    const exportCsv = () => {
        const hdrs = ['#','PO Number','PO Date','Supplier','Job','Project','Status','Priority','Delivery Date','Currency','Line #','Item Code','Description','UOM','Ordered Qty','Received Qty','Pending Qty','Unit Price','Pending Value'];
        const lines = [hdrs.join(','), ...sorted.map((r,i) => [
            i+1, r.poNumber, r.poDate ? fmtDate(r.poDate) : '',
            r.supplierName, r.jobId, r.projectName, r.poStatus, r.priority,
            r.deliveryDate ? fmtDate(r.deliveryDate) : '',
            r.currencyShort, r.lineNum, r.itemCode, r.itemDesc,
            r.uomName, r.orderedQty, r.receivedQty, r.pendingQty,
            r.unitPrice, r.pendingValue,
        ].map(esc).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href = url; a.download = `PO_GRN_Backlog_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    return (
        <div>
            <div className="rpt-filter-bar">
                <div className="rpt-filter-group">
                    <label>Job</label>
                    <select value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} – {j.projectName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Supplier</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                        <option value="">All Suppliers</option>
                        {suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-actions">
                    <button className="rpt-btn-run" onClick={run} disabled={loading}>
                        {loading ? '⏳ Loading…' : '▶ Run Report'}
                    </button>
                    <button className="rpt-btn-clear" onClick={() => { setJobId(''); setSupplierId(''); setRows(null); setPage(1); }}>
                        ✕ Clear
                    </button>
                </div>
            </div>

            {error && <div className="rpt-error">{error}</div>}

            {totals && (
                <div className="rpt-summary-strip">
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Pending Lines</span><span className="rpt-sum-val">{totals.items}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">POs Affected</span><span className="rpt-sum-val">{totals.pos}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Pending Qty</span><span className="rpt-sum-val">{fmt(totals.pendingQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Pending Value</span><span className="rpt-sum-val">{fmt(totals.pendingValue, 2)}</span></div>
                </div>
            )}

            {rows === null && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">🚚</div><div>Set filters and click <strong>Run Report</strong></div></div>
            )}
            {rows && rows.length === 0 && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">✅</div><div>No pending PO items found</div></div>
            )}

            {rows && rows.length > 0 && (
                <>
                    <div className="rpt-toolbar">
                        <span className="rpt-row-count">{sorted.length} line{sorted.length !== 1 ? 's' : ''}</span>
                        <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>
                    </div>
                    <div className="rpt-table-wrap">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th className="rpt-th-num">#</th>
                                    <Th col="poNumber"     label="PO Number"    cls="rpt-th-sm" />
                                    <Th col="poDate"       label="PO Date"      cls="rpt-th-sm" />
                                    <Th col="supplierName" label="Supplier"     />
                                    <Th col="jobId"        label="Job"          cls="rpt-th-xs" />
                                    <Th col="projectName"  label="Project"      />
                                    <Th col="poStatus"     label="Status"       cls="rpt-th-sm" />
                                    <Th col="deliveryDate" label="Delivery"     cls="rpt-th-sm" />
                                    <Th col="itemCode"     label="Item Code"    cls="rpt-th-sm" />
                                    <Th col="itemDesc"     label="Description"  cls="rpt-th-lg" />
                                    <Th col="uomName"      label="UOM"          cls="rpt-th-xs" />
                                    <Th col="orderedQty"   label="Ordered"      cls="rpt-th-num" />
                                    <Th col="receivedQty"  label="Received"     cls="rpt-th-num" />
                                    <Th col="pendingQty"   label="Pending Qty"  cls="rpt-th-num" />
                                    <Th col="pendingValue" label="Pending Val"  cls="rpt-th-num" />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((r, i) => (
                                    <tr key={`${r.poLineId}-${i}`} className="rpt-row-link" onClick={() => navigate(`/purchase-orders/${r.poId}`)}>
                                        <td className="rpt-td-num">{(page - 1) * pageSize + i + 1}</td>
                                        <td><span className="rpt-code-chip">{r.poNumber}</span></td>
                                        <td className="rpt-td-center">{r.poDate ? fmtDate(r.poDate) : '—'}</td>
                                        <td>{r.supplierName}</td>
                                        <td><span className="rpt-code-chip">{r.jobId}</span></td>
                                        <td>{r.projectName}</td>
                                        <td><StatusBadge status={r.poStatus} /></td>
                                        <td className="rpt-td-center">{r.deliveryDate ? fmtDate(r.deliveryDate) : '—'}</td>
                                        <td><span className="rpt-code-chip">{r.itemCode}</span></td>
                                        <td className="rpt-td-desc">{r.itemDesc}</td>
                                        <td className="rpt-td-center rpt-td-muted">{r.uomName}</td>
                                        <td className="rpt-td-num">{fmt(r.orderedQty, 2)}</td>
                                        <td className="rpt-td-num">{fmt(r.receivedQty, 2)}</td>
                                        <td className="rpt-td-num rpt-qty-warn">{fmt(r.pendingQty, 2)}</td>
                                        <td className="rpt-td-num rpt-amount">{fmt(r.pendingValue, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} pageSize={pageSize}
                        totalRows={sorted.length} onPage={setPage} onPageSize={v => { setPageSize(v); setPage(1); }} />
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB 4 — Issue Items Per Job
// ═══════════════════════════════════════════════════════════════════════════════
const IssueItemsTab = ({ jobs }) => {
    const navigate = useNavigate();
    const [jobId,    setJobId]    = useState('');
    const [status,   setStatus]   = useState('');
    const [rows,     setRows]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('issueDate');
    const [sortDir,  setSortDir]  = useState('desc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(200);

    const ISSUE_STATUSES = ['Draft', 'Approved', 'Issued', 'Cancelled'];

    const run = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (jobId)  p.set('jobId',  jobId);
        if (status) p.set('status', status);
        try {
            const res  = await fetch(`${variables.API_URL}reports/backlog/issue-items?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [jobId, status]);

    const handleSort = col => {
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

    const totals = useMemo(() => {
        if (!rows || !rows.length) return null;
        return {
            items:      rows.length,
            issues:     new Set(rows.map(r => r.issueId)).size,
            totalQty:   rows.reduce((s, r) => s + (r.qty       || 0), 0),
            totalValue: rows.reduce((s, r) => s + (r.lineTotal || 0), 0),
        };
    }, [rows]);

    const exportCsv = () => {
        const hdrs = ['#','Issue No','Issue Date','Job','Project','Status','Issued To','Line #','Item Code','Description','Qty','UOM','Unit Cost','Line Total','Notes'];
        const lines = [hdrs.join(','), ...sorted.map((r,i) => [
            i+1, r.issueNo, r.issueDate ? fmtDate(r.issueDate) : '',
            r.jobId, r.projectName, r.status, r.issuedTo,
            r.lineNum, r.itemCode, r.itemDesc,
            r.qty, r.uomName, r.unitCost, r.lineTotal, r.notes,
        ].map(esc).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href = url; a.download = `Issue_Items_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    return (
        <div>
            <div className="rpt-filter-bar">
                <div className="rpt-filter-group">
                    <label>Job</label>
                    <select value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} – {j.projectName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)}>
                        <option value="">All Statuses</option>
                        {ISSUE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-actions">
                    <button className="rpt-btn-run" onClick={run} disabled={loading}>
                        {loading ? '⏳ Loading…' : '▶ Run Report'}
                    </button>
                    <button className="rpt-btn-clear" onClick={() => { setJobId(''); setStatus(''); setRows(null); setPage(1); }}>
                        ✕ Clear
                    </button>
                </div>
            </div>

            {error && <div className="rpt-error">{error}</div>}

            {totals && (
                <div className="rpt-summary-strip">
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Lines</span><span className="rpt-sum-val">{totals.items}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Issues</span><span className="rpt-sum-val">{totals.issues}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Qty Issued</span><span className="rpt-sum-val">{fmt(totals.totalQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total Value</span><span className="rpt-sum-val">{fmt(totals.totalValue, 2)}</span></div>
                </div>
            )}

            {rows === null && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📦</div><div>Set filters and click <strong>Run Report</strong></div></div>
            )}
            {rows && rows.length === 0 && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📭</div><div>No issue items found</div></div>
            )}

            {rows && rows.length > 0 && (
                <>
                    <div className="rpt-toolbar">
                        <span className="rpt-row-count">{sorted.length} line{sorted.length !== 1 ? 's' : ''}</span>
                        <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>
                    </div>
                    <div className="rpt-table-wrap">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th className="rpt-th-num">#</th>
                                    <Th col="issueNo"    label="Issue No"     cls="rpt-th-sm" />
                                    <Th col="issueDate"  label="Date"         cls="rpt-th-sm" />
                                    <Th col="jobId"      label="Job"          cls="rpt-th-xs" />
                                    <Th col="projectName" label="Project"     />
                                    <Th col="status"     label="Status"       cls="rpt-th-sm" />
                                    <Th col="issuedTo"   label="Issued To"    />
                                    <Th col="itemCode"   label="Item Code"    cls="rpt-th-sm" />
                                    <Th col="itemDesc"   label="Description"  cls="rpt-th-lg" />
                                    <Th col="qty"        label="Qty"          cls="rpt-th-num" />
                                    <Th col="uomName"    label="UOM"          cls="rpt-th-xs" />
                                    <Th col="unitCost"   label="Unit Cost"    cls="rpt-th-num" />
                                    <Th col="lineTotal"  label="Line Total"   cls="rpt-th-num" />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((r, i) => (
                                    <tr key={`${r.issueLineId}-${i}`} className="rpt-row-link" onClick={() => navigate(`/inventory-issue/${r.issueId}`)}>
                                        <td className="rpt-td-num">{(page - 1) * pageSize + i + 1}</td>
                                        <td><span className="rpt-code-chip">{r.issueNo}</span></td>
                                        <td className="rpt-td-center">{r.issueDate ? fmtDate(r.issueDate) : '—'}</td>
                                        <td><span className="rpt-code-chip">{r.jobId}</span></td>
                                        <td>{r.projectName}</td>
                                        <td><StatusBadge status={r.status} /></td>
                                        <td className="rpt-td-muted">{r.issuedTo}</td>
                                        <td><span className="rpt-code-chip">{r.itemCode}</span></td>
                                        <td className="rpt-td-desc">{r.itemDesc}</td>
                                        <td className="rpt-td-num">{fmt(r.qty, 2)}</td>
                                        <td className="rpt-td-center rpt-td-muted">{r.uomName}</td>
                                        <td className="rpt-td-num">{fmt(r.unitCost, 2)}</td>
                                        <td className="rpt-td-num rpt-amount">{fmt(r.lineTotal, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} pageSize={pageSize}
                        totalRows={sorted.length} onPage={setPage} onPageSize={v => { setPageSize(v); setPage(1); }} />
                </>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT — Procurement Backlog Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
const BacklogReport = () => {
    const [activeTab,  setActiveTab]  = useState('bom');
    const [jobs,       setJobs]       = useState([]);
    const [suppliers,  setSuppliers]  = useState([]);

    // Load jobs and suppliers for all dropdowns
    useEffect(() => {
        const h = authHeaders();
        // Jobs
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
        // Suppliers
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1&sortCol=SupplierName&sortDir=ASC`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers(d.data || []))
            .catch(() => {});
    }, []);

    const activeTab_cfg = TAB_CFG.find(t => t.key === activeTab);

    return (
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: activeTab_cfg.grad }}>⏳</div>
                <div>
                    <div className="rpt-header-title">Procurement Backlog Dashboard</div>
                    <div className="rpt-header-sub">Track pending items across BOM → PR → PO → GRN and Issue Notes</div>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="rpt-tabs">
                {TAB_CFG.map(t => (
                    <button
                        key={t.key}
                        className={`rpt-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                        style={activeTab === t.key ? { borderBottomColor: t.accent, color: t.accent } : {}}
                        onClick={() => setActiveTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Tab panels ── */}
            <div className="rpt-tab-panel">
                {activeTab === 'bom'   && <BomToPrTab   jobs={jobs} />}
                {activeTab === 'pr'    && <PrToPoTab    jobs={jobs} />}
                {activeTab === 'po'    && <PoToGrnTab   jobs={jobs} suppliers={suppliers} />}
                {activeTab === 'issue' && <IssueItemsTab jobs={jobs} />}
            </div>

        </div>
    );
};

export default BacklogReport;

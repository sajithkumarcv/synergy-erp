import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today       = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;

const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    dateFrom:       firstOfYear(),
    dateTo:         today(),
    customerId:     '',
    jobTypeId:      '',
    jobStageId:     '',
    jobStatusId:    '',
    approvalStatus: '',
    overBudgetOnly: false,
};

// ── Budget status pill ────────────────────────────────────────────────────
const STATUS_CFG = {
    Over:        { bg: '#fee2e2', color: '#b91c1c', label: 'Over Budget' },
    Within:      { bg: '#dcfce7', color: '#166534', label: 'Within Budget' },
    'No Budget': { bg: '#fef9c3', color: '#854d0e', label: 'No Budget' },
};
const BudgetPill = ({ status }) => {
    const cfg = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#64748b', label: status };
    return (
        <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 9px',
            borderRadius: 20, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {cfg.label}
        </span>
    );
};

// ── CSV export (job-level) ────────────────────────────────────────────────
const exportCsv = (rows) => {
    const headers = ['#', 'Job ID', 'Project', 'Type', 'Customer', 'Status', 'CCY', 'Rate',
        'Budget (base)', 'Actual (base)', 'Variance (base)', 'Variance %', 'Over Headers', 'Budget Status'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.jobId, r.projectName, r.jobTypeName, r.customerName, r.jobStatusName,
            r.currencySymbol, r.exchangeRate, r.totalBudgetBase, r.totalActualBase, r.varianceBase,
            r.variancePct == null ? '' : Number(r.variancePct).toFixed(1), r.overCategoryCount, r.budgetStatus,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Job_Budget_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
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
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalRows);
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong> records</div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)}        disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) => p === '…'
                    ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
                    : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>)}
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

// ═══════════════════════════════════════════════════════════════════════
const JobBudgetReport = () => {
    const navigate = useNavigate();
    const { lookups, getModuleStatuses, baseCurrencyCode } = useLookup();

    const [filters,  setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [jobs,     setJobs]     = useState(null);
    const [cats,     setCats]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('varianceBase');
    const [sortDir,  setSortDir]  = useState('asc');   // most-over first (variance ascending = most negative)
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [expanded, setExpanded] = useState({});      // jobId -> bool

    const [customers, setCustomers] = useState([]);
    const [jobTypes,  setJobTypes]  = useState([]);
    const [jobStages, setJobStages] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}customer/search?pageSize=500&page=1&sortCol=CustomerName&sortDir=ASC`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] }).then(d => setCustomers(d.data || [])).catch(() => {});
        fetch(`${variables.API_URL}job/types`, { headers: h })
            .then(r => r.ok ? r.json() : []).then(d => setJobTypes(Array.isArray(d) ? d : [])).catch(() => {});
        fetch(`${variables.API_URL}job/stages`, { headers: h })
            .then(r => r.ok ? r.json() : []).then(d => setJobStages(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1); setExpanded({});
        const p = new URLSearchParams();
        if (filters.dateFrom)       p.set('dateFrom',       filters.dateFrom);
        if (filters.dateTo)         p.set('dateTo',         filters.dateTo);
        if (filters.customerId)     p.set('customerId',     filters.customerId);
        if (filters.jobTypeId)      p.set('jobTypeId',      filters.jobTypeId);
        if (filters.jobStageId)     p.set('jobStageId',     filters.jobStageId);
        if (filters.jobStatusId)    p.set('jobStatusId',    filters.jobStatusId);
        if (filters.approvalStatus) p.set('approvalStatus', filters.approvalStatus);
        if (filters.overBudgetOnly) p.set('overBudgetOnly', 'true');
        try {
            const res  = await fetch(`${variables.API_URL}reports/job-budget?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setJobs([]); setCats([]); return; }
            setJobs(data.jobs || []);
            setCats(data.categories || []);
        } catch { setError('Network error.'); setJobs([]); setCats([]); }
        finally { setLoading(false); }
    }, [filters]);

    const catsByJob = useMemo(() => {
        const m = {};
        cats.forEach(c => { (m[c.jobId] = m[c.jobId] || []).push(c); });
        return m;
    }, [cats]);

    const handleSort = (col) => {
        setPage(1);
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => {
        if (!jobs) return [];
        return [...jobs].sort((a, b) => {
            let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
            if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
            return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [jobs, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    const totals = useMemo(() => {
        if (!jobs || jobs.length === 0) return null;
        return {
            count:       jobs.length,
            overCount:   jobs.filter(j => j.budgetStatus === 'Over').length,
            noBudget:    jobs.filter(j => j.budgetStatus === 'No Budget').length,
            budgetBase:  jobs.reduce((s, r) => s + (r.totalBudgetBase || 0), 0),
            actualBase:  jobs.reduce((s, r) => s + (r.totalActualBase || 0), 0),
            get varianceBase() { return this.budgetBase - this.actualBase; },
        };
    }, [jobs]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setJobs(null); setCats([]); setPage(1); setExpanded({}); };
    const toggle   = (jobId) => setExpanded(e => ({ ...e, [jobId]: !e[jobId] }));

    // ── Print / PDF (clean isolated window) ──────────────────────────────────
    const printReport = () => {
        if (!sorted || sorted.length === 0) return;
        const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const fb = [];
        if (filters.dateFrom || filters.dateTo) fb.push(`Period: ${filters.dateFrom || '…'} → ${filters.dateTo || '…'}`);
        if (filters.overBudgetOnly) fb.push('Over-budget only');
        const rowsHtml = sorted.map((r, i) => {
            const over = (r.varianceBase || 0) < 0;
            const overCats = (catsByJob[r.jobId] || []).filter(c => c.isOver);
            const sub = overCats.length
                ? `<tr class="sub"><td></td><td colspan="10">⚠ Over headers: ${overCats.map(c => `${esc(c.categoryName)} (${fmt(c.variance)})`).join(' · ')}</td></tr>`
                : '';
            return `<tr class="${over ? 'over' : ''}">
                <td>${i + 1}</td><td class="mono">${esc(r.jobId)}</td><td>${esc(r.projectName || '')}</td>
                <td>${esc(r.customerName || '')}</td><td>${esc(r.jobStatusName || '')}</td>
                <td class="r">${esc(r.currencySymbol || '')}</td>
                <td class="r">${fmt(r.totalBudget)}</td><td class="r">${fmt(r.totalActual)}</td>
                <td class="r ${over ? 'neg' : 'pos'}">${fmt(r.variance)}</td>
                <td class="r">${r.variancePct == null ? '—' : Number(r.variancePct).toFixed(1) + '%'}</td>
                <td class="c">${esc(r.budgetStatus)}</td>
            </tr>${sub}`;
        }).join('');
        const t = totals || {};
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Job Budget Variance Report</title>
<style>
@page { size: A4 landscape; margin: 12mm 10mm 16mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11px; margin: 0; }
h1 { font-size: 17px; margin: 0 0 2px; }
.meta { color: #64748b; font-size: 10.5px; margin-bottom: 10px; }
.sumbar { display: flex; gap: 22px; margin: 8px 0 12px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
.sumbar b { display: block; font-size: 14px; }
.sumbar span { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 4px 7px; border-bottom: 1px solid #e2e8f0; text-align: left; }
th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #475569; }
td.r, th.r { text-align: right; } td.c, th.c { text-align: center; }
td.mono { font-family: 'Courier New', monospace; font-weight: 700; color: #4338ca; }
tr.over td { background: #fef6f6; }
td.neg { color: #b91c1c; font-weight: 700; } td.pos { color: #166534; font-weight: 700; }
tr.sub td { font-size: 10px; color: #b45309; background: #fffbeb; border-bottom: 1px solid #fde68a; }
tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #cbd5e1; }
tbody tr { break-inside: avoid; }
</style></head><body>
<h1>Job Budget Variance Report</h1>
<div class="meta">${fb.join(' &nbsp;·&nbsp; ') || 'All jobs'} &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-GB')}</div>
<div class="sumbar">
  <div><span>Jobs</span><b>${t.count || 0}</b></div>
  <div><span>Over Budget</span><b style="color:#b91c1c">${t.overCount || 0}</b></div>
  <div><span>No Budget</span><b style="color:#854d0e">${t.noBudget || 0}</b></div>
  <div><span>Budget (${esc(baseCurrencyCode)})</span><b style="color:#1e40af">${fmt(t.budgetBase)}</b></div>
  <div><span>Actual (${esc(baseCurrencyCode)})</span><b>${fmt(t.actualBase)}</b></div>
  <div><span>Net Variance (${esc(baseCurrencyCode)})</span><b style="color:${(t.varianceBase || 0) < 0 ? '#b91c1c' : '#166534'}">${fmt(t.varianceBase)}</b></div>
</div>
<table>
<thead><tr><th>#</th><th>Job ID</th><th>Project</th><th>Customer</th><th>Status</th><th class="r">Curr</th>
<th class="r">Budget</th><th class="r">Actual</th><th class="r">Variance</th><th class="r">Var %</th><th class="c">Budget Status</th></tr></thead>
<tbody>${rowsHtml}</tbody>
<tfoot><tr><td colspan="6" class="r">Totals (${esc(baseCurrencyCode)} base) — ${t.count || 0} job(s)</td>
<td class="r">${fmt(t.budgetBase)}</td><td class="r">${fmt(t.actualBase)}</td>
<td class="r" style="color:${(t.varianceBase || 0) < 0 ? '#b91c1c' : '#166534'}">${fmt(t.varianceBase)}</td><td colspan="2"></td></tr></tfoot>
</table></body></html>`;
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
    };

    return (
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>📉</div>
                <div>
                    <div className="rpt-header-title">Job Budget Variance Report</div>
                    <div className="rpt-header-sub">
                        {jobs == null ? 'Set filters and click Run Report'
                            : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} · ${totals?.overCount || 0} over budget`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {jobs && jobs.length > 0 && (
                        <>
                            <button className="rpt-btn-export" onClick={printReport}>🖨 Print / PDF</button>
                            <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date From</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} />
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date To</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} />
                    </div>
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Customer</span>
                        <select className="rpt-filter-select" value={filters.customerId} onChange={e => setF('customerId', e.target.value)}>
                            <option value="">All Customers</option>
                            {customers.map(c => <option key={c.customerId} value={c.customerId}>{c.customerName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job Type</span>
                        <select className="rpt-filter-select" value={filters.jobTypeId} onChange={e => setF('jobTypeId', e.target.value)}>
                            <option value="">All Types</option>
                            {jobTypes.map(t => <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Stage</span>
                        <select className="rpt-filter-select" value={filters.jobStageId} onChange={e => setF('jobStageId', e.target.value)}>
                            <option value="">All Stages</option>
                            {jobStages.map(s => <option key={s.jobStageId} value={s.jobStageId}>{s.jobStageName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job Status</span>
                        <select className="rpt-filter-select" value={filters.jobStatusId} onChange={e => setF('jobStatusId', e.target.value)}>
                            <option value="">All Statuses</option>
                            {(lookups.jobStatuses || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Approval</span>
                        <select className="rpt-filter-select" value={filters.approvalStatus} onChange={e => setF('approvalStatus', e.target.value)}>
                            <option value="">All</option>
                            {getModuleStatuses('JOB').map(s => <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#b91c1c', cursor: 'pointer', height: 34 }}>
                            <input type="checkbox" checked={filters.overBudgetOnly} onChange={e => setF('overBudgetOnly', e.target.checked)} />
                            Over budget only
                        </label>
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

            {/* ── Summary strip ── */}
            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Jobs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Over Budget</div>
                        <div className="rpt-summary-val" style={{ color: '#b91c1c' }}>{totals.overCount}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">No Budget Set</div>
                        <div className="rpt-summary-val" style={{ color: '#854d0e' }}>{totals.noBudget}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Budget ({baseCurrencyCode})</div>
                        <div className="rpt-summary-val blue">{fmt(totals.budgetBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Actual ({baseCurrencyCode})</div>
                        <div className={`rpt-summary-val ${totals.actualBase > totals.budgetBase ? 'amber' : 'blue'}`}>{fmt(totals.actualBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Net Variance ({baseCurrencyCode})</div>
                        <div className="rpt-summary-val" style={{ color: totals.varianceBase < 0 ? '#b91c1c' : '#166534' }}>{fmt(totals.varianceBase)}</div>
                    </div>
                </div>
            )}

            {/* ── Content ── */}
            <div className="rpt-content">
                {loading && (<div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>)}
                {!loading && jobs === null && !error && (
                    <div className="rpt-state"><div className="rpt-state-icon">📊</div>
                        <span>Set your filters above and click <strong>Run Report</strong></span></div>
                )}
                {!loading && jobs !== null && jobs.length === 0 && (
                    <div className="rpt-state"><div className="rpt-state-icon">🔍</div>
                        <span>No jobs match the selected filters.</span></div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 32 }}></th>
                                        <th className="c" style={{ width: 42 }}>#</th>
                                        <Th col="jobId"         label="Job ID" />
                                        <Th col="projectName"   label="Project" />
                                        <Th col="jobTypeName"   label="Type" />
                                        <Th col="customerName"  label="Customer" />
                                        <Th col="jobStatusName" label="Status" />
                                        <Th col="currencySymbol" label="Curr" cls="r" />
                                        <Th col="totalBudget"   label="Budget" cls="r" />
                                        <Th col="totalActual"   label="Actual" cls="r" />
                                        <Th col="variance"      label="Variance" cls="r" />
                                        <Th col="variancePct"   label="Var %" cls="r" />
                                        <Th col="overCategoryCount" label="Over Hdrs" cls="r" />
                                        <Th col="budgetStatus"  label="Budget Status" cls="c" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => {
                                        const isOpen = !!expanded[r.jobId];
                                        const rowCats = catsByJob[r.jobId] || [];
                                        const overVar = (r.varianceBase || 0) < 0;
                                        return (
                                            <React.Fragment key={r.jobId}>
                                                <tr style={{ background: r.budgetStatus === 'Over' ? '#fef6f6' : undefined }}>
                                                    <td className="c">
                                                        <button onClick={() => toggle(r.jobId)} title="Show budget headers"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12 }}>
                                                            {isOpen ? '▾' : '▸'}
                                                        </button>
                                                    </td>
                                                    <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                                    <td>
                                                        <span onClick={() => navigate(`/jobs/${r.jobId}`)} style={{
                                                            fontFamily: 'Courier New', fontWeight: 700, color: '#4338ca', fontSize: 11.5,
                                                            background: '#e0e7ff', padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
                                                            {r.jobId}
                                                        </span>
                                                    </td>
                                                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                                                        {r.projectName || <span className="muted">—</span>}
                                                    </td>
                                                    <td><span style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '1px 7px', borderRadius: 10 }}>{r.jobTypeName || '—'}</span></td>
                                                    <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.customerName || <span className="muted">—</span>}</td>
                                                    <td style={{ fontSize: 11.5, color: '#475569' }}>{r.jobStatusName || '—'}</td>
                                                    <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#64748b' }}>{r.currencySymbol || '—'}</td>
                                                    <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>{fmt(r.totalBudget)}</td>
                                                    <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: overVar ? '#b91c1c' : '#475569', fontSize: 12.5 }}>{fmt(r.totalActual)}</td>
                                                    <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: overVar ? '#b91c1c' : '#166534', fontSize: 12.5 }}>{fmt(r.variance)}</td>
                                                    <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: overVar ? '#b91c1c' : '#64748b', fontSize: 12 }}>
                                                        {r.variancePct == null ? <span className="muted">—</span> : `${Number(r.variancePct) > 0 ? '+' : ''}${Number(r.variancePct).toFixed(1)}%`}
                                                    </td>
                                                    <td className="r" style={{ fontWeight: 700, color: r.overCategoryCount > 0 ? '#b91c1c' : '#94a3b8', fontSize: 12 }}>{r.overCategoryCount || '—'}</td>
                                                    <td className="c"><BudgetPill status={r.budgetStatus} /></td>
                                                </tr>
                                                {isOpen && (
                                                    <tr>
                                                        <td colSpan={14} style={{ padding: 0, background: '#f8fafc' }}>
                                                            <div style={{ padding: '6px 18px 10px 52px' }}>
                                                                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', margin: '4px 0 6px' }}>
                                                                    Budget Headers — {r.currencySymbol || ''}
                                                                </div>
                                                                {rowCats.length === 0 ? (
                                                                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No budget headers or actuals recorded.</div>
                                                                ) : (
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                                        <thead>
                                                                            <tr style={{ color: '#64748b', textAlign: 'left' }}>
                                                                                <th style={{ padding: '3px 8px', fontWeight: 600 }}>Cost Header</th>
                                                                                <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'right' }}>Budgeted</th>
                                                                                <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'right' }}>Actual</th>
                                                                                <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'right' }}>Variance</th>
                                                                                <th style={{ padding: '3px 8px', fontWeight: 600, textAlign: 'center' }}>Status</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {rowCats.map((c, ci) => (
                                                                                <tr key={`${r.jobId}-${c.costCategoryId ?? 'unc'}-${ci}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                                                    <td style={{ padding: '3px 8px', fontWeight: c.costCategoryId == null ? 600 : 500, color: c.costCategoryId == null ? '#854d0e' : '#334155', fontStyle: c.costCategoryId == null ? 'italic' : 'normal' }}>
                                                                                        {c.categoryName}
                                                                                    </td>
                                                                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1e40af' }}>{fmt(c.budgeted)}</td>
                                                                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace', color: c.isOver ? '#b91c1c' : '#475569' }}>{fmt(c.actual)}</td>
                                                                                    <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: c.isOver ? '#b91c1c' : '#166534' }}>{fmt(c.variance)}</td>
                                                                                    <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                                                                                        {c.isOver
                                                                                            ? <span style={{ color: '#b91c1c', fontSize: 10.5, fontWeight: 700 }}>OVER</span>
                                                                                            : <span style={{ color: '#166534', fontSize: 10.5, fontWeight: 600 }}>OK</span>}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals ({baseCurrencyCode} base) — {totals.count} job{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af' }}>{fmt(totals.budgetBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: totals.actualBase > totals.budgetBase ? '#b91c1c' : '#475569' }}>{fmt(totals.actualBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: totals.varianceBase < 0 ? '#b91c1c' : '#166534' }}>{fmt(totals.varianceBase)}</td>
                                            <td colSpan={3}></td>
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

export default JobBudgetReport;

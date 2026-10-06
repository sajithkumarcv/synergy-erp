import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { fmt, fmtDate, statusBadgeCfg } from '../procurementConstants';
import '../Procurement.css';
import './PrPendingPo.css';

// Purchaser worklist: purchase requests that still have lines waiting for a PO.
// Data: GET purchaserequest/pending-po (sp_GetPrPendingPo) - one row per pending PR line, grouped here by PR.
// The status filter picks which PR statuses to include (default Approved + Partial); PRs of Completed /
// Cancelled jobs are never listed.

const AGE_OPTIONS = [
    { value: 0,  label: 'Any age' },
    { value: 3,  label: 'Over 3 days' },
    { value: 7,  label: 'Over 7 days' },
    { value: 14, label: 'Over 14 days' },
];
const DEFAULT_STATUSES = ['Approved', 'Partial'];
const HIDDEN_STATUSES  = ['Cancelled', 'Rejected'];   // never carry lines that wait for a PO

const csvEsc = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const PrPendingPo = () => {
    const navigate = useNavigate();
    const { getModuleStatuses, getStatusConfig, getVList } = useLookup();

    const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
    const [jobId,    setJobId]    = useState('');
    const [priority, setPriority] = useState('');
    const [minDays,  setMinDays]  = useState(0);
    const [search,   setSearch]   = useState('');
    const [lines,    setLines]    = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [open,     setOpen]     = useState({});            // prId -> expanded
    const [jobs,     setJobs]     = useState([]);

    // Job dropdown: Completed (4) and Cancelled (5) jobs are not offered.
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&jobStatusIds=1,2,3`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const load = useCallback(() => {
        setLoading(true); setError('');
        const q = new URLSearchParams();
        q.set('status', statuses.length ? statuses.join(',') : DEFAULT_STATUSES.join(','));
        if (jobId)    q.set('jobId', jobId);
        if (priority) q.set('priority', priority);
        fetch(`${variables.API_URL}purchaserequest/pending-po?${q}`, { headers: authHeaders() })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`); return d; })
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(e => { setError(e.message || 'Could not load the list.'); setLines([]); })
            .finally(() => setLoading(false));
    }, [statuses, jobId, priority]);

    useEffect(() => { load(); }, [load]);

    // lines -> one entry per PR (age / search filters applied here, on the client)
    const prs = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const map = new Map();
        lines.forEach(l => {
            let p = map.get(l.prId);
            if (!p) {
                p = { prId: l.prId, prNumber: l.prNumber, prDate: l.prDate, approvedDate: l.approvedDate, jobId: l.jobId,
                      jobName: l.jobName, priority: l.priority, prStatus: l.prStatus, requestedBy: l.requestedBy,
                      daysWaiting: l.daysWaiting, totalLines: l.totalLines, value: 0, lines: [] };
                map.set(l.prId, p);
            }
            p.lines.push(l);
            p.value += Number(l.pendingValue) || 0;
        });
        let list = [...map.values()];
        if (minDays > 0) list = list.filter(p => p.daysWaiting > minDays);
        if (needle) {
            list = list.filter(p =>
                `${p.prNumber} ${p.jobId || ''} ${p.jobName || ''} ${p.requestedBy || ''}`.toLowerCase().includes(needle) ||
                p.lines.some(l => `${l.itemCode || ''} ${l.itemDesc || ''}`.toLowerCase().includes(needle)));
        }
        return list.sort((a, b) => b.daysWaiting - a.daysWaiting || a.prNumber.localeCompare(b.prNumber));
    }, [lines, minDays, search]);

    const totals = useMemo(() => ({
        prs:   prs.length,
        lines: prs.reduce((s, p) => s + p.lines.length, 0),
        value: prs.reduce((s, p) => s + p.value, 0),
        late:  prs.filter(p => p.daysWaiting > 7).length,
    }), [prs]);

    const statusOptions = useMemo(
        () => (getModuleStatuses('PR') || []).filter(s => !HIDDEN_STATUSES.includes(s.statusCode)),
        [getModuleStatuses]);

    const toggleStatus = (code) =>
        setStatuses(cur => cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code]);

    const exportCsv = () => {
        const hdr = ['PR No', 'PR Date', 'Approved', 'Days waiting', 'Status', 'Job', 'Priority', 'Line', 'Item code', 'Item', 'UOM',
                     'Required qty', 'PO created qty', 'Pending qty', 'Est. unit price', 'Pending value', 'Required date',
                     'Last price', 'Last currency', 'Last supplier', 'Last PO date'];
        const rows = [];
        prs.forEach(p => p.lines.forEach(l => rows.push([
            p.prNumber, fmtDate(p.prDate), p.approvedDate ? fmtDate(p.approvedDate) : '', p.daysWaiting, p.prStatus, p.jobId || '', p.priority || '',
            l.lineNum, l.itemCode, l.itemDesc, l.uomName, l.requiredQty, l.poCreatedQty, l.pendingQty, l.estUnitPrice ?? '', l.pendingValue,
            l.requiredDate ? fmtDate(l.requiredDate) : '', l.lastPrice ?? '', l.lastPriceCurrency || '', l.lastSupplier || '',
            l.lastPoDate ? fmtDate(l.lastPoDate) : '',
        ].map(csvEsc).join(','))));
        const blob = new Blob([[hdr.map(csvEsc).join(','), ...rows].join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `PRs_pending_PO_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const statusBadge = (code) => {
        const cfg = statusBadgeCfg(getStatusConfig('PR', code)) || {};
        return (
            <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                <span className="po-status-dot" style={{ background: cfg.dot }} />{cfg.label || code}
            </span>
        );
    };

    const ageClass = (d) => d > 14 ? 'ppo-age-red' : d > 7 ? 'ppo-age-amber' : '';
    const priorities = getVList('Procurement', 'Priority') || [];

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">PRs pending PO</div>
                            <div className="po-page-sub">Purchase requests with lines still waiting for a purchase order · oldest first</div>
                        </div>
                        <div className="po-toolbar">
                            <button className="po-btn-sec" onClick={load} disabled={loading}>↻ Refresh</button>
                            <button className="po-btn-sec" onClick={exportCsv} disabled={!prs.length}>⬇ Export CSV</button>
                        </div>
                    </div>

                    <div className="ppo-tiles">
                        <div className="ppo-tile"><span>PRs waiting</span><b>{totals.prs}</b></div>
                        <div className="ppo-tile"><span>Lines pending</span><b>{totals.lines}</b></div>
                        <div className="ppo-tile"><span>Est. value</span><b>{fmt(totals.value)}</b></div>
                        <div className={`ppo-tile${totals.late ? ' ppo-tile-red' : ''}`}><span>Waiting over 7 days</span><b>{totals.late}</b></div>
                    </div>

                    <div className="ppo-filters">
                        <input className="po-select ppo-search" placeholder="Search PR no., item, job…" value={search} onChange={e => setSearch(e.target.value)} />
                        <select className="po-select" value={jobId} onChange={e => setJobId(e.target.value)}>
                            <option value="">All jobs</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                        <select className="po-select" value={priority} onChange={e => setPriority(e.target.value)}>
                            <option value="">All priorities</option>
                            {priorities.map(p => <option key={p.value ?? p.code ?? p} value={p.value ?? p.code ?? p}>{p.label ?? p.name ?? p.value ?? p}</option>)}
                        </select>
                        <select className="po-select" value={minDays} onChange={e => setMinDays(Number(e.target.value))}>
                            {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="ppo-status-row">
                        <span className="ppo-status-label">PR status</span>
                        {statusOptions.map(s => (
                            <label key={s.statusCode} className={`ppo-chip${statuses.includes(s.statusCode) ? ' on' : ''}`}>
                                <input type="checkbox" checked={statuses.includes(s.statusCode)} onChange={() => toggleStatus(s.statusCode)} />
                                {s.statusLabel || s.statusCode}
                            </label>
                        ))}
                    </div>
                </div>

                {error && <div className="ppo-error">⚠ {error}</div>}

                <div className="po-table-wrap">
                    <table className={`po-table rt-cards${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <th>PR no.</th><th>Approved</th><th>Job</th><th>Status</th><th>Priority</th>
                                <th style={{ textAlign: 'right' }}>Waiting</th>
                                <th style={{ textAlign: 'right' }}>Lines</th>
                                <th style={{ textAlign: 'right' }}>Est. value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && prs.length === 0 && (
                                <tr><td colSpan={8} className="po-empty">Nothing is waiting for a PO with these filters.</td></tr>
                            )}
                            {prs.map(p => (
                                <React.Fragment key={p.prId}>
                                    <tr className="ppo-row" onClick={() => setOpen(o => ({ ...o, [p.prId]: !o[p.prId] }))}>
                                        <td data-label="PR no.">
                                            <span className="ppo-arrow">{open[p.prId] ? '▾' : '▸'}</span>
                                            <span className="po-num-link" onClick={e => { e.stopPropagation(); navigate(`/purchase-requests/${p.prId}`); }}>{p.prNumber}</span>
                                        </td>
                                        <td data-label="Approved">{p.approvedDate ? fmtDate(p.approvedDate) : <span className="ppo-muted">not approved</span>}</td>
                                        <td data-label="Job" title={p.jobName || ''}>{p.jobId || '—'}</td>
                                        <td data-label="Status">{statusBadge(p.prStatus)}</td>
                                        <td data-label="Priority">{p.priority || '—'}</td>
                                        <td data-label="Waiting" className={`po-num-cell ${ageClass(p.daysWaiting)}`}>{p.daysWaiting} {p.daysWaiting === 1 ? 'day' : 'days'}</td>
                                        <td data-label="Lines" className="po-num-cell">{p.lines.length} of {p.totalLines}</td>
                                        <td data-label="Est. value" className="po-num-cell">{fmt(p.value)}</td>
                                    </tr>
                                    {open[p.prId] && (
                                        <tr className="ppo-detail">
                                            <td colSpan={8}>
                                                <div className="ppo-lines">
                                                    <div className="ppo-line ppo-line-head">
                                                        <span>Item</span><span>Pending</span><span>Required</span><span>Last purchase</span>
                                                    </div>
                                                    {p.lines.map(l => {
                                                        const late = l.requiredDate && new Date(l.requiredDate) < new Date();
                                                        return (
                                                            <div className="ppo-line" key={l.prLineId}>
                                                                <span><b>{l.itemCode}</b> {l.itemDesc}</span>
                                                                <span>{fmt(l.pendingQty)} {l.uomName}{l.poCreatedQty > 0 && <i className="ppo-muted"> (of {fmt(l.requiredQty)})</i>}</span>
                                                                <span className={late ? 'ppo-age-red' : ''}>{l.requiredDate ? fmtDate(l.requiredDate) : '—'}</span>
                                                                <span className={l.lastPrice == null ? 'ppo-muted' : ''}>
                                                                    {l.lastPrice == null
                                                                        ? 'no purchase history'
                                                                        : `${fmt(l.lastPrice)} ${l.lastPriceCurrency || ''} · ${l.lastSupplier || '—'} · ${fmtDate(l.lastPoDate)}`}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PrPendingPo;

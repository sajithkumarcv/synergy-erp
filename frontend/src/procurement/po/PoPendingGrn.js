import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { fmt, fmtDate, statusBadgeCfg } from '../procurementConstants';
import '../Procurement.css';
import '../pr/PrPendingPo.css';   // same worklist look as "PRs pending PO" (ppo-* classes)

// Purchaser / store worklist: purchase orders that still have lines waiting to be received (GRN).
// Data: GET purchaseorder/pending-grn (sp_GetPoPendingGrn) - one row per open PO line, grouped here by PO.
// The status chips pick which PO statuses to include (default Approved + Sent + Partial); POs of Completed /
// Cancelled jobs are never listed. Receipt / delivery / search filters work on the loaded rows in the browser.

const DEFAULT_STATUSES = ['Approved', 'Sent', 'Partial'];
const SHOWN_STATUSES   = ['Approved', 'Sent', 'Partial', 'Hold'];   // statuses that can still be waiting for goods
const RECEIPT_OPTIONS = [
    { value: '',        label: 'All open lines' },
    { value: 'none',    label: 'Not received yet' },
    { value: 'partial', label: 'Partially received' },
];
const DELIVERY_OPTIONS = [
    { value: 0,  label: 'Any delivery date' },
    { value: -1, label: 'Overdue (any)' },
    { value: 7,  label: 'Overdue over 7 days' },
    { value: 30, label: 'Overdue over 30 days' },
];

const csvEsc = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const PoPendingGrn = () => {
    const navigate = useNavigate();
    const { getModuleStatuses, getStatusConfig, baseCurrencyCode } = useLookup();

    const [statuses,   setStatuses]   = useState(DEFAULT_STATUSES);
    const [supplierId, setSupplierId] = useState('');
    const [jobId,      setJobId]      = useState('');
    const [receipt,    setReceipt]    = useState('');
    const [delivery,   setDelivery]   = useState(0);
    const [search,     setSearch]     = useState('');
    const [lines,      setLines]      = useState([]);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [open,       setOpen]       = useState({});            // poId -> expanded
    const [jobs,       setJobs]       = useState([]);
    const [suppliers,  setSuppliers]  = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&jobStatusIds=1,2,3`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers((d.data || []).sort((a, b) => (a.supplierName || '').localeCompare(b.supplierName || ''))))
            .catch(() => {});
    }, []);

    const load = useCallback(() => {
        setLoading(true); setError('');
        const q = new URLSearchParams();
        q.set('status', statuses.length ? statuses.join(',') : DEFAULT_STATUSES.join(','));
        if (supplierId) q.set('supplierId', supplierId);
        if (jobId)      q.set('jobId', jobId);
        fetch(`${variables.API_URL}purchaseorder/pending-grn?${q}`, { headers: authHeaders() })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`); return d; })
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(e => { setError(e.message || 'Could not load the list.'); setLines([]); })
            .finally(() => setLoading(false));
    }, [statuses, supplierId, jobId]);

    useEffect(() => { load(); }, [load]);

    // lines -> one entry per PO (receipt / delivery / search filters applied here, on the client)
    const pos = useMemo(() => {
        const needle = search.trim().toLowerCase();
        const map = new Map();
        lines
            .filter(l => receipt === 'none' ? !(l.receivedQty > 0) : receipt === 'partial' ? l.receivedQty > 0 : true)
            .forEach(l => {
                let p = map.get(l.poId);
                if (!p) {
                    p = { poId: l.poId, poNumber: l.poNumber, poDate: l.poDate, deliveryDate: l.deliveryDate, supplierName: l.supplierName,
                          jobId: l.jobId, jobName: l.jobName, poStatus: l.poStatus, currencyShort: l.currencyShort,
                          approvedDate: l.approvedDate, daysOverdue: l.daysOverdue, totalLines: l.totalLines, value: 0, lines: [] };
                    map.set(l.poId, p);
                }
                p.lines.push(l);
                p.value += Number(l.openValueBase) || 0;
            });
        let list = [...map.values()];
        if (delivery === -1) list = list.filter(p => p.daysOverdue > 0);
        else if (delivery > 0) list = list.filter(p => p.daysOverdue > delivery);
        if (needle) {
            list = list.filter(p =>
                `${p.poNumber} ${p.supplierName || ''} ${p.jobId || ''} ${p.jobName || ''}`.toLowerCase().includes(needle) ||
                p.lines.some(l => `${l.itemCode || ''} ${l.itemDesc || ''}`.toLowerCase().includes(needle)));
        }
        return list.sort((a, b) => b.daysOverdue - a.daysOverdue || String(a.deliveryDate || '9').localeCompare(String(b.deliveryDate || '9')) || a.poNumber.localeCompare(b.poNumber));
    }, [lines, receipt, delivery, search]);

    const totals = useMemo(() => ({
        pos:     pos.length,
        lines:   pos.reduce((s, p) => s + p.lines.length, 0),
        value:   pos.reduce((s, p) => s + p.value, 0),
        overdue: pos.filter(p => p.daysOverdue > 0).length,
    }), [pos]);

    const statusOptions = useMemo(
        () => (getModuleStatuses('PO') || []).filter(s => SHOWN_STATUSES.includes(s.statusCode)),
        [getModuleStatuses]);

    const toggleStatus = (code) =>
        setStatuses(cur => cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code]);

    const exportCsv = () => {
        const hdr = ['PO No', 'PO Date', 'Expected', 'Days overdue', 'Status', 'Supplier', 'Job', 'Line', 'Item code', 'Item', 'UOM',
                     'Ordered', 'Received', 'Open qty', 'Unit price', 'Currency', `Open value (${baseCurrencyCode || 'base'})`, 'Last GRN'];
        const rows = [];
        pos.forEach(p => p.lines.forEach(l => rows.push([
            p.poNumber, fmtDate(p.poDate), p.deliveryDate ? fmtDate(p.deliveryDate) : '', p.daysOverdue, p.poStatus, p.supplierName || '', p.jobId || '',
            l.lineNum, l.itemCode, l.itemDesc, l.uomName, l.orderedQty, l.receivedQty, l.openQty, l.unitPrice ?? '', p.currencyShort || '',
            l.openValueBase, l.lastGrnDate ? fmtDate(l.lastGrnDate) : '',
        ].map(csvEsc).join(','))));
        const blob = new Blob([[hdr.map(csvEsc).join(','), ...rows].join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `POs_pending_GRN_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const statusBadge = (code) => {
        const cfg = statusBadgeCfg(getStatusConfig('PO', code)) || {};
        return (
            <span className="po-status-badge" style={{ background: cfg.bg, color: cfg.color }}>
                <span className="po-status-dot" style={{ background: cfg.dot }} />{cfg.label || code}
            </span>
        );
    };

    const overdueClass = (d) => d > 30 ? 'ppo-age-red' : d > 0 ? 'ppo-age-amber' : '';

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">POs pending GRN</div>
                            <div className="po-page-sub">Purchase orders with lines still waiting to be received · most overdue first</div>
                        </div>
                        <div className="po-toolbar">
                            <button className="po-btn-sec" onClick={load} disabled={loading}>↻ Refresh</button>
                            <button className="po-btn-sec" onClick={exportCsv} disabled={!pos.length}>⬇ Export CSV</button>
                        </div>
                    </div>

                    <div className="ppo-tiles">
                        <div className="ppo-tile"><span>POs waiting</span><b>{totals.pos}</b></div>
                        <div className="ppo-tile"><span>Lines pending</span><b>{totals.lines}</b></div>
                        <div className="ppo-tile"><span>Open value ({baseCurrencyCode})</span><b>{fmt(totals.value)}</b></div>
                        <div className={`ppo-tile${totals.overdue ? ' ppo-tile-red' : ''}`}><span>Past expected date</span><b>{totals.overdue}</b></div>
                    </div>

                    <div className="ppo-filters">
                        <input className="po-select ppo-search" placeholder="Search PO no., supplier, item, job…" value={search} onChange={e => setSearch(e.target.value)} />
                        <select className="po-select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                            <option value="">All suppliers</option>
                            {suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                        </select>
                        <select className="po-select" value={jobId} onChange={e => setJobId(e.target.value)}>
                            <option value="">All jobs</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                        <select className="po-select" value={receipt} onChange={e => setReceipt(e.target.value)}>
                            {RECEIPT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select className="po-select" value={delivery} onChange={e => setDelivery(Number(e.target.value))}>
                            {DELIVERY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="ppo-status-row">
                        <span className="ppo-status-label">PO status</span>
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
                                <th>PO no.</th><th>PO date</th><th>Supplier</th><th>Job</th><th>Status</th><th>Expected</th>
                                <th style={{ textAlign: 'right' }}>Overdue</th>
                                <th style={{ textAlign: 'right' }}>Lines</th>
                                <th style={{ textAlign: 'right' }}>Open value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && pos.length === 0 && (
                                <tr><td colSpan={9} className="po-empty">Nothing is waiting to be received with these filters.</td></tr>
                            )}
                            {pos.map(p => (
                                <React.Fragment key={p.poId}>
                                    <tr className="ppo-row" onClick={() => setOpen(o => ({ ...o, [p.poId]: !o[p.poId] }))}>
                                        <td data-label="PO no.">
                                            <span className="ppo-arrow">{open[p.poId] ? '▾' : '▸'}</span>
                                            <span className="po-num-link" onClick={e => { e.stopPropagation(); navigate(`/purchase-orders/${p.poId}`); }}>{p.poNumber}</span>
                                        </td>
                                        <td data-label="PO date">{p.poDate ? fmtDate(p.poDate) : '—'}</td>
                                        <td data-label="Supplier">{p.supplierName || '—'}</td>
                                        <td data-label="Job" title={p.jobName || ''}>{p.jobId || '—'}</td>
                                        <td data-label="Status">{statusBadge(p.poStatus)}</td>
                                        <td data-label="Expected">{p.deliveryDate ? fmtDate(p.deliveryDate) : <span className="ppo-muted">no date</span>}</td>
                                        <td data-label="Overdue" className={`po-num-cell ${overdueClass(p.daysOverdue)}`}>{p.daysOverdue > 0 ? `${p.daysOverdue} ${p.daysOverdue === 1 ? 'day' : 'days'}` : '—'}</td>
                                        <td data-label="Lines" className="po-num-cell">{p.lines.length} of {p.totalLines}</td>
                                        <td data-label="Open value" className="po-num-cell">{fmt(p.value)}</td>
                                    </tr>
                                    {open[p.poId] && (
                                        <tr className="ppo-detail">
                                            <td colSpan={9}>
                                                <div className="ppo-lines">
                                                    <div className="ppo-line ppo-line-head">
                                                        <span>Item</span><span>Open</span><span>Received</span><span>Last GRN</span>
                                                    </div>
                                                    {p.lines.map(l => (
                                                        <div className="ppo-line" key={l.poLineId}>
                                                            <span><b>{l.itemCode}</b> {l.itemDesc}</span>
                                                            <span>{fmt(l.openQty)} {l.uomName}{l.receivedQty > 0 && <i className="ppo-muted"> (of {fmt(l.orderedQty)})</i>}</span>
                                                            <span className={l.receivedQty > 0 ? '' : 'ppo-muted'}>{l.receivedQty > 0 ? `${fmt(l.receivedQty)} ${l.uomName || ''}` : 'nothing yet'}</span>
                                                            <span className={l.lastGrnDate ? '' : 'ppo-muted'}>{l.lastGrnDate ? fmtDate(l.lastGrnDate) : 'no GRN'}</span>
                                                        </div>
                                                    ))}
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

export default PoPendingGrn;

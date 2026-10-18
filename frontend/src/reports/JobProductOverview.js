import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';
import './JobProductOverview.css';

// Pick a job and a product: the purchase orders for that product on that job (ordered / received) next to the issue
// notes (issue qty / issued qty). Data: GET reports/job-product-overview/products?jobId= (product list) and
// GET reports/job-product-overview?jobId=&itemId= (sp_GetJobProductOverview, two result sets).
// "Issued qty" counts only Confirmed issue notes (a Draft note has not moved stock yet).

const csvEsc = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const poTag  = s => (s === 'Received' || s === 'Closed') ? 'jpo-tag-ok' : (s === 'Partial' || s === 'Approved' || s === 'Sent') ? 'jpo-tag-warn' : 'jpo-tag-grey';
const issTag = s => s === 'Confirmed' ? 'jpo-tag-ok' : s === 'Draft' ? 'jpo-tag-grey' : '';

const JobProductOverview = () => {
    const navigate = useNavigate();

    const [jobs,      setJobs]      = useState([]);
    const [jobId,     setJobId]     = useState('');
    const [products,  setProducts]  = useState([]);
    const [itemId,    setItemId]    = useState('');
    const [data,      setData]      = useState(null);   // { pos, issues }
    const [loading,   setLoading]   = useState(false);
    const [error,     setError]     = useState('');

    // Job dropdown: every job (closed ones too - this is a look-back report)
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=DESC`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    // Products of the chosen job
    useEffect(() => {
        setItemId(''); setData(null); setError('');
        if (!jobId) { setProducts([]); return; }
        fetch(`${variables.API_URL}reports/job-product-overview/products?jobId=${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`); return d; })
            .then(d => setProducts(Array.isArray(d) ? d : []))
            .catch(e => { setError(e.message || 'Could not load the products.'); setProducts([]); });
    }, [jobId]);

    const load = useCallback(() => {
        if (!jobId || !itemId) { setData(null); return; }
        setLoading(true); setError('');
        fetch(`${variables.API_URL}reports/job-product-overview?jobId=${encodeURIComponent(jobId)}&itemId=${itemId}`, { headers: authHeaders() })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.message || `HTTP ${r.status}`); return d; })
            .then(d => setData({ pos: d.pos || [], issues: d.issues || [] }))
            .catch(e => { setError(e.message || 'Could not load the overview.'); setData(null); })
            .finally(() => setLoading(false));
    }, [jobId, itemId]);

    useEffect(() => { load(); }, [load]);

    const totals = useMemo(() => {
        if (!data) return null;
        return {
            purchased: data.pos.reduce((s, r) => s + (r.orderedQty || 0), 0),
            received:  data.pos.reduce((s, r) => s + (r.receivedQty || 0), 0),
            open:      data.pos.reduce((s, r) => s + (r.openQty || 0), 0),
            issued:    data.issues.reduce((s, r) => s + (r.issuedQty || 0), 0),
            drafted:   data.issues.reduce((s, r) => s + ((r.issueQty || 0) - (r.issuedQty || 0)), 0),
        };
    }, [data]);

    const uom = data ? (data.pos[0]?.uomName || data.issues[0]?.uomName || '') : '';
    const product = products.find(p => String(p.itemId) === String(itemId));

    const exportCsv = () => {
        if (!data) return;
        const rows = [
            ['PURCHASE ORDERS'],
            ['PO No', 'PO Date', 'Supplier', 'Status', 'Ordered', 'Received', 'Open', 'UOM', 'Unit price'],
            ...data.pos.map(r => [r.poNumber, r.poDate ? fmtDate(r.poDate) : '', r.supplierName || '', r.poStatus, r.orderedQty, r.receivedQty, r.openQty, r.uomName || '', r.unitPrice ?? '']),
            [],
            ['ISSUE NOTES'],
            ['Issue No', 'Issue Date', 'Status', 'Issued to', 'Issue qty', 'Issued qty', 'UOM', 'Unit cost'],
            ...data.issues.map(r => [r.issueNo, r.issueDate ? fmtDate(r.issueDate) : '', r.status, r.issuedTo || '', r.issueQty, r.issuedQty, r.uomName || '', r.unitCost ?? '']),
        ];
        const blob = new Blob([rows.map(r => r.map(csvEsc).join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Job_${jobId}_${product?.itemCode || itemId}_overview.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#e0e7ff)' }}>📦</div>
                <div>
                    <div className="rpt-header-title">Job – Product Overview</div>
                    <div className="rpt-header-sub">
                        {!jobId ? 'Pick a job, then a product' : !itemId ? 'Now pick a product on this job'
                            : data ? `${data.pos.length} PO line${data.pos.length !== 1 ? 's' : ''} · ${data.issues.length} issue line${data.issues.length !== 1 ? 's' : ''}` : ''}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {data && (data.pos.length > 0 || data.issues.length > 0) && <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>}
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group" style={{ flex: '1 1 320px' }}>
                        <span className="rpt-filter-label">Job</span>
                        <select className="rpt-filter-select" value={jobId} onChange={e => setJobId(e.target.value)}>
                            <option value="">Select a job…</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group" style={{ flex: '1 1 320px' }}>
                        <span className="rpt-filter-label">Product</span>
                        <select className="rpt-filter-select" value={itemId} onChange={e => setItemId(e.target.value)} disabled={!jobId}>
                            <option value="">{!jobId ? 'Select a job first' : products.length ? 'Select a product…' : 'No purchases or issues on this job'}</option>
                            {products.map(p => <option key={p.itemId} value={p.itemId}>{p.itemCode} — {p.itemName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <button className="rpt-btn-run" onClick={load} disabled={!itemId || loading}>{loading ? '⏳ Loading…' : '↻ Refresh'}</button>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total purchased {uom && `(${uom})`}</div><div className="rpt-summary-val blue">{fmt(totals.purchased)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total received</div><div className="rpt-summary-val">{fmt(totals.received)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Still to receive</div><div className="rpt-summary-val amber">{fmt(totals.open)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total issued {uom && `(${uom})`}</div><div className="rpt-summary-val blue">{fmt(totals.issued)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Draft issues (not yet issued)</div><div className="rpt-summary-val amber">{fmt(totals.drafted)}</div></div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Loading…</span></div>}
                {!loading && !data && !error && <div className="rpt-state"><div className="rpt-state-icon">📦</div><span>Pick a <strong>job</strong> and a <strong>product</strong> to see its purchase orders and issues</span></div>}
                {!loading && data && (
                    <div className="jpo-split">
                        <div className="jpo-pane">
                            <div className="jpo-pane-title">Purchase orders <small>{data.pos.length} line{data.pos.length !== 1 ? 's' : ''}</small></div>
                            <div className="rpt-body jpo-scroll">
                                <table className="rpt-table">
                                    <thead><tr>
                                        <th>PO No</th><th>PO Date</th><th>Supplier</th><th>Status</th>
                                        <th className="r">Order Qty</th><th className="r">Rcvd Qty</th><th className="r">Open</th>
                                    </tr></thead>
                                    <tbody>
                                        {data.pos.length === 0 && <tr><td colSpan={7} className="jpo-muted" style={{ textAlign: 'center', padding: 14 }}>No purchase orders for this product on this job.</td></tr>}
                                        {data.pos.map(r => (
                                            <tr key={`${r.poId}-${r.lineNum}`}>
                                                <td><span className="jpo-link" onClick={() => navigate(`/purchase-orders/${r.poId}`)}>{r.poNumber}</span></td>
                                                <td>{r.poDate ? fmtDate(r.poDate) : '—'}</td>
                                                <td title={r.supplierName || ''}>{r.supplierName || '—'}</td>
                                                <td><span className={`jpo-tag ${poTag(r.poStatus)}`}>{r.poStatus}</span></td>
                                                <td className="r" style={{ fontFamily: 'monospace' }}>{fmt(r.orderedQty)}</td>
                                                <td className="r" style={{ fontFamily: 'monospace', color: '#166534' }}>{fmt(r.receivedQty)}</td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: r.openQty > 0 ? '#b45309' : '#94a3b8' }}>{fmt(r.openQty)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="jpo-pane">
                            <div className="jpo-pane-title">Issue notes <small>{data.issues.length} line{data.issues.length !== 1 ? 's' : ''}</small></div>
                            <div className="rpt-body jpo-scroll">
                                <table className="rpt-table">
                                    <thead><tr>
                                        <th>Issue No</th><th>Issue Date</th><th>Issued To</th><th>Status</th>
                                        <th className="r">Issue Qty</th><th className="r">Issued Qty</th>
                                    </tr></thead>
                                    <tbody>
                                        {data.issues.length === 0 && <tr><td colSpan={6} className="jpo-muted" style={{ textAlign: 'center', padding: 14 }}>No issue notes for this product on this job.</td></tr>}
                                        {data.issues.map(r => (
                                            <tr key={`${r.issueId}-${r.lineNum}`}>
                                                <td><span className="jpo-link" onClick={() => navigate(`/inventory-issue/${r.issueId}`)}>{r.issueNo}</span></td>
                                                <td>{r.issueDate ? fmtDate(r.issueDate) : '—'}</td>
                                                <td title={r.issuedTo || ''}>{r.issuedTo || '—'}</td>
                                                <td><span className={`jpo-tag ${issTag(r.status)}`}>{r.status}</span></td>
                                                <td className="r" style={{ fontFamily: 'monospace' }}>{fmt(r.issueQty)}</td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: r.issuedQty > 0 ? '#166534' : '#94a3b8' }}>{fmt(r.issuedQty)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default JobProductOverview;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { fmt, fmtDate } from '../../procurement/procurementConstants';
import { fmtPrice } from '../../common/fmtPrice';
import '../../procurement/Procurement.css';
import '../../procurement/pr/PrPendingPo.css';   // same worklist look (ppo-* classes)

// Stock revaluations (2026-11-14h): every time a received PO line's price changed (Amend PO line, or a revised PO
// re-approved), and every time a cancelled GRN took its revaluation back out. One row per revaluation, newest
// first; open a row for its GRN lines and the job cost charges.
// Data: GET stockbalance/revaluations (sp_GetStockRevaluations), GET stockbalance/revaluations/{id}.

const SOURCE_LABEL = { AMEND: 'PO line amended', APPROVAL: 'Revised PO approved', GRN_CANCEL: 'GRN cancelled' };

const csvEsc = v => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const signed = v => (v > 0 ? '+' : '') + fmt(v);
const signClass = v => (v > 0 ? 'ppo-age-amber' : v < 0 ? 'ppo-age-red' : 'ppo-muted');

const StockRevaluations = () => {
    const navigate = useNavigate();
    const { baseCurrencyCode } = useLookup();

    const [dateFrom, setDateFrom] = useState('');
    const [dateTo,   setDateTo]   = useState('');
    const [search,   setSearch]   = useState('');
    const [rows,     setRows]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [open,     setOpen]     = useState({});   // revalId -> { loading, grnLines, jobLines, error }

    const load = useCallback(() => {
        setLoading(true); setError('');
        const q = new URLSearchParams();
        if (dateFrom) q.set('dateFrom', dateFrom);
        if (dateTo)   q.set('dateTo', dateTo);
        if (search.trim()) q.set('searchText', search.trim());
        fetch(`${variables.API_URL}stockbalance/revaluations?${q.toString()}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d?.message || 'Could not load revaluations.'); }))
            .then(d => setRows(Array.isArray(d) ? d : []))
            .catch(e => { setRows([]); setError(e.message || 'Could not load revaluations.'); })
            .finally(() => setLoading(false));
    }, [dateFrom, dateTo, search]);

    useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

    const toggle = (id) => {
        if (open[id]) { setOpen(o => { const n = { ...o }; delete n[id]; return n; }); return; }
        setOpen(o => ({ ...o, [id]: { loading: true } }));
        fetch(`${variables.API_URL}stockbalance/revaluations/${id}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => setOpen(o => ({ ...o, [id]: { grnLines: d.grnLines || [], jobLines: d.jobLines || [] } })))
            .catch(() => setOpen(o => ({ ...o, [id]: { error: 'Could not load the details.' } })));
    };

    const totals = useMemo(() => ({
        count: rows.length,
        stock: rows.reduce((s, r) => s + (r.stockValueChange || 0), 0),
        job:   rows.reduce((s, r) => s + (r.jobValueChange   || 0), 0),
        not:   rows.reduce((s, r) => s + (r.notChargedValueChange || 0), 0),
    }), [rows]);

    const exportCsv = () => {
        const hdr = ['Date', 'Reason', 'PO', 'GRN(s)', 'Item code', 'Item', 'Qty revalued', 'Base unit', `Total change (${baseCurrencyCode || 'base'})`,
                     'Qty in stock', 'Stock value change', 'Qty issued', 'Charged to jobs', 'Jobs', 'Not charged', 'Avg cost before', 'Avg cost after', 'By', 'Note'];
        const lines = rows.map(r => [
            fmtDate(r.revalDate), SOURCE_LABEL[r.source] || r.source, r.poNumber || '', r.grnNumbers || r.cancelledGrnNumber || '',
            r.itemCode, r.itemName, r.receivedQty, r.baseUom || '', r.valueChange, r.stockQty, r.stockValueChange, r.issuedQty,
            r.jobValueChange, r.jobIds || '', r.notChargedValueChange, r.avgCostBefore ?? '', r.avgCostAfter ?? '', r.createdBy || '', r.note || '',
        ].map(csvEsc).join(','));
        const blob = new Blob(['﻿' + [hdr.map(csvEsc).join(','), ...lines].join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Stock_revaluations_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Stock revaluations</div>
                            <div className="po-page-sub">Price changes on goods already received · newest first · values in {baseCurrencyCode || 'base currency'}</div>
                        </div>
                        <div className="po-toolbar">
                            <button className="po-btn-sec" onClick={load} disabled={loading}>↻ Refresh</button>
                            <button className="po-btn-sec" onClick={exportCsv} disabled={!rows.length}>⬇ Export CSV</button>
                        </div>
                    </div>

                    <div className="ppo-tiles">
                        <div className="ppo-tile"><span>Revaluations</span><b>{totals.count}</b></div>
                        <div className="ppo-tile"><span>Stock value change</span><b>{signed(totals.stock)}</b></div>
                        <div className="ppo-tile"><span>Charged to jobs</span><b>{signed(totals.job)}</b></div>
                        <div className="ppo-tile"><span>Not charged</span><b>{signed(totals.not)}</b></div>
                    </div>

                    <div className="ppo-filters">
                        <input className="po-select ppo-search" placeholder="Search item, PO, GRN, job…" value={search} onChange={e => setSearch(e.target.value)} />
                        <input className="po-select" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" />
                        <input className="po-select" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" />
                    </div>
                </div>

                {error && <div className="ppo-error">⚠ {error}</div>}

                <div className="po-table-wrap">
                    <table className={`po-table rt-cards${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <th>Date</th><th>Reason</th><th>PO / GRN</th><th>Item</th>
                                <th style={{ textAlign: 'right' }}>Qty</th>
                                <th style={{ textAlign: 'right' }}>Total change</th>
                                <th style={{ textAlign: 'right' }}>Stock value</th>
                                <th style={{ textAlign: 'right' }}>Charged to jobs</th>
                                <th style={{ textAlign: 'right' }}>Not charged</th>
                                <th style={{ textAlign: 'right' }}>Avg cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={10} className="po-empty">No revaluations with these filters.</td></tr>
                            )}
                            {rows.map(r => {
                                const d = open[r.revalId];
                                return (
                                    <React.Fragment key={r.revalId}>
                                        <tr className="ppo-row" onClick={() => toggle(r.revalId)}>
                                            <td data-label="Date"><span className="ppo-arrow">{d ? '▾' : '▸'}</span>{fmtDate(r.revalDate)}</td>
                                            <td data-label="Reason">{SOURCE_LABEL[r.source] || r.source}</td>
                                            <td data-label="PO / GRN">
                                                {r.poId
                                                    ? <span className="po-num-link" onClick={e => { e.stopPropagation(); navigate(`/purchase-orders/${r.poId}`); }}>{r.poNumber}</span>
                                                    : null}
                                                <div className="ppo-muted" style={{ fontSize: 11 }}>{r.grnNumbers || r.cancelledGrnNumber || ''}</div>
                                            </td>
                                            <td data-label="Item"><b>{r.itemCode}</b> {r.itemName}</td>
                                            <td data-label="Qty" className="po-num-cell">{fmt(r.receivedQty)} {r.baseUom || ''}</td>
                                            <td data-label="Total change" className={`po-num-cell ${signClass(r.valueChange)}`}>{signed(r.valueChange)}</td>
                                            <td data-label="Stock value" className="po-num-cell">{signed(r.stockValueChange)}<div className="ppo-muted" style={{ fontSize: 11 }}>{fmt(r.stockQty)} in stock</div></td>
                                            <td data-label="Charged to jobs" className="po-num-cell" title={r.jobIds || ''}>{signed(r.jobValueChange)}<div className="ppo-muted" style={{ fontSize: 11 }}>{r.jobIds || (r.issuedQty > 0 ? `${fmt(r.issuedQty)} issued` : '')}</div></td>
                                            <td data-label="Not charged" className="po-num-cell">{signed(r.notChargedValueChange)}</td>
                                            <td data-label="Avg cost" className="po-num-cell">
                                                {r.avgCostBefore != null ? fmtPrice(r.avgCostBefore) : '—'} → {r.avgCostAfter != null ? fmtPrice(r.avgCostAfter) : '—'}
                                            </td>
                                        </tr>
                                        {d && (
                                            <tr className="ppo-detail">
                                                <td colSpan={10}>
                                                    {d.loading && <div className="ppo-muted">Loading…</div>}
                                                    {d.error && <div className="ppo-error">⚠ {d.error}</div>}
                                                    {d.grnLines && (
                                                        <div className="ppo-lines">
                                                            <div className="ppo-line ppo-line-head">
                                                                <span>GRN line</span><span>Qty × cost before → after</span><span>Stock / issued</span><span>Change</span>
                                                            </div>
                                                            {d.grnLines.length === 0 && <div className="ppo-line"><span className="ppo-muted">No GRN lines (GRN cancel entry).</span></div>}
                                                            {d.grnLines.map(g => (
                                                                <div className="ppo-line" key={g.revalGrnId}>
                                                                    <span><b>{g.grnNumber}</b> line {g.lineNum}{g.receivedDate ? ` · ${fmtDate(g.receivedDate)}` : ''}</span>
                                                                    <span>{fmt(g.qtyBase)} × {fmtPrice(g.unitCostBefore)} → {fmtPrice(g.unitCostAfter)}</span>
                                                                    <span>{fmt(g.stockQty)} in stock · {fmt(g.issuedQty)} issued</span>
                                                                    <span>stock {signed(g.stockValueChange)} · jobs {signed(g.jobValueChange)} · not charged {signed(g.notChargedValue)}</span>
                                                                </div>
                                                            ))}
                                                            {d.jobLines.length > 0 && (
                                                                <>
                                                                    <div className="ppo-line ppo-line-head" style={{ marginTop: 8 }}>
                                                                        <span>Job charge</span><span>Issue</span><span>Cost category</span><span>Amount</span>
                                                                    </div>
                                                                    {d.jobLines.map(j => (
                                                                        <div className="ppo-line" key={j.adjId} title={j.note || ''}>
                                                                            <span><b>{j.jobId}</b> {j.projectName || ''}</span>
                                                                            <span>{j.issueNo || '—'} · {fmt(j.qty)}</span>
                                                                            <span>{j.costCategoryName || <i className="ppo-muted">none</i>}</span>
                                                                            <span className={signClass(j.amount)}>{signed(j.amount)}{j.note && j.note.includes('when this was posted') ? ' · job was closed' : ''}</span>
                                                                        </div>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {r.note && <div className="ppo-muted" style={{ fontSize: 11, marginTop: 6 }}>{r.note} · by {r.createdBy}</div>}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StockRevaluations;

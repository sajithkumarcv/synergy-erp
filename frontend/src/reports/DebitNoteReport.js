import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
    dateFrom:   firstOfMonth(),
    dateTo:     today(),
    supplierId: '',
    status:     '',
    debitType:  '',
    createdBy:  '',
};

// ── Simple status badge (no document-status config for DN) ───────────────
const STATUS_COLORS = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    Cancelled:       { bg: '#fce7f3', color: '#9d174d', dot: '#db2777' },
};
const StatusBadge = ({ status }) => {
    const cfg = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {status || '—'}
        </span>
    );
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows, baseCcy) => {
    const base = baseCcy || 'Base';
    const headers = ['#','DN Number','Date','Supplier','Curr','Rate','Debit Type',
        'Debit','Debit ('+base+')','Allocated ('+base+')','Unallocated ('+base+')',
        'Status','Reason','Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.dnNumber, r.dnDate ? fmtDate(r.dnDate) : '',
            r.supplierName, r.currencyShort, r.exchangeRate, r.debitType,
            r.debitAmount, r.debitAmountBase, r.allocatedBase, r.unallocatedBase,
            r.status, r.reason, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `DebitNote_Report_${today()}.csv`; a.click();
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

// ═══════════════════════════════════════════════════════════════════════
const DebitNoteReport = () => {
    const navigate = useNavigate();
    const { getModuleStatuses, getVList } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('dnDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(20);

    const [suppliers, setSuppliers] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers((d.data || []).sort((a, b) => a.supplierName.localeCompare(b.supplierName))))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo',     filters.dateTo);
        if (filters.supplierId) p.set('supplierId', filters.supplierId);
        if (filters.status)     p.set('status',     filters.status);
        if (filters.debitType)  p.set('debitType',  filters.debitType);
        if (filters.createdBy)  p.set('createdBy',  filters.createdBy);
        try {
            const res  = await fetch(`${variables.API_URL}reports/debit-note?${p}`, { headers: authHeaders() });
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
            count:          rows.length,
            debitBase:      rows.reduce((s, r) => s + (r.debitAmountBase || 0), 0),
            allocatedBase:  rows.reduce((s, r) => s + (r.allocatedBase   || 0), 0),
            unallocatedBase:rows.reduce((s, r) => s + (r.unallocatedBase || 0), 0),
        };
    }, [rows]);

    const currencySummary = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const map = {};
        rows.forEach(r => {
            const key = `${r.currencyShort}|${r.exchangeRate}`;
            if (!map[key]) map[key] = {
                currency: r.currencyShort || '',
                rate: r.exchangeRate,
                isBase: !r.exchangeRate || r.exchangeRate === 1,
                count: 0, debit: 0, debitBase: 0, allocatedBase: 0, unallocatedBase: 0,
            };
            map[key].count++;
            map[key].debit           += r.debitAmount     || 0;
            map[key].debitBase       += r.debitAmountBase || 0;
            map[key].allocatedBase   += r.allocatedBase   || 0;
            map[key].unallocatedBase += r.unallocatedBase || 0;
        });
        return Object.values(map).sort((a, b) => a.currency.localeCompare(b.currency));
    }, [rows]);

    const baseCcy = rows?.[0]?.baseCurrency || '';

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>➕</div>
                <div>
                    <div className="rpt-header-title">Debit Note Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} Debit Note${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted, rows?.[0]?.baseCurrency)}>
                            ⬇ Export CSV
                        </button>
                    )}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="rpt-filter-card">
                <div className="rpt-filter-row">

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date From</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateFrom}
                            onChange={e => setF('dateFrom', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date To</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateTo}
                            onChange={e => setF('dateTo', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Supplier</span>
                        <select className="rpt-filter-select"
                            value={filters.supplierId}
                            onChange={e => setF('supplierId', e.target.value)}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => (
                                <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Debit Type</span>
                        <select className="rpt-filter-select"
                            value={filters.debitType}
                            onChange={e => setF('debitType', e.target.value)}>
                            <option value="">All Types</option>
                            {getVList('DebitNote', 'DebitType').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select"
                            value={filters.status}
                            onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {getModuleStatuses('DN').map(s =>
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            )}
                        </select>
                    </div>

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Created By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.createdBy}
                            onChange={e => setF('createdBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
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

            {/* ── Error ── */}
            {error && <div className="rpt-error">⚠ {error}</div>}

            {/* ── Summary strip ── */}
            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total DNs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Debit ({baseCcy})</div>
                        <div className="rpt-summary-val blue">{fmt(totals.debitBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Allocated ({baseCcy})</div>
                        <div className="rpt-summary-val green">{fmt(totals.allocatedBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Unallocated ({baseCcy})</div>
                        <div className={`rpt-summary-val ${totals.unallocatedBase > 0 ? 'amber' : ''}`}>{fmt(totals.unallocatedBase)}</div>
                    </div>
                </div>
            )}

            {/* ── Currency Breakdown ── */}
            {currencySummary.length > 0 && (
                <div className="rpt-ccy-section">
                    <div className="rpt-ccy-title">Currency Breakdown</div>
                    <table className="rpt-ccy-table">
                        <thead>
                            <tr>
                                <th>Currency</th>
                                <th className="r">Rate</th>
                                <th className="r">Count</th>
                                <th className="r">Debit</th>
                                <th className="r">Debit ({baseCcy})</th>
                                <th className="r">Allocated ({baseCcy})</th>
                                <th className="r">Unalloc. ({baseCcy})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: g.isBase ? '#475569' : '#7c3aed' }}>{fmt(g.debit)}</td>
                                    <td className="r mono" style={{ color: '#b91c1c', fontWeight: 700 }}>{fmt(g.debitBase)}</td>
                                    <td className="r mono" style={{ color: '#1d4ed8', fontWeight: 600 }}>{fmt(g.allocatedBase)}</td>
                                    <td className="r mono" style={{ color: g.unallocatedBase > 0 ? '#b45309' : '#475569', fontWeight: 700 }}>{fmt(g.unallocatedBase)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Content ── */}
            <div className="rpt-content">

                {loading && (
                    <div className="rpt-state">
                        <div className="rpt-spinner" />
                        <span>Running report…</span>
                    </div>
                )}

                {!loading && rows === null && !error && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">📊</div>
                        <span>Set your filters above and click <strong>Run Report</strong></span>
                    </div>
                )}

                {!loading && rows !== null && rows.length === 0 && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">🔍</div>
                        <span>No debit notes match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 36 }}>#</th>
                                        <Th col="dnNumber"        label="DN Number"                   />
                                        <Th col="dnDate"          label="Date"                        />
                                        <Th col="supplierName"    label="Supplier"                    />
                                        <Th col="currencyShort"   label="Curr"                    cls="r" />
                                        <Th col="exchangeRate"    label="Rate"                    cls="r" />
                                        <Th col="debitType"       label="Debit Type"                  />
                                        <Th col="debitAmount"     label="Debit"                   cls="r" />
                                        <Th col="debitAmountBase" label={`Debit (${baseCcy})`}    cls="r" />
                                        <Th col="allocatedBase"   label={`Allocated (${baseCcy})`} cls="r" />
                                        <Th col="unallocatedBase" label={`Unalloc. (${baseCcy})`} cls="r" />
                                        <Th col="status"          label="Status"                      />
                                        <Th col="reason"          label="Reason"                      />
                                        <Th col="createdBy"       label="Created By"                  />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => {
                                        const isForeign = r.exchangeRate && r.exchangeRate !== 1;
                                        return (
                                        <tr key={r.dnId} onClick={() => navigate(`/debit-notes/${r.dnId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td><span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#b91c1c', fontSize: 11.5, background: '#fee2e2', padding: '2px 8px', borderRadius: 4 }}>{r.dnNumber}</span></td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.dnDate)}</td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.supplierName || <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: isForeign ? '#7c3aed' : '#64748b' }}>{r.currencyShort}</td>
                                            <td className="r" style={{ fontSize: 11, color: '#94a3b8' }}>{isForeign ? Number(r.exchangeRate).toFixed(4) : <span className="muted">—</span>}</td>
                                            <td style={{ fontSize: 11.5, color: '#475569' }}>{r.debitType || <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: isForeign ? '#7c3aed' : '#b91c1c', fontSize: 12 }}>{fmt(r.debitAmount)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#b91c1c', fontSize: 12.5 }}>{fmt(r.debitAmountBase)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#1d4ed8', fontSize: 12 }}>{fmt(r.allocatedBase)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: (r.unallocatedBase || 0) > 0 ? '#b45309' : '#475569', fontSize: 12.5 }}>{fmt(r.unallocatedBase)}</td>
                                            <td><StatusBadge status={r.status} /></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || <span className="muted">—</span>}</td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={7} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Page totals ({baseCcy}) — {totals.count} record{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#b91c1c' }}>{fmt(totals.debitBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1d4ed8' }}>{fmt(totals.allocatedBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#b45309' }}>{fmt(totals.unallocatedBase)}</td>
                                            <td colSpan={3} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalRows={sorted.length}
                            onPage={p => setPage(p)}
                            onPageSize={s => { setPageSize(s); setPage(1); }}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default DebitNoteReport;

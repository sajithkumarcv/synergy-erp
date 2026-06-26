import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';
import './JobItemLedger.css';

const today       = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;
const PAGE_SIZES  = [10, 20, 50, 100];

// ── Shared small helpers ────────────────────────────────────────────────────
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
            <div className="rpt-pag-info">Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong></div>
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

// ── Status badge ────────────────────────────────────────────────────────────
const STATUS_CFG = {
    Approved: { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    Draft:    { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
    Issued:   { bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
    Received: { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
    Cancelled:{ bg: '#fee2e2', color: '#dc2626', dot: '#ef4444' },
};
const StatusBadge = ({ status }) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.Draft;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700,
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {status}
        </span>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
//  DETAIL PANEL — IN grid (GRN receipts) + OUT grid (Issue notes)
// ═══════════════════════════════════════════════════════════════════════════
const DetailPanel = ({ selectedRow, dateFrom, dateTo, onClose }) => {
    const navigate = useNavigate();
    const panelRef = useRef(null);

    const [inRows,    setInRows]    = useState(null);
    const [outRows,   setOutRows]   = useState(null);
    const [loading,   setLoading]   = useState(false);
    const [inSortCol, setInSortCol] = useState('grnDate');
    const [inSortDir, setInSortDir] = useState('asc');
    const [outSortCol,setOutSortCol]= useState('issueDate');
    const [outSortDir,setOutSortDir]= useState('asc');

    // Scroll panel into view on open
    useEffect(() => {
        if (panelRef.current) {
            setTimeout(() => panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
        }
    }, [selectedRow]);

    useEffect(() => {
        if (!selectedRow) return;
        const load = async () => {
            setLoading(true);
            const p = new URLSearchParams();
            if (dateFrom)            p.set('dateFrom', dateFrom);
            if (dateTo)              p.set('dateTo',   dateTo);
            if (selectedRow.jobId)   p.set('jobId',    selectedRow.jobId);
            if (selectedRow.itemId)  p.set('itemId',   selectedRow.itemId);
            const h = authHeaders();
            const [resIn, resOut] = await Promise.all([
                fetch(`${variables.API_URL}reports/job-item-ledger/in?${p}`,  { headers: h }),
                fetch(`${variables.API_URL}reports/job-item-ledger/out?${p}`, { headers: h }),
            ]);
            setInRows(resIn.ok   ? await resIn.json()  : []);
            setOutRows(resOut.ok ? await resOut.json() : []);
            setLoading(false);
        };
        load();
    }, [selectedRow, dateFrom, dateTo]);

    const sortedIn = useMemo(() => {
        if (!inRows) return [];
        return [...inRows].sort((a, b) => {
            let av = a[inSortCol] ?? '', bv = b[inSortCol] ?? '';
            if (typeof av === 'number') return inSortDir === 'asc' ? av - bv : bv - av;
            return inSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [inRows, inSortCol, inSortDir]);

    const sortedOut = useMemo(() => {
        if (!outRows) return [];
        return [...outRows].sort((a, b) => {
            let av = a[outSortCol] ?? '', bv = b[outSortCol] ?? '';
            if (typeof av === 'number') return outSortDir === 'asc' ? av - bv : bv - av;
            return outSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [outRows, outSortCol, outSortDir]);

    const inTotals  = useMemo(() => inRows?.length  ? {
        qty:   inRows.reduce((s, r)  => s + (r.receivedQty || 0), 0),
        value: inRows.reduce((s, r)  => s + (r.lineTotal   || 0), 0),
    } : null, [inRows]);
    const outTotals = useMemo(() => outRows?.length ? {
        qty:   outRows.reduce((s, r) => s + (r.qty       || 0), 0),
        value: outRows.reduce((s, r) => s + (r.lineTotal  || 0), 0),
    } : null, [outRows]);

    const handleInSort  = col => { if (inSortCol  === col) setInSortDir(d  => d === 'asc' ? 'desc' : 'asc'); else { setInSortCol(col);  setInSortDir('asc');  } };
    const handleOutSort = col => { if (outSortCol === col) setOutSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOutSortCol(col); setOutSortDir('asc'); } };

    const ThIn  = ({ col, label }) => <th onClick={() => handleInSort(col)}  style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>{label}<SortIcon col={col} sc={inSortCol}  sd={inSortDir}  /></th>;
    const ThOut = ({ col, label }) => <th onClick={() => handleOutSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>{label}<SortIcon col={col} sc={outSortCol} sd={outSortDir} /></th>;

    if (!selectedRow) return null;

    return (
        <div className="jil-detail-panel" ref={panelRef}>
            {/* Header bar */}
            <div className="jil-detail-header">
                <div className="jil-detail-title">
                    <span className="jil-detail-chip">{selectedRow.jobId}</span>
                    <span className="jil-detail-item">
                        <span className="rpt-code-chip">{selectedRow.itemCode}</span>
                        {' '}{selectedRow.itemName}
                    </span>
                    <span className="jil-detail-uom">{selectedRow.uomName}</span>
                </div>
                <button className="jil-close-btn" onClick={onClose} title="Close detail">✕</button>
            </div>

            {loading && <div className="jil-loading">⏳ Loading movements…</div>}

            {!loading && (
                <div className="jil-grids">
                    {/* ── IN GRID ── */}
                    <div className="jil-grid-col jil-in">
                        <div className="jil-grid-head">
                            <span className="jil-grid-icon">📥</span>
                            <span className="jil-grid-label">IN — Purchase Receipts (GRN)</span>
                            {inTotals && (
                                <span className="jil-grid-totals">
                                    <strong>{fmt(inTotals.qty, 2)}</strong> received · Value <strong>{fmt(inTotals.value, 2)}</strong>
                                </span>
                            )}
                        </div>
                        <div className="jil-table-wrap">
                            {(!inRows || inRows.length === 0)
                                ? <div className="jil-no-data">No GRN receipts found</div>
                                : (
                                    <table className="jil-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <ThIn col="grnNumber"    label="GRN No" />
                                                <ThIn col="grnDate"      label="Date" />
                                                <ThIn col="supplierName" label="Supplier" />
                                                <ThIn col="poNumber"     label="PO No" />
                                                <ThIn col="receivedQty"  label="Qty" />
                                                <ThIn col="unitPrice"    label="Unit Price" />
                                                <ThIn col="lineTotal"    label="Amount" />
                                                <ThIn col="invoiceNo"    label="Invoice" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedIn.map((r, i) => (
                                                <tr key={r.grnDetailId} className="jil-row-link" onClick={() => navigate(`/grn/${r.grnId}`)}>
                                                    <td className="jil-td-num">{i + 1}</td>
                                                    <td><span className="rpt-code-chip">{r.grnNumber}</span></td>
                                                    <td className="jil-td-date">{r.grnDate ? fmtDate(r.grnDate) : '—'}</td>
                                                    <td className="jil-td-wrap">{r.supplierName}</td>
                                                    <td>{r.poNumber ? <span className="rpt-code-chip">{r.poNumber}</span> : '—'}</td>
                                                    <td className="jil-td-qty jil-in-qty">{fmt(r.receivedQty, 2)}</td>
                                                    <td className="jil-td-amt">{fmt(r.unitPrice, 2)}</td>
                                                    <td className="jil-td-amt jil-in-val">{fmt(r.lineTotal, 2)}</td>
                                                    <td className="jil-td-muted">{r.invoiceNo || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {inTotals && (
                                            <tfoot>
                                                <tr className="jil-total-row">
                                                    <td colSpan={5} className="jil-total-label">Total</td>
                                                    <td className="jil-td-qty jil-in-qty">{fmt(inTotals.qty, 2)}</td>
                                                    <td></td>
                                                    <td className="jil-td-amt jil-in-val">{fmt(inTotals.value, 2)}</td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}
                        </div>
                    </div>

                    {/* ── OUT GRID ── */}
                    <div className="jil-grid-col jil-out">
                        <div className="jil-grid-head">
                            <span className="jil-grid-icon">📤</span>
                            <span className="jil-grid-label">OUT — Issue Notes</span>
                            {outTotals && (
                                <span className="jil-grid-totals">
                                    <strong>{fmt(outTotals.qty, 2)}</strong> issued · Value <strong>{fmt(outTotals.value, 2)}</strong>
                                </span>
                            )}
                        </div>
                        <div className="jil-table-wrap">
                            {(!outRows || outRows.length === 0)
                                ? <div className="jil-no-data">No issue notes found</div>
                                : (
                                    <table className="jil-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <ThOut col="issueNo"   label="Issue No" />
                                                <ThOut col="issueDate" label="Date" />
                                                <ThOut col="issuedTo"  label="Issued To" />
                                                <ThOut col="qty"       label="Qty" />
                                                <ThOut col="unitCost"  label="Unit Cost" />
                                                <ThOut col="lineTotal" label="Amount" />
                                                <ThOut col="status"    label="Status" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedOut.map((r, i) => (
                                                <tr key={r.issueLineId} className="jil-row-link" onClick={() => navigate(`/inventory-issue/${r.issueId}`)}>
                                                    <td className="jil-td-num">{i + 1}</td>
                                                    <td><span className="rpt-code-chip">{r.issueNo}</span></td>
                                                    <td className="jil-td-date">{r.issueDate ? fmtDate(r.issueDate) : '—'}</td>
                                                    <td className="jil-td-wrap">{r.issuedTo}</td>
                                                    <td className="jil-td-qty jil-out-qty">{fmt(r.qty, 2)}</td>
                                                    <td className="jil-td-amt">{fmt(r.unitCost, 2)}</td>
                                                    <td className="jil-td-amt jil-out-val">{fmt(r.lineTotal, 2)}</td>
                                                    <td><StatusBadge status={r.status} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {outTotals && (
                                            <tfoot>
                                                <tr className="jil-total-row">
                                                    <td colSpan={4} className="jil-total-label">Total</td>
                                                    <td className="jil-td-qty jil-out-qty">{fmt(outTotals.qty, 2)}</td>
                                                    <td></td>
                                                    <td className="jil-td-amt jil-out-val">{fmt(outTotals.value, 2)}</td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                )}
                        </div>
                    </div>
                </div>
            )}

            {/* Balance bar */}
            {!loading && inTotals !== null && outTotals !== null && (
                <div className="jil-balance-bar">
                    <div className="jil-bal-item jil-bal-in">
                        <span className="jil-bal-label">Total IN</span>
                        <span className="jil-bal-qty">{fmt((inRows || []).reduce((s,r) => s+(r.receivedQty||0),0), 2)}</span>
                        <span className="jil-bal-val">{fmt((inRows || []).reduce((s,r) => s+(r.lineTotal||0),0), 2)}</span>
                    </div>
                    <div className="jil-bal-sep">−</div>
                    <div className="jil-bal-item jil-bal-out">
                        <span className="jil-bal-label">Total OUT</span>
                        <span className="jil-bal-qty">{fmt((outRows || []).reduce((s,r) => s+(r.qty||0),0), 2)}</span>
                        <span className="jil-bal-val">{fmt((outRows || []).reduce((s,r) => s+(r.lineTotal||0),0), 2)}</span>
                    </div>
                    <div className="jil-bal-sep">=</div>
                    <div className="jil-bal-item jil-bal-net">
                        <span className="jil-bal-label">Net Balance</span>
                        <span className="jil-bal-qty">{fmt(
                            (inRows||[]).reduce((s,r)=>s+(r.receivedQty||0),0) - (outRows||[]).reduce((s,r)=>s+(r.qty||0),0), 2
                        )}</span>
                        <span className="jil-bal-val">{fmt(
                            (inRows||[]).reduce((s,r)=>s+(r.lineTotal||0),0) - (outRows||[]).reduce((s,r)=>s+(r.lineTotal||0),0), 2
                        )}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
const JobItemLedgerReport = () => {
    const [filters, setFilters] = useState({
        dateFrom:      firstOfYear(),
        dateTo:        today(),
        jobId:         '',
        jobTypeId:     '',
        categoryId:    '',
        subCategoryId: '',
        itemTypeId:    '',
        itemId:        '',
    });

    const [rows,       setRows]       = useState(null);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState('');
    const [sortCol,    setSortCol]    = useState('jobId');
    const [sortDir,    setSortDir]    = useState('asc');
    const [page,       setPage]       = useState(1);
    const [pageSize,   setPageSize]   = useState(20);
    const [selected,   setSelected]   = useState(null);   // clicked row

    // Lookup data
    const [jobs,        setJobs]        = useState([]);
    const [jobTypes,    setJobTypes]    = useState([]);
    const [categories,  setCategories]  = useState([]);
    const [allSubCats,  setAllSubCats]  = useState([]);
    const [itemTypes,   setItemTypes]   = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    // Derived: subcategories for selected category
    const subCategories = useMemo(() =>
        filters.categoryId
            ? allSubCats.filter(s => s.parentId === filters.categoryId)
            : allSubCats,
    [allSubCats, filters.categoryId]);

    // Load lookups + jobs on mount
    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}reports/job-item-ledger/lookups`, { headers: h })
            .then(r => r.ok ? r.json() : {})
            .then(d => {
                setJobTypes(d.jobTypes   || []);
                setCategories(d.categories || []);
                setAllSubCats(d.subCategories || []);
                setItemTypes(d.itemTypes   || []);
            })
            .catch(() => {});
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1); setSelected(null);
        const p = new URLSearchParams();
        if (filters.dateFrom)      p.set('dateFrom',      filters.dateFrom);
        if (filters.dateTo)        p.set('dateTo',        filters.dateTo);
        if (filters.jobId)         p.set('jobId',         filters.jobId);
        if (filters.jobTypeId)     p.set('jobTypeId',     filters.jobTypeId);
        if (filters.categoryId)    p.set('categoryId',    filters.categoryId);
        if (filters.subCategoryId) p.set('subCategoryId', filters.subCategoryId);
        if (filters.itemTypeId)    p.set('itemTypeId',    filters.itemTypeId);
        if (filters.itemId)        p.set('itemId',        filters.itemId);
        try {
            const res  = await fetch(`${variables.API_URL}reports/job-item-ledger?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [filters]);

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
            jobs:       new Set(rows.map(r => r.jobId)).size,
            rcvQty:     rows.reduce((s, r) => s + (r.totalReceivedQty   || 0), 0),
            rcvVal:     rows.reduce((s, r) => s + (r.totalReceivedValue  || 0), 0),
            issQty:     rows.reduce((s, r) => s + (r.totalIssuedQty     || 0), 0),
            issVal:     rows.reduce((s, r) => s + (r.totalIssuedValue    || 0), 0),
            netVal:     rows.reduce((s, r) => s + (r.netValue            || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, right }) => (
        <th style={{ textAlign: right ? 'right' : 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
            onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const clearFilters = () => {
        setFilters({ dateFrom: firstOfYear(), dateTo: today(), jobId: '', jobTypeId: '', categoryId: '', subCategoryId: '', itemTypeId: '', itemId: '' });
        setRows(null); setSelected(null); setPage(1);
    };

    const exportCsv = () => {
        const hdrs = ['#','Job','Project','Job Type','Item Code','Item Name','UOM','Category','Sub Category','Item Type','Recv Qty','Recv Value','Issued Qty','Issued Value','Net Qty','Net Value'];
        const lines = [hdrs.join(','), ...sorted.map((r, i) => [
            i+1, r.jobId, r.projectName, r.jobTypeName, r.itemCode, r.itemName,
            r.uomName, r.categoryName, r.subCategoryName||'', r.itemTypeName,
            r.totalReceivedQty, r.totalReceivedValue,
            r.totalIssuedQty, r.totalIssuedValue,
            r.netQty, r.netValue,
        ].map(esc).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a'); a.href = url; a.download = `Job_Item_Ledger_${today()}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const handleRowClick = row => {
        setSelected(prev =>
            prev && prev.jobId === row.jobId && prev.itemId === row.itemId ? null : row
        );
    };

    return (
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#e0e7ff)' }}>📊</div>
                <div>
                    <div className="rpt-header-title">Job Item Ledger</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'View item movements per job — IN (GRN) and OUT (Issues)'
                            : `${rows.length} item${rows.length !== 1 ? 's' : ''} found — click any row to see IN / OUT detail`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={exportCsv}>⬇ Export CSV</button>
                    )}
                </div>
            </div>

            {/* ── Filter bar ── */}
            <div className="rpt-filter-bar jil-filter-bar">
                {/* Row 1 */}
                <div className="rpt-filter-group">
                    <label>Date From</label>
                    <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} />
                </div>
                <div className="rpt-filter-group">
                    <label>Date To</label>
                    <input type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} />
                </div>
                <div className="rpt-filter-group" style={{ minWidth: 200 }}>
                    <label>Job</label>
                    <select value={filters.jobId} onChange={e => setF('jobId', e.target.value)}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} – {j.projectName}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Job Type</label>
                    <select value={filters.jobTypeId} onChange={e => setF('jobTypeId', e.target.value)}>
                        <option value="">All Types</option>
                        {jobTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Item Category</label>
                    <select value={filters.categoryId} onChange={e => {
                        setF('categoryId', e.target.value);
                        setFilters(f => ({ ...f, categoryId: e.target.value, subCategoryId: '' }));
                    }}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Sub Category</label>
                    <select value={filters.subCategoryId} onChange={e => setF('subCategoryId', e.target.value)}
                        disabled={subCategories.length === 0}>
                        <option value="">All Sub-Categories</option>
                        {subCategories.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-group">
                    <label>Item Type</label>
                    <select value={filters.itemTypeId} onChange={e => setF('itemTypeId', e.target.value)}>
                        <option value="">All Item Types</option>
                        {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
                <div className="rpt-filter-actions">
                    <button className="rpt-btn-run" onClick={runReport} disabled={loading}>
                        {loading ? '⏳ Loading…' : '▶ Run Report'}
                    </button>
                    <button className="rpt-btn-clear" onClick={clearFilters}>✕ Clear</button>
                </div>
            </div>

            {error && <div className="rpt-error">{error}</div>}

            {/* ── Summary strip ── */}
            {totals && (
                <div className="rpt-summary-strip">
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Items</span><span className="rpt-sum-val">{totals.items}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Jobs</span><span className="rpt-sum-val">{totals.jobs}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total IN Qty</span><span className="rpt-sum-val" style={{ color: '#1e40af' }}>{fmt(totals.rcvQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total IN Value</span><span className="rpt-sum-val" style={{ color: '#1e40af' }}>{fmt(totals.rcvVal, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total OUT Qty</span><span className="rpt-sum-val" style={{ color: '#b45309' }}>{fmt(totals.issQty, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Total OUT Value</span><span className="rpt-sum-val" style={{ color: '#b45309' }}>{fmt(totals.issVal, 2)}</span></div>
                    <div className="rpt-summary-card"><span className="rpt-sum-label">Net Value</span><span className="rpt-sum-val" style={{ color: totals.netVal >= 0 ? '#166534' : '#dc2626' }}>{fmt(totals.netVal, 2)}</span></div>
                </div>
            )}

            {/* ── Empty states ── */}
            {rows === null && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📊</div><div>Set filters and click <strong>Run Report</strong> to view item movements</div></div>
            )}
            {rows && rows.length === 0 && !loading && (
                <div className="rpt-empty-state"><div className="rpt-empty-icon">📭</div><div>No item movements found for the selected filters</div></div>
            )}

            {/* ── Summary grid ── */}
            {rows && rows.length > 0 && (
                <>
                    <div className="rpt-toolbar">
                        <span className="rpt-row-count">{sorted.length} item{sorted.length !== 1 ? 's' : ''}</span>
                        {selected && (
                            <span className="jil-selected-hint">
                                📍 Showing detail for <strong>{selected.itemCode}</strong> on job <strong>{selected.jobId}</strong>
                                <button className="jil-deselect-btn" onClick={() => setSelected(null)}>Close detail</button>
                            </span>
                        )}
                    </div>
                    <div className="rpt-table-wrap jil-summary-wrap">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <Th col="jobId"             label="Job" />
                                    <Th col="projectName"       label="Project" />
                                    <Th col="jobTypeName"       label="Job Type" />
                                    <Th col="itemCode"          label="Item Code" />
                                    <Th col="itemName"          label="Item Name" />
                                    <Th col="uomName"           label="UOM" />
                                    <Th col="categoryName"      label="Category" />
                                    <Th col="subCategoryName"   label="Sub Category" />
                                    <Th col="itemTypeName"      label="Item Type" />
                                    <Th col="totalReceivedQty"  label="IN Qty"    right />
                                    <Th col="totalReceivedValue"label="IN Value"  right />
                                    <Th col="totalIssuedQty"    label="OUT Qty"   right />
                                    <Th col="totalIssuedValue"  label="OUT Value" right />
                                    <Th col="netQty"            label="Net Qty"   right />
                                    <Th col="netValue"          label="Net Value" right />
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((r, i) => {
                                    const isActive = selected && selected.jobId === r.jobId && selected.itemId === r.itemId;
                                    return (
                                        <tr
                                            key={`${r.jobId}-${r.itemId}`}
                                            className={`rpt-row-link jil-summary-row ${isActive ? 'jil-row-active' : ''}`}
                                            onClick={() => handleRowClick(r)}
                                        >
                                            <td style={{ textAlign: 'right', color: '#94a3b8' }}>{(page - 1) * pageSize + i + 1}</td>
                                            <td><span className="rpt-code-chip">{r.jobId}</span></td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.projectName}</td>
                                            <td style={{ color: '#64748b', fontSize: 12 }}>{r.jobTypeName}</td>
                                            <td><span className="rpt-code-chip">{r.itemCode}</span></td>
                                            <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.itemName}</td>
                                            <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{r.uomName}</td>
                                            <td style={{ fontSize: 12 }}>{r.categoryName}</td>
                                            <td style={{ fontSize: 12, color: '#64748b' }}>{r.subCategoryName || '—'}</td>
                                            <td style={{ fontSize: 12 }}>{r.itemTypeName}</td>
                                            <td style={{ textAlign: 'right', color: '#1e40af', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalReceivedQty, 2)}</td>
                                            <td style={{ textAlign: 'right', color: '#1e40af', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalReceivedValue, 2)}</td>
                                            <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalIssuedQty, 2)}</td>
                                            <td style={{ textAlign: 'right', color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.totalIssuedValue, 2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: (r.netQty || 0) >= 0 ? '#166534' : '#dc2626' }}>{fmt(r.netQty, 2)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: (r.netValue || 0) >= 0 ? '#166534' : '#dc2626' }}>{fmt(r.netValue, 2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Detail panel (IN / OUT grids) ── */}
                    {selected && (
                        <DetailPanel
                            selectedRow={selected}
                            dateFrom={filters.dateFrom}
                            dateTo={filters.dateTo}
                            onClose={() => setSelected(null)}
                        />
                    )}

                    <Pagination page={page} totalPages={totalPages} pageSize={pageSize}
                        totalRows={sorted.length} onPage={setPage} onPageSize={v => { setPageSize(v); setPage(1); }} />
                </>
            )}
        </div>
    );
};

export default JobItemLedgerReport;

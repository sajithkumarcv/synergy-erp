import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const PAGE_SIZES   = [10, 20, 50, 100];

const DEFAULT_FILTERS = { dateFrom: firstOfMonth(), dateTo: today(), jobId: '', status: '', mType: '', site: '', empType: '', employeeId: '', supplierId: '' };


const exportCsv = (rows) => {
    const headers = ['#', 'Document No', 'Date', 'Jobs', 'Employees', 'Total Hours', 'OT Hours', 'Status', 'Created By'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headers.join(','), ...rows.map((r, i) => [i + 1, r.documentNo, r.documentDate ? fmtDate(r.documentDate) : '', r.jobCount, r.employeeCount, r.totalHours, r.totalOTHours, r.status, r.createdBy].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Manhour_Report_${today()}.csv`; a.click();
};

const SortIcon = ({ col, sc, sd }) => <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>{sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}</span>;

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i = 1; i <= totalPages; i++) { if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i); else if (pages[pages.length - 1] !== '…') pages.push('…'); }
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{(page-1)*pageSize+1}–{Math.min(page*pageSize,totalRows)}</strong> of <strong>{totalRows}</strong></div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)} disabled={page===1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page-1)} disabled={page===1}>‹</button>
                {pages.map((p,i) => p==='…' ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span> : <button key={p} className={`rpt-pag-btn ${page===p?'active':''}`} onClick={() => onPage(p)}>{p}</button>)}
                <button className="rpt-pag-btn" onClick={() => onPage(page+1)} disabled={page===totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page===totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">Rows: <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>{PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
    );
};

const ManhourReport = () => {
    const navigate = useNavigate();
    const { getVList } = useLookup();
    const empTypeOptions = getVList('Employee', 'EmployeeType');
    const [filters, setFilters]   = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');
    const [sortCol, setSortCol]   = useState('documentDate');
    const [sortDir, setSortDir]   = useState('desc');
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [jobs, setJobs]           = useState([]);
    const [employees, setEmployees] = useState([]);
    const [supplierRows, setSupplierRows] = useState([]);
    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] }).then(d => setJobs(d.data || [])).catch(() => {});
        fetch(`${variables.API_URL}employee`, { headers: h })
            .then(r => r.ok ? r.json() : []).then(d => setEmployees(Array.isArray(d) ? d : (d.data || []))).catch(() => {});
    }, []);

    // Only suppliers that actually have employees (outsourced) — derived from the
    // employee list rather than the full supplier master.
    const suppliers = useMemo(() => {
        const map = new Map();
        employees.forEach(e => {
            if (e.supplierId && !map.has(e.supplierId))
                map.set(e.supplierId, { supplierId: e.supplierId, supplierName: e.supplierName, supplierCode: e.supplierCode });
        });
        return Array.from(map.values()).sort((a, b) => String(a.supplierName || '').localeCompare(String(b.supplierName || '')));
    }, [employees]);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
        if (filters.dateTo)   p.set('dateTo',   filters.dateTo);
        if (filters.jobId)    p.set('jobId',    filters.jobId);
        if (filters.status)   p.set('status',   filters.status);
        if (filters.mType)      p.set('mType',      filters.mType);
        if (filters.site)       p.set('site',       filters.site);
        if (filters.empType)    p.set('empType',    filters.empType);
        if (filters.employeeId) p.set('employeeId', filters.employeeId);
        if (filters.supplierId) p.set('supplierId', filters.supplierId);
        try {
            const res = await fetch(`${variables.API_URL}reports/manhour?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); setSupplierRows([]); return; }
            setRows(data.batches || []);
            setSupplierRows(data.suppliers || []);
        } catch { setError('Network error.'); setRows([]); setSupplierRows([]); }
        finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => { setPage(1); if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };

    const sorted = useMemo(() => {
        if (!rows) return [];
        return [...rows].sort((a, b) => { let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''; if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av; return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); });
    }, [rows, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return {
            count:         rows.length,
            totalHours:    rows.reduce((s, r) => s + (r.totalHours    || 0), 0),
            totalOTHours:  rows.reduce((s, r) => s + (r.totalOTHours  || 0), 0),
            totalEmployees: rows.reduce((s, r) => s + (r.employeeCount || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => <th className={cls} onClick={() => handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>;
    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setSupplierRows([]); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#ede9fe,#c4b5fd)' }}>⏱️</div>
                <div>
                    <div className="rpt-header-title">Manhour Report</div>
                    <div className="rpt-header-sub">{rows == null ? 'Set filters and click Run Report' : `${rows.length} batch${rows.length !== 1 ? 'es' : ''} found`}</div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>}
                </div>
            </div>

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
                        <span className="rpt-filter-label">Job No</span>
                        <select className="rpt-filter-select" value={filters.jobId} onChange={e => setF('jobId', e.target.value)}>
                            <option value="">All Jobs</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w180">
                        <span className="rpt-filter-label">Type</span>
                        <select className="rpt-filter-select" value={filters.mType} onChange={e => setF('mType', e.target.value)}>
                            <option value="">All Types</option>
                            {getVList('Manhour', 'Type').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Site</span>
                        <select className="rpt-filter-select" value={filters.site} onChange={e => setF('site', e.target.value)}>
                            <option value="">All</option>
                            {getVList('Manhour', 'Site').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w180">
                        <span className="rpt-filter-label">Emp Type</span>
                        <select className="rpt-filter-select" value={filters.empType}
                            onChange={e => { setF('empType', e.target.value); setF('employeeId', ''); }}>
                            <option value="">All Types</option>
                            {empTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w220">
                        <span className="rpt-filter-label">Employee</span>
                        <select className="rpt-filter-select" value={filters.employeeId} onChange={e => setF('employeeId', e.target.value)}>
                            <option value="">All Employees</option>
                            {employees
                                .filter(e => !filters.empType || e.empType === filters.empType)
                                .map(e => (
                                    <option key={e.employeeId} value={e.employeeId}>
                                        {e.empCode} — {e.employeeName}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <div className="rpt-filter-group w220">
                        <span className="rpt-filter-label">Supplier (Outsourced)</span>
                        <select className="rpt-filter-select" value={filters.supplierId} onChange={e => setF('supplierId', e.target.value)}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => (
                                <option key={s.supplierId} value={s.supplierId}>
                                    {s.supplierCode ? `${s.supplierCode} — ` : ''}{s.supplierName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select" value={filters.status} onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {['Draft', 'Approved', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runReport} disabled={loading}>{loading ? '⏳ Running…' : '▶ Run Report'}</button>
                        </div>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Batches</div><div className="rpt-summary-val">{totals.count}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Hours</div><div className="rpt-summary-val blue">{fmt(totals.totalHours, 2)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">OT Hours</div><div className="rpt-summary-val amber">{fmt(totals.totalOTHours, 2)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Employee Records</div><div className="rpt-summary-val">{totals.totalEmployees}</div></div>
                </div>
            )}

            {!loading && supplierRows.length > 0 && (
                <div className="rpt-content" style={{ marginBottom: 16 }}>
                    <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: '#0f172a', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🏢 By Supplier — Outsourced Manpower
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8' }}>(employees linked to a supplier)</span>
                    </div>
                    <div className="rpt-body">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    <th>Supplier</th>
                                    <th className="r">Employees</th>
                                    <th className="r">Batches</th>
                                    <th className="r">Total Hrs</th>
                                    <th className="r">OT Hrs</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supplierRows.map(s => (
                                    <tr key={s.supplierId}>
                                        <td style={{ fontWeight: 600, color: '#5b21b6' }}>{s.supplierName || `#${s.supplierId}`}</td>
                                        <td className="r" style={{ color: '#475569', fontWeight: 600 }}>{s.employeeCount}</td>
                                        <td className="r" style={{ color: '#475569' }}>{s.batchCount}</td>
                                        <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{fmt(s.totalHours, 2)}</td>
                                        <td className="r" style={{ fontFamily: 'monospace', fontWeight: s.totalOTHours > 0 ? 700 : 400, color: s.totalOTHours > 0 ? '#d97706' : '#94a3b8' }}>{fmt(s.totalOTHours, 2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                    <td style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>Total — {supplierRows.length} supplier{supplierRows.length !== 1 ? 's' : ''}</td>
                                    <td className="r" style={{ padding: '8px 6px', color: '#334155' }}>{supplierRows.reduce((a, s) => a + (s.employeeCount || 0), 0)}</td>
                                    <td />
                                    <td className="r" style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af' }}>{fmt(supplierRows.reduce((a, s) => a + (s.totalHours || 0), 0), 2)}</td>
                                    <td className="r" style={{ padding: '8px 6px', fontFamily: 'monospace', color: '#d97706' }}>{fmt(supplierRows.reduce((a, s) => a + (s.totalOTHours || 0), 0), 2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows === null && !error && <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>}
                {!loading && rows !== null && rows.length === 0 && <div className="rpt-state"><div className="rpt-state-icon">🔍</div><span>No manhour batches match the selected filters.</span></div>}
                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="documentNo"    label="Document No"  />
                                        <Th col="documentDate"  label="Date"         />
                                        <Th col="jobCount"      label="Jobs"      cls="r" />
                                        <Th col="employeeCount" label="Employees" cls="r" />
                                        <Th col="totalHours"    label="Total Hrs" cls="r" />
                                        <Th col="totalOTHours"  label="OT Hrs"    cls="r" />
                                        <Th col="status"        label="Status"       />
                                        <Th col="createdBy"     label="Created By"   />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.batchId} onClick={() => navigate(`/manhour/${r.batchId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td><span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#5b21b6', fontSize: 11.5, background: '#ede9fe', padding: '2px 8px', borderRadius: 4 }}>{r.documentNo}</span></td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.documentDate)}</td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>{r.jobCount}</td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>{r.employeeCount}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>{fmt(r.totalHours, 2)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: r.totalOTHours > 0 ? 700 : 400, color: r.totalOTHours > 0 ? '#d97706' : '#94a3b8' }}>{fmt(r.totalOTHours, 2)}</td>
                                            <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: r.status === 'Approved' ? '#dcfce7' : r.status === 'Cancelled' ? '#fee2e2' : '#f1f5f9', color: r.status === 'Approved' ? '#166534' : r.status === 'Cancelled' ? '#991b1b' : '#475569' }}>{r.status}</span></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={5} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>Totals — {totals.count} batch{totals.count !== 1 ? 'es' : ''}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalHours, 2)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#d97706', fontWeight: 700 }}>{fmt(totals.totalOTHours, 2)}</td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={sorted.length} onPage={p => setPage(p)} onPageSize={s => { setPageSize(s); setPage(1); }} />
                    </>
                )}
            </div>
        </div>
    );
};

export default ManhourReport;

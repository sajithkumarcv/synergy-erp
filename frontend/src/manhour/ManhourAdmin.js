import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import './Manhour.css';

const fmt     = n => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const PAGE_SIZES = [20, 50, 100];

const DEFAULT_FILTERS = {
    searchText: '', jobId: '', documentNo: '',
    employeeId: '', empType: '', status: '',
    dateFrom: '', dateTo: '',
};

const STATUS_COLORS = {
    Draft:      { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
    Approved:   { bg: '#f0fdf4', color: '#166534', dot: '#22c55e' },
    PendingL1:  { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
    PendingL2:  { bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
    Rejected:   { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
    Cancelled:  { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};
const StatusBadge = ({ status }) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.Draft;
    return (
        <span className="mh-status-badge" style={{ background: c.bg, color: c.color }}>
            <span className="mh-status-dot" style={{ background: c.dot }} />
            {status}
        </span>
    );
};

// ── Edit modal ────────────────────────────────────────────────────────────────
const EditModal = ({ row, employees, jobs, siteOptions, typeOptions, onSave, onClose }) => {
    const [form, setForm] = useState({
        jobId:         row.jobId        || '',
        employeeId:    row.employeeId   || '',
        hours:         row.hours        || '',
        overtimeHours: row.overtimeHours|| 0,
        site:          row.site         || '',
        mType:         row.mType        || '',
    });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async () => {
        setError('');
        const h  = parseFloat(form.hours)         || 0;
        const ot = parseFloat(form.overtimeHours)  || 0;
        if (!form.jobId)      { setError('Job ID is required.');       return; }
        if (!form.employeeId) { setError('Employee is required.');     return; }
        if (h <= 0)           { setError('NH must be greater than 0.'); return; }
        if (h > 24)           { setError('NH cannot exceed 24.');       return; }
        if (ot < 0)           { setError('OT cannot be negative.');     return; }
        if (h + ot > 24)      { setError('NH + OT cannot exceed 24.');  return; }

        setSaving(true);
        try {
            const res  = await fetch(`${variables.API_URL}manhour/admin/line/${row.manhourId}`, {
                method:  'PUT',
                headers: authHeaders(),
                body:    JSON.stringify({ ...form, hours: h, overtimeHours: ot, employeeId: Number(form.employeeId) }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.message || 'Save failed.'); return; }
            onSave();
        } catch { setError('Network error.'); }
        finally   { setSaving(false); }
    };

    const inputStyle = { height: 34, border: '1px solid #e2e8f0', borderRadius: 6, padding: '0 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
    const labelStyle = { fontSize: 11.5, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 };

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'#fff', borderRadius:12, padding:28, width:520, maxWidth:'95vw', boxShadow:'0 20px 50px rgba(0,0,0,.2)' }}>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <div>
                        <div style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>Edit Manhour Line</div>
                        <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                            {row.documentNo} · {fmtDate(row.documentDate)}
                            <span style={{ marginLeft:8, background:'#f1f5f9', padding:'1px 7px', borderRadius:4, fontSize:11 }}>
                                {row.status}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>✕</button>
                </div>

                {error && (
                    <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:7, padding:'8px 12px', fontSize:13, marginBottom:14 }}>
                        {error}
                    </div>
                )}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div style={{ gridColumn:'1/-1' }}>
                        <label style={labelStyle}>Job ID</label>
                        <select style={inputStyle} value={form.jobId} onChange={e => set('jobId', e.target.value)}>
                            <option value="">— Select Job —</option>
                            {jobs.map(j => (
                                <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ gridColumn:'1/-1' }}>
                        <label style={labelStyle}>Employee</label>
                        <select style={inputStyle} value={form.employeeId} onChange={e => set('employeeId', e.target.value)}>
                            <option value="">— Select Employee —</option>
                            {employees.map(e => (
                                <option key={e.employeeId} value={e.employeeId}>{e.empCode} — {e.employeeName}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={labelStyle}>Normal Hours (NH)</label>
                        <input type="number" style={inputStyle} min="0.5" max="24" step="0.5"
                            value={form.hours} onChange={e => set('hours', e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle}>OT Hours</label>
                        <input type="number" style={inputStyle} min="0" max="24" step="0.5"
                            value={form.overtimeHours} onChange={e => set('overtimeHours', e.target.value)} />
                    </div>

                    <div>
                        <label style={labelStyle}>Site</label>
                        <select style={inputStyle} value={form.site} onChange={e => set('site', e.target.value)}>
                            <option value="">— None —</option>
                            {siteOptions.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Type</label>
                        <select style={inputStyle} value={form.mType} onChange={e => set('mType', e.target.value)}>
                            <option value="">— None —</option>
                            {typeOptions.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:22 }}>
                    <button className="mh-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="mh-btn-pri" onClick={handleSubmit} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Confirm dialog ────────────────────────────────────────────────────────────
const ConfirmDelete = ({ row, onConfirm, onCancel }) => (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ background:'#fff', borderRadius:12, padding:24, maxWidth:400, width:'90%', boxShadow:'0 20px 40px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:8 }}>Delete Manhour Line</div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:6 }}>
                <strong>{row.documentNo}</strong> · {fmtDate(row.documentDate)}
            </div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:6 }}>
                Job: <strong>{row.jobId}</strong> · Employee: <strong>{row.empCode} {row.employeeName}</strong>
            </div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:6 }}>
                NH: <strong>{row.hours}</strong> · OT: <strong>{row.overtimeHours}</strong>
                · Status: <strong>{row.status}</strong>
            </div>
            <div style={{ fontSize:12.5, color:'#dc2626', background:'#fee2e2', borderRadius:6, padding:'7px 10px', marginBottom:20 }}>
                ⚠ This is a permanent soft-delete. The line will be hidden from all reports.
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button className="mh-btn-sec" onClick={onCancel}>Cancel</button>
                <button className="mh-btn-pri" style={{ background:'#dc2626' }} onClick={onConfirm}>Delete Line</button>
            </div>
        </div>
    </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
const ManhourAdmin = () => {
    const navigate     = useNavigate();
    const { lookups, getModuleStatuses }  = useLookup();

    const siteOptions = lookups.vlistMH_SITE || [];
    const typeOptions = lookups.vlistMH_TYPE || [];

    const [filters,    setFiltersState] = useState({ ...DEFAULT_FILTERS });
    const [applied,    setApplied]      = useState({ ...DEFAULT_FILTERS });
    const [rows,       setRows]         = useState([]);
    const [loading,    setLoading]      = useState(false);
    const [page,       setPage]         = useState(1);
    const [pageSize,   setPageSize]     = useState(50);
    const [totalRows,  setTotalRows]    = useState(0);
    const [totalPages, setTotalPages]   = useState(1);
    const [sortCol,    setSortCol]      = useState('DocumentDate');
    const [sortDir,    setSortDir]      = useState('DESC');
    const [toast,      setToast]        = useState([]);
    const [editRow,    setEditRow]      = useState(null);
    const [deleteRow,  setDeleteRow]    = useState(null);
    const [employees,  setEmployees]    = useState([]);
    const [jobs,       setJobs]         = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [selected,   setSelected]     = useState(new Set()); // Set of manhourIds
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDeleting,   setBulkDeleting]   = useState(false);

    const showToast = (msg, type = 'success') => {
        const id = Date.now();
        setToast(p => [...p, { id, msg, type }]);
        setTimeout(() => setToast(p => p.filter(t => t.id !== id)), 3500);
    };

    // Load employees + jobs once for the edit modal
    useEffect(() => {
        fetch(`${variables.API_URL}manhour/employees`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setEmployees(d || [])).catch(() => {});
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobs(d.data || [])).catch(() => {});
    }, []);

    const load = useCallback(() => {
        setLoading(true);
        const q = new URLSearchParams({
            searchText: applied.searchText || '',
            jobId:      applied.jobId      || '',
            documentNo: applied.documentNo || '',
            status:     applied.status     || '',
            dateFrom:   applied.dateFrom   || '',
            dateTo:     applied.dateTo     || '',
            page, pageSize, sortCol, sortDir,
        });
        if (applied.employeeId) q.set('employeeId', applied.employeeId);
        if (applied.empType)    q.set('empType',    applied.empType);
        fetch(`${variables.API_URL}manhour/admin/lines?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setRows(d.data || []); setTotalRows(d.totalRows || 0); setTotalPages(d.totalPages || 1); setSelected(new Set()); })
            .catch(() => showToast('Failed to load.', 'error'))
            .finally(() => setLoading(false));
    }, [applied, page, pageSize, sortCol, sortDir]);

    useEffect(() => { if (hasSearched) load(); }, [load, hasSearched]);

    const applyFilters = () => { setHasSearched(true); setApplied({ ...filters }); setPage(1); };
    const resetFilters = () => { setHasSearched(false); setFiltersState(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); setPage(1); setRows([]); setTotalRows(0); };

    const handleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
        else { setSortCol(col); setSortDir('DESC'); }
        setPage(1);
    };

    const doDelete = async () => {
        try {
            const res = await fetch(`${variables.API_URL}manhour/admin/line/${deleteRow.manhourId}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            const data = await res.json();
            if (!res.ok) { showToast(data.message || 'Delete failed.', 'error'); return; }
            showToast('Line deleted.');
            load();
        } catch { showToast('Network error.', 'error'); }
        finally   { setDeleteRow(null); }
    };

    // ── Selection helpers ─────────────────────────────────────────────────────
    const allPageIds    = rows.map(r => r.manhourId);
    const allSelected   = allPageIds.length > 0 && allPageIds.every(id => selected.has(id));
    const someSelected  = allPageIds.some(id => selected.has(id)) && !allSelected;

    const toggleRow = (id) => setSelected(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const toggleAll = () => {
        if (allSelected) {
            setSelected(prev => { const next = new Set(prev); allPageIds.forEach(id => next.delete(id)); return next; });
        } else {
            setSelected(prev => { const next = new Set(prev); allPageIds.forEach(id => next.add(id)); return next; });
        }
    };

    const doBulkDelete = async () => {
        setBulkDeleting(true);
        const ids = [...selected];
        let failed = 0;
        for (const id of ids) {
            try {
                const res = await fetch(`${variables.API_URL}manhour/admin/line/${id}`, {
                    method: 'DELETE', headers: authHeaders(),
                });
                if (!res.ok) failed++;
            } catch { failed++; }
        }
        setBulkDeleting(false);
        setBulkDeleteOpen(false);
        setSelected(new Set());
        if (failed > 0) showToast(`${ids.length - failed} deleted, ${failed} failed.`, 'error');
        else            showToast(`${ids.length} line${ids.length > 1 ? 's' : ''} deleted.`);
        load();
    };

    const SortIcon = ({ col }) =>
        sortCol !== col
            ? <span style={{ opacity:.3, marginLeft:3 }}>⇅</span>
            : <span style={{ color:'#1d4ed8', marginLeft:3 }}>{sortDir === 'ASC' ? '↑' : '↓'}</span>;

    const Th = ({ col, children, right }) => (
        <th onClick={() => handleSort(col)} style={{ cursor:'pointer', textAlign: right ? 'right' : 'left', whiteSpace:'nowrap' }}>
            {children}<SortIcon col={col} />
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - 2);
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="mh-page">
            {/* Header */}
            <div className="mh-page-header">
                <div>
                    <div className="mh-page-title">
                        🔧 Manhour Admin
                        <span style={{ marginLeft:10, fontSize:12, background:'#fee2e2', color:'#991b1b', borderRadius:5, padding:'2px 8px', fontWeight:600 }}>
                            Admin Only
                        </span>
                    </div>
                    <div className="mh-page-subtitle">
                        Edit or delete individual manhour lines regardless of batch status
                    </div>
                </div>
                <button className="mh-btn-sec" onClick={() => navigate('/manhour')}>← Back to Manhour</button>
            </div>

            {/* Filters */}
            <div className="mh-filter-bar">
                {/* Row 1 */}
                <div className="mh-filter-group">
                    <label>Search</label>
                    <input className="mh-filter-input" placeholder="Doc no / Job / Employee…"
                        value={filters.searchText}
                        onChange={e => setFiltersState(p => ({ ...p, searchText: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyFilters()} />
                </div>
                <div className="mh-filter-group" style={{ minWidth:200 }}>
                    <label>Job ID</label>
                    <select className="mh-filter-input" value={filters.jobId}
                        onChange={e => setFiltersState(p => ({ ...p, jobId: e.target.value }))}>
                        <option value="">All Jobs</option>
                        {jobs.map(j => (
                            <option key={j.jobId} value={j.jobId}>
                                {j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="mh-filter-group" style={{ minWidth:200 }}>
                    <label>Employee</label>
                    <select className="mh-filter-input" value={filters.employeeId}
                        onChange={e => setFiltersState(p => ({ ...p, employeeId: e.target.value }))}>
                        <option value="">All Employees</option>
                        {employees.map(e => (
                            <option key={e.employeeId} value={e.employeeId}>
                                {e.empCode} — {e.employeeName}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="mh-filter-group" style={{ maxWidth:160 }}>
                    <label>Company / Outsource</label>
                    <select className="mh-filter-input" value={filters.empType}
                        onChange={e => setFiltersState(p => ({ ...p, empType: e.target.value }))}>
                        <option value="">All</option>
                        <option value="COMPANY">Company</option>
                        <option value="OUTSOURCED">Outsourced</option>
                    </select>
                </div>
                <div className="mh-filter-group" style={{ maxWidth:140 }}>
                    <label>Date From</label>
                    <input type="date" className="mh-filter-input"
                        value={filters.dateFrom}
                        onChange={e => setFiltersState(p => ({ ...p, dateFrom: e.target.value }))} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth:140 }}>
                    <label>Date To</label>
                    <input type="date" className="mh-filter-input"
                        value={filters.dateTo}
                        onChange={e => setFiltersState(p => ({ ...p, dateTo: e.target.value }))} />
                </div>
                <div className="mh-filter-group" style={{ maxWidth:140 }}>
                    <label>Status</label>
                    <select className="mh-filter-input" value={filters.status}
                        onChange={e => setFiltersState(p => ({ ...p, status: e.target.value }))}>
                        <option value="">All</option>
                        {getModuleStatuses('MH').map(s => <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>)}
                    </select>
                </div>
                <div className="mh-filter-group" style={{ maxWidth:130 }}>
                    <label>Doc No</label>
                    <input className="mh-filter-input" placeholder="MH-…"
                        value={filters.documentNo}
                        onChange={e => setFiltersState(p => ({ ...p, documentNo: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyFilters()} />
                </div>
                <button className="mh-filter-btn mh-filter-search" onClick={applyFilters}>Search</button>
                <button className="mh-filter-btn mh-filter-reset"  onClick={resetFilters}>Reset</button>
            </div>

            {/* Toolbar */}
            <div className="mh-toolbar">
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    <div className="mh-count-info">
                        {!hasSearched ? 'Use filters above and click Search' : loading ? 'Loading…' : `${totalRows.toLocaleString()} line${totalRows !== 1 ? 's' : ''}`}
                    </div>
                    {selected.size > 0 && (
                        <button
                            className="mh-btn-pri"
                            style={{ background:'#dc2626', height:30, fontSize:12.5, padding:'0 14px' }}
                            onClick={() => setBulkDeleteOpen(true)}>
                            🗑 Delete Selected ({selected.size})
                        </button>
                    )}
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:12, color:'#64748b' }}>Rows:</span>
                    {PAGE_SIZES.map(s => (
                        <button key={s} className={`mh-pag-btn ${pageSize === s ? 'active' : ''}`}
                            onClick={() => { setPageSize(s); setPage(1); }}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="mh-table-wrap">
                {!hasSearched ? (
                    <div className="mh-empty">
                        <div className="mh-empty-icon">🔍</div>
                        <div className="mh-empty-text">Set filters and click Search</div>
                        <div className="mh-empty-sub">Use Date, Job, Employee or other filters above to find lines</div>
                    </div>
                ) : !loading && rows.length === 0 ? (
                    <div className="mh-empty">
                        <div className="mh-empty-icon">📭</div>
                        <div className="mh-empty-text">No lines found</div>
                        <div className="mh-empty-sub">Try adjusting your filters</div>
                    </div>
                ) : (
                    <table className="mh-table">
                        <thead>
                            <tr>
                                <th style={{ width:36, textAlign:'center', padding:'10px 8px' }}>
                                    <input type="checkbox"
                                        checked={allSelected}
                                        ref={el => { if (el) el.indeterminate = someSelected; }}
                                        onChange={toggleAll}
                                        title={allSelected ? 'Deselect all on page' : 'Select all on page'}
                                        style={{ cursor:'pointer', width:15, height:15 }} />
                                </th>
                                <Th col="DocumentNo">Doc No</Th>
                                <Th col="DocumentDate">Date</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="EmpCode">Employee</Th>
                                <Th col="Hours" right>NH</Th>
                                <th style={{ textAlign:'right' }}>OT</th>
                                <th>Site</th>
                                <th>Type</th>
                                <th style={{ textAlign:'right' }}>NH Rate</th>
                                <th style={{ textAlign:'right' }}>OT Rate</th>
                                <Th col="Status">Status</Th>
                                <th>Created By</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.manhourId}
                                    style={selected.has(r.manhourId) ? { background:'#eff6ff' } : undefined}>
                                    <td style={{ textAlign:'center', padding:'0 8px' }}>
                                        <input type="checkbox"
                                            checked={selected.has(r.manhourId)}
                                            onChange={() => toggleRow(r.manhourId)}
                                            style={{ cursor:'pointer', width:15, height:15 }} />
                                    </td>
                                    <td>
                                        <span style={{ fontWeight:600, color:'#1d4ed8', cursor:'pointer', fontSize:12.5 }}
                                            onClick={() => navigate(`/manhour/${r.batchId}`)}>
                                            {r.documentNo}
                                        </span>
                                    </td>
                                    <td style={{ whiteSpace:'nowrap' }}>{fmtDate(r.documentDate)}</td>
                                    <td>
                                        <span style={{ fontFamily:'monospace', fontWeight:600, fontSize:12 }}>{r.jobId}</span>
                                        {r.jobDescription && (
                                            <div style={{ fontSize:10.5, color:'#94a3b8', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                {r.jobDescription}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight:500 }}>{r.employeeName}</div>
                                        <div style={{ fontSize:11, color:'#94a3b8' }}>{r.empCode}</div>
                                        {r.empType && (
                                            <span style={{
                                                fontSize:10, fontWeight:600, padding:'1px 5px', borderRadius:3,
                                                background: r.empType === 'COMPANY' ? '#eff6ff' : '#fef3c7',
                                                color:      r.empType === 'COMPANY' ? '#1d4ed8' : '#92400e',
                                            }}>
                                                {r.empType === 'COMPANY' ? 'Company' : 'Outsourced'}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ textAlign:'right', fontWeight:600 }}>{fmt(r.hours)}</td>
                                    <td style={{ textAlign:'right', color: r.overtimeHours > 0 ? '#1e293b' : '#94a3b8' }}>
                                        {r.overtimeHours > 0 ? fmt(r.overtimeHours) : '—'}
                                    </td>
                                    <td style={{ fontSize:12 }}>{r.site || '—'}</td>
                                    <td style={{ fontSize:12 }}>{r.mType || '—'}</td>
                                    <td style={{ textAlign:'right', fontSize:12, color: r.nhRate > 0 ? '#0f766e' : '#94a3b8' }}>
                                        {r.nhRate > 0 ? fmt(r.nhRate) : '—'}
                                    </td>
                                    <td style={{ textAlign:'right', fontSize:12, color: r.otRate > 0 ? '#0f766e' : '#94a3b8' }}>
                                        {r.otRate > 0 ? fmt(r.otRate) : '—'}
                                    </td>
                                    <td><StatusBadge status={r.status} /></td>
                                    <td style={{ fontSize:12, color:'#64748b' }}>{r.createdBy}</td>
                                    <td>
                                        <div className="mh-action-btns">
                                            <button className="mh-btn-icon" title="Edit line"
                                                onClick={() => setEditRow(r)}>✏️</button>
                                            <button className="mh-btn-icon danger" title="Delete line"
                                                onClick={() => setDeleteRow(r)}>🗑</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="mh-pagination">
                        <div className="mh-pag-info">
                            Page {page} of {totalPages} · {totalRows.toLocaleString()} lines
                        </div>
                        <div className="mh-pag-btns">
                            <button className="mh-pag-btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                            <button className="mh-pag-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                            {pageNums().map(n => (
                                <button key={n} className={`mh-pag-btn ${n === page ? 'active' : ''}`}
                                    onClick={() => setPage(n)}>{n}</button>
                            ))}
                            <button className="mh-pag-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                            <button className="mh-pag-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bulk delete confirmation */}
            {bulkDeleteOpen && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ background:'#fff', borderRadius:12, padding:28, maxWidth:460, width:'92%', boxShadow:'0 20px 50px rgba(0,0,0,.2)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                            <span style={{ fontSize:24 }}>⚠️</span>
                            <div style={{ fontSize:16, fontWeight:700, color:'#0f172a' }}>Delete {selected.size} Line{selected.size > 1 ? 's' : ''}?</div>
                        </div>

                        <div style={{ fontSize:13, color:'#475569', marginBottom:10 }}>
                            You are about to permanently soft-delete <strong>{selected.size} manhour line{selected.size > 1 ? 's' : ''}</strong> from the system.
                        </div>
                        <div style={{ fontSize:13, color:'#475569', marginBottom:10 }}>
                            This action affects lines across <strong>any status</strong> — including Approved batches. Deleted lines will be hidden from all reports and cost calculations immediately.
                        </div>
                        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:7, padding:'9px 13px', fontSize:12.5, color:'#991b1b', marginBottom:20 }}>
                            <strong>This cannot be undone</strong> through the UI. A database admin would be needed to restore soft-deleted records.
                        </div>

                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                            <button className="mh-btn-sec" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
                                Cancel
                            </button>
                            <button className="mh-btn-pri" style={{ background:'#dc2626' }}
                                onClick={doBulkDelete} disabled={bulkDeleting}>
                                {bulkDeleting ? `Deleting…` : `Delete ${selected.size} Line${selected.size > 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit modal */}
            {editRow && (
                <EditModal
                    row={editRow}
                    employees={employees}
                    jobs={jobs}
                    siteOptions={siteOptions}
                    typeOptions={typeOptions}
                    onSave={() => { setEditRow(null); showToast('Line updated.'); load(); }}
                    onClose={() => setEditRow(null)}
                />
            )}

            {/* Delete confirm */}
            {deleteRow && (
                <ConfirmDelete
                    row={deleteRow}
                    onConfirm={doDelete}
                    onCancel={() => setDeleteRow(null)}
                />
            )}

            {/* Toast */}
            <div className="mh-toast">
                {toast.map(t => (
                    <div key={t.id} className={`mh-toast-item mh-toast-${t.type}`}>{t.msg}</div>
                ))}
            </div>
        </div>
    );
};

export default ManhourAdmin;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import { STATUS, fmt, fmtDate } from './jobConstants';
import './JobList.css';

const PAGE_SIZES      = [10, 20, 50, 100];
const DEFAULT_FILTERS = { searchText: '', customerId: '', jobTypeId: '', jobStatusIds: '', jobStageId: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="jl-sort-none">⇅</span>;
    return <span className="jl-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ─────────────────────────────────────────────────────────────
// JOB LIST PAGE
// ─────────────────────────────────────────────────────────────
const JobList = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/jobs', 'ADD');

    const [rows,      setRows]     = useState([]);
    const [total,     setTotal]    = useState(0);
    const [pages,     setPages]    = useState(1);
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(20);
    const [sortCol,   setSortCol]  = useState('JobDate');
    const [sortDir,   setSortDir]  = useState('DESC');
    const [loading,   setLoading]  = useState(false);
    const [applied,   setApplied]  = useState({ ...DEFAULT_FILTERS });

    const [jobTypes,   setJobTypes]  = useState([]);
    const [jobStages,  setJobStages] = useState([]);
    const [customers,  setCustomers] = useState([]);

    const gridRef = useRef({ pageSize: 20, sortCol: 'JobDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    // Load lookups once
    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}job/types`,  { headers: h }).then(r => r.json()).then(d => setJobTypes(Array.isArray(d)  ? d : [])).catch(console.error);
        fetch(`${variables.API_URL}job/stages`, { headers: h }).then(r => r.json()).then(d => setJobStages(Array.isArray(d) ? d : [])).catch(console.error);
        fetch(`${variables.API_URL}customer/search?pageSize=500&page=1&sortCol=CustomerName&sortDir=ASC`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setCustomers(d.data || []))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)   q.set('searchText',   af.searchText);
        if (af.customerId)   q.set('customerId',   af.customerId);
        if (af.jobTypeId)    q.set('jobTypeId',    af.jobTypeId);
        if (af.jobStatusIds) q.set('jobStatusIds', af.jobStatusIds);
        if (af.jobStageId)   q.set('jobStageId',   af.jobStageId);
        if (af.dateFrom)     q.set('dateFrom',     af.dateFrom);
        if (af.dateTo)       q.set('dateTo',       af.dateTo);
        fetch(`${variables.API_URL}job/search?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => console.error('Load jobs:', e)).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    // Mount-only: register with empty options
    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('job', {
            searchText:   { label: 'Search',    type: 'text',        placeholder: 'Job ID, customer, project…' },
            customerId:   { label: 'Customer',  type: 'select',      placeholder: 'All Customers', options: [] },
            jobTypeId:    { label: 'Job Type',  type: 'select',      placeholder: 'All Types',     options: [] },
            jobStatusIds: { label: 'Status',    type: 'multiselect',
                            options: Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
            jobStageId:   { label: 'Stage',     type: 'select',      placeholder: 'All Stages',    options: [] },
            dateFrom:     { label: 'Date From', type: 'date' },
            dateTo:       { label: 'Date To',   type: 'date' },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('job');
    }, []); // eslint-disable-line

    // Patch dropdown options once fetches complete
    useEffect(() => {
        updateFilterDefs('job', {
            searchText:   { label: 'Search',    type: 'text',        placeholder: 'Job ID, customer, project…' },
            customerId:   { label: 'Customer',  type: 'select',      placeholder: 'All Customers',
                            options: customers.map(c => ({ value: String(c.customerId), label: c.customerName })) },
            jobTypeId:    { label: 'Job Type',  type: 'select',      placeholder: 'All Types',
                            options: jobTypes.map(t => ({ value: t.jobTypeId, label: t.jobTypeName })) },
            jobStatusIds: { label: 'Status',    type: 'multiselect',
                            options: Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label })) },
            jobStageId:   { label: 'Stage',     type: 'select',      placeholder: 'All Stages',
                            options: jobStages.map(s => ({ value: s.jobStageId, label: s.jobStageName })) },
            dateFrom:     { label: 'Date From', type: 'date' },
            dateTo:       { label: 'Date To',   type: 'date' },
        });
    }, [jobTypes, jobStages, customers]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage = (p) => {
        const pg = Math.max(1, Math.min(p, pages));
        setPage(pg); load(pg, pageSize, sortCol, sortDir, applied);
    };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const pageNums = () => {
        const range = 5, cur = page;
        let start = Math.max(1, cur - Math.floor(range / 2));
        let end   = Math.min(pages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const Th = ({ col, children, style }) => (
        <th className="jl-th-sortable" style={style} onClick={() => handleSort(col)}>
            <span className="jl-th-inner">
                {children}
                <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
            </span>
        </th>
    );

    return (
        <div className="jl-page">

            {/* ── Page Header ── */}
            <div className="jl-page-header">
                <div>
                    <h1 className="jl-page-title">Jobs</h1>
                    <p className="jl-page-sub">
                        {total} job{total !== 1 ? 's' : ''} total
                    </p>
                </div>
                <div className="jl-header-actions">
                    <select className="jl-page-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                    {canAdd && <button className="jl-btn-create" onClick={() => navigate('/jobs/new')}>
                        + New Job
                    </button>}
                </div>
            </div>

            {/* ── Grid ── */}
            <div className="jl-grid-wrap">
                <div className="jl-table-wrap">
                    {loading && (
                        <div className="jl-loading-overlay">
                            <div className="jl-spinner"><div className="jl-spinner-ring" /></div>
                            <span>Loading jobs…</span>
                        </div>
                    )}
                    <table className={`jl-table${loading ? ' jl-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="JobId">Job No.</Th>
                                <Th col="JobDate">Date</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="ProjectName">Project</Th>
                                <Th col="JobTypeName">Type</Th>
                                <Th col="JobStageName">Stage</Th>
                                <Th col="CurrencySymbol" style={{ textAlign: 'center' }}>Curr</Th>
                                <Th col="OrderValue" style={{ textAlign: 'right' }}>Order Value</Th>
                                <th>Status</th>
                                <th style={{ width: 80 }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan="10" className="jl-empty">
                                        <div className="jl-empty-icon">📋</div>
                                        <div>No jobs found.</div>
                                        <div className="jl-empty-sub">Adjust filters or create a new job.</div>
                                    </td>
                                </tr>
                            ) : rows.map(j => {
                                const st = STATUS[j.jobStatusId] || STATUS[1];
                                return (
                                    <tr key={j.jobId}
                                        className="jl-row"
                                        onClick={() => navigate(`/jobs/${j.jobId}`)}>
                                        <td>
                                            <span className="jl-job-id">{j.jobId}</span>
                                        </td>
                                        <td className="jl-date-cell">{fmtDate(j.jobDate)}</td>
                                        <td>
                                            <div className="jl-cust-name">{j.customerName || '—'}</div>
                                            {j.customerCode && <div className="jl-cust-code">{j.customerCode}</div>}
                                        </td>
                                        <td className="jl-project-cell" title={j.projectName}>{j.projectName || '—'}</td>
                                        <td><span className="jl-type-badge">{j.jobTypeName || '—'}</span></td>
                                        <td className="jl-stage-cell">{j.jobStageName || '—'}</td>
                                        <td style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: j.jobExcRate && j.jobExcRate !== 1 ? '#7c3aed' : '#64748b' }}>
                                            {j.currencySymbol || '—'}
                                        </td>
                                        <td className="jl-num-cell">{j.orderValue ? fmt(j.orderValue) : '—'}</td>
                                        <td>
                                            <span className="jl-status-badge"
                                                style={{ background: st.bg, color: st.color }}>
                                                <span className="jl-status-dot" style={{ background: st.dot }} />
                                                {st.label}
                                            </span>
                                        </td>
                                        <td onClick={e => e.stopPropagation()}>
                                            <button className="jl-open-btn"
                                                onClick={() => navigate(`/jobs/${j.jobId}`)}>
                                                Open →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                <div className="jl-pagination">
                    <span className="jl-page-info">
                        Page <strong>{page}</strong> of <strong>{pages}</strong>
                        &nbsp;·&nbsp;{total} record{total !== 1 ? 's' : ''}
                    </span>
                    <div className="jl-page-controls">
                        <button className="jl-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="jl-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n}
                                className={`jl-page-btn ${n === page ? 'jl-page-active' : ''}`}
                                onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="jl-page-btn" onClick={() => goPage(page + 1)} disabled={page >= pages}>›</button>
                        <button className="jl-page-btn" onClick={() => goPage(pages)}    disabled={page >= pages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JobList;

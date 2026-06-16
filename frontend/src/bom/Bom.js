import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import { useFieldConfig } from '../FieldConfigContext';
import { usePermission } from '../PermissionContext';
import BomCopy from './BomCopy';
import './Bom.css';

const PAGE_SIZES      = [10, 20, 50, 100];
const DEFAULT_FILTERS = { searchText: '', bomStatus: '', dateFrom: '', dateTo: '' };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmt     = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="bom-sort-none">⇅</span>;
    return <span className="bom-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const STATUS_COLORS = {
    Draft:    { bg: '#fef9c3', color: '#854d0e' },
    Approved: { bg: '#dcfce7', color: '#166534' },
};

// statusList comes from vlist['Procurement.BOMHeaderStatus']
const StatusBadge = ({ status, statusList }) => {
    const s     = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
    const label = statusList?.find(v => v.value === status)?.label || status;
    return (
        <span className="bom-status-badge" style={{ background: s.bg, color: s.color }}>
            {label}
        </span>
    );
};

// ── Job search widget (inside New BOM slide-over) ───────────────
// onChange(jobId, label, jobTypeId) — passes job type so form can auto-fill
const JobSearchInput = ({ value, label, onChange, error }) => {
    const [query,   setQuery]   = useState(label || '');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);
    const wrap  = useRef(null);

    useEffect(() => {
        const h = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const search = (q) => {
        setQuery(q);
        if (!q) { onChange('', ''); }
        clearTimeout(timer.current);
        if (!q.trim()) { setResults([]); setOpen(false); return; }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(q)}&pageSize=10&page=1&sortCol=JobDate&sortDir=DESC&excludeClosedStatus=true`, { headers: authHeaders() });
                const d = await r.json();
                setResults(d.data || []);
                setOpen(true);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const select = (j) => {
        const lbl = `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`;
        setQuery(lbl);
        setOpen(false);
        onChange(j.jobId, lbl, j.jobTypeId || '');
    };

    return (
        <div className="bom-item-search" ref={wrap}>
            <input
                className={`bf-input${error ? ' bf-input-err' : ''}`}
                placeholder="Type Job ID or description to search…"
                value={query}
                onChange={e => search(e.target.value)}
            />
            {loading && <span className="bom-is-spinner" />}
            {open && results.length > 0 && (
                <div className="bom-is-dropdown">
                    {results.map(j => (
                        <div key={j.jobId} className="bom-is-option" onClick={() => select(j)}>
                            <span className="bom-is-code">{j.jobId}</span>
                            <span className="bom-is-name">{j.projectName || '—'}</span>
                            {j.customerName && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 'auto' }}>{j.customerName}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── New BOM slide-over ──────────────────────────────────────────
const NewBomForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { isReq }   = useFieldConfig('BOM');
    const [jobTypes, setJobTypes] = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobTypes(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const [form, setForm] = useState({
        jobId:          '',
        jobLabel:       '',
        jobTypeId:      '',
        bomDate:        new Date().toISOString().slice(0, 10),
        bomDescription: '',
        bomVersion:     1,
    });
    const [errors,    setErrors]    = useState({});
    const [saving,    setSaving]    = useState(false);
    const [saveError, setSaveError] = useState('');

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const validate = () => {
        const e = {};
        if (!form.jobId)     e.jobId     = 'Job is required.';
        if (!form.jobTypeId) e.jobTypeId = 'Job Type is required.';
        if (!form.bomDate)   e.bomDate   = 'BOM Date is required.';
        return e;
    };

    const save = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length) return;
        setSaving(true); setSaveError('');
        try {
            const res = await fetch(`${variables.API_URL}bom/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    bomHeaderId:    0,
                    jobId:          form.jobId,
                    jobTypeId:      form.jobTypeId,
                    bomDate:        form.bomDate,
                    bomDescription: form.bomDescription || null,
                    bomVersion:     form.bomVersion,
                    createdBy:      currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setSaveError(d?.message || 'Save failed.'); return; }
            onSaved(d.bomHeaderId);
        } catch { setSaveError('Network error.'); }
        finally { setSaving(false); }
    };

    const Sec = ({ label }) => (
        <div className="bf-section">
            <span className="bf-section-label">{label}</span>
            <div className="bf-section-line" />
        </div>
    );

    return (
        <div className="bf-overlay">
            <div className="bf-panel" onClick={e => e.stopPropagation()}>
                <div className="bf-header">
                    <div>
                        <div className="bf-header-title">+ New BOM</div>
                        <div className="bf-header-sub">Create a Bill of Materials for a job</div>
                    </div>
                    <button className="bf-close" onClick={onClose}>✕</button>
                </div>

                <div className="bf-body">
                    {saveError && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>
                            ❌ {saveError}
                        </div>
                    )}

                    <Sec label="Job" />
                    <div className="bf-row">
                        <div className="bf-field bf-f2">
                            <label>Job {isReq('jobId') && <span className="req">*</span>}</label>
                            <JobSearchInput
                                value={form.jobId}
                                label={form.jobLabel}
                                error={!!errors.jobId}
                                onChange={(id, lbl, typeId) => {
                                    setForm(f => ({ ...f, jobId: id, jobLabel: lbl, jobTypeId: typeId || f.jobTypeId }));
                                    setErrors(p => ({ ...p, jobId: undefined, jobTypeId: undefined }));
                                }}
                            />
                            {errors.jobId && <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.jobId}</span>}
                        </div>
                        <div className="bf-field" style={{ flex: '0 0 200px' }}>
                            <label>Job Type {isReq('jobTypeId') && <span className="req">*</span>}</label>
                            <select
                                className={`bf-input${errors.jobTypeId ? ' bf-input-err' : ''}`}
                                value={form.jobTypeId}
                                onChange={e => { set('jobTypeId', e.target.value); setErrors(p => ({ ...p, jobTypeId: undefined })); }}
                            >
                                <option value="">— Select Type —</option>
                                {jobTypes.map(t => (
                                    <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>
                                ))}
                            </select>
                            {errors.jobTypeId && <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.jobTypeId}</span>}
                        </div>
                    </div>

                    <Sec label="BOM Details" />
                    <div className="bf-row">
                        <div className="bf-field" style={{ flex: '0 0 160px' }}>
                            <label>BOM Date {isReq('bomDate') && <span className="req">*</span>}</label>
                            <input type="date" className={`bf-input${errors.bomDate ? ' bf-input-err' : ''}`}
                                value={form.bomDate} onChange={e => set('bomDate', e.target.value)} />
                            {errors.bomDate && <span style={{ color: '#dc2626', fontSize: 11 }}>{errors.bomDate}</span>}
                        </div>
                        <div className="bf-field" style={{ flex: '0 0 100px' }}>
                            <label>Version</label>
                            <input type="number" className="bf-input" min={1} max={99}
                                value={form.bomVersion}
                                onChange={e => set('bomVersion', parseInt(e.target.value) || 1)} />
                        </div>
                    </div>
                    <div className="bf-row">
                        <div className="bf-field bf-f2">
                            <label>Description</label>
                            <textarea className="bf-input bf-textarea" rows={3}
                                placeholder="Optional BOM description…"
                                value={form.bomDescription}
                                onChange={e => set('bomDescription', e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="bf-footer">
                    <button className="bf-btn-sec" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="bf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create BOM'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main BOM List Page ──────────────────────────────────────────
export const Bom = () => {
    const navigate = useNavigate();
    const { canDo } = usePermission();
    const canAdd    = canDo('/bom', 'ADD');
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { vlist } = useLookup();
    const bomHeaderStatuses = vlist?.['Procurement.BOMHeaderStatus'] || [];

    const [rows,      setRows]      = useState([]);
    const [totalRows, setTotal]     = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,      setPage]      = useState(1);
    const [pageSize,  setPageSize]  = useState(20);
    const [sortCol,   setSortCol]   = useState('BomDate');
    const [sortDir,   setSortDir]   = useState('DESC');
    const [loading,   setLoading]   = useState(false);
    const [applied,   setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,  setShowForm]  = useState(false);
    const [showCopy,  setShowCopy]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'BomDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortColumn: sc, sortDirection: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.bomStatus)  q.set('bomStatus',  af.bomStatus);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}bom/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(Math.ceil((res.totalRows || 0) / ps) || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (statuses) => ({
        searchText: { label: 'Search',     type: 'text',   placeholder: 'Job no., customer, description…' },
        bomStatus:  { label: 'BOM Status', type: 'select', placeholder: 'All Statuses',
                      options: statuses.map(s => ({ value: s.value, label: s.label })) },
        dateFrom:   { label: 'Date From',  type: 'text',   placeholder: 'YYYY-MM-DD' },
        dateTo:     { label: 'Date To',    type: 'text',   placeholder: 'YYYY-MM-DD' },
    });

    // Register filter panel once on mount with empty options
    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals });
            setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('bom', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('bom');
    }, []); // eslint-disable-line

    // Patch status options once vlist loads (never causes a re-registration loop)
    useEffect(() => {
        if (!bomHeaderStatuses.length) return;
        updateFilterDefs('bom', buildDefs(bomHeaderStatuses));
    }, [bomHeaderStatuses]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage = (p) => {
        const pg = Math.max(1, Math.min(p, totalPages));
        setPage(pg);
        load(pg, pageSize, sortCol, sortDir, applied);
    };

    const changePageSize = (ps) => {
        setPageSize(ps); setPage(1);
        load(1, ps, sortCol, sortDir, applied);
    };

    const Th = ({ col, children, style }) => (
        <th className="bom-th-sortable" style={style} onClick={() => handleSort(col)}>
            <span className="bom-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></span>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="bom-page">
            {showForm && (
                <NewBomForm
                    onClose={() => setShowForm(false)}
                    onSaved={id => { setShowForm(false); navigate(`/bom/${id}`); }}
                />
            )}
            {showCopy && (
                <BomCopy onClose={() => setShowCopy(false)} />
            )}

            <div className="bom-grid-wrap">
                <div className="bom-grid-header">
                    <div className="bom-title-row">
                        <div>
                            <h2 className="bom-page-title">Bill of Materials</h2>
                            <div className="bom-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="bom-toolbar">
                            <select className="bom-select" style={{ width: 110 }} value={pageSize}
                                onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && (
                                <button className="bom-btn-sec" onClick={() => setShowCopy(true)}
                                    title="Create a new BOM by copying from an existing one">
                                    ⎘ Copy BOM
                                </button>
                            )}
                            {canAdd && <button className="bom-btn-pri" onClick={() => setShowForm(true)}>+ New BOM</button>}
                        </div>
                    </div>
                </div>

                <div className="bom-table-wrap">
                    {loading && (
                        <div className="bom-loading-overlay">
                            <div className="bom-spinner">
                                <div className="bom-spinner-ring" />
                                <span className="bom-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`bom-table${loading ? ' bom-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="JobId">Job No.</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="BomDate">Date</Th>
                                <Th col="JobTypeName">Job Type</Th>
                                <th>Ver.</th>
                                <th>Lines</th>
                                <Th col="TotalBomValue" style={{ textAlign: 'right' }}>Total Value</Th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan="9" className="bom-empty">No BOMs found. Use the filters on the left or create a new BOM.</td></tr>
                            ) : (
                                rows.map(r => (
                                    <tr key={r.bomHeaderId}>
                                        <td>
                                            <button className="bom-id-link"
                                                onClick={() => navigate(`/bom/${r.bomHeaderId}`)}>
                                                {r.jobId}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="bom-name-cell">
                                                <span className="bom-name-main" title={r.customerName}>{r.customerName || '—'}</span>
                                            </div>
                                        </td>
                                        <td>{fmtDate(r.bomDate)}</td>
                                        <td><span className="bom-type-badge">{r.jobTypeName || '—'}</span></td>
                                        <td className="bom-version">v{r.bomVersion}</td>
                                        <td style={{ color: '#64748b' }}>{r.lineCount}</td>
                                        <td className="bom-num-cell">{r.totalBomValue > 0 ? fmt(r.totalBomValue) : '—'}</td>
                                        <td><StatusBadge status={r.bomStatus} statusList={bomHeaderStatuses} /></td>
                                        <td className="bom-actions-cell">
                                            <button className="bom-act-btn bom-act-open"
                                                onClick={() => navigate(`/bom/${r.bomHeaderId}`)}>Open</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="bom-pagination">
                    <div className="bom-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="bom-page-controls">
                        <button className="bom-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="bom-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n}
                                className={`bom-page-btn${n === page ? ' bom-page-btn-active' : ''}`}
                                onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="bom-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                        <button className="bom-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Bom;

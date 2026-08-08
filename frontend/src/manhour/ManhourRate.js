import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import AmountInput from '../common/AmountInput';
import '../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];

// ── Scope badge ───────────────────────────────────────────────────────────────
const ScopeBadge = ({ label }) => {
    const styles = {
        'Job':      { background: '#dbeafe', color: '#1e40af' },
        'Job Type': { background: '#ede9fe', color: '#5b21b6' },
        'Default':  { background: '#dcfce7', color: '#166534' },
    };
    const s = styles[label] || styles['Default'];
    return (
        <span style={{ ...s, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
            {label}
        </span>
    );
};

// ── Job live-search widget ────────────────────────────────────────────────────
const JobSearch = ({ value, label, onChange, onClear, disabled }) => {
    const [query,   setQuery]   = useState(label || '');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const [loading, setLoading] = useState(false);
    const timer  = useRef(null);
    const wrapRef = useRef(null);

    // Sync label when parent changes (e.g. edit mode pre-fill)
    useEffect(() => { setQuery(label || ''); }, [label]);

    // Close on outside click
    useEffect(() => {
        const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const search = q => {
        if (!q.trim()) { setResults([]); setOpen(false); return; }
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            setLoading(true);
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(q)}&pageSize=10&approvalStatus=Approved`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setResults(d.data || []); setOpen(true); })
                .catch(() => {})
                .finally(() => setLoading(false));
        }, 280);
    };

    const pick = job => {
        onChange(job.jobId, `${job.jobId}${job.projectName ? ' — ' + job.projectName : ''}`);
        setQuery(`${job.jobId}${job.projectName ? ' — ' + job.projectName : ''}`);
        setOpen(false);
    };

    const clear = () => {
        setQuery('');
        setResults([]);
        setOpen(false);
        onClear();
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4 }}>
                <input
                    className="pf-input"
                    type="text"
                    placeholder="Search job no or description…"
                    value={query}
                    disabled={disabled}
                    onChange={e => { setQuery(e.target.value); search(e.target.value); }}
                    autoComplete="off"
                />
                {value && (
                    <button type="button" onClick={clear}
                        style={{ border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: 6,
                            padding: '0 8px', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>
                        ✕
                    </button>
                )}
            </div>
            {open && results.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,.10)', maxHeight: 220, overflowY: 'auto',
                }}>
                    {loading && <div style={{ padding: '8px 12px', fontSize: 12, color: '#94a3b8' }}>Searching…</div>}
                    {results.map(j => (
                        <div key={j.jobId}
                            onMouseDown={() => pick(j)}
                            style={{
                                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                borderBottom: '1px solid #f1f5f9',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 12,
                                background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, marginRight: 6 }}>
                                {j.jobId}
                            </span>
                            {j.projectName}
                            {j.customerName && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>· {j.customerName}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Add / Edit form panel ─────────────────────────────────────────────────────
const RateForm = ({ initial, jobTypes, baseCurrencyCode, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isNew = !initial?.rateId;

    const [form, setForm] = useState({
        scopeType:    initial?.jobId ? 'job' : initial?.jobTypeId ? 'jobtype' : 'default',
        jobTypeId:    initial?.jobTypeId    || '',
        jobId:        initial?.jobId        || '',
        jobLabel:     initial?.jobId ? `${initial.jobId}${initial.projectName ? ' — ' + initial.projectName : ''}` : '',
        effectiveFrom: initial?.effectiveFrom ? initial.effectiveFrom.slice(0, 10) : '',
        effectiveTo:   initial?.effectiveTo   ? initial.effectiveTo.slice(0, 10)   : '',
        nhRate:        initial?.nhRate  != null ? String(initial.nhRate)  : '0',
        otRate:        initial?.otRate  != null ? String(initial.otRate)  : '0',
        remarks:       initial?.remarks || '',
        isActive:      initial?.isActive ?? true,
    });
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (form.scopeType === 'jobtype' && !form.jobTypeId) e.jobTypeId = 'Please select a job type.';
        if (form.scopeType === 'job'     && !form.jobId)     e.jobId     = 'Please select a job.';
        if (!form.effectiveFrom) e.effectiveFrom = 'Effective From is required.';
        if (!form.effectiveTo)   e.effectiveTo   = 'Effective To is required.';
        if (form.effectiveFrom && form.effectiveTo && form.effectiveTo < form.effectiveFrom)
            e.effectiveTo = 'Effective To must be on or after Effective From.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}manhour-rate/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                rateId:        isNew ? 0 : initial.rateId,
                jobTypeId:     form.scopeType === 'jobtype' ? form.jobTypeId : null,
                jobId:         form.scopeType === 'job'     ? form.jobId     : null,
                effectiveFrom: form.effectiveFrom,
                effectiveTo:   form.effectiveTo,
                nhRate:        parseFloat(form.nhRate)  || 0,
                otRate:        parseFloat(form.otRate)  || 0,
                remarks:       form.remarks.trim() || null,
                isActive:      form.isActive,
                savedBy:       currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                onSaved();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 520 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">{isNew ? 'New Rate' : 'Edit Rate'}</div>
                        {!isNew && (
                            <div className="pf-header-sub">
                                <ScopeBadge label={initial.scopeLabel} />
                                &nbsp;{initial.scopeLabel === 'Job Type' ? initial.jobTypeName :
                                       initial.scopeLabel === 'Job'      ? initial.jobId : 'Global Default'}
                            </div>
                        )}
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    {/* ── Scope selector ── */}
                    <div className="pf-field">
                        <label>Scope <span className="req">*</span></label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[['default','Global Default'],['jobtype','Job Type'],['job','Specific Job']].map(([val, lbl]) => (
                                <button key={val} type="button"
                                    onClick={() => setForm(p => ({ ...p, scopeType: val, jobTypeId: '', jobId: '', jobLabel: '' }))}
                                    style={{
                                        flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                                        border: form.scopeType === val ? '2px solid #1d4ed8' : '1px solid #e2e8f0',
                                        background: form.scopeType === val ? '#eff6ff' : '#fff',
                                        color:      form.scopeType === val ? '#1d4ed8' : '#64748b',
                                        fontWeight: form.scopeType === val ? 600 : 400,
                                    }}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Conditional scope field ── */}
                    {form.scopeType === 'jobtype' && (
                        <div className="pf-field">
                            <label>Job Type <span className="req">*</span></label>
                            <select className={`pf-input${errors.jobTypeId ? ' pf-input-err' : ''}`}
                                name="jobTypeId" value={form.jobTypeId} onChange={handle}>
                                <option value="">— Select job type —</option>
                                {jobTypes.map(jt => (
                                    <option key={jt.jobTypeId} value={jt.jobTypeId}>{jt.jobTypeName}</option>
                                ))}
                            </select>
                            {errors.jobTypeId && <span className="pf-field-err">{errors.jobTypeId}</span>}
                        </div>
                    )}

                    {form.scopeType === 'job' && (
                        <div className="pf-field">
                            <label>Job <span className="req">*</span></label>
                            <JobSearch
                                value={form.jobId}
                                label={form.jobLabel}
                                onChange={(id, lbl) => {
                                    setForm(p => ({ ...p, jobId: id, jobLabel: lbl }));
                                    if (errors.jobId) setErrors(p => ({ ...p, jobId: undefined }));
                                }}
                                onClear={() => setForm(p => ({ ...p, jobId: '', jobLabel: '' }))}
                            />
                            {errors.jobId && <span className="pf-field-err">{errors.jobId}</span>}
                        </div>
                    )}

                    {/* ── Date range ── */}
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Effective From <span className="req">*</span></label>
                            <input className={`pf-input${errors.effectiveFrom ? ' pf-input-err' : ''}`}
                                type="date" name="effectiveFrom" value={form.effectiveFrom} onChange={handle} />
                            {errors.effectiveFrom && <span className="pf-field-err">{errors.effectiveFrom}</span>}
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Effective To <span className="req">*</span></label>
                            <input className={`pf-input${errors.effectiveTo ? ' pf-input-err' : ''}`}
                                type="date" name="effectiveTo" value={form.effectiveTo} onChange={handle} />
                            {errors.effectiveTo && <span className="pf-field-err">{errors.effectiveTo}</span>}
                        </div>
                    </div>

                    {/* ── Rates ── */}
                    {baseCurrencyCode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                            background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#0369a1' }}>
                            <span>💱</span>
                            <span>Rates are in <strong>{baseCurrencyCode}</strong> (base currency). Cost = hours × rate.</span>
                        </div>
                    )}
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>NH Rate — Normal Hours {baseCurrencyCode && <span style={{ fontWeight: 700, color: '#0369a1' }}>({baseCurrencyCode})</span>}</label>
                            <AmountInput className="pf-input" decimals={4} placeholder="0.0000"
                                value={form.nhRate} onChange={v => handle({ target: { name: 'nhRate', value: v } })} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>OT Rate — Overtime {baseCurrencyCode && <span style={{ fontWeight: 700, color: '#0369a1' }}>({baseCurrencyCode})</span>}</label>
                            <AmountInput className="pf-input" decimals={4} placeholder="0.0000"
                                value={form.otRate} onChange={v => handle({ target: { name: 'otRate', value: v } })} />
                        </div>
                    </div>

                    {/* ── Remarks + Active ── */}
                    <div className="pf-field">
                        <label>Remarks</label>
                        <input className="pf-input" type="text" name="remarks"
                            value={form.remarks} onChange={handle} placeholder="Optional note…" />
                    </div>

                    {!isNew && (
                        <div className="pf-field">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" name="isActive" checked={form.isActive} onChange={handle}
                                    style={{ width: 15, height: 15, accentColor: '#16a34a' }} />
                                Active
                            </label>
                        </div>
                    )}
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : isNew ? 'Create' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main list page ────────────────────────────────────────────────────────────
const ManhourRate = () => {
    const { baseCurrencyCode } = useLookup();
    const [rows,         setRows]        = useState([]);
    const [jobTypes,     setJobTypes]    = useState([]);
    const [loading,      setLoading]     = useState(false);
    const [search,       setSearch]      = useState('');
    const [scopeFilter,  setScopeFilter] = useState('all');
    const [statusFilter, setStatusFilter]= useState('active');
    const [pageSize,     setPageSize]    = useState(200);
    const [page,         setPage]        = useState(1);
    const [sortCol,      setSortCol]     = useState('priority');
    const [sortDir,      setSortDir]     = useState('ASC');
    const [formTarget,   setFormTarget]  = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            fetch(`${variables.API_URL}manhour-rate`, { headers: authHeaders() }).then(r => r.json()),
            fetch(`${variables.API_URL}job/types`,    { headers: authHeaders() }).then(r => r.json()),
        ])
            .then(([rates, types]) => {
                setRows(Array.isArray(rates) ? rates : []);
                setJobTypes(Array.isArray(types) ? types : []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Filter ──────────────────────────────────────────────────────────────
    const filtered = rows.filter(r => {
        const q = search.toLowerCase();
        const matchSearch = !q ||
            (r.jobTypeName    || '').toLowerCase().includes(q) ||
            (r.jobId          || '').toLowerCase().includes(q) ||
            (r.jobDescription || '').toLowerCase().includes(q) ||
            (r.remarks        || '').toLowerCase().includes(q);
        const matchScope =
            scopeFilter === 'all'     ? true :
            scopeFilter === 'default' ? r.priority === 3 :
            scopeFilter === 'jobtype' ? r.priority === 2 :
                                        r.priority === 1;
        const matchStatus =
            statusFilter === 'all'    ? true :
            statusFilter === 'active' ? r.isActive : !r.isActive;
        return matchSearch && matchScope && matchStatus;
    });

    // ── Sort ────────────────────────────────────────────────────────────────
    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
        return sortDir === 'ASC' ? cmp : -cmp;
    });

    // ── Paginate ────────────────────────────────────────────────────────────
    const totalRows  = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize);

    const handleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
        else { setSortCol(col); setSortDir('ASC'); }
        setPage(1);
    };

    const goPage = p => setPage(Math.max(1, Math.min(p, totalPages)));

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
        return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
    };

    const Th = ({ col, children, style }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)} style={style}>
            <div className="po-th-inner">{children} <SortIcon col={col} /></div>
        </th>
    );

    const fmt = v => v > 0
        ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 4 })
        : <span style={{ color: '#cbd5e1' }}>—</span>;

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const toggleBtn = (val, active, onClick, label) => (
        <button key={val} onClick={onClick}
            style={{
                padding: '5px 11px', fontSize: 12, border: 'none', cursor: 'pointer',
                background: active ? '#1d4ed8' : '#fff',
                color:      active ? '#fff'    : '#64748b',
                fontWeight: active ? 600 : 400,
            }}>
            {label}
        </button>
    );

    return (
        <div className="po-page">
            {formTarget !== null && (
                <RateForm
                    initial={formTarget || null}
                    jobTypes={jobTypes}
                    baseCurrencyCode={baseCurrencyCode}
                    onClose={() => setFormTarget(null)}
                    onSaved={() => { setFormTarget(null); load(); }}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Manhour Rates</div>
                            <div className="po-page-sub">
                                {rows.length} total &nbsp;·&nbsp;
                                {rows.filter(r => r.priority === 3).length} default &nbsp;·&nbsp;
                                {rows.filter(r => r.priority === 2).length} job-type &nbsp;·&nbsp;
                                {rows.filter(r => r.priority === 1).length} job-specific
                            </div>
                        </div>
                        <button className="po-btn-pri" onClick={() => setFormTarget(false)}>+ New Rate</button>
                    </div>
                    <div className="po-toolbar" style={{ justifyContent: 'flex-start', paddingTop: 10 }}>
                        {/* Scope toggle */}
                        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                            {[['all','All'],['default','Default'],['jobtype','Job Type'],['job','Job']].map(([val, lbl]) =>
                                toggleBtn(val, scopeFilter === val, () => { setScopeFilter(val); setPage(1); }, lbl)
                            )}
                        </div>
                        {/* Status toggle */}
                        <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                            {[['active','Active'],['inactive','Inactive'],['all','All']].map(([val, lbl]) =>
                                toggleBtn(val, statusFilter === val, () => { setStatusFilter(val); setPage(1); }, lbl)
                            )}
                        </div>
                        <input className="pf-input"
                            style={{ width: 200, padding: '5px 10px', fontSize: 13 }}
                            type="text" placeholder="Search…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }} />
                        <select className="po-select" value={pageSize}
                            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <span className="po-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="priority">Scope</Th>
                                <Th col="jobTypeName">Job Type / Job</Th>
                                <Th col="effectiveFrom">Effective From</Th>
                                <Th col="effectiveTo">Effective To</Th>
                                <Th col="nhRate" style={{ textAlign: 'right' }}>NH Rate {baseCurrencyCode && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1' }}>({baseCurrencyCode})</span>}</Th>
                                <Th col="otRate" style={{ textAlign: 'right' }}>OT Rate {baseCurrencyCode && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1' }}>({baseCurrencyCode})</span>}</Th>
                                <th className="po-th">Remarks</th>
                                <Th col="isActive">Status</Th>
                                <th className="po-th">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No rates found.</td></tr>
                            ) : paginated.map(r => (
                                <tr key={r.rateId} style={!r.isActive ? { opacity: 0.55 } : {}}>
                                    <td><ScopeBadge label={r.scopeLabel} /></td>
                                    <td style={{ fontWeight: 500 }}>
                                        {r.scopeLabel === 'Job Type' && (
                                            <span style={{
                                                fontFamily: 'Courier New', fontSize: 12, fontWeight: 700,
                                                background: '#f3f0ff', color: '#5b21b6',
                                                padding: '2px 7px', borderRadius: 4
                                            }}>{r.jobTypeName}</span>
                                        )}
                                        {r.scopeLabel === 'Job' && (
                                            <>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontSize: 12, fontWeight: 700,
                                                    background: '#f1f5f9', color: '#334155',
                                                    padding: '2px 7px', borderRadius: 4, marginRight: 6
                                                }}>{r.jobId}</span>
                                                <span style={{ color: '#64748b', fontSize: 12 }}>{r.jobDescription}</span>
                                            </>
                                        )}
                                        {r.scopeLabel === 'Default' && (
                                            <span style={{ color: '#64748b', fontSize: 12, fontStyle: 'italic' }}>Global Default</span>
                                        )}
                                    </td>
                                    <td style={{ color: '#475569' }}>{fmtDate(r.effectiveFrom)}</td>
                                    <td style={{ color: '#475569' }}>{fmtDate(r.effectiveTo)}</td>
                                    <td style={{ textAlign: 'right', paddingRight: 24, fontWeight: 500 }}>{fmt(r.nhRate)}</td>
                                    <td style={{ textAlign: 'right', paddingRight: 24, fontWeight: 500 }}>{fmt(r.otRate)}</td>
                                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{r.remarks || ''}</td>
                                    <td>
                                        {r.isActive
                                            ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Active</span>
                                            : <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Inactive</span>}
                                    </td>
                                    <td>
                                        <button className="po-act-btn po-act-open" onClick={() => setFormTarget(r)}>Edit</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`}
                                onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManhourRate;

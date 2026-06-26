import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, statusBadgeCfg } from '../inventoryConstants';
import '../Inventory.css';
import { useFieldConfig } from '../../FieldConfigContext';
import '../../procurement/Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_FILTERS = { searchText: '', status: '', jobId: '', costingType: '', createdBy: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── New Issue Note form ───────────────────────────────────────
const IssueForm = ({ onClose, onSaved, issueTypes }) => {
    const currentUser = useCurrentUser();
    const { isReq } = useFieldConfig('ISSUE');
    const [form, setForm]           = useState({ issueDate: today(), jobId: '', costingType: '', issuedTo: '', notes: '' });
    const [errors, setErrors]       = useState({});
    const [serverErr, setServerErr] = useState('');
    const [draftWarn, setDraftWarn] = useState(null);
    const [saving, setSaving]       = useState(false);
    const [previewNo, setPreviewNo] = useState('');
    // Job-linked display fields (non-editable)
    const [jobCustomer, setJobCustomer] = useState('');
    const [jobProject,  setJobProject]  = useState('');

    // Fetch preview number once on mount
    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/ISN`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    // Issue Type is mandatory — the user must explicitly choose one;
    // we no longer auto-default to the first option so they see "-- Select --".

    // Job live-search (exclude Closed/Cancelled/Freezed via IsClosedStatus filter)
    const [jobSearch, setJobSearch]   = useState('');
    const [jobResults, setJobResults] = useState([]);
    const [jobLabel, setJobLabel]     = useState('');

    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const validate = (f) => {
        const e = {};
        if (!f.issueDate)         e.issueDate   = 'Issue Date is required.';
        if (!f.costingType)       e.costingType = 'Issue Type is required.';
        if (!f.jobId.trim())      e.jobId       = 'Job is required.';
        if (!f.issuedTo.trim())   e.issuedTo    = 'Issued To is required.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length) return;
        setServerErr(''); setSaving(true);
        fetch(`${variables.API_URL}stockissue/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ issueId: 0, issueDate: form.issueDate, jobId: form.jobId, costingType: form.costingType, issuedTo: form.issuedTo.trim(), notes: form.notes || null, createdBy: currentUser }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setServerErr(d.message || 'Error saving.'); return; } onSaved(d.issueId); })
            .catch(() => setServerErr('Network error.'))
            .finally(() => setSaving(false));
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            {/* ── Draft Issue Notes warning modal ── */}
            {draftWarn && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 480, width: '92%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 22 }}>⚠️</span>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Draft Issue Notes already exist for this job</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Consider opening one of these before creating a new issue note.</div>
                            </div>
                        </div>
                        <div style={{ borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', padding: '8px 0', marginBottom: 16 }}>
                            {draftWarn.map(r => (
                                <div key={r.issueId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #fef3c7' }}>
                                    <span style={{ fontFamily: 'Courier New', fontSize: 12, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 7px', borderRadius: 4 }}>
                                        {r.issueNo}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {(r.lineCount ?? 0) === 0
                                            ? <span style={{ color: '#dc2626', fontWeight: 600 }}>No lines</span>
                                            : `${r.lineCount} line${r.lineCount !== 1 ? 's' : ''}`}
                                        {r.issueDate ? ` · ${fmtDate(r.issueDate)}` : ''}
                                    </span>
                                    <a href={`/inventory-issue/${r.issueId}`} target="_blank" rel="noreferrer"
                                        style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                                        Open ↗
                                    </a>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setDraftWarn(null)}
                                style={{ padding: '6px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Create Anyway
                            </button>
                            <button onClick={() => { setDraftWarn(null); setForm(f => ({ ...f, jobId: '' })); setJobSearch(''); setJobLabel(''); setJobCustomer(''); setJobProject(''); }}
                                style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="pf-panel" style={{ maxWidth: 540 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Issue Note</div>
                        <div className="pf-header-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: 4, letterSpacing: '0.03em' }}>{previewNo}</span></>
                                : 'Issue number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverErr && <div className="pf-err">{serverErr}</div>}

                    {/* ── Step 1: Issue Date ── */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Issue Date {isReq('issueDate') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.issueDate ? ' pf-input-err' : ''}`} type="date" value={form.issueDate}
                                onChange={e => { setForm(f => ({ ...f, issueDate: e.target.value })); setErrors(p => ({ ...p, issueDate: undefined })); }} />
                            <FieldErr msg={errors.issueDate} />
                        </div>
                    </div>

                    {/* ── Step 2: Issue Type (must select BEFORE job so item filtering is set) ── */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Issue Type <span className="req">*</span></label>
                            <select className={`pf-input${errors.costingType ? ' pf-input-err' : ''}`} value={form.costingType}
                                onChange={e => {
                                    setForm(f => ({ ...f, costingType: e.target.value }));
                                    setErrors(p => ({ ...p, costingType: undefined }));
                                }}>
                                <option value="">-- Select --</option>
                                {issueTypes.map(t => <option key={t.issueTypeId} value={t.issueTypeCode}>{t.issueTypeName}</option>)}
                            </select>
                            <FieldErr msg={errors.costingType} />
                            {issueTypes.find(t => t.issueTypeCode === form.costingType)?.description && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                                    {issueTypes.find(t => t.issueTypeCode === form.costingType).description}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Step 3: Job Number ── */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>
                                Job {isReq('jobId') && <span className="req">*</span>}
                                {form.costingType === 'EXC_COSTING' && (
                                    <span style={{ fontSize: 10.5, color: '#7c3aed', fontWeight: 400, marginLeft: 6 }}>
                                        — item list will show only items purchased for this job
                                    </span>
                                )}
                            </label>
                            <div style={{ position: 'relative' }}>
                                {jobLabel ? (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span className="pf-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>✓ {jobLabel}</span>
                                        <button type="button" onClick={() => { setJobLabel(''); setJobCustomer(''); setJobProject(''); setForm(f => ({ ...f, jobId: '' })); }}
                                            style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                    </div>
                                ) : (
                                    <>
                                        <input className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`} value={jobSearch}
                                            onChange={e => setJobSearch(e.target.value)} placeholder="Search job…" autoComplete="off" />
                                        {jobResults.length > 0 && (
                                            <div style={dropStyle}>
                                                {jobResults.map(j => (
                                                    <div key={j.jobId} style={dropItem}
                                                        onClick={() => {
                                                            setForm(f => ({ ...f, jobId: j.jobId }));
                                                            setJobLabel(`${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`);
                                                            setJobCustomer(j.customerName || '');
                                                            setJobProject(j.projectName   || '');
                                                            setJobSearch(''); setJobResults([]);
                                                            setErrors(p => ({ ...p, jobId: undefined }));
                                                            fetch(`${variables.API_URL}stockissue/search?jobId=${encodeURIComponent(j.jobId)}&status=Draft&pageSize=50&page=1`, { headers: authHeaders() })
                                                                .then(r => r.ok ? r.json() : null)
                                                                .then(d => { const drafts = d?.data || []; if (drafts.length > 0) setDraftWarn(drafts); })
                                                                .catch(() => {});
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                        <strong>{j.jobId}</strong>
                                                        {j.projectName  && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                        {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <FieldErr msg={errors.jobId} />
                        </div>
                    </div>

                    {/* Customer & Project — auto-filled from selected Job */}
                    {(jobCustomer || jobProject) && (
                        <div className="pf-row">
                            {jobCustomer && (
                                <div className="pf-field pf-f2">
                                    <label>Customer</label>
                                    <div className="pf-input" style={{ background: '#f8fafc', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                                        <span style={{ opacity: .5, fontSize: 10 }}>🔒</span> {jobCustomer}
                                    </div>
                                </div>
                            )}
                            {jobProject && (
                                <div className="pf-field pf-f2">
                                    <label>Project</label>
                                    <div className="pf-input" style={{ background: '#f8fafc', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                                        <span style={{ opacity: .5, fontSize: 10 }}>🔒</span> {jobProject}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Issued To <span className="req">*</span></label>
                            <input className={`pf-input${errors.issuedTo ? ' pf-input-err' : ''}`} type="text" value={form.issuedTo}
                                onChange={e => { setForm(f => ({ ...f, issuedTo: e.target.value })); setErrors(p => ({ ...p, issuedTo: undefined })); }}
                                placeholder="Person or department receiving the items…" />
                            <FieldErr msg={errors.issuedTo} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2} value={form.notes} placeholder="Optional notes…"
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create Issue Note'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ───────────────────────────────────────────
const Issue = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/inventory-issue', 'ADD');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('IssueDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 20, sortCol: 'IssueDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [jobOptions,   setJobOptions]   = useState([]);
    const [issueTypes,   setIssueTypes]   = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobOptions((d.data || []).map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : '') })))).catch(console.error);
        fetch(`${variables.API_URL}stockissue/types`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setIssueTypes(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)   q.set('searchText',  af.searchText);
        if (af.status)       q.set('status',       af.status);
        if (af.jobId)        q.set('jobId',        af.jobId);
        if (af.costingType)  q.set('costingType',  af.costingType);
        if (af.createdBy)    q.set('createdBy',    af.createdBy);
        if (af.dateFrom)     q.set('dateFrom',     af.dateFrom);
        if (af.dateTo)       q.set('dateTo',       af.dateTo);
        fetch(`${variables.API_URL}stockissue/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (jobOpts, typeOpts) => ({
        searchText:  { label: 'Search',     type: 'text',        placeholder: 'Issue #, job ID…' },
        status:      { label: 'Status',     type: 'multiselect', options: getModuleStatuses('ISN').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        jobId:       { label: 'Job',        type: 'select',      placeholder: 'All Jobs',  options: jobOpts },
        costingType: { label: 'Issue Type', type: 'select',      placeholder: 'All Types', options: typeOpts },
        createdBy:   { label: 'Created By', type: 'text',        placeholder: 'Username…' },
        dateFrom:    { label: 'Date From',  type: 'date' },
        dateTo:      { label: 'Date To',    type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        registerFilters('inventory-issue', buildDefs([], []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('inventory-issue');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('inventory-issue', buildDefs(
            jobOptions,
            issueTypes.map(t => ({ value: t.issueTypeCode, label: t.issueTypeName }))
        ));
    }, [jobOptions, issueTypes, getModuleStatuses]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5, start = Math.max(1, Math.min(page - 2, totalPages - range + 1));
        return Array.from({ length: Math.min(range, totalPages) }, (_, i) => start + i);
    };

    const costingBadge = (code) => {
        const t = issueTypes.find(t => t.issueTypeCode === code);
        const label = t ? t.issueTypeName : code;
        const idx   = issueTypes.findIndex(t => t.issueTypeCode === code);
        const COLORS = [{ bg: '#dbeafe', color: '#1e40af' }, { bg: '#f3e8ff', color: '#7c3aed' }, { bg: '#dcfce7', color: '#166534' }];
        const c = COLORS[idx >= 0 ? idx : 0];
        return <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>{label}</span>;
    };

    return (
        <div className="po-page">
            {showForm && <IssueForm onClose={() => setShowForm(false)} onSaved={id => { setShowForm(false); navigate(`/inventory-issue/${id}`); }} issueTypes={issueTypes} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Issue Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Issue Note</button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="IssueNo">Issue #</Th>
                                <Th col="IssueDate">Date</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="CostingType">Costing</Th>
                                <th>Lines</th>
                                <Th col="TotalCost">Total Cost</Th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={8} className="po-empty">No Issue Notes found. Use the filters or create a new Issue Note.</td></tr>
                            ) : rows.map(r => {
                                const sCfg = statusBadgeCfg(getStatusConfig('ISN', r.status));
                                return (
                                    <tr key={r.issueId} style={r.status === 'Draft' ? { background: '#fffbeb' } : undefined}>
                                        <td><RowLink className="po-num-link" to={`/inventory-issue/${r.issueId}`}>{r.issueNo}</RowLink></td>
                                        <td>{fmtDate(r.issueDate)}</td>
                                        <td>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                        </td>
                                        <td>{costingBadge(r.costingType)}</td>
                                        <td style={{ color: '#64748b' }}>{r.lineCount}</td>
                                        <td className="po-num-cell">{fmt(r.totalCost)}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: sCfg.bg, color: sCfg.color }}>
                                                <span className="po-status-dot" style={{ background: sCfg.dot }} />{sCfg.label}
                                            </span>
                                        </td>
                                        <td><RowLink className="po-act-btn po-act-open" to={`/inventory-issue/${r.issueId}`}>Open</RowLink></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn ${n === page ? 'po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Issue;
export { Issue };

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, statusBadgeCfg } from '../inventoryConstants';
import { ColFilter, applyColFilters, matchNote } from '../../common/GridColumnFilter';
import RowLink from '../../common/RowLink';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', status: '', issueTypeId: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

// ── New Issue Request form ────────────────────────────────────
// The job is chosen once, here, and locked afterwards: it is the cost target the
// whole request hangs off. Same shape as the New Return Note form.
const IssueRequestForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [form, setForm] = useState({
        jobId: '', jobLabel: '', issueTypeId: '', requestDate: today(),
        // Requested By defaults to whoever is creating the request; still editable,
        // since a storekeeper may raise one on behalf of someone on site.
        requiredDate: '', requestedBy: currentUser || '', department: '',
        requestedFor: '', priority: 'Normal', notes: '',
    });
    const [errors,     setErrors]     = useState({});
    const [serverErr,  setServerErr]  = useState('');
    const [saving,     setSaving]     = useState(false);
    const [previewNo,  setPreviewNo]  = useState('');
    const [issueTypes, setIssueTypes] = useState([]);
    const [jobSearch,  setJobSearch]  = useState('');
    const [jobResults, setJobResults] = useState([]);
    const [jobSearching, setJobSearching] = useState(false);

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/ISR`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
        fetch(`${variables.API_URL}stockissue/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setIssueTypes(list);
                // Default to the costed type, which is the common case.
                const inc = list.find(t => t.issueTypeCode === 'INC_COSTING');
                if (inc) setForm(f => ({ ...f, issueTypeId: String(inc.issueTypeId) }));
            })
            .catch(console.error);
    }, []);

    // useCurrentUser can resolve after the first render, so fill Requested By when
    // it lands — but only while the field is still untouched.
    useEffect(() => {
        if (currentUser) setForm(f => (f.requestedBy ? f : { ...f, requestedBy: currentUser }));
    }, [currentUser]);

    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            setJobSearching(true);
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&excludeClosedStatus=true&pageSize=10&page=1`,
                  { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error)
                .finally(() => setJobSearching(false));
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const selectJob = (job) => {
        setForm(f => ({
            ...f,
            jobId:    job.jobId,
            jobLabel: `${job.jobId}${job.customerName ? ' — ' + job.customerName : ''}`,
        }));
        setJobSearch('');
        setJobResults([]);
        setErrors(p => ({ ...p, jobId: undefined }));
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.jobId)              e.jobId       = 'Job is required.';
        if (!f.issueTypeId)        e.issueTypeId = 'Issue Type is required.';
        if (!f.requestDate)        e.requestDate = 'Request Date is required.';
        if (!f.requestedBy.trim()) e.requestedBy = 'Requested By is required.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length) return;
        setServerErr(''); setSaving(true);
        fetch(`${variables.API_URL}issuerequest/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                requestId:    0,
                jobId:        form.jobId,
                issueTypeId:  Number(form.issueTypeId),
                requestDate:  form.requestDate,
                requiredDate: form.requiredDate || null,
                requestedBy:  form.requestedBy.trim(),
                department:   form.department.trim()   || null,
                requestedFor: form.requestedFor.trim() || null,
                priority:     form.priority || null,
                notes:        form.notes.trim() || null,
                createdBy:    currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerErr(d.message || 'Error creating request.'); return; }
                onSaved(d.requestId);
            })
            .catch(() => setServerErr('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="pf-panel" style={{ maxWidth: 640 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Issue Request</div>
                        <div className="pf-header-sub">
                            {previewNo ? <>Will be numbered <strong>{previewNo}</strong></> : 'Material requested from the store'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {serverErr && <div className="pf-err" style={{ marginBottom: 12 }}>{serverErr}</div>}

                    {/* Job picker */}
                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: 1 }}>
                            <label>Job <span className="req">*</span></label>
                            {form.jobId ? (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="pf-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>
                                        ✓ {form.jobLabel}
                                    </span>
                                    <button type="button"
                                        onClick={() => setForm(f => ({ ...f, jobId: '', jobLabel: '' }))}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                </div>
                            ) : (
                                <>
                                    <input className="pf-input" value={jobSearch}
                                        onChange={e => setJobSearch(e.target.value)}
                                        placeholder="Search open jobs by number, customer or description…" />
                                    {jobSearching && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>⏳ Searching…</div>}
                                    {jobResults.length > 0 && (
                                        <div style={{
                                            border: '1px solid #c8d4e4', borderRadius: 6, marginTop: 4,
                                            maxHeight: 190, overflowY: 'auto', background: '#fff',
                                        }}>
                                            {jobResults.map(j => (
                                                <div key={j.jobId}
                                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                    onMouseDown={() => selectJob(j)}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <strong style={{ color: '#1e40af' }}>{j.jobId}</strong>
                                                    {j.customerName && <span style={{ color: '#374151', marginLeft: 8 }}>{j.customerName}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            {errors.jobId && <span className="pf-field-err">{errors.jobId}</span>}
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Issue Type <span className="req">*</span></label>
                            <select className={`pf-input${errors.issueTypeId ? ' pf-input-err' : ''}`}
                                name="issueTypeId" value={form.issueTypeId} onChange={handle}>
                                <option value="">— Select —</option>
                                {issueTypes.map(t => (
                                    <option key={t.issueTypeId} value={t.issueTypeId}>{t.issueTypeName}</option>
                                ))}
                            </select>
                            {errors.issueTypeId && <span className="pf-field-err">{errors.issueTypeId}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Priority</label>
                            <select className="pf-input" name="priority" value={form.priority} onChange={handle}>
                                <option value="">— None —</option>
                                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Request Date <span className="req">*</span></label>
                            <input className={`pf-input${errors.requestDate ? ' pf-input-err' : ''}`}
                                type="date" name="requestDate" value={form.requestDate} onChange={handle} />
                            {errors.requestDate && <span className="pf-field-err">{errors.requestDate}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Required Date</label>
                            <input className="pf-input" type="date" name="requiredDate" value={form.requiredDate} onChange={handle} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Requested By <span className="req">*</span></label>
                            <input className={`pf-input${errors.requestedBy ? ' pf-input-err' : ''}`}
                                type="text" name="requestedBy" value={form.requestedBy}
                                onChange={handle} placeholder="Who is asking for the material…" />
                            {errors.requestedBy && <span className="pf-field-err">{errors.requestedBy}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Department</label>
                            <input className="pf-input" type="text" name="department" value={form.department} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Requested For</label>
                            <input className="pf-input" type="text" name="requestedFor" value={form.requestedFor}
                                onChange={handle} placeholder="Optional" />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field" style={{ flex: 1 }}>
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2} name="notes" value={form.notes}
                                onChange={handle} placeholder="Optional notes…" />
                        </div>
                    </div>
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create Request'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Issue Request list ────────────────────────────────────────
// Named export, matching the other inventory list pages (Issue, IssueReturn,
// Adjustment); the detail pages are default exports.
export const IssueRequest = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/inventory-issue-request', 'ADD');

    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(200);
    const [sortCol,    setSortCol]  = useState('RequestDate');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm] = useState(false);
    const [issueTypes, setIssueTypes] = useState([]);

    // Per-column boxes in the grid header — page-local, see GridColumnFilter.
    const [colF, setColF] = useState({ requestNo: '', jobId: '', customerName: '', requestedBy: '' });
    const shownRows = applyColFilters(rows, colF);

    const gridRef = useRef({ pageSize: 200, sortCol: 'RequestDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    useEffect(() => {
        fetch(`${variables.API_URL}stockissue/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setIssueTypes(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)  q.set('searchText',  af.searchText);
        if (af.status)      q.set('status',      af.status);
        if (af.issueTypeId) q.set('issueTypeId', af.issueTypeId);
        if (af.dateFrom)    q.set('dateFrom',    af.dateFrom);
        if (af.dateTo)      q.set('dateTo',      af.dateTo);
        fetch(`${variables.API_URL}issuerequest/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                setRows(res.data || []);
                setTotal(res.totalRows || 0);
                setPages(Math.ceil((res.totalRows || 0) / ps) || 1);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('inventory-issue-request', {
            searchText:  { label: 'Search',     type: 'text',        placeholder: 'Request #, job, requested by…' },
            status:      { label: 'Status',     type: 'multiselect',
                           options: getModuleStatuses('ISR').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
            issueTypeId: { label: 'Issue Type', type: 'select', placeholder: 'All Types',
                           options: issueTypes.map(t => ({ value: String(t.issueTypeId), label: t.issueTypeName })) },
            dateFrom:    { label: 'Date From',  type: 'date' },
            dateTo:      { label: 'Date To',    type: 'date' },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('inventory-issue-request');
    }, [getModuleStatuses, issueTypes]); // eslint-disable-line

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

    return (
        <div className="po-page">
            {showForm && (
                <IssueRequestForm
                    onClose={() => setShowForm(false)}
                    onSaved={id => { setShowForm(false); navigate(`/inventory-issue-request/${id}`); }} />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Issue Requests</div>
                            <div className="po-page-sub">
                                {totalRows} record{totalRows !== 1 ? 's' : ''}
                                {matchNote(colF, shownRows.length, rows.length)}
                            </div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Issue Request</button>}
                        </div>
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
                                <Th col="RequestNo">Request #</Th>
                                <Th col="RequestDate">Date</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="CustomerName">Customer</Th>
                                <Th col="RequiredDate">Required</Th>
                                <Th col="RequestedBy">Requested By</Th>
                                <Th col="IssueTypeName">Issue Type</Th>
                                <Th col="LineCount">Lines</Th>
                                <th>Requested Qty</th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                            <tr>
                                <ColFilter value={colF.requestNo}    onChange={v => setColF(p => ({ ...p, requestNo: v }))}    placeholder="Request #" />
                                <th />
                                <ColFilter value={colF.jobId}        onChange={v => setColF(p => ({ ...p, jobId: v }))}        placeholder="Job" />
                                <ColFilter value={colF.customerName} onChange={v => setColF(p => ({ ...p, customerName: v }))} placeholder="Customer" />
                                <th />
                                <ColFilter value={colF.requestedBy}  onChange={v => setColF(p => ({ ...p, requestedBy: v }))}  placeholder="Requested by" />
                                <th /><th /><th /><th /><th />
                            </tr>
                        </thead>
                        <tbody>
                            {shownRows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={11} className="po-empty">
                                        {rows.length === 0
                                            ? 'No Issue Requests found. Use the filters on the left or create a new request.'
                                            : 'No requests on this page match the column filters. The filter panel on the left searches every page.'}
                                    </td>
                                </tr>
                            ) : shownRows.map(r => {
                                const sCfg = statusBadgeCfg(getStatusConfig('ISR', r.status));
                                return (
                                    <tr key={r.requestId}>
                                        <td>
                                            <RowLink className="po-num-link" to={`/inventory-issue-request/${r.requestId}`}>
                                                {r.requestNo}
                                            </RowLink>
                                        </td>
                                        <td>{fmtDate(r.requestDate)}</td>
                                        <td>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>
                                                {r.jobId}
                                            </span>
                                        </td>
                                        <td>{r.customerName || '—'}</td>
                                        <td>{r.requiredDate ? fmtDate(r.requiredDate) : '—'}</td>
                                        <td>{r.requestedBy || '—'}</td>
                                        <td>{r.issueTypeName || '—'}</td>
                                        <td>{r.lineCount}</td>
                                        <td className="po-num-cell">{fmt(r.totalRequestedQty, 4)}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: sCfg.bg, color: sCfg.color }}>
                                                <span className="po-status-dot" style={{ background: sCfg.dot }} />
                                                {sCfg.label}
                                            </span>
                                        </td>
                                        <td>
                                            <RowLink className="po-act-btn po-act-open" to={`/inventory-issue-request/${r.requestId}`}>
                                                Open
                                            </RowLink>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total
                    </div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

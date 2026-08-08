import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, today, FormSection } from '../procurementConstants';
import '../Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const MENU_URL = '/free-issue-grn';

const DEFAULT_FILTERS = {
    searchText: '', status: '', jobId: '', createdBy: '', dateFrom: '', dateTo: '',
};

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Cancelled'];
const STATUS_CFG = {
    Draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Confirmed: { label: 'Confirmed', bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Cancelled: { label: 'Cancelled', bg: '#fce7f3', color: '#9d174d', dot: '#db2777' },
};
const statusOf = s => STATUS_CFG[s] || { label: s || '—', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── New Free Issue GRN form (header only — lines/edit happen on detail page) ──
const FreeIssueGrnForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();

    const INITIAL = {
        jobId: '', receiptDate: today(), receivedBy: '',
        briefDescription: '', detailedDescription: '', remarks: '',
        deliveredBy: '', boeNo: '', boeDate: '', deliveryNoteFilePath: '',
    };

    const [form,        setForm]        = useState(INITIAL);
    const [errors,      setErrors]      = useState({});
    const [jobs,        setJobs]        = useState([]);
    const [saving,      setSaving]      = useState(false);
    const [serverError, setServerError] = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobs((d.data || []).map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : ''), customer: j.customerName || '' }))))
            .catch(console.error);
    }, []);

    const selectedCustomer = (jobs.find(j => j.value === form.jobId)?.customer) || '';

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.jobId)                      e.jobId               = 'Job Ref is required.';
        if (!f.receiptDate)                e.receiptDate         = 'Date of Receipt is required.';
        if (!f.receivedBy.trim())          e.receivedBy          = 'Received By is required.';
        if (!f.briefDescription.trim())    e.briefDescription    = 'Brief Description is required.';
        if (!f.detailedDescription.trim()) e.detailedDescription = 'Detailed Description is required.';
        if (!f.deliveredBy.trim())         e.deliveredBy         = 'Delivered By is required.';
        if (f.boeDate && f.receiptDate && f.boeDate < f.receiptDate)
                                           e.boeDate             = 'BOE Date cannot be before Date of Receipt.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setServerError(''); setSaving(true);
        fetch(`${variables.API_URL}freeissuegrn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                freeIssueGrnId:       0,
                jobId:                form.jobId,
                receiptDate:          form.receiptDate,
                receivedBy:           form.receivedBy.trim(),
                briefDescription:     form.briefDescription.trim(),
                detailedDescription:  form.detailedDescription.trim(),
                deliveredBy:          form.deliveredBy.trim(),
                remarks:              form.remarks.trim() || null,
                boeNo:                form.boeNo.trim() || null,
                boeDate:              form.boeDate || null,
                deliveryNoteFilePath: form.deliveryNoteFilePath.trim() || null,
                createdBy:            currentUser,
                modifiedBy:           null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerError(d.message || 'Error saving.'); return; }
                onSaved(d.id);
            })
            .catch(() => setServerError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 720 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Free Issue GRN</div>
                        <div className="pf-header-sub">GRN number will be assigned automatically</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverError && <div className="pf-err">{serverError}</div>}

                    <FormSection label="Job & Receipt" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Job Ref <span className="req">*</span></label>
                            <select className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`} name="jobId" value={form.jobId} onChange={handle}>
                                <option value="">— Job No —</option>
                                {jobs.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                            </select>
                            <FieldErr msg={errors.jobId} />
                        </div>
                        <div className="pf-field">
                            <label>Customer</label>
                            <input className="pf-input" value={selectedCustomer || '—'} readOnly style={{ background: '#f8fafc', color: '#475569' }} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Date of Receipt <span className="req">*</span></label>
                            <input className={`pf-input${errors.receiptDate ? ' pf-input-err' : ''}`} type="date" name="receiptDate" value={form.receiptDate} onChange={handle} />
                            <FieldErr msg={errors.receiptDate} />
                        </div>
                        <div className="pf-field">
                            <label>Received By <span className="req">*</span></label>
                            <input className={`pf-input${errors.receivedBy ? ' pf-input-err' : ''}`} type="text" name="receivedBy" value={form.receivedBy} onChange={handle} placeholder="Name of receiver" />
                            <FieldErr msg={errors.receivedBy} />
                        </div>
                    </div>

                    <FormSection label="Description" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Brief Description <span className="req">*</span></label>
                            <input className={`pf-input${errors.briefDescription ? ' pf-input-err' : ''}`} type="text" name="briefDescription" value={form.briefDescription} onChange={handle} placeholder="Short summary of the material" />
                            <FieldErr msg={errors.briefDescription} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Detailed Description <span className="req">*</span></label>
                            <textarea className={`pf-input pf-textarea${errors.detailedDescription ? ' pf-input-err' : ''}`} rows={4} name="detailedDescription" value={form.detailedDescription} onChange={handle} placeholder="Full description — quantities, marks, where stored in yard, etc." />
                            <FieldErr msg={errors.detailedDescription} />
                        </div>
                    </div>

                    <FormSection label="Delivery" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Delivered By <span className="req">*</span></label>
                            <input className={`pf-input${errors.deliveredBy ? ' pf-input-err' : ''}`} type="text" name="deliveredBy" value={form.deliveredBy} onChange={handle} placeholder="Party / carrier who delivered" />
                            <FieldErr msg={errors.deliveredBy} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Delivery Note (file name / ref)</label>
                            <input className="pf-input" type="text" name="deliveryNoteFilePath" value={form.deliveryNoteFilePath} onChange={handle} placeholder="e.g. DN-1234.pdf" />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Bill of Entry No</label>
                            <input className="pf-input" type="text" name="boeNo" value={form.boeNo} onChange={handle} placeholder="BOE #" />
                        </div>
                        <div className="pf-field">
                            <label>Bill of Entry Date</label>
                            <input className={`pf-input${errors.boeDate ? ' pf-input-err' : ''}`} type="date" name="boeDate" value={form.boeDate} onChange={handle} />
                            <FieldErr msg={errors.boeDate} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Remarks</label>
                            <input className="pf-input" type="text" name="remarks" value={form.remarks} onChange={handle} placeholder="Optional notes" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create GRN'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page (mirrors procurement GRN list) ─────────────────────────────
const FreeIssueGrn = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo(MENU_URL, 'ADD');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(200);
    const [sortCol,    setSortCol]   = useState('ReceiptDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm]  = useState(false);

    const gridRef = useRef({ pageSize: 200, sortCol: 'ReceiptDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const [jobOptions, setJobOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobOptions((d.data || []).map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : '') }))))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.jobId)      q.set('jobId',      af.jobId);
        if (af.createdBy)  q.set('createdBy',  af.createdBy);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}freeissuegrn/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    const buildDefs = (jobOpts) => ({
        searchText: { label: 'Search',     type: 'text',        placeholder: 'GRN #, description, BOE…' },
        status:     { label: 'Status',     type: 'multiselect', options: STATUS_OPTIONS.map(s => ({ value: s, label: s })) },
        jobId:      { label: 'Job ID',     type: 'select',      placeholder: 'All Jobs', options: jobOpts },
        createdBy:  { label: 'Created By', type: 'text',        placeholder: 'Username…' },
        dateFrom:   { label: 'Date From',  type: 'date' },
        dateTo:     { label: 'Date To',    type: 'date' },
    });

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('freeIssueGrn', buildDefs([]), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('freeIssueGrn');
    }, []); // eslint-disable-line

    useEffect(() => {
        updateFilterDefs('freeIssueGrn', buildDefs(jobOptions));
    }, [jobOptions]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage         = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
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
        <div className="po-page">
            {showForm && <FreeIssueGrnForm onClose={() => setShowForm(false)} onSaved={id => { setShowForm(false); navigate(`/free-issue-grn/${id}`); }} />}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">GRN for Free Issue Material</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New</button>}
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
                                <Th col="FreeIssueGrnNumber">GRN #</Th>
                                <Th col="ReceiptDate">Date of Receipt</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="CustomerName">Customer</Th>
                                <th>Brief Description</th>
                                <th>Delivered By</th>
                                <th>Received By</th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No Free Issue GRNs found. Use the filters or create a new one.</td></tr>
                            ) : rows.map(r => {
                                const sc = statusOf(r.status);
                                return (
                                    <tr key={r.freeIssueGrnId} style={r.status === 'Draft' ? { background: '#fffbeb' } : undefined}>
                                        <td><RowLink className="po-num-link" to={`/free-issue-grn/${r.freeIssueGrnId}`}>{r.freeIssueGrnNumber}</RowLink></td>
                                        <td>{fmtDate(r.receiptDate)}</td>
                                        <td>
                                            {r.jobId
                                                ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td>{r.customerName || '—'}</td>
                                        <td>{r.briefDescription || '—'}</td>
                                        <td>{r.deliveredBy || '—'}</td>
                                        <td>{r.receivedBy || '—'}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: sc.bg, color: sc.color }}>
                                                <span className="po-status-dot" style={{ background: sc.dot }} />{sc.label}
                                            </span>
                                        </td>
                                        <td><RowLink className="po-act-btn po-act-open" to={`/free-issue-grn/${r.freeIssueGrnId}`}>Open</RowLink></td>
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

export default FreeIssueGrn;

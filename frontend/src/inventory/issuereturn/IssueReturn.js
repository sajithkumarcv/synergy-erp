import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate, today, statusBadgeCfg } from '../inventoryConstants';
import '../Inventory.css';
import '../../procurement/Procurement.css';
import RowLink from '../../common/RowLink';

const PAGE_SIZES = [50, 100, 200, 500, 1000];
const DEFAULT_FILTERS = { searchText: '', status: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── New Issue Return form ─────────────────────────────────────
const IssueReturnForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [form, setForm]               = useState({ issueId: null, issueLabel: '', returnDate: today(), returnedBy: '', notes: '' });
    const [errors, setErrors]           = useState({});
    const [serverErr, setServerErr]     = useState('');
    const [saving, setSaving]           = useState(false);
    const [previewNo, setPreviewNo]     = useState('');
    const [issueSearch, setIssueSearch] = useState('');
    const [issueResults, setIssueResults] = useState([]);
    const [issueSearching, setIssueSearching] = useState(false);

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/IRN`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!issueSearch.trim()) { setIssueResults([]); return; }
        const t = setTimeout(() => {
            setIssueSearching(true);
            fetch(
                `${variables.API_URL}stockissue/search?searchText=${encodeURIComponent(issueSearch)}&status=Confirmed&pageSize=10&page=1`,
                { headers: authHeaders() }
            )
                .then(r => r.json()).then(d => setIssueResults(d.data || [])).catch(console.error)
                .finally(() => setIssueSearching(false));
        }, 280);
        return () => clearTimeout(t);
    }, [issueSearch]);

    const selectIssue = (issue) => {
        setForm(f => ({
            ...f,
            issueId:    issue.issueId,
            issueLabel: `${issue.issueNo}${issue.jobId ? ' — Job: ' + issue.jobId : ''}`,
        }));
        setIssueSearch('');
        setIssueResults([]);
        setErrors(p => ({ ...p, issueId: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.issueId)    e.issueId    = 'Source Issue Note is required.';
        if (!f.returnDate) e.returnDate = 'Return Date is required.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length) return;
        setServerErr(''); setSaving(true);
        fetch(`${variables.API_URL}stockissuereturn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                returnId:   0,
                issueId:    form.issueId,
                returnDate: form.returnDate,
                returnedBy: form.returnedBy.trim() || null,
                notes:      form.notes.trim()      || null,
                createdBy:  currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerErr(d.message || 'Error saving.'); return; }
                onSaved(d.returnId);
            })
            .catch(() => setServerErr('Network error.'))
            .finally(() => setSaving(false));
    };

    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };
    const dropItem  = { padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 520 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Issue Return Note</div>
                        <div className="pf-header-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#d1fae5', color: '#065f46', padding: '1px 8px', borderRadius: 4, letterSpacing: '0.03em' }}>{previewNo}</span></>
                                : 'Return number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {serverErr && <div className="pf-err">{serverErr}</div>}

                    {/* Source Issue Note */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Source Issue Note <span className="req">*</span></label>
                            <div style={{ position: 'relative' }}>
                                {form.issueId ? (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span className="pf-input" style={{ flex: 1, background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>
                                            ✓ {form.issueLabel}
                                        </span>
                                        <button type="button"
                                            onClick={() => setForm(f => ({ ...f, issueId: null, issueLabel: '' }))}
                                            style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            className={`pf-input${errors.issueId ? ' pf-input-err' : ''}`}
                                            value={issueSearch}
                                            onChange={e => setIssueSearch(e.target.value)}
                                            placeholder="Search confirmed issue notes…"
                                            autoComplete="off" />
                                        {issueSearching && (
                                            <div style={dropStyle}>
                                                <div style={{ padding: '8px 12px', fontSize: 12, color: '#64748b' }}>Searching…</div>
                                            </div>
                                        )}
                                        {!issueSearching && issueResults.length > 0 && (
                                            <div style={dropStyle}>
                                                {issueResults.map(iss => (
                                                    <div key={iss.issueId} style={dropItem}
                                                        onClick={() => selectIssue(iss)}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                        <strong style={{ color: '#1e40af' }}>{iss.issueNo}</strong>
                                                        {iss.jobId && <span style={{ marginLeft: 8 }}>Job: <strong>{iss.jobId}</strong></span>}
                                                        <span style={{ color: '#64748b', marginLeft: 8, fontSize: 11 }}>{fmtDate(iss.issueDate)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            {errors.issueId && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {errors.issueId}</div>}
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Only Confirmed issue notes can have returns.</div>
                        </div>
                    </div>

                    {/* Return Date */}
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Return Date <span className="req">*</span></label>
                            <input
                                className={`pf-input${errors.returnDate ? ' pf-input-err' : ''}`}
                                type="date" value={form.returnDate}
                                onChange={e => { setForm(f => ({ ...f, returnDate: e.target.value })); setErrors(p => ({ ...p, returnDate: undefined })); }} />
                            {errors.returnDate && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {errors.returnDate}</div>}
                        </div>
                    </div>

                    {/* Returned By */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Returned By</label>
                            <input className="pf-input" type="text" value={form.returnedBy}
                                onChange={e => setForm(f => ({ ...f, returnedBy: e.target.value }))}
                                placeholder="Name of person returning items…" />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes</label>
                            <textarea className="pf-input pf-textarea" rows={2} value={form.notes}
                                placeholder="Optional notes…"
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                    </div>
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving || !form.issueId}>
                        {saving ? 'Creating…' : 'Create Return Note'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ────────────────────────────────────────────
const IssueReturn = () => {
    const navigate = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();
    const { registerFilters, unregisterFilters } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/inventory-issue-return', 'ADD');

    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(200);
    const [sortCol,    setSortCol]  = useState('ReturnDate');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [showForm,   setShowForm] = useState(false);

    const gridRef = useRef({ pageSize: 200, sortCol: 'ReturnDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}stockissuereturn/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                const tot = res.totalRows || 0;
                setRows(res.data || []);
                setTotal(tot);
                setPages(Math.ceil(tot / ps) || 1);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        registerFilters('inventory-issue-return', {
            searchText: { label: 'Search',    type: 'text',        placeholder: 'Return #, issue #, job…' },
            status:     { label: 'Status',    type: 'multiselect', options: getModuleStatuses('IRN').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('inventory-issue-return');
    }, [getModuleStatuses]); // eslint-disable-line

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
                <IssueReturnForm
                    onClose={() => setShowForm(false)}
                    onSaved={id => { setShowForm(false); navigate(`/inventory-issue-return/${id}`); }} />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Issue Return Notes</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setShowForm(true)}>+ New Return Note</button>}
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
                                <Th col="ReturnNo">Return #</Th>
                                <Th col="ReturnDate">Date</Th>
                                <th>Issue Note</th>
                                <th>Job</th>
                                <th>Returned By</th>
                                <th>Lines</th>
                                <Th col="TotalCost">Total Cost</Th>
                                <Th col="Status">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={9} className="po-empty">
                                        No Issue Return Notes found. Use the filters or create a new Return Note.
                                    </td>
                                </tr>
                            ) : rows.map(r => {
                                const sCfg = statusBadgeCfg(getStatusConfig('IRN', r.status));
                                return (
                                    <tr key={r.returnId}>
                                        <td>
                                            <RowLink className="po-num-link" to={`/inventory-issue-return/${r.returnId}`}>
                                                {r.returnNo}
                                            </RowLink>
                                        </td>
                                        <td>{fmtDate(r.returnDate)}</td>
                                        <td>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#7c3aed', background: '#f3e8ff', padding: '2px 6px', borderRadius: 4 }}>
                                                {r.issueNo}
                                            </span>
                                        </td>
                                        <td>
                                            {r.jobId && (
                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#065f46', background: '#d1fae5', padding: '2px 6px', borderRadius: 4 }}>
                                                    {r.jobId}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ color: '#475569' }}>{r.returnedBy || '—'}</td>
                                        <td style={{ color: '#64748b' }}>{r.lineCount}</td>
                                        <td className="po-num-cell">{fmt(r.totalCost)}</td>
                                        <td>
                                            <span className="po-status-badge" style={{ background: sCfg.bg, color: sCfg.color }}>
                                                <span className="po-status-dot" style={{ background: sCfg.dot }} />
                                                {sCfg.label}
                                            </span>
                                        </td>
                                        <td>
                                            <RowLink className="po-act-btn po-act-open" to={`/inventory-issue-return/${r.returnId}`}>
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

export default IssueReturn;
export { IssueReturn };

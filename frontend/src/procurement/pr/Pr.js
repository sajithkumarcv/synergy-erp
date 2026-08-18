import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInitialFilters } from '../../utils/useInitialFilters';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { useFilters } from '../../FilterContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, today, PR_STATUS, PRIORITY_CONFIG, FormSection } from '../procurementConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import '../Procurement.css';
import RowLink from '../../common/RowLink';
import PrPrintModal from './PrPrintModal';
import { ColFilter, applyColFilters, matchNote } from '../../common/GridColumnFilter';

const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = { searchText: '', status: '', priority: '', jobId: '', createdBy: '', dateFrom: '', dateTo: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="pr-sort-none">⇅</span>;
    return <span className="pr-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

// ── Approval History Popup ────────────────────────────────────────
const ApprovalPopup = ({ prId, onClose, flipUp = false }) => {
    const [data,    setData]    = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const ref = React.useRef(null);

    React.useEffect(() => {
        fetch(`${variables.API_URL}approval/status/PR/${prId}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setData(d)).catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [prId]);

    React.useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);

    const logs   = data?.log || [];
    const sorted = [...logs].sort((a, b) => new Date(b.actionDate) - new Date(a.actionDate));

    const actionColor = (a) => {
        if (!a) return '#64748b';
        if (['Approved','Auto-approved'].some(x => a.startsWith(x))) return '#16a34a';
        if (a === 'Rejected') return '#dc2626';
        if (a === 'Submitted') return '#1e40af';
        return '#92400e';
    };

    return (
        <div ref={ref} style={{
            position: 'absolute', zIndex: 500,
            ...(flipUp ? { bottom: '110%' } : { top: '110%' }),
            left: '50%', transform: 'translateX(-50%)',
            background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.18)',
            border: '1px solid #e2e8f0', minWidth: 300, maxWidth: 360, overflow: 'hidden'
        }}>
            <div style={{ background: '#1e3a5f', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Approval History</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: 16 }}>Loading…</div>
                ) : !data || logs.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: 16, fontStyle: 'italic' }}>No approval activity yet.</div>
                ) : (
                    <>
                        {data?.transaction && (
                            <div style={{ marginBottom: 10, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontSize: 11 }}>
                                <span style={{ color: '#64748b' }}>Level </span>
                                <strong>{data.transaction.currentLevelNo} of {data.transaction.totalLevels}</strong>
                                <span style={{ marginLeft: 6 }}>· <strong>{data.transaction.policyName || '—'}</strong></span>
                                {data.transaction.currentStatus && <span style={{ marginLeft: 6, color: '#64748b' }}>· {data.transaction.currentStatus}</span>}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {data?.transaction && !data.transaction.finalAction && (
                                <div style={{ display: 'flex', gap: 8, fontSize: 11, paddingBottom: 8, borderBottom: '1px dashed #e2e8f0', marginBottom: 2 }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', marginTop: 4, flexShrink: 0, boxShadow: '0 0 0 3px rgba(245,158,11,.2)' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 7px', borderRadius: 4, fontSize: 10 }}>⏳ Awaiting Approval</span>
                                            <span style={{ color: '#94a3b8', fontSize: 10 }}>Level {data.transaction.currentLevelNo} of {data.transaction.totalLevels}</span>
                                        </div>
                                        {(data.transaction.levelName || data.transaction.approverName) && (
                                            <div style={{ color: '#92400e', fontWeight: 500, marginTop: 2 }}>
                                                {data.transaction.levelName}
                                                {data.transaction.approverName && data.transaction.approverName !== data.transaction.levelName ? ` (${data.transaction.approverName})` : ''}
                                            </div>
                                        )}
                                        {data.transaction.approverUsers && (
                                            <div style={{ color: '#64748b', fontSize: 10, marginTop: 1 }}>Pending with: <strong>{data.transaction.approverUsers}</strong></div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {sorted.map((log, i) => {
                                const d = log.actionDate ? new Date(log.actionDate) : null;
                                const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                                const timeStr = d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                                return (
                                    <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: actionColor(log.action), marginTop: 4, flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <span style={{ fontWeight: 600, color: actionColor(log.action) }}>{log.action}</span>
                                                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                                                    <div style={{ color: '#64748b', fontSize: 10 }}>{dateStr}</div>
                                                    <div style={{ color: '#94a3b8', fontSize: 10 }}>{timeStr}</div>
                                                </div>
                                            </div>
                                            <div style={{ color: '#475569' }}>{log.actionByName || log.actionBy}</div>
                                            {log.levelNo > 0 && <div style={{ color: '#94a3b8', fontSize: 10 }}>Level {log.levelNo}{log.levelName ? ` — ${log.levelName}` : ''}</div>}
                                            {log.remarks && <div style={{ color: '#64748b', fontSize: 10, fontStyle: 'italic' }}>{log.remarks}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Status Badge with popup ────────────────────────────────────────
const StatusBadge = ({ status, prId }) => {
    const { getStatusConfig } = useLookup();
    const [showPopup, setShowPopup] = React.useState(false);
    const [flipUp,    setFlipUp]    = React.useState(false);
    const badgeRef = React.useRef(null);
    const raw = getStatusConfig('PR', status);
    const cfg = raw
        ? { bg: raw.badgeBg, color: raw.badgeColor, dot: raw.badgeDot, label: raw.statusLabel }
        : (PR_STATUS[status] || PR_STATUS.Draft);

    const handleClick = (e) => {
        e.stopPropagation();
        if (!showPopup && badgeRef.current) {
            const rect = badgeRef.current.getBoundingClientRect();
            setFlipUp(window.innerHeight - rect.bottom < 320);
        }
        setShowPopup(v => !v);
    };

    return (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={badgeRef}>
            <span className="pr-status-badge"
                style={{ background: cfg.bg, color: cfg.color, cursor: 'pointer', userSelect: 'none' }}
                onClick={handleClick}
                title="Click to view approval history">
                <span className="pr-status-dot" style={{ background: cfg.dot }} />
                {cfg.label}
            </span>
            {showPopup && <ApprovalPopup prId={prId} flipUp={flipUp} onClose={() => setShowPopup(false)} />}
        </div>
    );
};

// ── PR Info View (print-style, read-only — no print header) ────────
// Loads the full PR header then renders the print document in info-only
// mode (company letterhead + print button stripped). Used by the grid's
// "Open" action so users can glance at a PR without leaving the list.
const PrInfoModal = ({ prId, onClose }) => {
    const [pr,    setPr]    = React.useState(null);
    const [error, setError] = React.useState(false);

    React.useEffect(() => {
        fetch(`${variables.API_URL}purchaserequest/${prId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setPr(d))
            .catch(() => setError(true));
    }, [prId]);

    if (error) return null;
    if (!pr) {
        return (
            <div className="po-print-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
                <div style={{ color: '#fff', margin: 'auto', fontSize: 14 }}>Loading…</div>
            </div>
        );
    }
    return <PrPrintModal pr={pr} infoOnly onClose={onClose} />;
};

// ── New PR Form ───────────────────────────────────────────────────
const PrForm = ({ onClose, onSaved }) => {
    const currentUser        = useCurrentUser();
    const { vlist } = useLookup();
    const { isReq }          = useFieldConfig('PR');
    const priorities         = vlist?.['PR.Priority'] || [];

    const [form, setForm]    = useState({
        prDate:      today(),
        requestedBy: currentUser || '',
        jobId:       '',
        priority:    'Normal',
        notes:       '',
    });
    // Jobs = only those with an Approved BOM
    const [jobs,       setJobs]       = useState([]);
    const [jobsLoading, setJobsLoading] = useState(true);
    const [saving,     setSaving]     = useState(false);
    const [errors,     setErrors]     = useState({});
    const [error,      setError]      = useState('');
    const [previewNo,  setPreviewNo]  = useState('');
    const [draftWarn,  setDraftWarn]  = useState(null); // [{prId, prNumber, lineCount, createdDate}]

    useEffect(() => {
        fetch(`${variables.API_URL}documentseries/preview/PR`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d.previewNumber) setPreviewNo(d.previewNumber); })
            .catch(console.error);
    }, []);

    useEffect(() => {
        // PR is EXEMPT from the budget-approved guard at the SP level
        // (sp_AssertBudgetApproved is not called from sp_SetPR / sp_SetPRLine).
        // That's by design — engineers raise PRs to gather quotes that later
        // feed the BOM and the budget. So the dropdown lists every OPEN job
        // (status 1/2 = Active/On Hold), not just ones with an approved BOM.
        fetch(`${variables.API_URL}job/search?excludeClosedStatus=true&approvalStatus=Approved&pageSize=500&page=1&sortCol=JobDate&sortDir=DESC`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobs(d.data || []))
            .catch(console.error)
            .finally(() => setJobsLoading(false));
    }, []);

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
        if (name === 'jobId' && value) {
            fetch(`${variables.API_URL}purchaserequest/search?jobId=${encodeURIComponent(value)}&status=Draft&pageSize=50&page=1`, { headers: authHeaders() })
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    const drafts = (d?.data || []);
                    if (drafts.length > 0) setDraftWarn(drafts);
                })
                .catch(() => {});
        }
        if (name === 'jobId' && !value) setDraftWarn(null);
    };

    const validate = () => {
        const e = {};
        if (!form.prDate)             e.prDate      = 'PR date is required.';
        if (!form.requestedBy.trim()) e.requestedBy = 'Requested By is required.';
        if (!form.priority)           e.priority    = 'Priority is required.';
        if (!form.jobId)              e.jobId       = 'Job is required.';
        return e;
    };

    const save = () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaserequest/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                prId:        0,
                prDate:      form.prDate,
                requestedBy: form.requestedBy.trim(),
                jobId:       form.jobId,
                priority:    form.priority || null,
                notes:       form.notes.trim() || null,
                createdBy:   currentUser,
                modifiedBy:  null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                onSaved(d.id);
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            {/* ── Draft PRs warning modal ── */}
            {draftWarn && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 480, width: '92%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 22 }}>⚠️</span>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Draft PRs already exist for this job</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Consider opening one of these before creating a new PR.</div>
                            </div>
                        </div>
                        <div style={{ borderRadius: 6, border: '1px solid #fde68a', background: '#fffbeb', padding: '8px 0', marginBottom: 16 }}>
                            {draftWarn.map(r => (
                                <div key={r.prId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #fef3c7' }}>
                                    <span style={{ fontFamily: 'Courier New', fontSize: 12, fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '2px 7px', borderRadius: 4 }}>
                                        {r.prNumber}
                                    </span>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        {(() => { const lc = r.lineCount ?? 0; return lc === 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>No lines</span> : `${lc} line${lc !== 1 ? 's' : ''}`; })()}
                                        {r.prDate ? ` · ${fmtDate(r.prDate)}` : ''}
                                    </span>
                                    <a href={`/purchase-requests/${r.prId}`} target="_blank" rel="noreferrer"
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
                            <button onClick={() => { setDraftWarn(null); setForm(p => ({ ...p, jobId: '' })); }}
                                style={{ padding: '6px 18px', borderRadius: 6, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="pf-panel">
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">New Purchase Request</div>
                        <div className="pf-header-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {previewNo
                                ? <>Next number: <span style={{ fontFamily: 'Courier New', fontWeight: 700, fontSize: 13, background: '#f3e8ff', color: '#7c3aed', padding: '1px 8px', borderRadius: 4, letterSpacing: '0.03em' }}>{previewNo}</span></>
                                : 'PR number will be assigned automatically'}
                        </div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <FormSection label="Details" />
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>PR Date {isReq('prDate') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.prDate ? ' pf-input-err' : ''}`} type="date" name="prDate" value={form.prDate} onChange={handle} />
                            {errors.prDate && <span className="pf-field-err">{errors.prDate}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Requested By {isReq('requestedBy') && <span className="req">*</span>}</label>
                            <input className={`pf-input${errors.requestedBy ? ' pf-input-err' : ''}`} type="text" name="requestedBy" value={form.requestedBy} onChange={handle} placeholder="Your name" />
                            {errors.requestedBy && <span className="pf-field-err">{errors.requestedBy}</span>}
                        </div>
                        <div className="pf-field">
                            <label>Priority {isReq('priority') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.priority ? ' pf-input-err' : ''}`} name="priority" value={form.priority} onChange={handle}>
                                {priorities.length > 0
                                    ? priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)
                                    : ['Low','Normal','High','Urgent'].map(p => <option key={p} value={p}>{p}</option>)
                                }
                            </select>
                            {errors.priority && <span className="pf-field-err">{errors.priority}</span>}
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Job {isReq('jobId') && <span className="req">*</span>}</label>
                            <select className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`} name="jobId" value={form.jobId} onChange={handle} disabled={jobsLoading}>
                                <option value="">{jobsLoading ? 'Loading jobs…' : '— Select Job —'}</option>
                                {jobs.map(b => (
                                    <option key={b.jobId} value={b.jobId}>
                                        {b.jobId}{b.projectName ? ` — ${b.projectName}` : ''}{b.customerName ? ` (${b.customerName})` : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.jobId && <span className="pf-field-err">{errors.jobId}</span>}
                            <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                                Only open jobs (Active or On Hold) are listed
                            </span>
                        </div>
                    </div>

                    <FormSection label="Notes" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Notes / Justification</label>
                            <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} placeholder="Reason for this purchase request…" />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Creating…' : 'Create PR'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main List Page ─────────────────────────────────────────────────
export const Pr = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getModuleStatuses, getVList } = useLookup();
    const { canDo } = usePermission();
    const canAdd    = canDo('/purchase-requests', 'ADD');
    // Seeded from dashboard tiles (e.g. "Open PRs" → status = the open set) —
    // see [[weberp-synergy-fork]]. Otherwise restored from this tab's last
    // applied filters, so opening a PR and coming back keeps the search;
    // falls back to DEFAULT_FILTERS on the first visit of the session.
    const initialFilters = useInitialFilters(DEFAULT_FILTERS, 'purchaserequest');

    const [rows,      setRows]      = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [totalRows, setTotal]     = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,      setPage]      = useState(1);
    const [pageSize,  setPageSize]  = useState(200);
    const [sortCol,   setSortCol]   = useState('PrDate');
    const [sortDir,   setSortDir]   = useState('DESC');
    const [applied,   setApplied]   = useState(initialFilters);
    const [showForm,  setShowForm]  = useState(false);
    const [infoPrId,  setInfoPrId]  = useState(null);
    // Per-column box in the grid header — page-local, see GridColumnFilter.
    const [colF, setColF] = useState({ jobId: '' });
    const shownRows = applyColFilters(rows, colF);

    // Stable ref so filter callbacks always see current values
    const gridRef = useRef({ pageSize: 200, sortCol: 'PrDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    // Fetch active jobs for the Job ID filter dropdown
    const [jobOptions, setJobOptions] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobOptions((d.data || []).map(j => ({
                value: j.jobId,
                label: j.jobId + (j.projectName ? ' — ' + j.projectName : ''),
            })))
            ).catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.priority)   q.set('priority',   af.priority);
        if (af.jobId)      q.set('jobId',      af.jobId);
        if (af.createdBy)  q.set('createdBy',  af.createdBy);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}purchaserequest/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // Initial load
    useEffect(() => { load(1, pageSize, sortCol, sortDir, initialFilters); }, [load]); // eslint-disable-line

    // Build filter defs (jobOptions may be empty initially, patched once jobs load)
    const buildDefs = (opts) => ({
        searchText: { label: 'Search',       type: 'text',   placeholder: 'PR #, requested by…' },
        status:     { label: 'Status',       type: 'multiselect',
                      options: getModuleStatuses('PR').map(s => ({ value: s.statusCode, label: s.statusLabel })) },
        priority:   { label: 'Priority',     type: 'select', placeholder: 'All Priorities',
                      options: getVList('Procurement', 'Priority') },
        jobId:      { label: 'Job ID',       type: 'select', placeholder: 'All Jobs', options: opts },
        createdBy:  { label: 'Created By',   type: 'text',   placeholder: 'Username…' },
        dateFrom:   { label: 'Date From',    type: 'date' },
        dateTo:     { label: 'Date To',      type: 'date' },
    });

    // Register filter panel on mount
    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('purchaserequest', buildDefs([]), initialFilters, onApply);
        return () => unregisterFilters('purchaserequest');
    }, []); // eslint-disable-line

    // Patch filter defs once jobs OR lookups (status/priority) have loaded
    // (does NOT reset applied filters)
    useEffect(() => {
        updateFilterDefs('purchaserequest', buildDefs(jobOptions));
    }, [jobOptions, getModuleStatuses, getVList]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };
    const goPage        = p  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize= ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = (newId) => {
        setShowForm(false);
        navigate(`/purchase-requests/${newId}`);
    };

    const Th = ({ col, children }) => (
        <th className="pr-th-sortable" onClick={() => handleSort(col)}>
            <div className="pr-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
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
        <div className="pr-page">
            {showForm && <PrForm onClose={() => setShowForm(false)} onSaved={handleSaved} />}
            {infoPrId && <PrInfoModal prId={infoPrId} onClose={() => setInfoPrId(null)} />}

            <div className="pr-grid-wrap">
                <div className="pr-grid-header">
                    <div className="pr-title-row">
                        <div>
                            <div className="pr-page-title">Purchase Requests</div>
                            <div className="pr-page-sub">
                                {totalRows} record{totalRows !== 1 ? 's' : ''}
                                {matchNote(colF, shownRows.length, rows.length)}
                            </div>
                        </div>
                        <div className="pr-toolbar">
                            <select className="pr-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="pr-btn-pri" onClick={() => setShowForm(true)}>+ New PR</button>}
                        </div>
                    </div>
                </div>

                <div className="pr-table-wrap">
                    {loading && (
                        <div className="pr-loading-overlay">
                            <div className="pr-spinner">
                                <div className="pr-spinner-ring" />
                                <span className="pr-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`pr-table${loading ? ' pr-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="PrNumber">PR #</Th>
                                <Th col="PrDate">Date</Th>
                                <Th col="JobId">Job</Th>
                                <Th col="Status">Status</Th>
                                <Th col="RequestedBy">Requested By</Th>
                                <Th col="Priority">Priority</Th>
                                <Th col="LineCount">Lines</Th>
                                <Th col="PoCount">POs</Th>
                                <th>Actions</th>
                            </tr>
                            <tr>
                                <th /><th />
                                <ColFilter value={colF.jobId} onChange={v => setColF(p => ({ ...p, jobId: v }))} placeholder="Job no." />
                                <th /><th /><th /><th /><th /><th />
                            </tr>
                        </thead>
                        <tbody>
                            {shownRows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="pr-empty">
                                    {rows.length === 0
                                        ? 'No purchase requests found. Use the filters on the left or create a new PR.'
                                        : 'No PRs on this page match the column filter. The filter panel on the left searches every page.'}
                                </td></tr>
                            ) : shownRows.map(r => {
                                const priCfg = PRIORITY_CONFIG[r.priority] || {};
                                return (
                                    <tr key={r.prId} style={r.status === 'Draft' ? { background: '#fffbeb' } : undefined}>
                                        <td>
                                            <RowLink className="pr-num-link" to={`/purchase-requests/${r.prId}`}>
                                                {r.prNumber}
                                            </RowLink>
                                        </td>
                                        <td>{fmtDate(r.prDate)}</td>
                                        <td>{r.jobId
                                            ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1e40af', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                            : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td><StatusBadge status={r.status} prId={r.prId} /></td>
                                        <td>{r.requestedBy}</td>
                                        <td>
                                            {r.priority && (
                                                <span className="pr-priority-badge" style={{ background: priCfg.bg, color: priCfg.color }}>
                                                    {r.priority}
                                                </span>
                                            )}
                                        </td>
                                        <td className="pr-num-cell">{r.lineCount || 0}</td>
                                        <td className="pr-num-cell">{r.poCount || 0}</td>
                                        <td style={{ display: 'flex', gap: 4 }}>
                                            <button className="pr-act-btn pr-act-open"
                                                onClick={() => setInfoPrId(r.prId)}
                                                title="Quick view — see PR details without leaving this page">
                                                👁 View
                                            </button>
                                            <RowLink className="pr-act-btn" to={`/purchase-requests/${r.prId}`}
                                                style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}
                                                title="Open full detail page">
                                                ↗
                                            </RowLink>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="pr-pagination">
                    <div className="pr-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="pr-page-controls">
                        <button className="pr-page-btn" onClick={() => goPage(1)}           disabled={page === 1}>«</button>
                        <button className="pr-page-btn" onClick={() => goPage(page - 1)}    disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`pr-page-btn ${n === page ? 'pr-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="pr-page-btn" onClick={() => goPage(page + 1)}    disabled={page >= totalPages}>›</button>
                        <button className="pr-page-btn" onClick={() => goPage(totalPages)}  disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Pr;

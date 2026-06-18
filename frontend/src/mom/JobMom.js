import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import { usePermission } from '../PermissionContext';
import AlertModal from '../common/AlertModal';

// ── Formatters ────────────────────────────────────────────────
const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtDateTime = (d) =>
    d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDue = (d) => {
    if (!d) return null;
    const due  = new Date(d);
    const now  = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((due - now) / 86400000);
    if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, color: '#dc2626' };
    if (diff === 0) return { label: 'Due today',                  color: '#d97706' };
    if (diff <= 3)  return { label: `Due in ${diff}d`,            color: '#ca8a04' };
    return { label: fmtDate(d), color: '#64748b' };
};

// ── Style constants ───────────────────────────────────────────
const inputStyle = {
    border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 10px',
    fontSize: 13, color: '#1e293b', background: '#fff', outline: 'none',
    boxSizing: 'border-box', width: '100%',
};

const Label = ({ children }) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
        color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>
        {children}
    </label>
);

// ── Priority badge ────────────────────────────────────────────
const PRIORITY = {
    Critical: { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    High:     { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
    Medium:   { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
    Low:      { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
};
const PriBadge = ({ p }) => {
    const s = PRIORITY[p] || PRIORITY.Medium;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
            background: s.bg, color: s.color, borderRadius: 99,
            fontSize: 11, fontWeight: 600, padding: '2px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
            {p}
        </span>
    );
};

// ── Task status badge ─────────────────────────────────────────
const TASK_STATUS = {
    Open:       { bg: '#f1f5f9', color: '#475569' },
    InProgress: { bg: '#dbeafe', color: '#1e40af' },
    Completed:  { bg: '#dcfce7', color: '#166534' },
    Reassigned: { bg: '#fdf4ff', color: '#7e22ce' },
    Closed:     { bg: '#f0fdf4', color: '#15803d' },
};
const StatusBadge = ({ s }) => {
    const cfg = TASK_STATUS[s] || TASK_STATUS.Open;
    return (
        <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 99,
            fontSize: 11, fontWeight: 600, padding: '2px 8px', whiteSpace: 'nowrap' }}>
            {s === 'InProgress' ? 'In Progress' : s}
        </span>
    );
};

// ── MOM status badge ──────────────────────────────────────────
const MomStatusBadge = ({ s }) => {
    const cfg = s === 'Closed'
        ? { bg: '#f1f5f9', color: '#64748b' }
        : { bg: '#dcfce7', color: '#166534' };
    return (
        <span style={{ ...cfg, borderRadius: 99, fontSize: 11, fontWeight: 600, padding: '2px 10px' }}>{s}</span>
    );
};

const DEFAULT_FILTERS = { jobId: '', status: '', dateFrom: '', dateTo: '', createdBy: '', assignedTo: '' };

// ═════════════════════════════════════════════════════════════
// JobMom  — standalone MOM page
// ═════════════════════════════════════════════════════════════
const JobMom = () => {
    const currentUser = useCurrentUser();
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { getVList } = useLookup();
    const { canDo } = usePermission();
    const canAdd = canDo('/job-mom', 'ADD');

    const [moms,           setMoms]           = useState([]);
    const [loading,        setLoading]        = useState(false);
    const [applied,        setApplied]        = useState(DEFAULT_FILTERS);
    const [expanded,       setExpanded]       = useState({});
    const [showForm,       setShowForm]       = useState(false);
    const [editMom,        setEditMom]        = useState(null);
    const [activeTask,     setActiveTask]     = useState(null);
    const [users,          setUsers]          = useState([]);
    const [taskRefreshKey, setTaskRefreshKey] = useState(0);
    const [alertMsg,       setAlertMsg]       = useState(null);

    const appliedRef = useRef(DEFAULT_FILTERS);
    useEffect(() => { appliedRef.current = applied; }, [applied]);

    const load = useCallback((f) => {
        setLoading(true);
        const p = new URLSearchParams();
        if (f.jobId)      p.set('jobId',      f.jobId);
        if (f.status)     p.set('status',     f.status);
        if (f.dateFrom)   p.set('dateFrom',   f.dateFrom);
        if (f.dateTo)     p.set('dateTo',     f.dateTo);
        if (f.createdBy)  p.set('createdBy',  f.createdBy);
        if (f.assignedTo) p.set('assignedTo', f.assignedTo);
        fetch(`${variables.API_URL}mom?${p.toString()}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setMoms(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(DEFAULT_FILTERS); }, [load]);

    // Load users for filter dropdowns
    useEffect(() => {
        fetch(`${variables.API_URL}user/list`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setUsers(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    // Register filters on mount with empty user options
    useEffect(() => {
        const onApply = (vals) => { setApplied({ ...vals }); load(vals); };
        registerFilters('job-mom', {
            jobId:      { label: 'Job ID',    type: 'text',   placeholder: 'e.g. JOB-001' },
            status:     { label: 'Status',    type: 'select', placeholder: 'All',
                          options: getVList('MOM', 'TaskStatus') },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
            createdBy:  { label: 'Assigner',  type: 'select', placeholder: 'All', options: [] },
            assignedTo: { label: 'Assignee',  type: 'select', placeholder: 'All', options: [] },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('job-mom');
    }, [getVList]); // eslint-disable-line

    // Patch user options once list loads
    useEffect(() => {
        if (!users.length) return;
        const userOptions = users.map(u => ({ value: u.userName, label: u.fullName || u.userName }));
        updateFilterDefs('job-mom', {
            jobId:      { label: 'Job ID',    type: 'text',   placeholder: 'e.g. JOB-001' },
            status:     { label: 'Status',    type: 'select', placeholder: 'All',
                          options: getVList('MOM', 'TaskStatus') },
            dateFrom:   { label: 'Date From', type: 'date' },
            dateTo:     { label: 'Date To',   type: 'date' },
            createdBy:  { label: 'Assigner',  type: 'select', placeholder: 'All', options: userOptions },
            assignedTo: { label: 'Assignee',  type: 'select', placeholder: 'All', options: userOptions },
        });
    }, [users, getVList]); // eslint-disable-line

    const toggleExpand = (momId) => setExpanded(p => ({ ...p, [momId]: !p[momId] }));

    const closeMom = async (momId) => {
        if (!window.confirm('Close this MOM? It will become read-only.')) return;
        try {
            const res = await fetch(`${variables.API_URL}mom/${momId}/close`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ modifiedBy: currentUser }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setAlertMsg(d?.message || 'Failed to close MOM.');
                return;
            }
            load(appliedRef.current);
        } catch {
            setAlertMsg('Network error. Please try again.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

            {/* ── Page header ──────────────────────────────────── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#fff', flexShrink: 0 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Minutes of Meeting</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {loading ? 'Loading…' : `${moms.length} record${moms.length !== 1 ? 's' : ''}`}
                    </div>
                </div>
                {canAdd && (
                    <button onClick={() => { setEditMom(null); setShowForm(true); }}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
                            padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        + New MOM
                    </button>
                )}
            </div>

            {/* ── MOM list ─────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
                        Loading…
                    </div>
                ) : moms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                        <div style={{ fontSize: 14 }}>No meetings found.</div>
                        <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ New MOM" to record your first meeting.</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {moms.map(mom => (
                            <MomCard
                                key={mom.momId}
                                mom={mom}
                                expanded={!!expanded[mom.momId]}
                                onToggle={() => toggleExpand(mom.momId)}
                                onEdit={() => { setEditMom(mom); setShowForm(true); }}
                                onClose={() => closeMom(mom.momId)}
                                onTaskClick={setActiveTask}
                                taskRefreshKey={taskRefreshKey}
                                canAdd={canAdd}
                                onRefresh={() => { load(appliedRef.current); setTaskRefreshKey(k => k + 1); }}
                                currentUser={currentUser}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── MOM form modal ───────────────────────────────── */}
            {showForm && (
                <MomFormModal
                    mom={editMom}
                    currentUser={currentUser}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); load(applied); }}
                />
            )}

            {/* ── Task detail drawer ───────────────────────────── */}
            {activeTask && (
                <TaskDetailDrawer
                    task={activeTask}
                    currentUser={currentUser}
                    onClose={() => setActiveTask(null)}
                    onRefresh={() => { setActiveTask(null); load(appliedRef.current); setTaskRefreshKey(k => k + 1); }}
                />
            )}
        </div>
    );
};

// ── MOM card ──────────────────────────────────────────────────
const MomCard = ({ mom, expanded, onToggle, onEdit, onClose, onTaskClick, onRefresh, currentUser, taskRefreshKey, canAdd }) => {
    const [tasks,       setTasks]       = useState([]);
    const [loadingTask, setLoadingTask] = useState(false);
    const [showAddTask, setShowAddTask] = useState(false);
    const [taskFilter,  setTaskFilter]  = useState('me'); // 'me' | 'all'

    const reloadTasks = useCallback(() => {
        setLoadingTask(true);
        fetch(`${variables.API_URL}mom/${mom.momId}/tasks`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setTasks(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoadingTask(false));
    }, [mom.momId]);

    useEffect(() => { if (expanded) reloadTasks(); }, [expanded, reloadTasks]);
    // Reload tasks whenever parent signals a task was actioned
    useEffect(() => { if (expanded && taskRefreshKey > 0) reloadTasks(); }, [taskRefreshKey]); // eslint-disable-line

    const isClosed = mom.status === 'Closed';

    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,.04)', background: '#fff' }}>

            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
                background: isClosed ? '#fafbfc' : '#fff' }}
                onClick={onToggle}>

                <span style={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>
                    {expanded ? '▾' : '▸'}
                </span>

                {/* Job ID chip */}
                <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 6,
                    fontSize: 11, fontWeight: 700, padding: '3px 8px',
                    fontFamily: 'monospace', flexShrink: 0 }}>
                    {mom.jobId}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mom.title}
                        </span>
                        <MomStatusBadge s={mom.status} />
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {fmtDate(mom.meetingDate)}
                        {mom.venue && <span> · {mom.venue}</span>}
                        <span style={{ color: '#cbd5e1' }}> · </span>
                        <span style={{ color: '#94a3b8' }}>by {mom.createdBy}</span>
                    </div>
                </div>

                {/* Task counts */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {mom.openTasks > 0 && (
                        <span style={{ background: '#fef9c3', color: '#854d0e',
                            borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                            {mom.openTasks} open
                        </span>
                    )}
                    <span style={{ background: '#f1f5f9', color: '#475569',
                        borderRadius: 99, fontSize: 11, fontWeight: 600, padding: '2px 8px' }}>
                        {mom.totalTasks} task{mom.totalTasks !== 1 ? 's' : ''}
                    </span>
                </div>

                {/* Actions */}
                {!isClosed && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={onEdit}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                                padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                            Edit
                        </button>
                        <button onClick={onClose}
                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                                padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                            Close
                        </button>
                    </div>
                )}
            </div>

            {/* Expanded panel */}
            {expanded && (
                <div style={{ borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>

                    {/* Summary / attendees strip */}
                    {(mom.attendees || mom.summary) && (
                        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            {mom.attendees && (
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                                        textTransform: 'uppercase', letterSpacing: '.4px' }}>Attendees</div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{mom.attendees}</div>
                                </div>
                            )}
                            {mom.summary && (
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                                        textTransform: 'uppercase', letterSpacing: '.4px' }}>Summary</div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                                        {mom.summary}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action items */}
                    <div style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                                    textTransform: 'uppercase', letterSpacing: '.4px' }}>
                                    Action Items
                                </span>
                                {/* Filter toggle */}
                                <div style={{ display: 'flex', background: '#f1f5f9',
                                    borderRadius: 6, padding: 2, gap: 2 }}>
                                    {['me', 'all'].map(opt => (
                                        <button key={opt} onClick={() => setTaskFilter(opt)}
                                            style={{
                                                background: taskFilter === opt ? '#fff' : 'transparent',
                                                border: 'none', borderRadius: 5,
                                                padding: '2px 10px', fontSize: 11, fontWeight: 600,
                                                color: taskFilter === opt ? '#1e293b' : '#94a3b8',
                                                cursor: 'pointer',
                                                boxShadow: taskFilter === opt ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                                                transition: 'all .15s',
                                            }}>
                                            {opt === 'me' ? 'Only Me' : 'All'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {!isClosed && canAdd && (
                                <button onClick={() => setShowAddTask(true)}
                                    style={{ background: '#2563eb', color: '#fff', border: 'none',
                                        borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                        fontWeight: 600, cursor: 'pointer' }}>
                                    + Add Task
                                </button>
                            )}
                        </div>

                        {loadingTask ? (
                            <div style={{ color: '#94a3b8', fontSize: 13, padding: '6px 0' }}>Loading…</div>
                        ) : tasks.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 13, padding: '6px 0' }}>
                                No action items yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {tasks
                                    .filter(t => taskFilter === 'all' || t.assignedTo === currentUser)
                                    .map(t => (
                                        <TaskRow key={t.momTaskId} task={t} onClick={() => onTaskClick(t)} />
                                    ))
                                }
                                {tasks.filter(t => taskFilter === 'all' || t.assignedTo === currentUser).length === 0 && (
                                    <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 0' }}>
                                        No tasks assigned to you. Switch to "All" to see all items.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showAddTask && (
                <TaskFormModal
                    momId={mom.momId}
                    jobId={mom.jobId}
                    task={null}
                    currentUser={currentUser}
                    onClose={() => setShowAddTask(false)}
                    onSaved={() => { setShowAddTask(false); reloadTasks(); onRefresh(); }}
                />
            )}
        </div>
    );
};

// ── Task row ──────────────────────────────────────────────────
const TaskRow = ({ task, onClick }) => {
    const due  = fmtDue(task.dueDate);
    const done = task.status === 'Closed' || task.status === 'Completed';
    return (
        <div onClick={onClick}
            style={{ display: 'flex', alignItems: 'center', gap: 10,
                background: done ? '#fafbfc' : '#fff',
                border: '1px solid #f1f5f9', borderRadius: 8,
                padding: '8px 12px', cursor: 'pointer', opacity: done ? 0.7 : 1 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#cbd5e1'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#f1f5f9'}>
            <PriBadge p={task.priority} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: done ? '#94a3b8' : '#1e293b',
                    textDecoration: done ? 'line-through' : 'none' }}>
                    {task.description}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    {task.assignedTo}
                    {due && !done && (
                        <span style={{ marginLeft: 8, color: due.color, fontWeight: 600 }}>· {due.label}</span>
                    )}
                </div>
            </div>
            <StatusBadge s={task.status} />
        </div>
    );
};

// ── MOM form modal ────────────────────────────────────────────
const MomFormModal = ({ mom, currentUser, onClose, onSaved }) => {
    const isNew = !mom;
    const [form, setForm] = useState({
        momId:       mom?.momId       || 0,
        jobId:       mom?.jobId       || '',
        meetingDate: mom?.meetingDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        title:       mom?.title       || '',
        venue:       mom?.venue       || '',
        attendees:   mom?.attendees   || '',
        summary:     mom?.summary     || '',
        createdBy:   currentUser,
        modifiedBy:  currentUser,
    });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    // Job live-search
    const [jobSearch,  setJobSearch]  = useState(mom?.jobId || '');
    const [jobResults, setJobResults] = useState([]);
    const [jobLoading, setJobLoading] = useState(false);
    const jobTimer = useRef(null);
    const jobLocked = useRef(!!mom?.jobId);   // locked once picked or editing

    const searchJobs = (q) => {
        clearTimeout(jobTimer.current);
        if (q.length < 1) { setJobResults([]); return; }
        jobTimer.current = setTimeout(() => {
            setJobLoading(true);
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(q)}&pageSize=15&page=1&sortCol=JobDate&sortDir=DESC`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setJobResults(Array.isArray(d?.data) ? d.data : []))
                .catch(console.error)
                .finally(() => setJobLoading(false));
        }, 300);
    };

    const pickJob = (j) => {
        setForm(p => ({ ...p, jobId: j.jobId }));
        setJobSearch(j.jobId);
        setJobResults([]);
        jobLocked.current = true;
    };

    const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const save = async () => {
        if (!form.jobId.trim())       { setError('Job ID is required.');       return; }
        if (!form.title.trim())       { setError('Title is required.');        return; }
        if (!form.meetingDate.trim()) { setError('Meeting date is required.'); return; }
        setSaving(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}mom/save`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
            });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Save failed.'); return; }
            onSaved();
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !saving) onClose(); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: 580, maxWidth: '95vw',
                boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                        {isNew ? 'New Minutes of Meeting' : `Edit MOM — ${mom.jobId}`}
                    </span>
                    <button onClick={onClose} disabled={saving}
                        style={{ background: 'none', border: 'none', fontSize: 18,
                            cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 7,
                            padding: '8px 12px', fontSize: 13 }}>{error}</div>
                    )}

                    {/* Job search — only for new MOM */}
                    {isNew ? (
                        <div style={{ position: 'relative' }}>
                            <Label>Job ID *</Label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    value={jobSearch}
                                    onChange={e => {
                                        setJobSearch(e.target.value);
                                        setForm(p => ({ ...p, jobId: '' }));
                                        jobLocked.current = false;
                                        searchJobs(e.target.value);
                                    }}
                                    placeholder="Type to search job…"
                                    style={{ ...inputStyle, paddingRight: 28,
                                        borderColor: form.jobId ? '#22c55e' : '#e2e8f0' }} />
                                {jobLoading && (
                                    <span style={{ position: 'absolute', right: 8, top: 9,
                                        fontSize: 12, color: '#94a3b8' }}>⏳</span>
                                )}
                                {form.jobId && (
                                    <span style={{ position: 'absolute', right: 8, top: 8,
                                        color: '#22c55e', fontSize: 14 }}>✓</span>
                                )}
                            </div>
                            {jobResults.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 100,
                                    maxHeight: 220, overflowY: 'auto' }}>
                                    {jobResults.map(j => (
                                        <div key={j.jobId}
                                            onMouseDown={() => pickJob(j)}
                                            style={{ padding: '8px 12px', cursor: 'pointer',
                                                borderBottom: '1px solid #f8fafc', display: 'flex',
                                                gap: 10, alignItems: 'center' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700,
                                                fontSize: 12, color: '#1d4ed8', flexShrink: 0 }}>
                                                {j.jobId}
                                            </span>
                                            <span style={{ fontSize: 12, color: '#64748b',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {j.projectName || j.jobDescription || j.customerName}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <Label>Job</Label>
                            <div style={{ ...inputStyle, background: '#f8fafc', color: '#64748b',
                                cursor: 'default', userSelect: 'none' }}>
                                {mom.jobId}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <Label>Title *</Label>
                            <input name="title" value={form.title} onChange={handle}
                                placeholder="e.g. Kickoff Meeting" style={inputStyle} />
                        </div>
                        <div style={{ flex: '0 0 155px' }}>
                            <Label>Meeting Date *</Label>
                            <input type="date" name="meetingDate" value={form.meetingDate}
                                onChange={handle} style={inputStyle} />
                        </div>
                    </div>
                    <div>
                        <Label>Venue</Label>
                        <input name="venue" value={form.venue} onChange={handle}
                            placeholder="e.g. Conference Room A" style={inputStyle} />
                    </div>
                    <div>
                        <Label>Attendees</Label>
                        <input name="attendees" value={form.attendees} onChange={handle}
                            placeholder="Comma-separated names" style={inputStyle} />
                    </div>
                    <div>
                        <Label>Summary / Notes</Label>
                        <textarea name="summary" value={form.summary} onChange={handle}
                            rows={4} placeholder="Key discussion points…"
                            style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={onClose} disabled={saving}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: 7,
                            padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                            color: '#475569', fontWeight: 600 }}>
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7,
                            padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {saving ? 'Saving…' : isNew ? 'Create MOM' : 'Update MOM'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Task form modal ───────────────────────────────────────────
const TaskFormModal = ({ momId, jobId, task, currentUser, onClose, onSaved }) => {
    const isNew = !task;
    const [form, setForm] = useState({
        momTaskId:   task?.momTaskId  || 0,
        momId, jobId,
        description: task?.description || '',
        dueDate:     task?.dueDate?.slice(0, 10) || '',
        priority:    task?.priority   || 'Medium',
        assignedTo:  task?.assignedTo || '',
        remarks:     task?.remarks    || '',
        createdBy:   currentUser,
        modifiedBy:  currentUser,
    });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');
    const [users,  setUsers]  = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}user/list`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const save = async () => {
        if (!form.description.trim()) { setError('Description is required.'); return; }
        if (!form.assignedTo.trim())  { setError('Assigned to is required.'); return; }
        if (!form.dueDate.trim())     { setError('Due date is required.');    return; }
        setSaving(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}mom/task/save`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
            });
            const d = await res.json();
            if (!res.ok) { setError(d?.message || 'Save failed.'); return; }
            onSaved();
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
            zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !saving) onClose(); }}>
            <div style={{ background: '#fff', borderRadius: 14, width: 500, maxWidth: '95vw',
                boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}
                onClick={e => e.stopPropagation()}>

                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                        {isNew ? 'Add Action Item' : 'Edit Action Item'}
                    </span>
                    <button onClick={onClose} disabled={saving}
                        style={{ background: 'none', border: 'none', fontSize: 18,
                            cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 7,
                            padding: '8px 12px', fontSize: 13 }}>{error}</div>
                    )}
                    <div>
                        <Label>Description *</Label>
                        <textarea name="description" value={form.description} onChange={handle}
                            rows={3} placeholder="What needs to be done?"
                            style={{ ...inputStyle, height: 'auto', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <Label>Assign To *</Label>
                            <select name="assignedTo" value={form.assignedTo}
                                onChange={handle} style={inputStyle}>
                                <option value="">— Select engineer —</option>
                                {users.map(u => (
                                    <option key={u.userId} value={u.userName}>
                                        {u.fullName || u.userName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: '0 0 130px' }}>
                            <Label>Priority</Label>
                            <select name="priority" value={form.priority}
                                onChange={handle} style={inputStyle}>
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                                <option>Critical</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <Label>Due Date *</Label>
                        <input type="date" name="dueDate" value={form.dueDate}
                            onChange={handle} style={inputStyle} />
                    </div>
                    <div>
                        <Label>Remarks</Label>
                        <input name="remarks" value={form.remarks} onChange={handle}
                            placeholder="Optional notes" style={inputStyle} />
                    </div>
                </div>

                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button onClick={onClose} disabled={saving}
                        style={{ background: '#f1f5f9', border: 'none', borderRadius: 7,
                            padding: '8px 18px', fontSize: 13, cursor: 'pointer',
                            color: '#475569', fontWeight: 600 }}>
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7,
                            padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {saving ? 'Saving…' : isNew ? 'Add Task' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Task detail drawer ────────────────────────────────────────
const TaskDetailDrawer = ({ task: initTask, currentUser, onClose, onRefresh }) => {
    const [task]  = useState(initTask);
    const [log,        setLog]        = useState([]);
    const [loadingLog, setLoadingLog] = useState(true);
    const [busy,       setBusy]       = useState(false);
    const [error,      setError]      = useState('');
    const [statusNote, setStatusNote] = useState('');
    const [showReassign,  setShowReassign]  = useState(false);
    const [reassignUser,  setReassignUser]  = useState('');
    const [reassignNote,  setReassignNote]  = useState('');
    const [users,         setUsers]         = useState([]);

    useEffect(() => {
        fetch(`${variables.API_URL}mom/task/${task.momTaskId}/log`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setLog(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoadingLog(false));
        fetch(`${variables.API_URL}user/list`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(console.error);
    }, [task.momTaskId]);

    const changeStatus = async (newStatus) => {
        setBusy(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}mom/task/${task.momTaskId}/status`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ newStatus, remarks: statusNote || null, actionBy: currentUser }),
            });
            if (!res.ok) { const d = await res.json(); setError(d?.message || 'Error'); return; }
            window.dispatchEvent(new Event('notifications:refresh'));
            setStatusNote('');
            onRefresh();
        } catch { setError('Network error.'); }
        finally { setBusy(false); }
    };

    const doReassign = async () => {
        if (!reassignUser) { setError('Select a user.'); return; }
        setBusy(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}mom/task/${task.momTaskId}/reassign`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ toUser: reassignUser, remarks: reassignNote || null, actionBy: currentUser }),
            });
            if (!res.ok) { const d = await res.json(); setError(d?.message || 'Error'); return; }
            window.dispatchEvent(new Event('notifications:refresh'));
            onRefresh();
        } catch { setError('Network error.'); }
        finally { setBusy(false); }
    };

    const canAct = currentUser === task.assignedTo || currentUser === task.createdBy;

    const NEXT = { Open: ['InProgress','Closed'], InProgress: ['Completed','Closed'], Completed: ['Closed'], Reassigned: ['InProgress','Closed'], Closed: [] };
    const nextStatuses = canAct ? (NEXT[task.status] || []) : [];

    const LOG_ICON = { Assigned: '👤', Reassigned: '🔄', StatusChange: '🔔', Comment: '💬' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)',
            zIndex: 1050, display: 'flex', justifyContent: 'flex-end' }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
            <div style={{ width: 440, maxWidth: '95vw', background: '#fff',
                height: '100%', display: 'flex', flexDirection: 'column',
                boxShadow: '-4px 0 24px rgba(0,0,0,.12)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                            <PriBadge p={task.priority} />
                            <StatusBadge s={task.status} />
                            <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 6,
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', fontFamily: 'monospace' }}>
                                {task.jobId}
                            </span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', lineHeight: 1.4 }}>
                            {task.description}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                            Assigned to <strong style={{ color: '#475569' }}>{task.assignedTo}</strong>
                            {(() => { const d = fmtDue(task.dueDate); return d ? <span style={{ marginLeft: 6, color: d.color }}> · {d.label}</span> : null; })()}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none',
                        fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20,
                    display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {error && (
                        <div style={{ background: '#fee2e2', color: '#991b1b',
                            borderRadius: 7, padding: '8px 12px', fontSize: 13 }}>{error}</div>
                    )}

                    {/* Status update */}
                    {nextStatuses.length > 0 && (
                        <div>
                            <SectionLabel>Update Status</SectionLabel>
                            <textarea value={statusNote} onChange={e => setStatusNote(e.target.value)}
                                rows={2} placeholder="Optional remark…"
                                style={{ ...inputStyle, height: 'auto', marginBottom: 8 }} />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {nextStatuses.map(s => (
                                    <button key={s} onClick={() => changeStatus(s)} disabled={busy}
                                        style={{ border: '1px solid #e2e8f0', borderRadius: 7,
                                            padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                            cursor: 'pointer', background: '#f8fafc', color: '#1e293b' }}>
                                        → {s === 'InProgress' ? 'In Progress' : s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unauthorised notice */}
                    {!canAct && task.status !== 'Closed' && (
                        <div style={{ background: '#fef9c3', border: '1px solid #fde68a',
                            borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#854d0e' }}>
                            Only the <strong>assignee</strong> or <strong>assigner</strong> can update or reassign this task.
                        </div>
                    )}

                    {/* Reassign */}
                    {canAct && task.status !== 'Closed' && (
                        <div>
                            <SectionLabel>Reassign</SectionLabel>
                            {!showReassign ? (
                                <button onClick={() => setShowReassign(true)}
                                    style={{ background: 'none', border: '1px dashed #cbd5e1',
                                        borderRadius: 7, padding: '6px 14px', fontSize: 12,
                                        cursor: 'pointer', color: '#64748b' }}>
                                    🔄 Reassign to someone else
                                </button>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <select value={reassignUser} onChange={e => setReassignUser(e.target.value)} style={inputStyle}>
                                        <option value="">— Select engineer —</option>
                                        {users.map(u => (
                                            <option key={u.userId} value={u.userName}>{u.fullName || u.userName}</option>
                                        ))}
                                    </select>
                                    <input value={reassignNote} onChange={e => setReassignNote(e.target.value)}
                                        placeholder="Reason for reassignment" style={inputStyle} />
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={doReassign} disabled={busy}
                                            style={{ background: '#7c3aed', color: '#fff', border: 'none',
                                                borderRadius: 7, padding: '6px 14px', fontSize: 12,
                                                fontWeight: 600, cursor: 'pointer' }}>
                                            {busy ? 'Reassigning…' : 'Confirm'}
                                        </button>
                                        <button onClick={() => setShowReassign(false)}
                                            style={{ background: '#f1f5f9', border: 'none', borderRadius: 7,
                                                padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* History */}
                    <div>
                        <SectionLabel>History</SectionLabel>
                        {loadingLog ? (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</div>
                        ) : log.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>No history yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {log.map(l => (
                                    <div key={l.momTaskLogId} style={{ display: 'flex', gap: 10 }}>
                                        <div style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>
                                            {LOG_ICON[l.action] || '·'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>
                                                {l.action === 'Assigned'     && `Assigned to ${l.toUser}`}
                                                {l.action === 'Reassigned'   && `Reassigned from ${l.fromUser} → ${l.toUser}`}
                                                {l.action === 'StatusChange' && `Status: ${l.oldStatus} → ${l.newStatus}`}
                                                {l.action === 'Comment'      && l.remarks}
                                            </div>
                                            {l.remarks && l.action !== 'Comment' && (
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{l.remarks}</div>
                                            )}
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                                {l.actionBy} · {fmtDateTime(l.actionDate)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
        {children}
    </div>
);

export default JobMom;

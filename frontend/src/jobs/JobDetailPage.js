import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser, useAuth } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { usePermission } from '../PermissionContext';
import { STATUS, JOB_TABS, canAccessTab, canEdit, fmt, fmtDate } from './jobConstants';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import OverviewTab   from './tabs/OverviewTab';
import ExpensesTab   from './tabs/ExpensesTab';
import EngineersTab  from './tabs/EngineersTab';
import TermsTab      from './tabs/TermsTab';
import FinanceTab    from './tabs/FinanceTab';
import DocumentsTab  from './tabs/DocumentsTab';
import MetaTab            from './tabs/MetaTab';
import AdditionalJobsTab  from './tabs/AdditionalJobsTab';
import JobBudgetTab       from './tabs/JobBudgetTab';
import HistoryTab         from './tabs/HistoryTab';
import { useFieldConfig } from '../FieldConfigContext';
import JobReportModal from './JobReportModal';
import AlertModal from '../common/AlertModal';
import './JobDetail.css';


// ─────────────────────────────────────────────────────────────
// JobDetailPage  — Full page document-centric job view
// ─────────────────────────────────────────────────────────────
const JobDetailPage = () => {
    const { jobId }    = useParams();
    const navigate     = useNavigate();
    const currentUser  = useCurrentUser();
    const { auth }     = useAuth();
    const { canDo }    = usePermission();
    const { baseCurrencyCode } = useLookup();
    const userRole     = auth?.role || 'ADMIN';

    const [job,          setJob]         = useState(null);
    const [loading,      setLoading]     = useState(true);
    const [activeTab,    setActiveTab]   = useState('overview');
    const [jobTypes,     setJobTypes]    = useState([]);
    const [jobStages,    setJobStages]   = useState([]);
    const [showStageMenu, setStageMenu]  = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [approvalTx,   setApprovalTx]  = useState(null);

    const [showReportModal,   setShowReportModal]   = useState(false);
    const [readiness,         setReadiness]         = useState(null);   // pre-approval checklist

    // ── Job lifecycle actions ─────────────────────────────────
    const [showReviseModal,   setShowReviseModal]   = useState(false);
    const [reviseReason,      setReviseReason]      = useState('');
    const [revisePassword,    setRevisePassword]    = useState('');
    const [actionBusy,        setActionBusy]        = useState(false);
    const [actionError,       setActionError]       = useState('');
    const [alertMsg,          setAlertMsg]          = useState(null);

    // ── Close readiness modal (complete + cancel) ─────────────
    const [showReadinessModal, setShowReadinessModal] = useState(false);
    const [readinessAction,    setReadinessAction]    = useState('complete'); // 'complete' | 'cancel'
    const [readinessChecks,    setReadinessChecks]    = useState([]);
    const [readinessLoading,   setReadinessLoading]   = useState(false);
    const [readinessPhase,     setReadinessPhase]     = useState('checks');  // 'checks' | 'confirm'
    const [closeReason,        setCloseReason]        = useState('');
    const [closePassword,      setClosePassword]      = useState('');

    const loadJob = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
            .then(d => setJob(d))
            .catch(() => navigate('/jobs'))
            .finally(() => setLoading(false));
    }, [jobId, navigate]);

    useEffect(() => { loadJob(); }, [loadJob]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`,  { headers: authHeaders() }).then(r => r.json()).then(d => setJobTypes(Array.isArray(d)  ? d : [])).catch(console.error);
        fetch(`${variables.API_URL}job/stages`, { headers: authHeaders() }).then(r => r.json()).then(d => setJobStages(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    // Fetch pre-approval readiness whenever the approval tab is opened or job reloads
    useEffect(() => {
        if (activeTab !== 'approval' || !jobId) return;
        setReadiness(null);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/approval-readiness`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => setReadiness(Array.isArray(d) ? d : null))
            .catch(console.error);
    }, [activeTab, jobId]);

    // Stages that auto-freeze the job (status → 3 Freezed) when picked.
    // Mirrors the @FreezeStageId list inside sp_ChangeJobStage.
    const FREEZE_STAGE_IDS = new Set(['STAGE5']);

    // Freeze-stage modal state (reason + password) — mirrors Cancel/Complete UX.
    const [freezeStageModal,    setFreezeStageModal]    = useState(null);  // { stage } | null
    const [freezeStageReason,   setFreezeStageReason]   = useState('');
    const [freezeStagePassword, setFreezeStagePassword] = useState('');

    // Low-level POST that talks to the API. Reason / password are optional
    // — they're only sent when moving INTO a freeze stage.
    const postStageChange = async (stage, extra) => {
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/stage`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    jobStageId: stage.jobStageId,
                    oldStage:   job.jobStageName || '',
                    newStage:   stage.jobStageName,
                    modifiedBy: currentUser,
                    ...(extra || {}),
                })
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setActionError(d?.message || 'Failed to change stage.'); return false; }
            loadJob();
            return true;
        } catch { setActionError('Network error. Please try again.'); return false; }
    };

    const changeStage = async (stage) => {
        setStageMenu(false);
        // Moving INTO a freeze stage from an open status now requires reason + password,
        // because it triggers an auto-freeze that locks the job from new transactions.
        if (FREEZE_STAGE_IDS.has(stage.jobStageId) && [1, 2].includes(job.jobStatusId)) {
            setActionError('');
            setFreezeStageReason('');
            setFreezeStagePassword('');
            setFreezeStageModal({ stage });
            return;
        }
        await postStageChange(stage);
    };

    const confirmFreezeStage = async () => {
        if (!freezeStageReason.trim())   { setActionError('Reason is required.');   return; }
        if (!freezeStagePassword.trim()) { setActionError('Password is required.'); return; }
        setActionError('');
        setActionBusy(true);
        const ok = await postStageChange(freezeStageModal.stage, {
            reason:   freezeStageReason.trim(),
            password: freezeStagePassword,
        });
        setActionBusy(false);
        if (ok) {
            setFreezeStageModal(null);
            setFreezeStageReason('');
            setFreezeStagePassword('');
        }
    };

    useEffect(() => {
        if (!showStageMenu) return;
        const handler = () => { setStageMenu(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showStageMenu]);

    const loadReadiness = (action) => {
        setReadinessLoading(true);
        setReadinessChecks([]);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/close-readiness?action=${action}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setReadinessChecks(Array.isArray(d) ? d : []))
            .catch(() => setReadinessChecks([]))
            .finally(() => setReadinessLoading(false));
    };

    const openCloseReadiness = (action) => {
        setReadinessAction(action);
        setReadinessPhase('checks');
        setCloseReason('');
        setClosePassword('');
        setActionError('');
        setShowReadinessModal(true);
        loadReadiness(action);
    };

    const closeReadinessModal = () => {
        if (actionBusy) return;
        setShowReadinessModal(false);
        setReadinessChecks([]);
        setCloseReason('');
        setClosePassword('');
        setActionError('');
    };

    const confirmClose = () => {
        if (!closeReason.trim())    { setActionError('Reason is required.');   return; }
        if (!closePassword.trim())  { setActionError('Password is required.'); return; }
        setActionError('');
        setActionBusy(true);
        const endpoint = readinessAction === 'complete' ? 'complete' : 'cancel';
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/${endpoint}`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                oldStatus:  STATUS[job.jobStatusId]?.label || '',
                modifiedBy: currentUser,
                reason:     closeReason.trim(),
                password:   closePassword,
            }),
        })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message || 'Error'); return d; })
            .then(() => { closeReadinessModal(); loadJob(); })
            .catch(e => setActionError(e.message))
            .finally(() => setActionBusy(false));
    };

    const confirmRevise = () => {
        if (!reviseReason.trim())   { setActionError('Revision reason is required.'); return; }
        if (!revisePassword.trim()) { setActionError('Password is required.');         return; }
        setActionError('');
        setActionBusy(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/revise`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                reason:    reviseReason.trim(),
                revisedBy: currentUser,
                password:  revisePassword,
            }),
        })
            .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.message || 'Error'); return d; })
            .then(() => { setShowReviseModal(false); setReviseReason(''); setRevisePassword(''); loadJob(); })
            .catch(e => setActionError(e.message))
            .finally(() => setActionBusy(false));
    };

    // parentOnly tabs only show on main jobs (jobs that are not themselves additional)
    const isAdditionalJob = !!job?.parentJobId;
    // Freezed (3), Completed (4) and Cancelled (5) jobs are read-only — strip
    // every actionable tab (approval workflow, budget approve/revise). History
    // and Overview stay visible so users can still inspect what happened.
    const isClosedFinal  = [3, 4, 5].includes(job?.jobStatusId);
    const LOCKED_HIDE_TABS = new Set(['approval', 'budget']);
    const visibleTabs = JOB_TABS.filter(t =>
        canAccessTab(t, userRole, canDo)
        && !(t.parentOnly && isAdditionalJob)
        && !(isClosedFinal && LOCKED_HIDE_TABS.has(t.key))
    );

    // If the active tab gets revoked / hidden, jump to the first one the user can see.
    useEffect(() => {
        if (visibleTabs.length === 0) return;
        if (!visibleTabs.some(t => t.key === activeTab)) {
            setActiveTab(visibleTabs[0].key);
        }
    }, [visibleTabs, activeTab]);

    const renderTab = () => {
        if (!job) return null;
        switch (activeTab) {
            case 'overview':  return <OverviewTab  job={job} onRefresh={loadJob} userRole={userRole} currentUser={currentUser} />;
            case 'expenses':  return <ExpensesTab  job={job} onRefresh={loadJob} />;
            case 'engineers': return <EngineersTab job={job} onRefresh={loadJob} />;
            case 'terms':     return <TermsTab     job={job} onRefresh={loadJob} />;
            case 'budget':     return (
                <>
                    {job.approvalStatus !== 'Approved' && (
                        <div style={{
                            background: '#fffbeb', border: '1px solid #fde68a',
                            borderLeft: '4px solid #f59e0b', borderRadius: 8,
                            padding: '10px 16px', marginBottom: 12,
                            fontSize: 12.5, color: '#92400e',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <span style={{ fontSize: 16 }}>🔒</span>
                            <span>
                                Budget entry is locked until the job order is approved.
                                Go to the <strong>Approval</strong> tab, complete all requirements, and submit for approval.
                            </span>
                        </div>
                    )}
                    <JobBudgetTab job={job} />
                </>
            );
            case 'finance':    return <FinanceTab   job={job} />;
            case 'documents':  return <DocumentsTab job={job} />;
            case 'meta':       return <MetaTab           job={job} onRefresh={loadJob} />;
            case 'additional': return <AdditionalJobsTab  job={job} />;
            case 'history':    return <HistoryTab          job={job} />;
            case 'approval':   return (
                <>
                    {readiness && <JobApprovalReadiness items={readiness} />}
                    <ApprovalHistoryTab
                        moduleCode="JOB"
                        documentId={job.jobNumId}
                        documentNo={job.jobId}
                        documentAmount={job.orderValue}
                        onStatusChange={loadJob}
                        onTransactionLoad={setApprovalTx}
                    />
                </>
            );
            default:           return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading job…</span>
        </div>
    );
    if (!job) return null;

    const status   = STATUS[job.jobStatusId] || STATUS[1];
    const editable = canEdit(job.jobStatusId);

    // Job currency vs base — show base equivalent when they differ.
    const jobCcy    = job.currencyName || baseCurrencyCode || '';
    const jobRate   = Number(job.jobExcRate || 1);
    const isForeign = !!baseCurrencyCode && jobCcy !== baseCurrencyCode && jobRate !== 1;
    const baseSub   = (v) => (isForeign ? `≈ ${fmt((Number(v) || 0) * jobRate)} ${baseCurrencyCode}` : null);

    return (
        <div className="jd-page">

            {/* HEADER */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/jobs')}>← Jobs</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{job.jobId}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{job.customerName}</span>
                        {job.projectName && <><span className="jd-header-dot">·</span><span className="jd-header-project">{job.projectName}</span></>}
                        <span className="jd-header-dot">·</span>
                        <span className="jd-header-type">{job.jobTypeName}</span>
                        {job.currencySymbol && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{
                                fontSize: 12, fontWeight: 700, fontFamily: 'Courier New',
                                color: job.jobExcRate && job.jobExcRate !== 1 ? '#7c3aed' : '#475569',
                            }}>
                                {job.currencySymbol}
                                {job.jobExcRate && job.jobExcRate !== 1 && (
                                    <span style={{ fontWeight: 500, fontSize: 11, marginLeft: 4 }}>
                                        @ {Number(job.jobExcRate).toFixed(4)}
                                    </span>
                                )}
                            </span></>
                        )}
                        {job.parentJobId && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                                🔗 Parent: <button className="job-id-link" style={{ fontSize: 12, color: '#7c3aed' }}
                                    onClick={() => navigate(`/jobs/${encodeURIComponent(job.parentJobId)}`)}>
                                    {job.parentJobId}
                                </button>
                            </span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">

                    {/* Lifecycle status badge (read-only — changes via approval workflow) */}
                    <span className="jd-status-btn"
                        style={{ background: status.bg, color: status.color, borderColor: status.dot,
                                 cursor: 'default' }}>
                        <span className="jd-status-dot" style={{ background: status.dot }} />
                        {status.label}
                    </span>

                    {/* Approval status badge */}
                    {job.approvalStatus && (() => {
                        const APPR = {
                            Draft:           { label: 'Draft',            color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
                            PendingApproval: { label: 'Pending Approval', color: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
                            Approved:        { label: 'Job Approved',     color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
                            Rejected:        { label: 'Rejected',         color: '#991b1b', bg: '#fee2e2', dot: '#ef4444' },
                        };
                        const as = APPR[job.approvalStatus] || APPR.Draft;
                        return (
                            <span className="jd-status-btn" title="Job order approval status"
                                style={{ background: as.bg, color: as.color, borderColor: as.dot, cursor: 'default' }}>
                                <span className="jd-status-dot" style={{ background: as.dot }} />
                                {as.label}
                            </span>
                        );
                    })()}

                    {canDo('/jobs', 'PRINT') && (
                        <button
                            className="jd-edit-btn"
                            style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#bae6fd' }}
                            onClick={() => setShowReportModal(true)}
                            title="Generate job report for printing">
                            📄 Job Report
                        </button>
                    )}

                    {/* Stage dropdown */}
                    <div className="jd-menu-wrap" onMouseDown={e => e.stopPropagation()}>
                        <button className="jd-stage-btn" onClick={() => { if (editable && job.approvalStatus === 'Approved') setStageMenu(m => !m); }}
                            title={job.approvalStatus !== 'Approved' ? 'Stage cannot be changed until the job is approved' : undefined}>
                            📍 {job.jobStageName || 'Stage'}
                            {editable && job.approvalStatus === 'Approved' && <span className="jd-chevron">▾</span>}
                        </button>
                        {showStageMenu && (
                            <div className="jd-dropdown">
                                <div className="jd-dropdown-title">Move to Stage</div>
                                {jobStages.map(s => (
                                    <button key={s.jobStageId}
                                        className={`jd-dropdown-item ${s.jobStageId === job.jobStageId ? 'jd-dropdown-item-active' : ''}`}
                                        onClick={() => changeStage(s)}>
                                        {s.jobStageId === job.jobStageId && '✓ '}{s.jobStageName}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {editable && (
                        <button className="jd-edit-btn" onClick={() => setShowEditForm(true)}>✏️ Edit Job</button>
                    )}

                    {/* Complete Job — only when active or on hold AND approved */}
                    {[1, 2].includes(job.jobStatusId) && job.approvalStatus === 'Approved' && (
                        <button className="jd-action-btn jd-action-complete"
                            onClick={() => openCloseReadiness('complete')}>
                            ✅ Complete Job
                        </button>
                    )}

                    {/* Cancel Job — only when active or on hold.
                        Freezed jobs (3) can only be reopened via Revise — no direct cancel. */}
                    {[1, 2].includes(job.jobStatusId) && (
                        <button className="jd-action-btn jd-action-cancel"
                            onClick={() => openCloseReadiness('cancel')}>
                            ✖ Cancel Job
                        </button>
                    )}

                    {/* Revise Job — only when closed (Freezed / Completed / Cancelled) */}
                    {[3, 4, 5].includes(job.jobStatusId) && (
                        <button className="jd-action-btn jd-action-revise"
                            onClick={() => { setActionError(''); setReviseReason(''); setShowReviseModal(true); }}>
                            🔄 Revise Job
                        </button>
                    )}
                </div>
            </div>

            {/* KPI STRIP */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Job Date',          val: fmtDate(job.jobDate),              cls: '' },
                    { label: `Order Value${jobCcy ? ` (${jobCcy})` : ''}`, val: fmt(job.orderValue), cls: 'jd-kpi-blue', sub: baseSub(job.orderValue) },
                    { label: 'Total Expenses',     val: fmt(job.totalInvoicing),           cls: 'jd-kpi-amber', sub: baseSub(job.totalInvoicing) },
                    { label: 'Balance',            val: fmt(Number(job.orderValue||0) - Number(job.totalInvoicing||0)),
                                                                                            cls: Number(job.orderValue||0) - Number(job.totalInvoicing||0) < 0 ? 'jd-kpi-red' : 'jd-kpi-green',
                                                   sub: baseSub(Number(job.orderValue||0) - Number(job.totalInvoicing||0)) },
                    { label: 'Exp. Complete',      val: fmtDate(job.jobExpectedCompleteDate), cls: '' },
                    ...(job.finishedItemCode ? [{ label: 'Item',    val: job.finishedItemCode,  cls: 'jd-kpi-mono' }] : []),
                    ...(job.bomCount > 0     ? [{ label: 'BOMs',    val: job.bomCount,           cls: 'jd-kpi-blue' }] : []),
                    { label: 'LPO Ref',            val: job.lpoRef || '—',                cls: 'jd-kpi-mono' },
                    { label: 'Contract Ref',       val: job.contractRef || '—',           cls: 'jd-kpi-mono' },
                    ...(job.parentJobId ? [{ label: 'Parent Job', val: job.parentJobId,   cls: 'jd-kpi-purple' }] : []),
                ].map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
                            {k.sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{k.sub}</div>}
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* TAB BAR */}
            <div className="jd-tabs-bar">
                {visibleTabs.map(tab => (
                    <button key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                        title={tab.description}>
                        <span className="jd-tab-icon">{tab.icon}</span>
                        <span className="jd-tab-label">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            <div className="jd-tab-content">
                {activeTab !== 'approval' && !isClosedFinal && (
                    <ApprovalStatusBanner transaction={approvalTx} />
                )}
                {renderTab()}
            </div>

            {/* EDIT SLIDE-OVER */}
            {showEditForm && (
                <JobEditSlideOver
                    job={job} jobTypes={jobTypes} jobStages={jobStages}
                    onClose={() => setShowEditForm(false)}
                    onSaved={() => { setShowEditForm(false); loadJob(); }}
                />
            )}

            {/* ── CLOSE READINESS MODAL (Complete + Cancel) ─── */}
            {showReadinessModal && (() => {
                const isComplete  = readinessAction === 'complete';
                const allPassed   = readinessChecks.length > 0 && readinessChecks.every(c => c.Passed);
                const failCount   = readinessChecks.filter(c => !c.Passed).length;
                return (
                    <div className="jd-modal-overlay"
                         onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                         onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) closeReadinessModal(); }}>
                        <div className="jd-modal" style={{ minWidth: 480, maxWidth: 580 }} onClick={e => e.stopPropagation()}>
                            <div className="jd-modal-header">
                                <span className="jd-modal-title">
                                    {isComplete ? '✅ Complete Job' : '✖ Cancel Job'} — {job.jobId}
                                </span>
                                <button className="jd-modal-close" onClick={closeReadinessModal} disabled={actionBusy}>✕</button>
                            </div>
                            <div className="jd-modal-body">
                                {readinessPhase === 'checks' ? (
                                    <>
                                        <p className="jd-modal-desc" style={{ marginBottom: 12 }}>
                                            All checks must pass before the job can be {isComplete ? 'completed' : 'cancelled'}.
                                        </p>
                                        {readinessLoading ? (
                                            <div className="jd-modal-loading">Running checks…</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {readinessChecks.map(c => (
                                                    <div key={c.CheckKey} style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                                        padding: '8px 12px', borderRadius: 7,
                                                        background: c.Passed ? '#f0fdf4' : '#fef2f2',
                                                        border: `1px solid ${c.Passed ? '#bbf7d0' : '#fecaca'}`,
                                                    }}>
                                                        <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>
                                                            {c.Passed ? '✅' : '❌'}
                                                        </span>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: 13,
                                                                color: c.Passed ? '#166534' : '#991b1b' }}>
                                                                {c.CheckLabel}
                                                            </div>
                                                            {c.Detail && (
                                                                <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>
                                                                    {c.Detail}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {!readinessLoading && !allPassed && failCount > 0 && (
                                            <div className="jd-modal-warn" style={{ marginTop: 12 }}>
                                                {failCount} check{failCount > 1 ? 's' : ''} must be resolved before proceeding.
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <p className="jd-modal-desc" style={{ color: '#166534', fontWeight: 600, marginBottom: 12 }}>
                                            All checks passed. Provide a reason and your authorisation password to confirm.
                                        </p>
                                        <label className="jd-modal-label">
                                            Reason <span style={{ color: '#dc2626' }}>*</span>
                                        </label>
                                        <textarea
                                            className="jd-modal-textarea"
                                            rows={2}
                                            placeholder={isComplete ? 'Why is this job being completed?' : 'Why is this job being cancelled?'}
                                            value={closeReason}
                                            onChange={e => setCloseReason(e.target.value)}
                                            disabled={actionBusy}
                                            autoFocus
                                        />
                                        <label className="jd-modal-label" style={{ marginTop: 8 }}>
                                            Password <span style={{ color: '#dc2626' }}>*</span>
                                        </label>
                                        <input
                                            type="password" autoComplete="new-password"
                                            className="jd-modal-textarea"
                                            style={{ height: 34, padding: '6px 10px' }}
                                            placeholder="Authorisation password"
                                            value={closePassword}
                                            onChange={e => setClosePassword(e.target.value)}
                                            disabled={actionBusy}
                                        />
                                        {actionError && <div className="jd-modal-error">{actionError}</div>}
                                    </>
                                )}
                            </div>
                            <div className="jd-modal-footer">
                                {readinessPhase === 'checks' ? (
                                    <>
                                        <button className="jd-modal-btn-cancel" onClick={closeReadinessModal}>Back</button>
                                        <button className="jd-modal-btn-secondary"
                                            onClick={() => loadReadiness(readinessAction)}
                                            disabled={readinessLoading}>
                                            {readinessLoading ? 'Checking…' : 'Re-check'}
                                        </button>
                                        <button
                                            className={isComplete ? 'jd-modal-btn-confirm' : 'jd-modal-btn-danger'}
                                            onClick={() => { setActionError(''); setReadinessPhase('confirm'); }}
                                            disabled={!allPassed || readinessLoading}>
                                            Proceed
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className="jd-modal-btn-cancel"
                                            onClick={() => { setReadinessPhase('checks'); setActionError(''); }}
                                            disabled={actionBusy}>
                                            Back to Checklist
                                        </button>
                                        <button
                                            className={isComplete ? 'jd-modal-btn-confirm' : 'jd-modal-btn-danger'}
                                            onClick={confirmClose}
                                            disabled={actionBusy || !closeReason.trim() || !closePassword.trim()}>
                                            {actionBusy
                                                ? (isComplete ? 'Completing…' : 'Cancelling…')
                                                : (isComplete ? 'Mark as Completed' : 'Yes, Cancel Job')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── REVISE JOB MODAL ───────────────────────────── */}
            {showReviseModal && (
                <div className="jd-modal-overlay"
                     onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                     onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !actionBusy) setShowReviseModal(false); }}>
                    <div className="jd-modal" onClick={e => e.stopPropagation()}>
                        <div className="jd-modal-header">
                            <span className="jd-modal-title">🔄 Revise Job — {job.jobId}</span>
                            <button className="jd-modal-close" onClick={() => setShowReviseModal(false)} disabled={actionBusy}>✕</button>
                        </div>
                        <div className="jd-modal-body">
                            <p className="jd-modal-desc">
                                Reopening <strong>{job.jobId}</strong> (currently <em>{STATUS[job.jobStatusId]?.label}</em>) will allow new transactions to be created.
                                A reason and password are required.
                            </p>
                            <label className="jd-modal-label">Revision Reason <span style={{ color: '#dc2626' }}>*</span></label>
                            <textarea
                                className="jd-modal-textarea"
                                rows={3}
                                placeholder="Enter reason for revising this job…"
                                value={reviseReason}
                                onChange={e => setReviseReason(e.target.value)}
                                disabled={actionBusy}
                            />
                            <label className="jd-modal-label" style={{ marginTop: 8 }}>
                                Password <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                type="password" autoComplete="new-password"
                                className="jd-modal-textarea"
                                style={{ height: 34, padding: '6px 10px' }}
                                placeholder="Authorisation password"
                                value={revisePassword}
                                onChange={e => setRevisePassword(e.target.value)}
                                disabled={actionBusy}
                            />
                            {actionError && <div className="jd-modal-error">{actionError}</div>}
                        </div>
                        <div className="jd-modal-footer">
                            <button className="jd-modal-btn-cancel" onClick={() => { setShowReviseModal(false); setReviseReason(''); setRevisePassword(''); }} disabled={actionBusy}>
                                Cancel
                            </button>
                            <button className="jd-modal-btn-confirm"
                                onClick={confirmRevise}
                                disabled={actionBusy || !reviseReason.trim() || !revisePassword.trim()}>
                                {actionBusy ? 'Revising…' : 'Revise & Reopen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── JOB REPORT MODAL ─────────────────────────────── */}
            {showReportModal && (
                <JobReportModal
                    jobId={job.jobId}
                    onClose={() => setShowReportModal(false)}
                />
            )}

            {/* ── FREEZE STAGE MODAL ─────────────────────────── */}
            {freezeStageModal && (
                <div className="jd-modal-overlay"
                     onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                     onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !actionBusy) setFreezeStageModal(null); }}>
                    <div className="jd-modal" onClick={e => e.stopPropagation()}>
                        <div className="jd-modal-header">
                            <span className="jd-modal-title">🧊 Move to "{freezeStageModal.stage.jobStageName}" — {job.jobId}</span>
                            <button className="jd-modal-close" onClick={() => setFreezeStageModal(null)} disabled={actionBusy}>✕</button>
                        </div>
                        <div className="jd-modal-body">
                            <p className="jd-modal-desc">
                                Moving <strong>{job.jobId}</strong> to stage <em>{freezeStageModal.stage.jobStageName}</em> will
                                <strong> FREEZE</strong> the job. No new transactions (PR, PO, GRN, Issue, SRV, Invoice, Manhour, BOM)
                                can be created until it is reopened with <em>Revise</em>.
                            </p>
                            <label className="jd-modal-label">
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                className="jd-modal-textarea"
                                rows={2}
                                placeholder="Why is this job being freezed?"
                                value={freezeStageReason}
                                onChange={e => setFreezeStageReason(e.target.value)}
                                disabled={actionBusy}
                            />
                            <label className="jd-modal-label" style={{ marginTop: 8 }}>
                                Password <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                                type="password" autoComplete="new-password"
                                className="jd-modal-textarea"
                                style={{ height: 34, padding: '6px 10px' }}
                                placeholder="Authorisation password"
                                value={freezeStagePassword}
                                onChange={e => setFreezeStagePassword(e.target.value)}
                                disabled={actionBusy}
                            />
                            {actionError && <div className="jd-modal-error">{actionError}</div>}
                        </div>
                        <div className="jd-modal-footer">
                            <button className="jd-modal-btn-cancel"
                                onClick={() => { setFreezeStageModal(null); setFreezeStageReason(''); setFreezeStagePassword(''); }}
                                disabled={actionBusy}>
                                Cancel
                            </button>
                            <button className="jd-modal-btn-confirm"
                                onClick={confirmFreezeStage}
                                disabled={actionBusy || !freezeStageReason.trim() || !freezeStagePassword.trim()}>
                                {actionBusy ? 'Freezing…' : 'Freeze & Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ── Edit slide-over ────────────────────────────────────────────
const JobEditSlideOver = ({ job, jobTypes, jobStages, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq } = useFieldConfig('JOB');
    const { currencies, jobStatuses } = lookups;

    // Does the current job type require a parent job?
    const requiresParentJob = jobTypes.find(t => t.jobTypeId === job.jobTypeId)?.requiresParentJob || false;
    // Is the current job type linked to a budget header? Use OR across all signals
    // (job-type flag, the job's own flag, or an already-set budget category) so the
    // field reliably shows when editing an in-house job.
    const jobTypeRow = jobTypes.find(t => String(t.jobTypeId) === String(job.jobTypeId));
    const isBudgetHeaderLinked = !!(
        jobTypeRow?.isBudgetHeaderLinked || job.isBudgetHeaderLinked || job.budgetCategoryId
    );

    // Budget header options (job expense categories flagged UsedForBudget=1)
    const [budgetCategories, setBudgetCategories] = useState([]);
    useEffect(() => {
        fetch(`${variables.API_URL}Lookup/budgetcategories`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setBudgetCategories(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const [form, setForm] = useState({
        ...job,
        budgetCategoryId:        job.budgetCategoryId ?? '',
        jobDate:                 job.jobDate                 ? job.jobDate.slice(0, 10)                 : '',
        lpoDate:                 job.lpoDate                 ? job.lpoDate.slice(0, 10)                 : '',
        jobCurrencyId:           job.jobCurrencyId != null   ? String(job.jobCurrencyId)                : '',
        jobExpectedCompleteDate: job.jobExpectedCompleteDate ? job.jobExpectedCompleteDate.slice(0, 10) : '',
        jobExpectedDeliveryDate: job.jobExpectedDeliveryDate ? job.jobExpectedDeliveryDate.slice(0, 10) : '',
        jobPlannedStartDate:     job.jobPlannedStartDate     ? job.jobPlannedStartDate.slice(0, 10)     : '',
        orderValue:              job.orderValue       ?? 0,
        jobAdvanceAmount:        job.jobAdvanceAmount ?? 0,
        parentJobId:             job.parentJobId      || '',
    });
    const [saving,    setSaving]    = useState(false);
    const [saveError, setSaveError] = useState('');

    // ── Parent job live-search ──────────────────────────────────
    const [parentSearch,  setParentSearch]  = useState(job.parentJobId || '');
    const [parentResults, setParentResults] = useState([]);
    const [parentLoading, setParentLoading] = useState(false);

    useEffect(() => {
        if (!parentSearch || parentSearch === form.parentJobId) { setParentResults([]); return; }
        const t = setTimeout(() => {
            setParentLoading(true);
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(parentSearch)}&pageSize=20&page=1&sortCol=JobDate&sortDir=DESC`, { headers: authHeaders() })
                .then(r => r.json())
                // Filter out additional jobs — they cannot be used as parents
                .then(d => setParentResults((d.data || []).filter(j => !j.requiresParentJob && j.jobId !== job.jobId)))
                .catch(console.error).finally(() => setParentLoading(false));
        }, 300);
        return () => clearTimeout(t);
    }, [parentSearch]); // eslint-disable-line

    const pickParent = (j) => {
        const label = `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`;
        setForm(p => ({ ...p, parentJobId: j.jobId }));
        setParentSearch(label);
        setParentResults([]);
    };

    const handle = (e) => {
        const { name, value } = e.target;
        if (name === 'jobCurrencyId') {
            const cur = currencies.find(c => String(c.id) === value);
            setForm(p => ({ ...p, jobCurrencyId: value, jobExcRate: cur?.exchangeRate ?? p.jobExcRate }));
        } else {
            setForm(p => ({ ...p, [name]: value }));
        }
    };

    const save = () => {
        if (isBudgetHeaderLinked && !form.budgetCategoryId) {
            setSaveError('Budget Header is required for this job type.');
            return;
        }
        setSaving(true);
        setSaveError('');
        const d2n = v => v || null;  // empty string → null for nullable date fields
        fetch(`${variables.API_URL}job/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                ...form,
                jobCreatedBy:            job.jobCreatedBy,
                jobLastModifiedBy:       currentUser,
                customerId:              Number(form.customerId),
                jobCurrencyId:           Number(form.jobCurrencyId),
                jobExcRate:              Number(form.jobExcRate),
                // OrderValue / Advance are stored in the JOB currency — send as-is.
                orderValue:              Number(job.orderValue)       || 0,
                jobAdvanceAmount:        Number(job.jobAdvanceAmount) || 0,
                // jobStatusId intentionally omitted — changes only via approval workflow
                // Finished-item fields are intentionally NOT sent — field removed from the
                // edit form; values stay whatever they already are server-side.
                lpoDate:                 d2n(form.lpoDate),
                jobPlannedStartDate:     d2n(form.jobPlannedStartDate),
                jobExpectedCompleteDate: d2n(form.jobExpectedCompleteDate),
                jobExpectedDeliveryDate: d2n(form.jobExpectedDeliveryDate),
                parentJobId:             form.parentJobId || null,
                budgetCategoryId:        form.budgetCategoryId ? Number(form.budgetCategoryId) : null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) {
                    setSaveError(d?.message || d?.title || 'Save failed. Please try again.');
                    return;
                }
                onSaved();
            })
            .catch(() => setSaveError('Network error. Please check your connection.'))
            .finally(() => setSaving(false));
    };

    const Sec = ({ label }) => (
        <div className="jf-section"><span className="jf-section-label">{label}</span><div className="jf-section-line" /></div>
    );

    const FinDisplay = ({ label, value }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{value}</span>
        </div>
    );

    return (
        <div className="jf-overlay">
            <div className="jf-panel" onClick={e => e.stopPropagation()}>
                <div className="jf-header">
                    <div><div className="jf-header-title">Edit Job — {job.jobId}</div><div className="jf-header-sub">Update job information</div></div>
                    <button className="jf-close" onClick={onClose}>✕</button>
                </div>
                <div className="jf-body">
                    {saveError && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 14px', marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>⚠️</span><span>{saveError}</span>
                            <button onClick={() => setSaveError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700, fontSize: 14 }}>✕</button>
                        </div>
                    )}
                    <Sec label="Classification" />
                    <div className="jf-row">
                        <div className="jf-field"><label>Job Type</label><select name="jobTypeId" className="jf-input" value={form.jobTypeId} onChange={handle}>{jobTypes.map(t => <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>)}</select></div>
                        <div className="jf-field"><label>Stage</label><select name="jobStageId" className="jf-input" value={form.jobStageId} onChange={handle} disabled={job.approvalStatus !== 'Approved'} title={job.approvalStatus !== 'Approved' ? 'Stage cannot be changed until the job is approved' : undefined} style={job.approvalStatus !== 'Approved' ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>{jobStages.map(s => <option key={s.jobStageId} value={s.jobStageId}>{s.jobStageName}</option>)}</select></div>
                        <div className="jf-field">
                            <label>Status</label>
                            <div className="jf-input" style={{ display:'flex', alignItems:'center', gap:6,
                                background:'#f8fafc', cursor:'default', userSelect:'none' }}>
                                {(() => { const s = jobStatuses.find(x => String(x.id) === String(form.jobStatusId)); return s?.name || '—'; })()}
                                <span style={{ fontSize:10, color:'#94a3b8', marginLeft:'auto' }}>via approval</span>
                            </div>
                        </div>
                        <div className="jf-field" style={{ flex:'0 0 150px' }}><label>Job Date</label><input type="date" name="jobDate" className="jf-input" value={form.jobDate} onChange={handle} /></div>
                    </div>

                    {/* ── Budget Header (only for budget-header-linked job types) ── */}
                    {isBudgetHeaderLinked && (
                        <>
                            <Sec label="Budget Header" />
                            <div className="jf-row">
                                <div className="jf-field jf-f2">
                                    <label>Budget Header <span className="req">*</span></label>
                                    <select name="budgetCategoryId" className="jf-input"
                                        value={form.budgetCategoryId} onChange={handle}>
                                        <option value="">-- Select --</option>
                                        {budgetCategories.map(b => (
                                            <option key={b.id} value={b.id}>{b.code ? `${b.code} — ` : ''}{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Parent Job (only for job types that require it) ── */}
                    {requiresParentJob && (
                        <>
                            <Sec label="Parent Job" />
                            <div className="jf-row">
                                <div className="jf-field jf-f2" style={{ position: 'relative' }}>
                                    <label>Parent Job {isReq('parentJobId') && <span className="req">*</span>}</label>
                                    <input
                                        className={`jf-input ${form.parentJobId ? 'jf-input-ok' : ''}`}
                                        placeholder="Type Job ID or description to search…"
                                        value={parentSearch}
                                        onChange={e => {
                                            setParentSearch(e.target.value);
                                            if (!e.target.value) setForm(p => ({ ...p, parentJobId: '' }));
                                        }}
                                    />
                                    {parentLoading && <span className="jf-cust-spinner">⏳</span>}
                                    {form.parentJobId && (
                                        <span
                                            style={{ position: 'absolute', right: 8, top: 32, cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
                                            onClick={() => { setForm(p => ({ ...p, parentJobId: '' })); setParentSearch(''); }}
                                        >✕</span>
                                    )}
                                    {parentResults.length > 0 && (
                                        <div className="jf-cust-dropdown">
                                            {parentResults.map(j => (
                                                <div key={j.jobId} className="jf-cust-option" onClick={() => pickParent(j)}>
                                                    <span className="jf-cust-code">{j.jobId}</span>
                                                    <span className="jf-cust-name">{j.projectName || '—'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {form.parentJobId && (
                                    <div className="jf-field" style={{ flex: '0 0 auto', alignSelf: 'flex-end', paddingBottom: 2 }}>
                                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ {form.parentJobId}</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    <Sec label="Customer & Project" />
                    <div className="jf-row">
                        <div className="jf-field jf-f2"><label>Project Name</label><input name="projectName" className="jf-input" value={form.projectName || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>External Ref</label><input name="externalRef" className="jf-input" value={form.externalRef || ''} onChange={handle} /></div>
                    </div>
                    <Sec label="References" />
                    <div className="jf-row">
                        <div className="jf-field"><label>Contract Ref</label><input name="contractRef" className="jf-input" value={form.contractRef || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>LPO Ref</label><input name="lpoRef" className="jf-input" value={form.lpoRef || ''} onChange={handle} /></div>
                        <div className="jf-field" style={{ flex:'0 0 150px' }}><label>LPO Date</label><input type="date" name="lpoDate" className="jf-input" value={form.lpoDate} onChange={handle} /></div>
                    </div>
                    <Sec label="Financial" />
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                            💡 Financial values are managed via <strong>Edit Financials</strong> on the Overview tab.
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            <FinDisplay label="Currency"      value={job.currencyName ? `${job.currencyName} (${job.currencySymbol || ''})` : '—'} />
                            <FinDisplay label="Exc. Rate"     value={job.jobExcRate   ?? '—'} />
                            <FinDisplay label="Order Value"   value={job.orderValue   != null ? Number(job.orderValue).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'} />
                            <FinDisplay label="Advance"       value={job.jobAdvanceAmount != null ? Number(job.jobAdvanceAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'} />
                        </div>
                    </div>
                    <Sec label="Timeline" />
                    <div className="jf-row">
                        <div className="jf-field"><label>Planned Start</label><input type="date" name="jobPlannedStartDate" className="jf-input" value={form.jobPlannedStartDate} onChange={handle} /></div>
                        <div className="jf-field"><label>Exp. Completion</label><input type="date" name="jobExpectedCompleteDate" className="jf-input" value={form.jobExpectedCompleteDate} onChange={handle} /></div>
                        <div className="jf-field"><label>Exp. Delivery</label><input type="date" name="jobExpectedDeliveryDate" className="jf-input" value={form.jobExpectedDeliveryDate} onChange={handle} /></div>
                    </div>
                    <Sec label="Description" />
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex:1 }}><label>Description</label><textarea name="jobDescription" className="jf-input jf-textarea" rows={3} value={form.jobDescription || ''} onChange={handle} /></div>
                    </div>
                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Job'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Job approval readiness checklist ──────────────────────────
// Shows per-requirement status: ✅ met / ❌ missing + message.
// Rendered above the ApprovalHistoryTab when on the approval tab.
const READINESS_ICONS = {
    Finance:   '💰',
    Engineers: '👷',
    Terms:     '📄',
    Documents: '📎',
    Meta:      '🏷️',
};

const JobApprovalReadiness = ({ items }) => {
    const allOk = items.every(i => i.ok);
    return (
        <div style={{
            background: allOk ? '#f0fdf4' : '#fffbeb',
            border: `1px solid ${allOk ? '#bbf7d0' : '#fde68a'}`,
            borderLeft: `4px solid ${allOk ? '#22c55e' : '#f59e0b'}`,
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: allOk ? '#166534' : '#92400e', marginBottom: 10 }}>
                {allOk
                    ? '✅ All requirements met — ready to submit for approval'
                    : '⚠ Complete the following before submitting for approval:'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                {items.map(item => (
                    <div key={item.requirement} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, minWidth: 200, flex: '1 0 200px' }}>
                        <span style={{ fontSize: 15, lineHeight: 1.3, flexShrink: 0 }}>{item.ok ? '✅' : '❌'}</span>
                        <div>
                            <span style={{ color: '#475569', marginRight: 4 }}>{READINESS_ICONS[item.requirement]}</span>
                            <strong style={{ color: item.ok ? '#166534' : '#1e293b' }}>{item.requirement}</strong>
                            {!item.ok && (
                                <div style={{ color: '#92400e', fontSize: 11.5, marginTop: 1 }}>{item.message}</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default JobDetailPage;

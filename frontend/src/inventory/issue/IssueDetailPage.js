import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { ISSUE_TABS, fmtDate, fmt, statusBadgeCfg } from '../inventoryConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import IssueOverviewTab    from './tabs/IssueOverviewTab';
import IssueLinesTab        from './tabs/IssueLinesTab';
import IssueNotePrintModal  from './IssueNotePrintModal';
import { InlineError } from '../../common/InlineError';
import JobClosedBanner      from '../../jobs/JobClosedBanner';
import '../../jobs/JobDetail.css';
import '../Inventory.css';
import '../../procurement/Procurement.css';
import AlertModal from '../../common/AlertModal';

const IssueDetailPage = () => {
    const { id }              = useParams();
    const navigate            = useNavigate();
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();

    const [issue,          setIssue]      = useState(null);
    const [lines,          setLines]      = useState([]);
    const [loading,        setLoading]    = useState(true);
    const [error,          setError]      = useState(null);
    const [activeTab,      setActiveTab]  = useState('overview');
    const [showStatusMenu, setStatusMenu] = useState(false);
    const [deleting,       setDeleting]   = useState(false);
    const [showPrint,      setShowPrint]  = useState(false);
    const [pendingStatus,  setPendingStatus] = useState(null);  // status awaiting confirmation
    const [confirming,     setConfirming]     = useState(false);
    const [alertMsg,       setAlertMsg]       = useState(null);
    const [confirm,        setConfirm]        = useState(null);
    const statusRef = useRef(null);

    const loadIssue = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}stockissue/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setIssue(d.issue); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadIssue(); }, [loadIssue]);

    // Close status menu on outside click
    useEffect(() => {
        if (!showStatusMenu) return;
        const handler = (e) => {
            if (statusRef.current && !statusRef.current.contains(e.target)) setStatusMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showStatusMenu]);

    const [actionError, setActionError] = useState('');

    const changeStatus = (newStatus) => {
        setStatusMenu(false);
        setActionError('');

        if (newStatus === 'Confirmed' && (!lines || lines.length === 0)) {
            setAlertMsg(
                'Cannot confirm this Issue Note.\n\n' +
                'No line items have been added yet.\n\n' +
                'Add at least one line on the Lines tab and try again.'
            );
            return;
        }

        // Open the verification modal instead of changing status directly
        setPendingStatus(newStatus);
    };

    const doChangeStatus = async () => {
        const newStatus = pendingStatus;
        if (!newStatus) return;
        setConfirming(true);
        setActionError('');
        try {
            let res, d;
            if (newStatus === 'Confirmed') {
                res = await fetch(`${variables.API_URL}stockissue/${id}/confirm`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({ modifiedBy: currentUser }),
                });
                d = await res.json().catch(() => ({}));
                if (!res.ok) { setActionError(d?.message || `Confirm failed (HTTP ${res.status}).`); return; }
            } else if (newStatus === 'Cancelled') {
                res = await fetch(`${variables.API_URL}stockissue/${id}/cancel`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({ modifiedBy: currentUser }),
                });
                d = await res.json().catch(() => ({}));
                if (!res.ok) { setActionError(d?.message || `Cancel failed (HTTP ${res.status}).`); return; }
            }
            setPendingStatus(null);
            loadIssue();
        } catch (e) {
            setActionError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally {
            setConfirming(false);
        }
    };

    const deleteIssue = () => {
        setConfirm({
            title: 'Delete Issue Note',
            message: 'Delete this Issue Note? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setActionError('');
                setDeleting(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}stockissue/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setActionError(d?.message || `Delete failed (HTTP ${res.status}).`); return; }
                    navigate('/inventory-issue');
                } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setDeleting(false); }
            },
        });
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading issue note…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/inventory-issue')}>
                ← Back to Issue Notes
            </button>
        </div>
    );
    if (!issue) return null;

    const statusData  = getStatusConfig('ISN', issue.status);
    const statusCfg   = statusBadgeCfg(statusData);
    const transitions = statusData?.allowedTransitions || [];
    const canEdit     = canDo('/inventory-issue', 'EDIT');
    const totalCost   = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0);
    const costingLabel = issue.costingType === 'INC_COSTING' ? 'Including Costing' : 'Excluding Costing';

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/inventory-issue')}>← Issue Notes</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{issue.issueNo}</div>
                    <div className="jd-header-info">
                        {issue.jobId && (
                            <span className="jd-header-project">Job: {issue.jobId}</span>
                        )}
                        {issue.customerName && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-customer">{issue.customerName}</span></>
                        )}
                        {issue.projectName && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{issue.projectName}</span></>
                        )}
                        {issue.issuedTo && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">To: {issue.issuedTo}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {issue.status === 'Confirmed' && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => setShowPrint(true)}
                            style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                        >
                            🖨 Print
                        </button>
                    )}

                    {issue.status === 'Draft' && canEdit && (
                        <button
                            className="jd-stage-btn"
                            onClick={deleteIssue}
                            disabled={deleting}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
                        >
                            {deleting ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}

                    {transitions.length > 0 && canEdit && (
                        <div className="prd-status-wrap" ref={statusRef}>
                            <button className="jd-stage-btn" onClick={() => setStatusMenu(o => !o)}>
                                Change Status ▾
                            </button>
                            {showStatusMenu && (
                                <div className="prd-status-menu">
                                    {transitions.map(t => (
                                        <div key={t} className="prd-status-item" onClick={() => changeStatus(t)}>
                                            → {t}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Issue Date',   val: fmtDate(issue.issueDate), cls: '' },
                    issue.jobId     && { label: 'Job',        val: issue.jobId,       cls: 'jd-kpi-mono' },
                    issue.issuedTo  && { label: 'Issued To',  val: issue.issuedTo,    cls: '' },
                    {                   label: 'Type',        val: costingLabel,       cls: '' },
                    {                   label: 'Lines',       val: lines.length,       cls: '' },
                    {                   label: 'Total Cost',  val: fmt(totalCost),     cls: 'jd-kpi-blue' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {ISSUE_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.badge && tab.key === 'lines' && lines.length > 0 && (
                            <span className="jd-tab-badge">{lines.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                <JobClosedBanner jobId={issue?.jobId} />
                {activeTab === 'overview' && (
                    <IssueOverviewTab issue={issue} onRefresh={loadIssue} />
                )}
                {activeTab === 'lines' && (
                    <IssueLinesTab issue={issue} lines={lines} onRefresh={loadIssue} />
                )}
            </div>

            {/* ── PRINT MODAL ── */}
            {showPrint && (
                <IssueNotePrintModal
                    issue={issue}
                    lines={lines}
                    onClose={() => setShowPrint(false)}
                />
            )}

            {/* ── STATUS CHANGE VERIFICATION MODAL ── */}
            {pendingStatus && (() => {
                const isCancel = pendingStatus === 'Cancelled';
                const accent   = isCancel ? '#fca5a5' : '#6ee7b7';
                return (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget && !confirming) setPendingStatus(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: `2px solid ${accent}` }}>
                        {isCancel ? (
                            <>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
                                    🚫 Cancel Issue Note {issue.issueNo}
                                </div>
                                <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginBottom: 16,
                                    background: '#fef2f2', borderRadius: 6, padding: '10px 14px', borderLeft: '3px solid #fca5a5' }}>
                                    This will void the <strong>Draft</strong> Issue Note and mark it <strong>Cancelled</strong>.
                                    No stock has been moved yet, so nothing is reversed — the record is kept for audit.
                                    <div style={{ marginTop: 8, color: '#991b1b' }}>To reverse a <strong>confirmed</strong> note, raise an <strong>Issue Return</strong> instead.</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>
                                    ✅ Confirm Issue Note {issue.issueNo}
                                </div>
                                <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6, marginBottom: 16,
                                    background: '#f0fdf4', borderRadius: 6, padding: '10px 14px', borderLeft: '3px solid #6ee7b7' }}>
                                    You are about to move this Issue Note from <strong>Draft</strong> to <strong>Confirmed</strong>.
                                    Please verify the items and quantities before continuing — on confirmation:
                                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                                        <li>Stock will be <strong>deducted</strong> from inventory.</li>
                                        <li>The note becomes <strong>locked</strong> — lines can no longer be edited.</li>
                                    </ul>
                                </div>
                            </>
                        )}
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                            <strong>{lines.length}</strong> line{lines.length === 1 ? '' : 's'} ·
                            Total cost <strong>{fmt(lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0))}</strong>
                        </div>
                        {actionError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {actionError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setPendingStatus(null); setActionError(''); }} disabled={confirming}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Back
                            </button>
                            <button onClick={doChangeStatus} disabled={confirming}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: isCancel ? '#dc2626' : '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: confirming ? .7 : 1 }}>
                                {confirming ? (isCancel ? 'Cancelling…' : 'Confirming…') : (isCancel ? '🚫 Cancel Note' : '✅ Confirm Issue')}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default IssueDetailPage;

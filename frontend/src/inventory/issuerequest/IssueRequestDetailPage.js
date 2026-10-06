import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { ISR_TABS, fmtDate, fmt, statusBadgeCfg } from '../inventoryConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import IssueRequestOverviewTab from './tabs/IssueRequestOverviewTab';
import IssueRequestLinesTab    from './tabs/IssueRequestLinesTab';
import { InlineError } from '../../common/InlineError';
import LoadErrorPage from '../../LoadErrorPage';
import ApprovalHistoryTab   from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../../approval/ApprovalStatusBanner';
import '../../jobs/JobDetail.css';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const IssueRequestDetailPage = () => {
    const { id }              = useParams();
    const navigate            = useNavigate();
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();

    const [issueRequest, setIssueRequest] = useState(null);
    const [lines,        setLines]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [activeTab,    setActiveTab]    = useState('overview');
    const [approvalTx,   setApprovalTx]   = useState(null);
    const [deleting,     setDeleting]     = useState(false);
    const [actionError,  setActionError]  = useState('');
    const [confirm,      setConfirm]      = useState(null);

    const loadRequest = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}issuerequest/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setIssueRequest(d.issueRequest); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadRequest(); }, [loadRequest]);

    const deleteRequest = () => {
        setConfirm({
            title: 'Delete Issue Request',
            message: 'Delete this Issue Request? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setActionError('');
                setDeleting(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}issuerequest/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setActionError(d?.message || `Delete failed (HTTP ${res.status}).`); return; }
                    navigate('/inventory-issue-request');
                } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setDeleting(false); }
            },
        });
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading issue request…</span>
        </div>
    );

    if (error) return <LoadErrorPage error={error} what="Issue request" backTo="/inventory-issue-request" backLabel="Issue Requests" />;

    if (!issueRequest) return null;

    const statusData = getStatusConfig('ISR', issueRequest.status);
    const statusCfg  = statusBadgeCfg(statusData);
    const canDelete  = (statusData?.canDelete ?? (issueRequest.status === 'Draft'))
                       && canDo('/inventory-issue-request', 'DELETE');

    const totalRequested = lines.reduce((s, l) => s + (l.requestedQty || 0), 0);
    const totalBalance   = lines.reduce((s, l) => s + (l.balanceQty   || 0), 0);

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/inventory-issue-request')}>
                        ← Issue Requests
                    </button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{issueRequest.requestNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-project">Job: {issueRequest.jobId}</span>
                        {issueRequest.customerName && (
                            <>
                                <span className="jd-header-dot">·</span>
                                <span className="jd-header-type">{issueRequest.customerName}</span>
                            </>
                        )}
                        {issueRequest.requestedBy && (
                            <>
                                <span className="jd-header-dot">·</span>
                                <span className="jd-header-type">By: {issueRequest.requestedBy}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {canDelete && (
                        <button className="jd-stage-btn"
                            onClick={deleteRequest}
                            disabled={deleting}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {deleting ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Request Date',  val: fmtDate(issueRequest.requestDate), cls: '' },
                    issueRequest.requiredDate && { label: 'Required By', val: fmtDate(issueRequest.requiredDate), cls: '' },
                    { label: 'Job',           val: issueRequest.jobId,                cls: 'jd-kpi-mono' },
                    { label: 'Issue Type',    val: issueRequest.issueTypeName || '—', cls: '' },
                    { label: 'Lines',         val: lines.length,                      cls: '' },
                    { label: 'Requested Qty', val: fmt(totalRequested, 4),            cls: 'jd-kpi-blue' },
                    { label: 'Balance Qty',   val: fmt(totalBalance, 4),              cls: '' },
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
                {ISR_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}>
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
                {activeTab !== 'approval' && <ApprovalStatusBanner transaction={approvalTx} />}
                {activeTab === 'overview' && (
                    <IssueRequestOverviewTab issueRequest={issueRequest} onRefresh={loadRequest} />
                )}
                {activeTab === 'lines' && (
                    <IssueRequestLinesTab issueRequest={issueRequest} lines={lines} onRefresh={loadRequest} />
                )}
                {activeTab === 'approval' && (
                    // Submitting for approval, approving and rejecting all live here —
                    // the engine is metadata driven off the ISR row in TBL_APPROVAL_MODULE.
                    // IsAmountBased = 0, so documentAmount stays 0.
                    <ApprovalHistoryTab
                        moduleCode="ISR"
                        documentId={Number(id)}
                        documentNo={issueRequest.requestNo}
                        documentAmount={0}
                        currencyId={null}
                        linesCount={lines.length}
                        lineLabel="request lines"
                        onStatusChange={loadRequest}
                        onTransactionLoad={setApprovalTx}
                    />
                )}
            </div>
        </div>
    );
};

export default IssueRequestDetailPage;

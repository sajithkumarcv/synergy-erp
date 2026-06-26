import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { IRN_TABS, fmtDate, fmt, statusBadgeCfg } from '../inventoryConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import IssueReturnOverviewTab  from './tabs/IssueReturnOverviewTab';
import IssueReturnLinesTab     from './tabs/IssueReturnLinesTab';
import IssueReturnPrintModal   from './IssueReturnPrintModal';
import { InlineError } from '../../common/InlineError';
import ApprovalHistoryTab      from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner    from '../../approval/ApprovalStatusBanner';
import '../../jobs/JobDetail.css';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const IssueReturnDetailPage = () => {
    const { id }              = useParams();
    const navigate            = useNavigate();
    const [searchParams]      = useSearchParams();
    const autoPrint           = searchParams.get('print') === '1';
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();

    const [issueReturn,    setIssueReturn]  = useState(null);
    const [lines,          setLines]        = useState([]);
    const [loading,        setLoading]      = useState(true);
    const [error,          setError]        = useState(null);
    const [activeTab,      setActiveTab]    = useState('overview');
    const [approvalTx,     setApprovalTx]  = useState(null);
    const [deleting,       setDeleting]     = useState(false);
    const [showPrint,      setShowPrint]    = useState(false);
    const [confirm,        setConfirm]      = useState(null);

    const loadReturn = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}stockissuereturn/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setIssueReturn(d.issueReturn); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadReturn(); }, [loadReturn]);
    useEffect(() => { if (issueReturn && autoPrint) setShowPrint(true); }, [issueReturn, autoPrint]);

    const [actionError, setActionError] = useState('');

    const deleteReturn = () => {
        setConfirm({
            title: 'Delete Issue Return',
            message: 'Delete this Issue Return Note? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setActionError('');
                setDeleting(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}stockissuereturn/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setActionError(d?.message || `Delete failed (HTTP ${res.status}).`); return; }
                    navigate('/inventory-issue-return');
                } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setDeleting(false); }
            },
        });
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading issue return…</span>
        </div>
    );

    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }}
                onClick={() => navigate('/inventory-issue-return')}>
                ← Back to Issue Returns
            </button>
        </div>
    );

    if (!issueReturn) return null;

    const statusData  = getStatusConfig('IRN', issueReturn.status);
    const statusCfg   = statusBadgeCfg(statusData);
    const canDelete   = canDo('/inventory-issue-return', 'DELETE');
    const totalCost   = lines.reduce((s, l) => s + (l.returnQty || 0) * (l.unitCost || 0), 0);

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/inventory-issue-return')}>
                        ← Issue Returns
                    </button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{issueReturn.returnNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-project">↩ {issueReturn.issueNo}</span>
                        {issueReturn.jobId && (
                            <>
                                <span className="jd-header-dot">·</span>
                                <span className="jd-header-project">Job: {issueReturn.jobId}</span>
                            </>
                        )}
                        {issueReturn.returnedBy && (
                            <>
                                <span className="jd-header-dot">·</span>
                                <span className="jd-header-type">By: {issueReturn.returnedBy}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <button className="jd-stage-btn"
                            onClick={() => setShowPrint(true)}
                            style={{ background: '#f0f9ff', color: '#0369a1', borderColor: '#7dd3fc' }}>
                        🖨 Print
                    </button>

                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {issueReturn.status === 'Draft' && canDelete && (
                        <button className="jd-stage-btn"
                            onClick={deleteReturn}
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
                    { label: 'Return Date',  val: fmtDate(issueReturn.returnDate), cls: '' },
                    { label: 'Issue Note',   val: issueReturn.issueNo,             cls: 'jd-kpi-mono' },
                    issueReturn.jobId        && { label: 'Job',         val: issueReturn.jobId,         cls: 'jd-kpi-mono' },
                    issueReturn.returnedBy   && { label: 'Returned By', val: issueReturn.returnedBy,   cls: '' },
                    { label: 'Lines',        val: lines.length,                   cls: '' },
                    { label: 'Total Value',  val: fmt(totalCost),                 cls: 'jd-kpi-blue' },
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
                {IRN_TABS.map(tab => (
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
                    <IssueReturnOverviewTab issueReturn={issueReturn} onRefresh={loadReturn} />
                )}
                {activeTab === 'lines' && (
                    <IssueReturnLinesTab issueReturn={issueReturn} lines={lines} onRefresh={loadReturn} />
                )}
                {activeTab === 'approval' && (
                    <ApprovalHistoryTab
                        moduleCode="IRN"
                        documentId={Number(id)}
                        documentNo={issueReturn.returnNo}
                        documentAmount={totalCost}
                        currencyId={null}
                        linesCount={lines.length}
                        lineLabel="return lines"
                        onStatusChange={loadReturn}
                        onTransactionLoad={setApprovalTx}
                    />
                )}
            </div>

            {/* ── Print modal ── */}
            {showPrint && (
                <IssueReturnPrintModal
                    issueReturn={issueReturn}
                    lines={lines}
                    onClose={() => setShowPrint(false)}
                />
            )}
        </div>
    );
};

export default IssueReturnDetailPage;

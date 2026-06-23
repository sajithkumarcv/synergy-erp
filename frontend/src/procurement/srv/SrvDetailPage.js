import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, fmt, SRV_TABS, statusBadgeCfg } from '../procurementConstants';
import SrvOverviewTab     from './tabs/SrvOverviewTab';
import SrvLinesTab        from './tabs/SrvLinesTab';
import ApprovalHistoryTab  from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../../approval/ApprovalStatusBanner';
import JobClosedBanner      from '../../jobs/JobClosedBanner';
import { InlineError }      from '../../common/InlineError';
import '../../jobs/JobDetail.css';
import '../Procurement.css';
import '../../inventory/Inventory.css';
import AlertModal from '../../common/AlertModal';

const SrvDetailPage = () => {
    const { id }               = useParams();
    const navigate             = useNavigate();
    const currentUser          = useCurrentUser();
    const { getStatusConfig }  = useLookup();
    const { canDo }            = usePermission();

    const [srv,         setSrv]         = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [activeTab,   setActiveTab]   = useState('overview');
    const [approvalTx,  setApprovalTx]  = useState(null);
    const [actBusy,     setActBusy]     = useState(false);
    const [actionError, setActionError] = useState('');
    const [showStatusMenu, setStatusMenu] = useState(false);
    const statusRef = useRef(null);

    const canEdit = canDo('/service-receipts', 'EDIT');

    const [linesCount, setLinesCount] = useState(null);
    const [alertMsg,   setAlertMsg]   = useState(null);
    const [confirm,    setConfirm]    = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}servicereceipt/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => {
                setSrv(d.header);
                // The detail GET also returns the lines — capture the count for
                // the Approval tab's pre-submit guard.
                setLinesCount(Array.isArray(d.lines) ? d.lines.length : 0);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // Close status menu on outside click
    useEffect(() => {
        if (!showStatusMenu) return;
        const handler = (e) => {
            if (statusRef.current && !statusRef.current.contains(e.target))
                setStatusMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showStatusMenu]);

    const changeStatus = async (newStatus) => {
        setStatusMenu(false);

        if (newStatus === 'Confirmed' && linesCount === 0) {
            setAlertMsg(
                'Cannot confirm this Service Receipt.\n\n' +
                'No service lines have been added yet.\n\n' +
                'Add at least one line on the Lines tab and try again.'
            );
            return;
        }

        const actionLabel = newStatus === 'Confirmed' ? 'Confirm' : newStatus;
        setConfirm({
            title: `${actionLabel} Service Receipt`,
            message: `${actionLabel} this Service Receipt?`,
            confirmLabel: actionLabel,
            onConfirm: async () => {
                setConfirm(null);
                setActionError('');
                setActBusy(true);
                try {
                    const res = await fetch(`${variables.API_URL}servicereceipt/${id}/status`, {
                        method: 'POST', headers: authHeaders(),
                        body: JSON.stringify({ status: newStatus, changedBy: currentUser }),
                    });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setActionError(d?.message || `Status change failed (HTTP ${res.status}).`); return; }
                    load();
                } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
                finally { setActBusy(false); }
            },
        });
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading service receipt…</span>
        </div>
    );
    if (error || !srv) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error || 'Not found.'}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/service-receipts')}>
                ← Back to Service Receipts
            </button>
        </div>
    );

    const statusData  = getStatusConfig('SRV', srv.status);
    const statusCfg   = statusBadgeCfg(statusData);
    const transitions = statusData?.allowedTransitions || [];

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/service-receipts')}>← Service Receipts</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{srv.srvNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{fmtDate(srv.srvDate)}</span>
                        {srv.poNumber && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">PO: {srv.poNumber}</span></>
                        )}
                        {srv.supplierName && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{srv.supplierName}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label || srv.status}
                    </span>

                    {/* Status transitions */}
                    {transitions.length > 0 && canEdit && (
                        <div className="prd-status-wrap" ref={statusRef}>
                            <button className="jd-stage-btn" onClick={() => setStatusMenu(o => !o)} disabled={actBusy}>
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

                    {/* Fallback for modules without TBL_DOCUMENT_STATUS rows */}
                    {transitions.length === 0 && canEdit && srv.status === 'Draft' && (
                        <button className="jd-stage-btn"
                            style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}
                            onClick={() => changeStatus('Confirmed')} disabled={actBusy}>
                            ✓ Confirm Receipt
                        </button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date',         val: fmtDate(srv.srvDate) },
                    { label: 'Lines',        val: srv.lineCount ?? '—' },
                    { label: 'Total Cost',   val: fmt(srv.totalCost), cls: 'jd-kpi-blue' },
                    srv.jobId        && { label: 'Job',      val: srv.jobId,        cls: 'jd-kpi-mono' },
                    srv.poNumber     && { label: 'PO',       val: srv.poNumber,     cls: 'jd-kpi-mono' },
                    srv.createdBy    && { label: 'Created By', val: srv.createdBy },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls || ''}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {SRV_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.badge && tab.key === 'lines' && (srv.lineCount > 0) && (
                            <span className="jd-tab-badge">{srv.lineCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                {activeTab !== 'approval' && (
                    <>
                        <JobClosedBanner jobId={srv?.jobId} />
                        <ApprovalStatusBanner transaction={approvalTx} />
                    </>
                )}
                {activeTab === 'overview' && (
                    <SrvOverviewTab srv={srv} onRefresh={load} />
                )}
                {activeTab === 'lines' && (
                    <SrvLinesTab srv={srv} onRefresh={load} />
                )}
                {activeTab === 'approval' && (
                    <ApprovalHistoryTab
                        moduleCode="SRV"
                        documentId={Number(id)}
                        documentNo={srv.srvNo}
                        documentAmount={srv.totalCost}
                        currencyId={null}
                        linesCount={linesCount}
                        lineLabel="service lines"
                        onStatusChange={load}
                        onTransactionLoad={setApprovalTx}
                    />
                )}
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default SrvDetailPage;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { GRN_TABS, fmtDate, fmt, statusBadgeCfg } from '../procurementConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { usePrintFormat } from '../../print/printFormats';
import GrnOverviewTab        from './tabs/GrnOverviewTab';
import GrnLinesTab           from './tabs/GrnLinesTab';
import GrnDocumentsTab       from './tabs/GrnDocumentsTab';
import GrnPrintModal         from './GrnPrintModal';
import { GrnQcModal, GrnQcLogTab } from './GrnQcModal';
import GrnCancelModal        from './GrnCancelModal';
import JobClosedBanner       from '../../jobs/JobClosedBanner';
import { InlineError }       from '../../common/InlineError';
import '../../jobs/JobDetail.css';
import '../Procurement.css';
import AlertModal from '../../common/AlertModal';
import LoginPasswordModal from '../../common/LoginPasswordModal';

const GrnDetailPage = () => {
    const { grnId }          = useParams();
    const navigate           = useNavigate();
    const currentUser        = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { canDo }          = usePermission();

    const [grn,          setGrn]        = useState(null);
    const [loading,      setLoading]    = useState(true);
    const [error,        setError]      = useState(null);
    const [activeTab,    setActiveTab]  = useState('overview');
    const [showStatusMenu, setStatusMenu] = useState(false);
    const [showPrint,    setShowPrint]  = useState(false);
    const printFmt = usePrintFormat('GRN');   // configured layout (Company Settings → Print Formats)
    const statusRef = useRef(null);

    const loadGrn = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}grn/${grnId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setGrn(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [grnId]);

    useEffect(() => { loadGrn(); }, [loadGrn]);

    useEffect(() => {
        if (!showStatusMenu) return;
        const handler = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusMenu(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showStatusMenu]);

    const [actionError,  setActionError]  = useState('');
    const [linesCount,   setLinesCount]   = useState(null);
    const [showQcModal,    setShowQcModal]   = useState(false);
    const [pendingStatus,  setPendingStatus] = useState(null);   // status waiting on QC confirmation
    const [qcRejected,     setQcRejected]   = useState(false);  // show rejection notice banner
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [alertMsg,        setAlertMsg]        = useState(null);
    const [showLoginPw,    setShowLoginPw]   = useState(false);  // login password gate before Received
    const [pendingLoginPw, setPendingLoginPw] = useState('');    // password captured, waiting for QC

    // Light line-count fetch for the status-change pre-check. Refreshed
    // alongside the header so it stays accurate while the user toggles tabs.
    useEffect(() => {
        if (!grnId) return;
        fetch(`${variables.API_URL}grn/lines/${grnId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setLinesCount(Array.isArray(d) ? d.length : 0))
            .catch(() => setLinesCount(null));
    }, [grnId, grn]);

    // Statuses that "post" the document — moving forward, requires lines.
    // Cancel / revert / back-to-Draft transitions are not blocked.
    const POSTING_STATUSES = new Set(['Received', 'Confirmed', 'Completed', 'Posted']);

    // Core status-change call — used both directly and after QC confirmation.
    const doChangeStatus = async (newStatus, loginPassword = null) => {
        setActionError('');
        try {
            const res = await fetch(`${variables.API_URL}grn/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ id: Number(grnId), status: newStatus, changedBy: currentUser, loginPassword })
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setActionError(d?.message || `Status change failed (HTTP ${res.status}).`);
                return;
            }
            setPendingLoginPw('');
            loadGrn();
        } catch (e) { setActionError(`Network error — ${e?.message || 'could not reach the server.'}`); }
    };

    const changeStatus = (newStatus) => {
        setStatusMenu(false);
        setActionError('');

        if (POSTING_STATUSES.has(newStatus) && linesCount === 0) {
            setAlertMsg(
                `Cannot change status to "${newStatus}".\n\n` +
                `This GRN has no line items.\n\n` +
                `Add at least one line on the Lines tab and try again.`
            );
            return;
        }

        // Intercept Draft → Received: password first, then QC.
        if (newStatus === 'Received' && grn?.status === 'Draft') {
            setPendingStatus(newStatus);
            setShowLoginPw(true);
            return;
        }

        // Intercept any → Cancelled: password-protected modal.
        if (newStatus === 'Cancelled') {
            setShowCancelModal(true);
            return;
        }

        doChangeStatus(newStatus);
    };

    const renderTab = () => {
        if (!grn) return null;
        switch (activeTab) {
            case 'overview':  return <GrnOverviewTab  grn={grn} onRefresh={loadGrn} />;
            case 'lines':     return <GrnLinesTab     grn={grn} onRefresh={loadGrn} />;
            case 'documents': return <GrnDocumentsTab grn={grn} />;
            case 'qc':        return <GrnQcLogTab     grn={grn} />;
            default:          return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading goods receipt note…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/grn')}>← Back to GRNs</button>
        </div>
    );
    if (!grn) return null;

    const statusData  = getStatusConfig('GRN', grn.status);
    const statusCfg   = statusBadgeCfg(statusData);
    const transitions = statusData?.allowedTransitions || [];

    const canEdit    = canDo('/grn', 'EDIT');
    const canPrint   = grn.status !== 'Draft';

    return (
        <div className="jd-page">
            {showPrint && <GrnPrintModal grn={grn} onClose={() => setShowPrint(false)} />}

            {showLoginPw && (
                <LoginPasswordModal
                    title="Confirm GRN Receipt"
                    message="Enter your login password to mark this GRN as Received."
                    onConfirm={(pw) => {
                        setPendingLoginPw(pw);
                        setShowLoginPw(false);
                        setShowQcModal(true);
                    }}
                    onClose={() => {
                        setShowLoginPw(false);
                        setPendingStatus(null);
                    }}
                />
            )}

            {showQcModal && (
                <GrnQcModal
                    grn={grn}
                    currentUser={currentUser}
                    onConfirm={() => {
                        setShowQcModal(false);
                        doChangeStatus(pendingStatus, pendingLoginPw);
                        setPendingStatus(null);
                        setQcRejected(false);
                    }}
                    onReject={() => {
                        setShowQcModal(false);
                        setPendingStatus(null);
                        setPendingLoginPw('');
                        setQcRejected(true);
                        loadGrn();
                    }}
                    onCancel={() => {
                        setShowQcModal(false);
                        setPendingStatus(null);
                        setPendingLoginPw('');
                    }}
                />
            )}

            {showCancelModal && (
                <GrnCancelModal
                    grn={grn}
                    currentUser={currentUser}
                    onCancelled={() => { setShowCancelModal(false); loadGrn(); }}
                    onClose={() => setShowCancelModal(false)}
                />
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/grn')}>← GRN</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{grn.grnNumber}</div>
                    <div className="jd-header-info">
                        {grn.supplierName && (
                            <span className="jd-header-customer">{grn.supplierName}</span>
                        )}
                        {grn.poNumber && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">PO: {grn.poNumber}</span></>
                        )}
                        {grn.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{grn.jobId}{grn.jobTitle ? ` — ${grn.jobTitle}` : ''}</span></>
                        )}
                        {grn.currencyShort && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">{grn.currencyShort}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {canPrint && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => setShowPrint(printFmt)}
                            title="Print / Save as PDF"
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                            🖨 Print GRN
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
                    { label: 'GRN Date',     val: fmtDate(grn.grnDate),      cls: '' },
                    grn.receivedDate && { label: 'Received',  val: fmtDate(grn.receivedDate), cls: '' },
                    grn.doNo         && { label: 'D.O. No',   val: grn.doNo,                  cls: 'jd-kpi-mono' },
                    grn.invoiceNo    && { label: 'Invoice',   val: grn.invoiceNo,              cls: 'jd-kpi-mono' },
                    grn.poNumber     && { label: 'PO',        val: grn.poNumber,               cls: 'jd-kpi-mono' },
                    grn.jobId        && { label: 'Job',       val: grn.jobId,                  cls: 'jd-kpi-mono' },
                    { label: 'Total',         val: fmt(grn.linesSubTotal),    cls: 'jd-kpi-blue' },
                    { label: 'Total w/ Tax',  val: fmt(grn.linesTotalWithTax), cls: 'jd-kpi-blue' },
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
                {GRN_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'lines'     && grn.lineCount     > 0 && <span className="jd-tab-badge">{grn.lineCount}</span>}
                        {tab.key === 'documents' && grn.documentCount > 0 && <span className="jd-tab-badge">{grn.documentCount}</span>}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                <JobClosedBanner jobId={grn?.jobId} />

                {/* QC Rejection notice */}
                {qcRejected && (
                    <div style={{ margin: '0 0 12px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginBottom: 3 }}>
                                ❌ QC Rejected — GRN remains as Draft
                            </div>
                            <div style={{ fontSize: 12, color: '#b91c1c' }}>
                                The rejection has been logged in the <strong>QC Log</strong> tab. Raise a <strong>Return to Vendor</strong> for the rejected items, or edit the GRN and re-inspect.
                            </div>
                        </div>
                        <button onClick={() => setQcRejected(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>✕</button>
                    </div>
                )}

                {renderTab()}
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default GrnDetailPage;

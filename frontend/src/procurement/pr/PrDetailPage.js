import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { PR_TABS, PRIORITY_CONFIG, fmtDate, statusBadgeCfg } from '../procurementConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { usePrintFormat } from '../../print/printFormats';
import { useCurrentUser } from '../../AuthContext';
import PrOverviewTab   from './tabs/PrOverviewTab';
import PrLinesTab      from './tabs/PrLinesTab';
import PrDocumentsTab  from './tabs/PrDocumentsTab';
import PrPoTab         from './tabs/PrPoTab';
import PrHistoryTab    from './tabs/PrHistoryTab';
import PrPrintModal        from './PrPrintModal';
import ApprovalHistoryTab  from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../../approval/ApprovalStatusBanner';
import JobClosedBanner      from '../../jobs/JobClosedBanner';
import '../../jobs/JobDetail.css';
import '../Procurement.css';

const PrDetailPage = () => {
    const { prId }      = useParams();
    const navigate      = useNavigate();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();

    const [pr,         setPr]        = useState(null);
    const [loading,    setLoading]   = useState(true);
    const [error,      setError]     = useState(null);
    const [activeTab,  setActiveTab] = useState('overview');
    const [showPrint,    setShowPrint]    = useState(false);
    const printFmt = usePrintFormat('PR');   // configured layout (Company Settings → Print Formats)
    const [approvalTx,  setApprovalTx]  = useState(null);
    const [linesCount,  setLinesCount]  = useState(null);
    const [showRevise,  setShowRevise]  = useState(false);
    const [reviseReason,setReviseReason]= useState('');
    const [revising,    setRevising]    = useState(false);
    const [reviseError, setReviseError] = useState('');
    const [showClose,   setShowClose]   = useState(false);
    const [closeReason, setCloseReason] = useState('');
    const [closing,     setClosing]     = useState(false);
    const [closeError,  setCloseError]  = useState('');
    const currentUser = useCurrentUser();

    const loadPr = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}purchaserequest/${prId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setPr(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
        // Light line-count fetch for the Approval tab pre-submit guard.
        fetch(`${variables.API_URL}purchaserequest/lines/${prId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setLinesCount(Array.isArray(d) ? d.length : 0))
            .catch(() => setLinesCount(null));
    }, [prId]);

    useEffect(() => { loadPr(); }, [loadPr]);

    const renderTab = () => {
        if (!pr) return null;
        switch (activeTab) {
            case 'overview':   return <PrOverviewTab  pr={pr} onRefresh={loadPr} />;
            case 'lines':      return <PrLinesTab     pr={pr} onRefresh={loadPr} />;
            case 'documents':  return <PrDocumentsTab pr={pr} />;
            case 'pos':        return <PrPoTab pr={pr} />;
            case 'approval':   return (
                <ApprovalHistoryTab
                    moduleCode="PR"
                    documentId={pr.prId}
                    documentNo={pr.prNumber}
                    linesCount={linesCount}
                    lineLabel="PR line items"
                    onStatusChange={loadPr}
                    onTransactionLoad={setApprovalTx}
                />
            );
            case 'history':    return <PrHistoryTab pr={pr} />;
            default:           return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading purchase request…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/purchase-requests')}>← Back to Purchase Requests</button>
        </div>
    );
    if (!pr) return null;

    const statusData = getStatusConfig('PR', pr.status);
    const statusCfg  = statusBadgeCfg(statusData);
    const priCfg     = PRIORITY_CONFIG[pr.priority] || {};
    const canPrint   = (statusData?.canPrint ?? (pr.status !== 'Draft')) && canDo('/purchase-requests', 'PRINT');
    const canRevise  = canDo('/purchase-requests', 'EDIT');

    const handleClosePr = async () => {
        if (!closeReason.trim()) { setCloseError('A reason is required.'); return; }
        setClosing(true); setCloseError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaserequest/${pr.prId}/close`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ revisedBy: currentUser, reason: closeReason }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setCloseError(d?.message || 'Close failed.'); return; }
            setShowClose(false); setCloseReason('');
            loadPr();
        } catch (e) {
            setCloseError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setClosing(false); }
    };

    const handleRevisePr = async () => {
        if (!reviseReason.trim()) { setReviseError('A reason is required.'); return; }
        setRevising(true); setReviseError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaserequest/${pr.prId}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ revisedBy: currentUser, reason: reviseReason }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setReviseError(d?.message || 'Revision failed.'); return; }
            setShowRevise(false); setReviseReason('');
            loadPr();
        } catch (e) {
            setReviseError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setRevising(false); }
    };

    return (
        <div className="jd-page">
            {showPrint && <PrPrintModal pr={pr} onClose={() => setShowPrint(false)} />}
            {showClose && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>🔒 Close Purchase Request</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
                            <strong>{pr.prNumber}</strong> — Closing will prevent any further POs being raised against this PR.
                            All remaining Open/Partial lines will be marked Closed.
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={closeReason}
                                onChange={e => { setCloseReason(e.target.value); setCloseError(''); }}
                                placeholder="e.g. Project scope changed, remaining items no longer required…"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                autoFocus
                            />
                        </div>
                        {closeError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {closeError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setShowClose(false); setCloseReason(''); setCloseError(''); }} disabled={closing}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleClosePr} disabled={closing}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#374151', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: closing ? .7 : 1 }}>
                                {closing ? 'Closing…' : '🔒 Close PR'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showRevise && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>✏️ Revise Purchase Request</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
                            <strong>{pr.prNumber}</strong>{pr.revision > 0 ? ` · Rev ${pr.revision}` : ''} — Status will reset to Draft. You can edit lines then re-submit for approval.
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Reason <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={reviseReason}
                                onChange={e => { setReviseReason(e.target.value); setReviseError(''); }}
                                placeholder="e.g. Quantities need adjustment after site review…"
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                                autoFocus
                            />
                        </div>
                        {reviseError && (
                            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                                ⚠ {reviseError}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { setShowRevise(false); setReviseReason(''); setReviseError(''); }} disabled={revising}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleRevisePr} disabled={revising}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: revising ? .7 : 1 }}>
                                {revising ? 'Revising…' : '✏️ Confirm Revise'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/purchase-requests')}>← Purchase Requests</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{pr.prNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">
                            {pr.requestedBy}
                        </span>
                        {pr.priority && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project" style={{ background: priCfg.bg, color: priCfg.color, padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                                {pr.priority}
                            </span></>
                        )}
                        {pr.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">{pr.jobId}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label}
                    </span>

                    {['Approved','Partial'].includes(pr.status) && canRevise && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => { setReviseReason(''); setReviseError(''); setShowRevise(true); }}
                            disabled={revising}
                            title="Reset to Draft for editing — increments revision counter"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
                        >
                            {revising ? '…' : '✏️ Revise PR'}
                        </button>
                    )}
                    {['Approved','Partial'].includes(pr.status) && canDo('/purchase-requests', 'CLOSE') && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => { setCloseReason(''); setCloseError(''); setShowClose(true); }}
                            title="Close PR — no further POs allowed, remaining balance released"
                            style={{ display: 'flex', alignItems: 'center', gap: 5,
                                     background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' }}
                        >
                            🔒 Close PR
                        </button>
                    )}
                    {canPrint && (
                        <button
                            className="jd-stage-btn"
                            onClick={() => setShowPrint(printFmt)}
                            title="Print / Save as PDF"
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                            🖨 Print PR
                        </button>
                    )}

                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date',         val: fmtDate(pr.prDate),                                    cls: '' },
                    pr.revision > 0 && { label: 'Revision',     val: `Rev ${pr.revision}`,          cls: 'jd-kpi-amber' },
                    pr.jobId && { label: 'Job',          val: pr.jobId,                              cls: '' },
                    { label: 'Lines',        val: pr.lineCount || 0,                                cls: 'jd-kpi-blue' },
                    { label: 'POs Raised',   val: pr.poCount   || 0,                                cls: '' },
                    { label: 'Created By',   val: pr.createdBy,                                     cls: '' },
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
                {PR_TABS
                    .filter(tab => !tab.approvedOnly || pr.status !== 'Draft')
                    .map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'lines' && pr.lineCount > 0 && (
                            <span className="jd-tab-badge">{pr.lineCount}</span>
                        )}
                        {tab.key === 'documents' && pr.documentCount > 0 && (
                            <span className="jd-tab-badge">{pr.documentCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {activeTab !== 'approval' && (
                    <>
                        <JobClosedBanner jobId={pr?.jobId} />
                        <ApprovalStatusBanner transaction={approvalTx} />
                    </>
                )}
                {renderTab()}
            </div>
        </div>
    );
};

export default PrDetailPage;

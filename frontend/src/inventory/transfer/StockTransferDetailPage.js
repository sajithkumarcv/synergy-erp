import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, STR_TABS, statusBadgeCfg } from '../inventoryConstants';
import StTransferOverviewTab from './tabs/StTransferOverviewTab';
import StTransferItemsTab   from './tabs/StTransferItemsTab';
import ApprovalHistoryTab    from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner  from '../../approval/ApprovalStatusBanner';
import ConfirmModal          from '../../common/ConfirmModal';
import AlertModal            from '../../common/AlertModal';
import { InlineError }       from '../../common/InlineError';
import '../../jobs/JobDetail.css';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const StockTransferDetailPage = () => {
    const { id }              = useParams();
    const [searchParams]      = useSearchParams();
    const navigate            = useNavigate();
    const { getStatusConfig } = useLookup();
    const { canDo }           = usePermission();
    const canEdit = canDo('/inventory-transfer', 'EDIT');

    const [transfer,     setTransfer]     = useState(null);
    const [lines,        setLines]        = useState([]);
    const [jobs,         setJobs]         = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [activeTab,    setActiveTab]    = useState(searchParams.get('tab') || 'overview');
    const [approvalTx,   setApprovalTx]   = useState(null);
    const [actionError,  setActionError]  = useState('');
    const [alertMsg,     setAlertMsg]     = useState(null);
    const [confirm,      setConfirm]      = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}stocktransfer/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setTransfer(d.transfer); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&excludeClosedStatus=true&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobs(d.data || [])).catch(console.error);
    }, []);

    const deleteTransfer = () => {
        setConfirm({
            title: 'Delete Transfer',
            message: `Delete ${transfer.transferNo}? This cannot be undone.`,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                const r = await fetch(`${variables.API_URL}stocktransfer/${id}`, { method: 'DELETE', headers: authHeaders() });
                if (!r.ok) { const d = await r.json().catch(() => ({})); setAlertMsg(d?.message || 'Delete failed.'); return; }
                navigate('/inventory-transfer');
            },
        });
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading transfer…</span>
        </div>
    );
    if (error || !transfer) return (
        <div className="jd-page-loading">
            <div style={{ color:'#dc2626', fontSize:14, fontWeight:600 }}>⚠ {error || 'Not found.'}</div>
            <button className="jd-back-btn" style={{ marginTop:12 }} onClick={() => navigate('/inventory-transfer')}>
                ← Back to Stock Transfers
            </button>
        </div>
    );

    const statusData = getStatusConfig('STR', transfer.status);
    const statusCfg  = statusBadgeCfg(statusData);
    const isDraft    = transfer.status === 'Draft';

    return (
        <div className="jd-page">
            {confirm   && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {alertMsg  && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/inventory-transfer')}>← Stock Transfers</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{transfer.transferNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{fmtDate(transfer.transferDate)}</span>
                        <span className="jd-header-dot">·</span>
                        <span style={{ fontFamily:'Courier New', fontSize:11, color:'#065f46', background:'#d1fae5', padding:'1px 6px', borderRadius:3 }}>{transfer.fromJobId}</span>
                        <span style={{ margin:'0 4px', color:'#94a3b8' }}>→</span>
                        <span style={{ fontFamily:'Courier New', fontSize:11, color:'#1e40af', background:'#dbeafe', padding:'1px 6px', borderRadius:3 }}>{transfer.toJobId}</span>
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background:statusCfg.bg, color:statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background:statusCfg.dot }} />
                        {statusCfg.label || transfer.status}
                    </span>
                    {isDraft && canEdit && (
                        <button className="po-act-btn po-act-del" onClick={deleteTransfer}>Delete</button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date',       val: fmtDate(transfer.transferDate) },
                    { label: 'From Job',   val: transfer.fromJobId,  cls: 'jd-kpi-mono' },
                    { label: 'To Job',     val: transfer.toJobId,    cls: 'jd-kpi-mono' },
                    { label: 'Items',      val: transfer.lineCount ?? '—' },
                    { label: 'Created By', val: transfer.createdBy },
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
                {STR_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.badge && tab.key === 'items' && (transfer.lineCount > 0) && (
                            <span className="jd-tab-badge">{transfer.lineCount}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                {activeTab !== 'approval' && (
                    <ApprovalStatusBanner transaction={approvalTx} />
                )}
                {activeTab === 'overview' && (
                    <StTransferOverviewTab
                        transfer={transfer}
                        jobs={jobs}
                        onRefresh={load}
                    />
                )}
                {activeTab === 'items' && (
                    <StTransferItemsTab
                        transfer={transfer}
                        lines={lines}
                        onRefresh={load}
                    />
                )}
                {activeTab === 'approval' && (
                    <ApprovalHistoryTab
                        moduleCode="STR"
                        documentId={Number(id)}
                        documentNo={transfer.transferNo}
                        documentAmount={null}
                        currencyId={null}
                        linesCount={lines.length}
                        lineLabel="transfer items"
                        onStatusChange={load}
                        onTransactionLoad={setApprovalTx}
                    />
                )}
            </div>
        </div>
    );
};

export default StockTransferDetailPage;

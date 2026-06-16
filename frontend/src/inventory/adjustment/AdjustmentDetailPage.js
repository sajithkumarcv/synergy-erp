import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { ADJ_TABS, fmt, fmtDate, statusBadgeCfg } from '../inventoryConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import AdjustmentOverviewTab from './tabs/AdjustmentOverviewTab';
import AdjustmentLinesTab    from './tabs/AdjustmentLinesTab';
import ApprovalHistoryTab    from '../../approval/ApprovalHistoryTab';
import ApprovalStatusBanner  from '../../approval/ApprovalStatusBanner';
import '../../jobs/JobDetail.css';
import '../Inventory.css';
import '../../procurement/Procurement.css';

const AdjustmentDetailPage = () => {
    const { id }               = useParams();
    const navigate             = useNavigate();
    const { getVList, getStatusConfig } = useLookup();
    const { canDo }            = usePermission();

    const [header,     setHeader]     = useState(null);
    const [lines,      setLines]      = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState(null);
    const [activeTab,  setActiveTab]  = useState('overview');
    const [approvalTx, setApprovalTx] = useState(null);

    const reasons  = getVList('Inventory', 'AdjustmentReason');
    const canEdit  = canDo('/inventory-adjustment', 'EDIT');

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}stockadjustment/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setHeader(d.adjustment || null); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading adjustment…</span>
        </div>
    );
    if (error || !header) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error || 'Not found.'}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/inventory-adjustment')}>
                ← Back to Adjustments
            </button>
        </div>
    );

    const statusData   = getStatusConfig('ADJ', header.status);
    const statusCfg    = statusBadgeCfg(statusData);
    const isDraft      = header.status === 'Draft' || header.status === 'Rejected';
    const editable     = canEdit && isDraft;
    const totalValue   = lines.reduce((s, l) => s + (l.lineValue || 0), 0);
    const reasonLabel  = reasons.find(r => r.value === header.reason)?.label || header.reason;

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <AdjustmentOverviewTab
                        header={header}
                        reasons={reasons}
                        editable={editable}
                        adjustmentId={id}
                        onRefresh={load}
                    />
                );
            case 'lines':
                return (
                    <AdjustmentLinesTab
                        header={header}
                        lines={lines}
                        editable={editable}
                        adjustmentId={id}
                        onRefresh={load}
                    />
                );
            case 'approval':
                return (
                    <ApprovalHistoryTab
                        moduleCode="ADJ"
                        documentId={Number(id)}
                        documentNo={header.adjustmentNo}
                        documentAmount={totalValue}
                        currencyId={null}
                        linesCount={lines.length}
                        lineLabel="adjustment lines"
                        onStatusChange={load}
                        onTransactionLoad={setApprovalTx}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="jd-page">

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/inventory-adjustment')}>← Adjustments</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{header.adjustmentNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{fmtDate(header.adjustmentDate)}</span>
                        {reasonLabel && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">{reasonLabel}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {statusCfg.label || header.status}
                    </span>
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date',        val: fmtDate(header.adjustmentDate) },
                    { label: 'Lines',       val: lines.length },
                    { label: 'Total Value', val: fmt(totalValue), cls: 'jd-kpi-blue' },
                    header.createdBy  && { label: 'Created By',  val: header.createdBy  },
                    header.postedBy   && { label: 'Posted By',   val: header.postedBy   },
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
                {ADJ_TABS.map(tab => (
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
                {activeTab !== 'approval' && <ApprovalStatusBanner transaction={approvalTx} />}
                {renderTab()}
            </div>

        </div>
    );
};

export default AdjustmentDetailPage;

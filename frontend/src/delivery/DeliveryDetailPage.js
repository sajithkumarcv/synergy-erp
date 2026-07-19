import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { usePermission } from '../PermissionContext';
import { usePrintFormat } from '../print/printFormats';
import { DELIVERY_TABS, fmtDate, getDeliveryStatusConfig, STATUS_TRANSITIONS } from './deliveryConstants';
import DeliveryOverviewTab   from './tabs/DeliveryOverviewTab';
import DeliveryLinesTab      from './tabs/DeliveryLinesTab';
import DeliveryDocumentsTab  from './tabs/DeliveryDocumentsTab';
import DeliveryPrintModal    from './DeliveryPrintModal';
import '../jobs/JobDetail.css';
import '../procurement/Procurement.css';
import AlertModal from '../common/AlertModal';
import ConfirmModal from '../common/ConfirmModal';

const DeliveryDetailPage = () => {
    const { deliveryId }  = useParams();
    const navigate        = useNavigate();
    const [searchParams]  = useSearchParams();
    const autoPrint       = searchParams.get('print') === '1';
    const { canDo }       = usePermission();

    const [delivery,    setDelivery]  = useState(null);
    const [lines,       setLines]     = useState([]);
    const [loading,     setLoading]   = useState(true);
    const [error,       setError]     = useState(null);
    const [activeTab,   setActiveTab] = useState('overview');
    const [statusBusy,  setStatusBusy]  = useState(false);
    const [statusErr,   setStatusErr]   = useState('');
    const [deleting,    setDeleting]    = useState(false);
    const [showPrint,   setShowPrint]   = useState(false);
    const printFmt = usePrintFormat('DLV');   // configured layout (Company Settings → Print Formats)
    const [alertMsg,    setAlertMsg]    = useState(null);
    const [confirm,     setConfirm]     = useState(null);

    const loadDelivery = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}delivery/${deliveryId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setDelivery(d.header); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [deliveryId]);

    useEffect(() => { loadDelivery(); }, [loadDelivery]);
    useEffect(() => { if (delivery && autoPrint) setShowPrint(printFmt); }, [delivery, autoPrint]);

    const changeStatus = async (newStatus) => {
        setStatusBusy(true); setStatusErr('');
        try {
            const r = await fetch(`${variables.API_URL}delivery/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ deliveryId: Number(deliveryId), newStatus }),
            });
            const d = await r.json();
            if (!r.ok) { setStatusErr(d.message || 'Status change failed.'); return; }
            loadDelivery();
        } catch { setStatusErr('Network error.'); }
        finally { setStatusBusy(false); }
    };

    const deleteDelivery = () => {
        setConfirm({
            title: 'Delete Delivery Note',
            message: 'Delete this delivery note? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setDeleting(true);
                try {
                    const r = await fetch(`${variables.API_URL}delivery/${deliveryId}`, {
                        method: 'DELETE', headers: authHeaders(),
                    });
                    const d = await r.json();
                    if (!r.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
                    navigate('/delivery');
                } catch { setAlertMsg('Network error.'); }
                finally { setDeleting(false); }
            },
        });
    };

    const renderTab = () => {
        if (!delivery) return null;
        switch (activeTab) {
            case 'overview':  return <DeliveryOverviewTab  delivery={delivery} onRefresh={loadDelivery} />;
            case 'lines':     return <DeliveryLinesTab     delivery={delivery} lines={lines} onRefresh={loadDelivery} />;
            case 'documents': return <DeliveryDocumentsTab delivery={delivery} />;
            default:          return null;
        }
    };

    // ── Loading / Error states ────────────────────────────────────────
    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading delivery note…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/delivery')}>
                ← Back to Delivery Notes
            </button>
        </div>
    );
    if (!delivery) return null;

    const statusCfg  = getDeliveryStatusConfig(delivery.status);
    const nextStates = STATUS_TRANSITIONS[delivery.status] || [];
    const canChange  = canDo('/delivery', 'EDIT');
    const canDelete  = statusCfg.canDelete && canDo('/delivery', 'DELETE');

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── Print Modal ── */}
            {showPrint && (
                <DeliveryPrintModal
                    delivery={delivery}
                    lines={lines}
                    onClose={() => setShowPrint(false)}
                />
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/delivery')}>← Delivery Notes</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{delivery.deliveryNo}</div>
                    <div className="jd-header-info">
                        {delivery.customerName && (
                            <span className="jd-header-customer">{delivery.customerName}</span>
                        )}
                        {delivery.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">Job: {delivery.jobId}</span></>
                        )}
                        {delivery.invoiceNo && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">Inv: {delivery.invoiceNo}</span></>
                        )}
                        {delivery.vehicleNo && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">🚚 {delivery.vehicleNo}</span></>
                        )}
                    </div>
                </div>

                <div className="jd-header-right">
                    {/* Status badge */}
                    <span className="cd-flag-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.dot }} />
                        {delivery.status}
                    </span>

                    {/* Status error */}
                    {statusErr && (
                        <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 500 }}>⚠ {statusErr}</span>
                    )}

                    {/* Status transition buttons */}
                    {canChange && nextStates.map(ns => {
                        const isCancelOrRevert = ns === 'Cancelled' || ns === 'Draft';
                        return (
                            <button key={ns}
                                className="jd-stage-btn"
                                onClick={() => changeStatus(ns)}
                                disabled={statusBusy}
                                style={isCancelOrRevert
                                    ? { background: '#fff7ed', color: '#9a3412', borderColor: '#fed7aa' }
                                    : { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                                {statusBusy ? '…' : `→ ${ns}`}
                            </button>
                        );
                    })}

                    {/* Print */}
                    <button className="jd-stage-btn" onClick={() => setShowPrint(printFmt)}
                        style={{ background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                        🖨 Print
                    </button>

                    {/* Delete */}
                    {canDelete && (
                        <button className="jd-stage-btn" onClick={deleteDelivery} disabled={deleting}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {deleting ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Delivery Date', val: fmtDate(delivery.deliveryDate) },
                    { label: 'Customer',      val: delivery.customerName },
                    delivery.invoiceNo   && { label: 'Invoice',     val: delivery.invoiceNo,   cls: 'jd-kpi-mono' },
                    delivery.jobId       && { label: 'Job',         val: delivery.jobId,        cls: 'jd-kpi-mono' },
                    delivery.vehicleNo   && { label: 'Vehicle',     val: delivery.vehicleNo,    cls: 'jd-kpi-mono' },
                    delivery.deliveredBy && { label: 'Delivered By',val: delivery.deliveredBy  },
                    { label: 'Lines', val: lines.length, cls: lines.length > 0 ? 'jd-kpi-blue' : '' },
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
                {DELIVERY_TABS.map(tab => {
                    let badge = null;
                    if (tab.badge) {
                        if (tab.key === 'lines'     && lines.length             > 0) badge = lines.length;
                        if (tab.key === 'documents' && delivery.documentCount   > 0) badge = delivery.documentCount;
                    }
                    return (
                        <button key={tab.key}
                            className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}>
                            <span className="jd-tab-icon">{tab.icon}</span>
                            {tab.label}
                            {badge != null && (
                                <span className="jd-tab-badge">{badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {renderTab()}
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default DeliveryDetailPage;

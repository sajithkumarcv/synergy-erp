import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import { useLookup } from '../../LookupContext';
import { fmtDate } from '../procurementConstants';
import ScOverviewTab    from './tabs/ScOverviewTab';
import ScComponentsTab  from './tabs/ScComponentsTab';
import ScMaterialOutTab from './tabs/ScMaterialOutTab';
import ScReceiptTab     from './tabs/ScReceiptTab';
import '../../jobs/JobDetail.css';
import '../Procurement.css';


const SC_TABS = [
    { key: 'overview',     label: 'Overview',     icon: '📋' },
    { key: 'components',   label: 'Components',   icon: '📦' },
    { key: 'material-out', label: 'Material Out', icon: '🚚', materialOutOnly: true },
    { key: 'receipt',      label: 'Receipt',      icon: '✅' },
];

// ── Confirm modal ─────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, confirmLabel, confirmStyle, onConfirm, onClose, busy, error, children }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{message}</div>
            {children}
            {error && (
                <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>
                    ⚠ {error}
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose} disabled={busy}
                    style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                </button>
                <button onClick={onConfirm} disabled={busy}
                    style={{ padding: '7px 18px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: busy ? .7 : 1, ...confirmStyle }}>
                    {busy ? 'Processing…' : confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

// ── Main Detail Page ──────────────────────────────────────────────────────────
const SubcontractDetailPage = () => {
    const { id }      = useParams();
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();
    const { getStatusConfig } = useLookup();

    const [sc,          setSc]          = useState(null);
    const [components,  setComponents]  = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [activeTab,   setActiveTab]   = useState('overview');
    const [actBusy,     setActBusy]     = useState(false);
    const [actionError, setActionError] = useState('');

    // Confirm dialogs
    const [showApprove,  setShowApprove]  = useState(false);
    const [showCancel,   setShowCancel]   = useState(false);
    const [showClose,    setShowClose]    = useState(false);
    const [confirmBusy,  setConfirmBusy]  = useState(false);
    const [confirmError, setConfirmError] = useState('');

    const canEdit   = canDo('/subcontracts', 'EDIT');
    const canPost   = canDo('/subcontracts', 'POST');
    const editable  = sc && sc.status === 'Draft' && canEdit;

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}subcontract/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setSc(d.header); setComponents(d.components || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const changeStatus = async (newStatus) => {
        setActBusy(true); setActionError(''); setConfirmBusy(true); setConfirmError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/${id}/status`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ newStatus, actionBy: currentUser }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Status change failed.');
            setShowApprove(false); setShowCancel(false); setShowClose(false);
            load();
        } catch (e) {
            setActionError(e.message);
            setConfirmError(e.message);
        } finally { setActBusy(false); setConfirmBusy(false); }
    };

    // ── Loading / Error states ─────────────────────────────────────────────────
    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading subcontract order…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/subcontracts')}>← Back to Subcontracts</button>
        </div>
    );
    if (!sc) return null;

    const statusCfg = getStatusConfig('SCO', sc.status) || { badgeBg: '#f1f5f9', badgeColor: '#475569', badgeDot: '#94a3b8', statusLabel: sc.status };
    const isMaterialOut = sc.subcontractType === 'MATERIAL_OUT';
    const visibleTabs = SC_TABS.filter(t => !t.materialOutOnly || isMaterialOut);

    return (
        <div className="jd-page">

            {/* ── Confirm Modals ── */}
            {showApprove && (
                <ConfirmModal
                    title="✅ Approve Subcontract Order"
                    message={<>Approve <strong>{sc.subcontractNo}</strong>? This allows Material Out and Receipts to be created against it.</>}
                    confirmLabel="Approve"
                    confirmStyle={{ background: '#16a34a', color: '#fff' }}
                    onConfirm={() => changeStatus('Approved')}
                    onClose={() => { setShowApprove(false); setConfirmError(''); }}
                    busy={confirmBusy}
                    error={confirmError}
                />
            )}
            {showCancel && (
                <ConfirmModal
                    title="✕ Cancel Subcontract Order"
                    message={<>Cancel <strong>{sc.subcontractNo}</strong>? This action cannot be undone.</>}
                    confirmLabel="Cancel Order"
                    confirmStyle={{ background: '#dc2626', color: '#fff' }}
                    onConfirm={() => changeStatus('Cancelled')}
                    onClose={() => { setShowCancel(false); setConfirmError(''); }}
                    busy={confirmBusy}
                    error={confirmError}
                />
            )}
            {showClose && (
                <ConfirmModal
                    title="🔒 Close Subcontract Order"
                    message={<>Close <strong>{sc.subcontractNo}</strong>? No further receipts can be posted once closed.</>}
                    confirmLabel="🔒 Close"
                    confirmStyle={{ background: '#374151', color: '#fff' }}
                    onConfirm={() => changeStatus('Closed')}
                    onClose={() => { setShowClose(false); setConfirmError(''); }}
                    busy={confirmBusy}
                    error={confirmError}
                />
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/subcontracts')}>← Subcontracts</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{sc.subcontractNo}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{sc.vendorName || '—'}</span>
                        {sc.subcontractType && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{
                                fontSize: 11, fontWeight: 600,
                                color:      isMaterialOut ? '#1e40af' : '#6d28d9',
                                background: isMaterialOut ? '#dbeafe'  : '#ede9fe',
                                padding: '1px 7px', borderRadius: 4,
                            }}>
                                {isMaterialOut ? 'Material Out' : 'Service Only'}
                            </span></>
                        )}
                        {sc.outputItemCode && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{sc.outputItemCode} — {sc.outputItemName}</span></>
                        )}
                        {sc.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{ fontFamily: 'Courier New, monospace', fontSize: 12, fontWeight: 700, background: '#dbeafe', color: '#1e40af', padding: '2px 9px', borderRadius: 4 }}>
                                {sc.jobId}
                            </span></>
                        )}
                        {sc.poNumber && (
                            <><span className="jd-header-dot">·</span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>PO:</span>
                            <span style={{ fontFamily: 'Courier New, monospace', fontSize: 12, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: 4 }}>
                                {sc.poNumber}
                            </span></>
                        )}
                    </div>
                </div>

                <div className="jd-header-right">
                    {/* Status badge */}
                    <span className="cd-flag-badge" style={{ background: statusCfg.badgeBg, color: statusCfg.badgeColor }}>
                        <span className="cd-flag-dot" style={{ background: statusCfg.badgeDot }} />
                        {statusCfg.statusLabel}
                    </span>

                    {/* Approve — Draft only */}
                    {sc.status === 'Draft' && canEdit && (
                        <button className="jd-stage-btn"
                            onClick={() => { setConfirmError(''); setShowApprove(true); }}
                            disabled={actBusy}
                            style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}>
                            ✅ Approve
                        </button>
                    )}

                    {/* Cancel — Draft or Approved */}
                    {['Draft', 'Approved'].includes(sc.status) && canEdit && (
                        <button className="jd-stage-btn"
                            onClick={() => { setConfirmError(''); setShowCancel(true); }}
                            disabled={actBusy}
                            style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca' }}>
                            ✕ Cancel
                        </button>
                    )}

                    {/* Close — Received only */}
                    {sc.status === 'Received' && canPost && (
                        <button className="jd-stage-btn"
                            onClick={() => { setConfirmError(''); setShowClose(true); }}
                            disabled={actBusy}
                            style={{ background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' }}>
                            🔒 Close
                        </button>
                    )}

                    <button className="jd-stage-btn" onClick={load} title="Refresh" style={{ padding: '5px 10px' }}>↺</button>
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Expected',    val: sc.expectedDate ? fmtDate(sc.expectedDate) : '—',   cls: '' },
                    { label: 'Output Qty',  val: `${Number(sc.outputQty).toLocaleString()}${sc.outputUomName ? ' ' + sc.outputUomName : ''}`, cls: 'jd-kpi-mono' },
                    { label: 'Received',    val: Number(sc.totalReceivedQty || 0).toLocaleString(),  cls: Number(sc.totalReceivedQty) >= Number(sc.outputQty) ? 'jd-kpi-green' : 'jd-kpi-mono' },
                    isMaterialOut && { label: 'Components',   val: sc.totalComponents || 0,         cls: '' },
                    isMaterialOut && { label: 'Material Outs',val: sc.totalMaterialOuts || 0,       cls: '' },
                    { label: 'Receipts',    val: sc.totalReceipts || 0,                              cls: '' },
                    sc.jobId && { label: 'Job', val: sc.jobId, cls: 'jd-kpi-mono' },
                    { label: 'Created By',  val: sc.createdBy || '—',                               cls: '' },
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
                {visibleTabs.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn${activeTab === tab.key ? ' jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'components'   && sc.totalComponents  > 0 && <span className="jd-tab-badge">{sc.totalComponents}</span>}
                        {tab.key === 'material-out' && sc.totalMaterialOuts > 0 && <span className="jd-tab-badge">{sc.totalMaterialOuts}</span>}
                        {tab.key === 'receipt'      && sc.totalReceipts    > 0 && <span className="jd-tab-badge">{sc.totalReceipts}</span>}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {actionError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', borderRadius: 8, padding: '10px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#991b1b' }}>⚠ {actionError}</span>
                        <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                )}

                {activeTab === 'overview'     && <ScOverviewTab    sc={sc} editable={editable} onRefresh={load} />}
                {activeTab === 'components'   && <ScComponentsTab  sc={sc} components={components} editable={editable} onRefresh={load} />}
                {activeTab === 'material-out' && <ScMaterialOutTab sc={sc} components={components} editable={canEdit && ['Approved','InProgress'].includes(sc.status)} onRefresh={load} />}
                {activeTab === 'receipt'      && <ScReceiptTab     sc={sc} onRefresh={load} />}
            </div>
        </div>
    );
};

export default SubcontractDetailPage;

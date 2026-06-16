import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import AlertModal from '../common/AlertModal';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import { CUSTOMER_TABS, getFlag, fmt } from './customerConstants';
import OverviewTab  from './tabs/OverviewTab';
import ContactsTab  from './tabs/ContactsTab';
import AddressesTab from './tabs/AddressesTab';
import '../jobs/JobDetail.css';
import './CustomerDetail.css';

// ─── Credit Hold Modal ───────────────────────────────────────────
const CreditHoldModal = ({ customer, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isOnHold = customer.creditHold;
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);
    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'customer/credithold', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ customerId: customer.customerId, creditHold: !isOnHold, creditHoldBy: currentUser, creditHoldNote: note.trim() || null })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to update credit hold.'); return; }
            onSaved(); onClose();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };
    return (
        <div className="cd-modal-backdrop">
            <div className="cd-modal-box">
                <div className={`cd-modal-header ${isOnHold ? 'cd-modal-green' : 'cd-modal-black'}`}>
                    <span>{isOnHold ? 'Release Credit Hold' : 'Place on Credit Hold'}</span>
                    <button className="jf-close" onClick={onClose}>&#10005;</button>
                </div>
                <div className="cd-modal-body">
                    <div className="cd-modal-name">{customer.customerName}</div>
                    <div className="cd-modal-code">{customer.customerCode}</div>
                    {isOnHold && customer.creditHoldNote && (
                        <div className="cd-modal-note"><strong>Current reason: </strong>{customer.creditHoldNote}</div>
                    )}
                    {!isOnHold && (
                        <><label className="cd-modal-label">Reason for hold</label>
                        <textarea className="jf-input jf-textarea" rows="3" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Overdue invoices…" /></>
                    )}
                    {isOnHold && <p className="cd-modal-release">This will release the credit hold and allow transactions.</p>}
                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className={isOnHold ? 'cd-btn-teal' : 'cd-btn-black'} onClick={submit} disabled={saving}>
                        {saving ? 'Saving…' : (isOnHold ? 'Release Hold' : 'Confirm Hold')}
                    </button>
                </div>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── Credit Flag Modal (manual rating: GREEN / YELLOW / RED) ──────
const FLAG_OPTIONS = [
    { value: 'GREEN',  label: 'Good Standing', bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    { value: 'YELLOW', label: 'Warning',       bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
    { value: 'RED',    label: 'Overdue',       bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
];

const CreditFlagModal = ({ customer, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [flag, setFlag] = useState(customer.creditFlag || 'GREEN');
    const [note, setNote] = useState(customer.creditFlagNote || '');
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'customer/creditflag', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ customerId: customer.customerId, creditFlag: flag, creditFlagNote: note.trim() || null, creditFlagBy: currentUser })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to update credit flag.'); return; }
            onSaved(); onClose();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="cd-modal-backdrop">
            <div className="cd-modal-box">
                <div className="cd-modal-header cd-modal-black">
                    <span>Set Credit Flag</span>
                    <button className="jf-close" onClick={onClose}>&#10005;</button>
                </div>
                <div className="cd-modal-body">
                    <div className="cd-modal-name">{customer.customerName}</div>
                    <div className="cd-modal-code">{customer.customerCode}</div>

                    <label className="cd-modal-label" style={{ marginTop: 10 }}>Credit rating</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        {FLAG_OPTIONS.map(o => (
                            <button key={o.value} type="button" onClick={() => setFlag(o.value)}
                                style={{
                                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                    padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                                    background: flag === o.value ? o.bg : '#fff',
                                    border: flag === o.value ? `2px solid ${o.dot}` : '1.5px solid #e2e8f0',
                                }}>
                                <span style={{ width: 14, height: 14, borderRadius: '50%', background: o.dot }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: flag === o.value ? o.color : '#475569' }}>{o.label}</span>
                            </button>
                        ))}
                    </div>

                    <label className="cd-modal-label" style={{ marginTop: 12 }}>Reason / note</label>
                    <textarea className="jf-input jf-textarea" rows="3" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — e.g. payments slowing down…" />
                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="cd-btn-black" onClick={submit} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Flag'}
                    </button>
                </div>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── CUSTOMER DETAIL PAGE ────────────────────────────────────────
const CustomerDetailPage = () => {
    const { customerId } = useParams();
    const navigate       = useNavigate();
    const { canDo }      = usePermission();
    const { baseCurrencyCode } = useLookup();
    const canEdit        = canDo('/customers', 'EDIT');

    const [customer,  setCustomer] = useState(null);
    const [loading,   setLoading]  = useState(true);
    const [error,     setError]    = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [showHold,  setShowHold]  = useState(false);
    const [showFlag,  setShowFlag]  = useState(false);

    const loadCustomer = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}customer/${customerId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setCustomer(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [customerId]);

    useEffect(() => { loadCustomer(); }, [loadCustomer]);

    const renderTab = () => {
        if (!customer) return null;
        switch (activeTab) {
            case 'overview':  return <OverviewTab  customer={customer} onRefresh={loadCustomer} canEdit={canEdit} />;
            case 'contacts':  return <ContactsTab  customer={customer} onRefresh={loadCustomer} canEdit={canEdit} />;
            case 'addresses': return <AddressesTab customer={customer} onRefresh={loadCustomer} canEdit={canEdit} />;
            default: return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading customer…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/customers')}>← Back to Customers</button>
        </div>
    );
    if (!customer) return null;

    const flag = customer.creditFlag || 'GREEN';
    const cfg  = getFlag(flag);

    return (
        <div className="jd-page">
            {showHold && (
                <CreditHoldModal customer={customer} onClose={() => setShowHold(false)} onSaved={loadCustomer} />
            )}
            {showFlag && (
                <CreditFlagModal customer={customer} onClose={() => setShowFlag(false)} onSaved={loadCustomer} />
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/customers')}>← Customers</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{customer.customerCode}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">
                            {customer.customerName}
                            {customer.creditHold && <span className="cd-hold-tag" title={customer.creditHoldNote}>⚑</span>}
                        </span>
                        {customer.customerType && <><span className="jd-header-dot">·</span><span className="jd-header-project">{customer.customerType}</span></>}
                        {customer.customerCategoryName && <><span className="jd-header-dot">·</span><span className="jd-header-type">{customer.customerCategoryName}</span></>}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className={`cd-status-badge ${customer.isActive ? 'cd-status-active' : 'cd-status-inactive'}`}>
                        {customer.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span
                        className="cd-flag-badge"
                        style={{ background: cfg.bg, color: cfg.color, cursor: canEdit ? 'pointer' : 'default' }}
                        onClick={() => canEdit && setShowFlag(true)}
                        title={canEdit ? 'Click to change credit flag' : (customer.creditFlagNote || '')}
                    >
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />
                        {customer.creditFlagLabel || cfg.label}
                        {canEdit && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>✎</span>}
                    </span>
                    {canEdit && <button
                        className={`jd-stage-btn ${customer.creditHold ? 'cd-hold-active' : ''}`}
                        onClick={() => setShowHold(true)}
                    >
                        {customer.creditHold ? '🔓 Release Hold' : '🔒 Credit Hold'}
                    </button>}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    customer.currencyName     && { label: 'Currency',      val: customer.currencyShortName || customer.currencyName, cls: '' },
                    customer.paymentTermName  && { label: 'Payment Terms', val: customer.paymentTermName,  cls: '' },
                    customer.creditLimit != null && { label: `Credit Limit${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`, val: fmt(customer.creditLimit), cls: 'jd-kpi-blue' },
                    customer.creditDays  != null && { label: 'Credit Days',   val: `${customer.creditDays}d`,  cls: '' },
                    customer.salesPerson && { label: 'Sales Person', val: customer.salesPerson, cls: '' },
                    customer.vatNumber   && { label: 'VAT / TRN',   val: customer.vatNumber,   cls: 'jd-kpi-mono' },
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
                {CUSTOMER_TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {renderTab()}
            </div>
        </div>
    );
};

export default CustomerDetailPage;

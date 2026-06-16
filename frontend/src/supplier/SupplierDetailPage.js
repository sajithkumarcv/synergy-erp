import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import { SUPPLIER_TABS, fmt } from './supplierConstants';
import OverviewTab  from './tabs/OverviewTab';
import ContactsTab  from './tabs/ContactsTab';
import AddressesTab from './tabs/AddressesTab';
import BankTab      from './tabs/BankTab';
import '../jobs/JobDetail.css';
import './SupplierDetail.css';

// ─── SUPPLIER DETAIL PAGE ────────────────────────────────────────
const SupplierDetailPage = () => {
    const { supplierId } = useParams();
    const navigate       = useNavigate();
    const { canDo }      = usePermission();
    const { baseCurrencyCode } = useLookup();
    const canEdit        = canDo('/suppliers', 'EDIT');

    const [supplier,  setSupplier] = useState(null);
    const [loading,   setLoading]  = useState(true);
    const [error,     setError]    = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    const loadSupplier = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`${variables.API_URL}supplier/${supplierId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setSupplier(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [supplierId]);

    useEffect(() => { loadSupplier(); }, [loadSupplier]);

    const renderTab = () => {
        if (!supplier) return null;
        switch (activeTab) {
            case 'overview':  return <OverviewTab  supplier={supplier} onRefresh={loadSupplier} canEdit={canEdit} />;
            case 'contacts':  return <ContactsTab  supplier={supplier} onRefresh={loadSupplier} canEdit={canEdit} />;
            case 'addresses': return <AddressesTab supplier={supplier} onRefresh={loadSupplier} canEdit={canEdit} />;
            case 'banks':     return <BankTab      supplier={supplier} canEdit={canEdit} />;
            default: return null;
        }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading supplier…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/suppliers')}>← Back to Suppliers</button>
        </div>
    );
    if (!supplier) return null;

    return (
        <div className="jd-page">
            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/suppliers')}>← Suppliers</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{supplier.supplierCode}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">
                            {supplier.supplierName}
                        </span>
                        {supplier.supplierType && <><span className="jd-header-dot">·</span><span className="jd-header-project">{supplier.supplierType}</span></>}
                        {supplier.supplierCategoryName && <><span className="jd-header-dot">·</span><span className="jd-header-type">{supplier.supplierCategoryName}</span></>}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className={`sd-status-badge ${supplier.isActive ? 'sd-status-active' : 'sd-status-inactive'}`}>
                        {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    supplier.currencyName        && { label: 'Currency',        val: supplier.currencyShortName || supplier.currencyName, cls: '' },
                    supplier.paymentTermName     && { label: 'Payment Terms',   val: supplier.paymentTermName,  cls: '' },
                    supplier.paymentMode         && { label: 'Payment Mode',    val: supplier.paymentMode,      cls: '' },
                    supplier.creditLimit != null && { label: `Credit Limit${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`, val: fmt(supplier.creditLimit), cls: 'jd-kpi-blue' },
                    supplier.creditDays  != null && { label: 'Credit Days',     val: `${supplier.creditDays}d`, cls: '' },
                    supplier.leadTimeDays!= null && { label: 'Lead Time',       val: `${supplier.leadTimeDays}d`,cls: '' },
                    supplier.rating      != null && { label: 'Rating',          val: '★'.repeat(supplier.rating) + '☆'.repeat(5 - supplier.rating), cls: '' },
                    supplier.countryName         && { label: 'Country',         val: supplier.countryName,      cls: '' },
                    supplier.accountManager      && { label: 'Acct Manager',    val: supplier.accountManager,   cls: '' },
                    supplier.vatNumber           && { label: 'VAT / TRN',       val: supplier.vatNumber,        cls: 'jd-kpi-mono' },
                    supplier.tradeLicenseNo      && { label: 'Trade Lic.',      val: supplier.tradeLicenseNo,   cls: 'jd-kpi-mono' },
                    supplier.isOnHold            && { label: 'Status',          val: '⚠ On Hold',               cls: 'jd-kpi-red' },
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
                {SUPPLIER_TABS.map(tab => (
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

export default SupplierDetailPage;

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { variables, authHeaders } from './Variable';
import { useAuth } from './AuthContext';
import { useFilters } from './FilterContext';
import { useTheme } from './ThemeContext';
import { usePermission } from './PermissionContext';
import useOwnerCompany from './hooks/useOwnerCompany';
import Country from './Country';
import { UserManagement }    from './usermanagement/UserManagement';
import { RoleManagement }    from './usermanagement/RoleManagement';
import { AssignRole }        from './usermanagement/AssignRole';
import { RolePermissions }   from './usermanagement/RolePermissions';
import CustomerList       from './customer/CustomerList';
import CustomerDetailPage from './customer/CustomerDetailPage';
import SupplierList       from './supplier/SupplierList';
import SupplierDetailPage from './supplier/SupplierDetailPage';
import { Job } from './jobs/Job';
import JobDetailPage from './jobs/JobDetailPage';
import JobBudgetPage from './jobs/JobBudgetPage';
import JobOverview  from './jobs/JobOverview';
import JobAnalysis  from './jobs/JobAnalysis';
import { Item } from './items/Item';
import ItemDetailPage from './items/ItemDetailPage';
import { Bom } from './bom/Bom';
import BomDetailPage from './bom/BomDetailPage';
import { Pr } from './procurement/pr/Pr';
import PrDetailPage from './procurement/pr/PrDetailPage';
import { Po } from './procurement/po/Po';
import PoDetailPage from './procurement/po/PoDetailPage';
import ProcurementGrn from './procurement/grn/Grn';
import ProcurementGrnDetailPage from './procurement/grn/GrnDetailPage';
import SupplierInvoice from './procurement/invoice/SupplierInvoice';
import SupplierInvoiceDetailPage from './procurement/invoice/SupplierInvoiceDetailPage';
import Delivery from './delivery/Delivery';
import DeliveryDetailPage from './delivery/DeliveryDetailPage';
import GrnUnregistrationPage from './procurement/grn-unreg/GrnUnregistrationPage';
import { Rtv } from './procurement/rtv/Rtv';
import RtvDetailPage from './procurement/rtv/RtvDetailPage';
import { Srv } from './procurement/srv/Srv';
import SrvDetailPage from './procurement/srv/SrvDetailPage';
import { Subcontract } from './procurement/subcontract/Subcontract';
import SubcontractDetailPage from './procurement/subcontract/SubcontractDetailPage';
import DocumentSeries       from './settings/DocumentSeries';
import DocumentStatus       from './settings/DocumentStatus';
import BudgetPassword          from './settings/BudgetPassword';
import InvoiceRevisePassword   from './settings/InvoiceRevisePassword';
import ChangePassword          from './settings/ChangePassword';
import ErrorLog                 from './settings/ErrorLog';
import CompanySettings          from './settings/CompanySettings';
import SmtpSettings             from './settings/SmtpSettings';
import { Grn } from './inventory/grn/Grn';
import GrnDetailPage from './inventory/grn/GrnDetailPage';
import { Issue } from './inventory/issue/Issue';
import IssueDetailPage from './inventory/issue/IssueDetailPage';
import { IssueReturn } from './inventory/issuereturn/IssueReturn';
import IssueReturnDetailPage from './inventory/issuereturn/IssueReturnDetailPage';
import { Adjustment } from './inventory/adjustment/Adjustment';
import AdjustmentDetailPage from './inventory/adjustment/AdjustmentDetailPage';
import StockBalance from './inventory/balance/StockBalance';
import StockByJob   from './inventory/stockbyjob/StockByJob';
import StockTransfer           from './inventory/transfer/StockTransfer';
import StockTransferDetailPage from './inventory/transfer/StockTransferDetailPage';
import ItemPriceAnalysis from './inventory/priceanalysis/ItemPriceAnalysis';
import StockAlerts  from './inventory/alerts/StockAlerts';
import { Invoice } from './invoice/Invoice';
import InvoiceDetailPage from './invoice/InvoiceDetailPage';
import ReceiptVoucher from './receipt/ReceiptVoucher';
import ReceiptVoucherDetail from './receipt/ReceiptVoucherDetail';
import PaymentVoucher from './finance/PaymentVoucher';
import PaymentVoucherDetail from './finance/PaymentVoucherDetail';
import CreditNote from './finance/CreditNote';
import CreditNoteDetail from './finance/CreditNoteDetail';
import DebitNote from './finance/DebitNote';
import DebitNoteDetail from './finance/DebitNoteDetail';
import Receivables from './receivables/Receivables';
import CustomerReceivables from './receivables/CustomerReceivables';
import PaymentFollowup from './followup/PaymentFollowup';
import Payables from './payables/Payables';
import SupplierPayables from './payables/SupplierPayables';
import MyApprovalsPage       from './approval/MyApprovalsPage';
import ApprovalsAdminPage    from './approval/ApprovalsAdminPage';
import ApprovalPoliciesPage  from './approval/ApprovalPoliciesPage';
import JobMom                from './mom/JobMom';
import NotificationBell     from './common/NotificationBell';
import Manhour               from './manhour/Manhour';
import ManhourDetailPage     from './manhour/ManhourDetailPage';
import ManhourAdmin          from './manhour/ManhourAdmin';
import Employee              from './manhour/Employee';
import ManhourRate           from './manhour/ManhourRate';
import MenuManagement        from './usermanagement/MenuManagement';
import PoReport             from './reports/PoReport';
import InventoryGrnReport   from './reports/InventoryGrnReport';
import StockBalanceReport   from './reports/StockBalanceReport';
import StockAdjustmentReport from './reports/StockAdjustmentReport';
import InHouseStockReport    from './reports/InHouseStockReport';
import SupplierInvoiceReport from './reports/SupplierInvoiceReport';
import PaymentVoucherReport  from './reports/PaymentVoucherReport';
import ManhourReport         from './reports/ManhourReport';
import IssueDetailsReport    from './reports/IssueDetailsReport';
import PurchaseDetailsReport from './reports/PurchaseDetailsReport';
import PrReport             from './reports/PrReport';
import JobReport             from './reports/JobReport';
import JobBudgetReport       from './reports/JobBudgetReport';
import OpenPoReport          from './reports/OpenPoReport';
import VendorScorecard       from './reports/VendorScorecard';
import GrnReport            from './reports/GrnReport';
import GrnUnregReport       from './reports/GrnUnregReport';
import RtvReport            from './reports/RtvReport';
import IssueReport          from './reports/IssueReport';
import IssueReturnReport        from './reports/IssueReturnReport';
import IssueReturnDetailsReport from './reports/IssueReturnDetailsReport';
import SrvReport            from './reports/SrvReport';
import BacklogReport        from './reports/BacklogReport';
import JobItemLedgerReport  from './reports/JobItemLedgerReport';
import InvoiceReport        from './reports/InvoiceReport';
import ReceiptVoucherReport from './reports/ReceiptVoucherReport';
import CreditNoteReport     from './reports/CreditNoteReport';
import DebitNoteReport      from './reports/DebitNoteReport';
import BomReport            from './reports/BomReport';
import Dashboard            from './Dashboard';
import AdminPage            from './admin/AdminPage';
import UserGroups           from './alerts/UserGroups';
import EmailAlertConfig     from './alerts/EmailAlertConfig';
import AlertLogs            from './alerts/AlertLogs';
import RowLink from './common/RowLink';
import './Layout.css';

// menuData is now loaded dynamically from PermissionContext — no static array needed.

const Icon = ({ name }) => {
  const icons = {
    dashboard:   (<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/></svg>),
    masters:     (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/></svg>),
    procurement: (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round"/><path d="M5 8h6M5 11h4" strokeLinecap="round"/></svg>),
    inventory:   (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1L15 5v6L8 15 1 11V5z" strokeLinejoin="round"/><path d="M8 1v14M1 5l7 4 7-4" strokeLinecap="round"/></svg>),
    job:         (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="11" rx="1.5"/><path d="M5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" strokeLinecap="round"/><path d="M4 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
    finance:     (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4v1m0 6v1" strokeLinecap="round"/></svg>),
    settings:    (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" strokeLinecap="round"/></svg>),
    reports:     (<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 5h6M5 8h6M5 11h4" strokeLinecap="round"/></svg>),
    chevron:     (<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
    filter:      (<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="2" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="6" y1="12" x2="10" y2="12"/></svg>),
    palette:     (<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6.5"/><circle cx="5.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/></svg>),
    check:       (<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  };
  return icons[name] || null;
};

const ThemePicker = () => {
  const { activeTheme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className="theme-picker-wrap" onMouseDown={e => e.stopPropagation()}>
      <button className="theme-trigger" onClick={() => setOpen(o => !o)} title="Change theme">
        <Icon name="palette" /><span>Theme</span>
      </button>
      {open && (
        <div className="theme-dropdown">
          <div className="theme-dropdown-title">Choose Theme</div>
          {Object.entries(themes).map(([key, theme]) => {
            const isActive = key === activeTheme;
            return (
              <button key={key} className={`theme-option ${isActive ? 'theme-option-active' : ''}`}
                onClick={() => { setTheme(key); setOpen(false); }}>
                <span className="theme-swatches">
                  {theme.preview.map((color, i) => <span key={i} className="theme-swatch" style={{ background: color }} />)}
                </span>
                <span className="theme-option-text">
                  <span className="theme-option-name">{theme.name}</span>
                  <span className="theme-option-desc">{theme.description}</span>
                </span>
                {isActive && <span className="theme-check"><Icon name="check" /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Searchable item filter (server-side, portal dropdown) ─────────────────
// Debounces calls to api/item/search; renders results in a React portal so the
// list is never clipped by the filter panel's overflow:hidden/auto.
const SearchableSelectFilter = ({ value, onChange, placeholder }) => {
  const [q,      setQ]      = useState('');
  const [res,    setRes]    = useState([]);
  const [label,  setLabel]  = useState('');
  const [coords, setCoords] = useState(null);
  const timer    = useRef(null);
  const inputRef = useRef(null);

  // If parent clears the value (e.g. "Clear all"), reset local display state
  useEffect(() => { if (!value) { setLabel(''); setQ(''); setRes([]); } }, [value]);

  const positionMenu = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 2, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!res.length) return;
    const h = () => positionMenu();
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h); };
  }, [res.length]);

  const search = (text) => {
    setQ(text);
    clearTimeout(timer.current);
    if (!text.trim()) { setRes([]); return; }
    timer.current = setTimeout(() => {
      fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(text)}&pageSize=20`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { setRes(Array.isArray(d) ? d : (d.data || [])); positionMenu(); })
        .catch(() => {});
    }, 280);
  };

  const select = (it) => {
    setRes([]);
    setLabel(`${it.itemCode} – ${it.itemName}`);
    setQ('');
    onChange(String(it.itemId));
  };

  const clear = () => { setLabel(''); setQ(''); setRes([]); onChange(''); };

  if (value && label) return (
    <div className="fp-ss-selected">
      <span className="fp-ss-label">{label}</span>
      <button className="fp-ss-clear" onClick={clear} title="Clear">×</button>
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="fp-input"
        type="text"
        placeholder={placeholder || 'Search item…'}
        value={q}
        onChange={e => search(e.target.value)}
        onFocus={positionMenu}
        onBlur={() => setTimeout(() => setRes([]), 200)}
      />
      {res.length > 0 && coords && createPortal(
        <div style={{
          position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
          zIndex: 99999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
          boxShadow: '0 4px 16px rgba(0,0,0,.18)', maxHeight: 220, overflowY: 'auto',
        }}>
          {res.map(it => (
            <div key={it.itemId} className="fp-ss-item"
              onMouseDown={() => select(it)}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <strong style={{ color: '#1e40af' }}>{it.itemCode}</strong>
              <span style={{ color: '#374151', marginLeft: 6 }}>{it.itemName}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

const FilterPanel = () => {
  const { activePage, filterDefs, filterValues, setFilter, applyFilters, clearFilters, activeCount } = useFilters();
  const [openGroups, setOpenGroups] = useState({});
  const page   = activePage;
  const defs   = page ? (filterDefs[page] || {}) : {};
  const values = page ? (filterValues[page] || {}) : {};
  const count  = page ? activeCount(page) : 0;
  useEffect(() => {
    if (page && filterDefs[page])
      setOpenGroups(Object.fromEntries(Object.keys(filterDefs[page]).map(k => [k, true])));
  }, [page, filterDefs]);
  if (!page || !filterDefs[page]) return null;
  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  return (
    <div className="erp-filterpanel">
      <div className="fp-header">
        <span className="fp-title">
          <Icon name="filter" /> Filters
          {count > 0 && <span className="fp-count-badge">{count}</span>}
        </span>
        {count > 0 && <span className="fp-clear" onClick={() => clearFilters(page)}>Clear</span>}
      </div>
      <div className="fp-body">
        {Object.entries(defs).map(([key, def]) => {
          const isOpen = openGroups[key] !== false;
          return (
            <div className="fp-group" key={key}>
              <div className="fp-group-header" onClick={() => toggleGroup(key)}>
                <span>{def.label}</span>
                <span className={`fp-chevron ${isOpen ? 'open' : ''}`}><Icon name="chevron" /></span>
              </div>
              {isOpen && (
                <div className="fp-group-body">
                  {def.type === 'text' && (
                    <input className="fp-input" type="text" placeholder={def.placeholder || ''}
                      value={values[key] || ''}
                      onChange={e => setFilter(page, key, e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && applyFilters(page)} />
                  )}
                  {def.type === 'date' && (
                    <input className="fp-input" type="date"
                      value={values[key] || ''}
                      onChange={e => setFilter(page, key, e.target.value)} />
                  )}
                  {def.type === 'select' && (
                    <select className="fp-select" value={values[key] || ''} onChange={e => {
                      setFilter(page, key, e.target.value);
                      if (def.onChange) def.onChange(e.target.value);
                    }}>
                      <option value="">{def.placeholder || `All ${def.label}`}</option>
                      {(def.options || []).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  )}
                  {def.type === 'radio' && (
                    <div className="fp-radio-group">
                      {(def.options || []).map(opt => (
                        <label className="fp-radio-item" key={opt.value}>
                          <input type="radio" name={`fp-radio-${key}`} value={opt.value}
                            checked={(values[key] ?? '') === opt.value}
                            onChange={() => setFilter(page, key, opt.value)} />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {def.type === 'multiselect' && (
                    <div className="fp-multiselect-group">
                      {(def.options || []).map(opt => {
                        const selected = (values[key] || '').split(',').filter(Boolean);
                        const checked  = selected.includes(opt.value);
                        const toggle   = () => {
                          const next = checked
                            ? selected.filter(v => v !== opt.value)
                            : [...selected, opt.value];
                          setFilter(page, key, next.join(','));
                        };
                        return (
                          <label key={opt.value} className={`fp-multiselect-item${checked ? ' checked' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={toggle} />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {def.type === 'searchable-select' && (
                    <SearchableSelectFilter
                      value={values[key] || ''}
                      onChange={val => setFilter(page, key, val)}
                      placeholder={def.placeholder}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="fp-footer">
        <button className="fp-apply" onClick={() => applyFilters(page)}>Apply Filters</button>
      </div>
    </div>
  );
};

// ── Dynamic SideNav — renders from PermissionContext menus ──────────────────
const SideNav = () => {
  // Navigation is now handled by <RowLink>, which calls useNavigate() internally.
  // We only need useLocation here to compute active-state highlighting.
  const location   = useLocation();
  const activePath = location.pathname;
  const { menus, loaded } = usePermission();

  // Build parent → children map from flat menu list
  const parents  = menus.filter(m => m.parentMenuId == null).sort((a, b) => a.menuOrder - b.menuOrder);
  const children = (parentId) => menus.filter(m => m.parentMenuId === parentId).sort((a, b) => (a.menuOrder ?? 99) - (b.menuOrder ?? 99));
  const isGroup  = (item) => !item.menuUrl || item.menuUrl === '#';

  const pathActive = (url) => url && url !== '#' && (activePath === url || activePath.startsWith(url + '/'));

  // Determine which top-level section owns the active path (supports 3 levels)
  const activeParentId = (() => {
    for (const p of parents) {
      if (pathActive(p.menuUrl)) return p.menuId;
      for (const c of children(p.menuId)) {
        if (pathActive(c.menuUrl)) return p.menuId;
        if (children(c.menuId).some(g => pathActive(g.menuUrl))) return p.menuId;
      }
    }
    return null;
  })();

  // Which L2 sub-group is open (for 3-level menus)
  const activeSubId = (() => {
    for (const p of parents) {
      for (const c of children(p.menuId)) {
        if (isGroup(c) && children(c.menuId).some(g => pathActive(g.menuUrl))) return c.menuId;
      }
    }
    return null;
  })();

  const [openId,    setOpenId]    = useState(activeParentId);
  const [openSubId, setOpenSubId] = useState(activeSubId);

  useEffect(() => { if (activeParentId != null) setOpenId(activeParentId); },    [activeParentId]);
  useEffect(() => { if (activeSubId    != null) setOpenSubId(activeSubId); },    [activeSubId]);

  if (!loaded) return <nav className="erp-sidenav" />;

  return (
    <nav className="erp-sidenav">
      {parents.map(item => {
        const kids   = children(item.menuId);
        const isLeaf = !isGroup(item);

        // Top-level leaf (Dashboard, My Approvals…)
        if (isLeaf && kids.length === 0) {
          return (
            <RowLink key={item.menuId}
                     to={item.menuUrl}
                     className={`menu-single ${pathActive(item.menuUrl) ? 'active' : ''}`}>
              <span className="menu-icon"><Icon name={item.menuIcon || 'dashboard'} /></span>
              {item.menuName}
            </RowLink>
          );
        }

        // Expandable group (L1)
        const isOpen = openId === item.menuId;
        return (
          <div className="menu-section" key={item.menuId}>
            <div className={`menu-header ${isOpen ? 'open' : ''}`}
                 onClick={() => setOpenId(isOpen ? null : item.menuId)}>
              <span className="menu-header-left">
                <span className="menu-icon"><Icon name={item.menuIcon || 'masters'} /></span>
                {item.menuName}
              </span>
              <span className={`menu-arrow ${isOpen ? 'open' : ''}`}><Icon name="chevron" /></span>
            </div>
            {isOpen && (
              <div className="menu-items">
                {kids.map(child => {
                  const grandkids = children(child.menuId);

                  // L2 sub-group (no URL, has children) — renders as collapsible sub-header
                  if (isGroup(child) && grandkids.length > 0) {
                    const subOpen = openSubId === child.menuId;
                    return (
                      <div key={child.menuId} className="menu-subgroup">
                        <div className={`menu-subheader ${subOpen ? 'open' : ''}`}
                             onClick={() => setOpenSubId(subOpen ? null : child.menuId)}>
                          <span className="menu-subheader-left">
                            <span className="menu-subdot" />{child.menuName}
                          </span>
                          <span className={`menu-subarrow ${subOpen ? 'open' : ''}`}><Icon name="chevron" /></span>
                        </div>
                        {subOpen && (
                          <div className="menu-subitems">
                            {grandkids.map(gc => (
                              <RowLink key={gc.menuId}
                                       to={gc.menuUrl}
                                       style={{ display: 'block' }}
                                       className={`menu-subitem ${pathActive(gc.menuUrl) ? 'active' : ''}`}>
                                <span className="menu-dot" />{gc.menuName}
                              </RowLink>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // L2 leaf (normal menu item)
                  return (
                    <RowLink key={child.menuId}
                             to={child.menuUrl}
                             style={{ display: 'block' }}
                             className={`menu-item ${pathActive(child.menuUrl) ? 'active' : ''}`}>
                      <span className="menu-dot" />{child.menuName}
                    </RowLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

// ── Dynamic PageTitle — derives breadcrumb from PermissionContext menus ──────
const PageTitle = () => {
  const location = useLocation();
  const { menus } = usePermission();

  // Find the deepest menu whose URL is a prefix of the current path
  const match = menus
    .filter(m => m.menuUrl && m.menuUrl !== '#' &&
      (location.pathname === m.menuUrl || location.pathname.startsWith(m.menuUrl + '/')))
    .sort((a, b) => (b.menuUrl?.length ?? 0) - (a.menuUrl?.length ?? 0))[0];

  if (!match || location.pathname === '/') return null;

  // Build breadcrumb chain (supports up to 3 levels)
  const parent      = match.parentMenuId != null ? menus.find(m => m.menuId === match.parentMenuId) : null;
  const grandparent = parent?.parentMenuId   != null ? menus.find(m => m.menuId === parent.parentMenuId)   : null;

  return (
    <div className="erp-page-title-bar">
      {grandparent && (
        <><span className="erp-page-title-section">{grandparent.menuName}</span>
          <span className="erp-page-title-sep">›</span></>
      )}
      {parent && (
        <><span className="erp-page-title-section">{parent.menuName}</span>
          <span className="erp-page-title-sep">›</span></>
      )}
      <span className="erp-page-title-name">{match.menuName}</span>
    </div>
  );
};

// ── RouteGuard — blocks direct URL access to screens not in the user's menus ─
const RouteGuard = ({ children }) => {
  const location = useLocation();
  const { canAccessPath, loaded } = usePermission();

  // While permissions are still loading show a spinner (prevents false
  // Access-Denied flash and gives visual feedback during the initial fetch).
  if (!loaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 320, flexDirection: 'column', gap: 12, color: '#94a3b8',
      }}>
        <div className="spinner-border" role="status"
             style={{ width: '2rem', height: '2rem', color: '#64748b' }} />
        <span style={{ fontSize: 13 }}>Loading permissions…</span>
      </div>
    );
  }

  if (!canAccessPath(location.pathname)) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 320, gap: 12, color: '#64748b',
      }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Access Denied</div>
        <div style={{ fontSize: 13 }}>You do not have permission to view this page.</div>
      </div>
    );
  }

  return children;
};

// ── Client company name in the header centre (read-only display) ──────────────
const ClientNameDisplay = () => {
  const { company, loading } = useOwnerCompany();

  if (loading) return null;

  return (
    <div className="erp-client-name">
      <div className="ecn-display">
        <span className="ecn-name">
          {company?.displayName || company?.companyName || ''}
        </span>
      </div>
    </div>
  );
};

const Layout = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (auth?.fullName || auth?.username || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="erp-shell">
      <header className="erp-header">
        <div className="erp-header-left">
          <img src="/logo.svg" alt="PMS" style={{ width: 43, height: 43, borderRadius: 9, flexShrink: 0 }} />
          <div className="erp-company">PMS<span>Project Management</span></div>
        </div>
        <div className="erp-header-center">
          <ClientNameDisplay />
        </div>
        <div className="erp-header-right">
          <ThemePicker />
          <NotificationBell userId={auth?.userId || 0} userName={auth?.username || ''} />
          <div className="erp-header-divider" />
          <div className="erp-user-info">
            <div className="erp-user-name">{auth?.fullName || auth?.username}</div>
            <div className="erp-user-role">{auth?.role}</div>
          </div>
          <div className="erp-avatar">{initials}</div>
          <button className="erp-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <div className="erp-body">
        <SideNav />
        <FilterPanel />
        <main className="erp-main">
          <PageTitle />
          <RouteGuard>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/country"          element={<Country />} />
            <Route path="/user-management"                          element={<UserManagement />} />
            <Route path="/user-management/roles"                    element={<RoleManagement />} />
            <Route path="/user-management/assign-roles"             element={<AssignRole />} />
            <Route path="/user-management/role-permissions"         element={<RolePermissions />} />
            <Route path="/customers"          element={<CustomerList />} />
            <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="/suppliers"          element={<SupplierList />} />
            <Route path="/suppliers/:supplierId" element={<SupplierDetailPage />} />
            <Route path="/jobs"             element={<Job />} />
            <Route path="/jobs/:jobId"        element={<JobDetailPage />} />
            <Route path="/jobs/:jobId/budget" element={<JobBudgetPage />} />
            <Route path="/job-overview"     element={<JobOverview />} />
            <Route path="/job-analysis"     element={<JobAnalysis />} />
            <Route path="/job-mom"          element={<JobMom />} />
            <Route path="/items"            element={<Item />} />
            <Route path="/items/:itemId"    element={<ItemDetailPage />} />
            <Route path="/bom"              element={<Bom />} />
            <Route path="/bom/:bomId"       element={<BomDetailPage />} />
            <Route path="/purchase-requests"          element={<Pr />} />
            <Route path="/purchase-requests/:prId"    element={<PrDetailPage />} />
            <Route path="/purchase-orders"            element={<Po />} />
            <Route path="/purchase-orders/:poId"      element={<PoDetailPage />} />
            <Route path="/grn"                        element={<ProcurementGrn />} />
            <Route path="/grn/:grnId"                 element={<ProcurementGrnDetailPage />} />
            <Route path="/supplier-invoice"              element={<SupplierInvoice />} />
            <Route path="/supplier-invoice/:invoiceId"  element={<SupplierInvoiceDetailPage />} />
            <Route path="/grn-unregistration"           element={<GrnUnregistrationPage />} />
            <Route path="/rtv"                        element={<Rtv />} />
            <Route path="/rtv/:rtvId"                 element={<RtvDetailPage />} />
            <Route path="/service-receipts"           element={<Srv />} />
            <Route path="/service-receipts/:id"       element={<SrvDetailPage />} />
            <Route path="/subcontracts"               element={<Subcontract />} />
            <Route path="/subcontracts/:id"           element={<SubcontractDetailPage />} />
            <Route path="/settings/document-series"   element={<DocumentSeries />} />
            <Route path="/settings/document-status"   element={<DocumentStatus />} />
            <Route path="/settings/budget-password"          element={<BudgetPassword />} />
            <Route path="/settings/invoice-revise-password"  element={<InvoiceRevisePassword />} />
            <Route path="/settings/change-password"          element={<ChangePassword />} />
            <Route path="/settings/error-log"                element={<ErrorLog />} />
            <Route path="/settings/company"                  element={<CompanySettings />} />
            <Route path="/settings/smtp"                     element={<SmtpSettings />} />
            <Route path="/inventory-grn"              element={<Grn />} />
            <Route path="/inventory-grn/:id"          element={<GrnDetailPage />} />
            <Route path="/inventory-issue"                    element={<Issue />} />
            <Route path="/inventory-issue/:id"              element={<IssueDetailPage />} />
            <Route path="/inventory-issue-return"           element={<IssueReturn />} />
            <Route path="/inventory-issue-return/:id"       element={<IssueReturnDetailPage />} />
            <Route path="/inventory-adjustment"             element={<Adjustment />} />
            <Route path="/inventory-adjustment/:id"         element={<AdjustmentDetailPage />} />
            <Route path="/inventory-balance"                element={<StockBalance />} />
            <Route path="/inventory-stock-by-job"           element={<StockByJob />} />
            <Route path="/inventory-transfer"               element={<StockTransfer />} />
            <Route path="/inventory-transfer/:id"           element={<StockTransferDetailPage />} />
            <Route path="/item-price-analysis"              element={<ItemPriceAnalysis />} />
            <Route path="/inventory-alerts"                 element={<StockAlerts />} />
            <Route path="/invoices"                   element={<Invoice />} />
            <Route path="/invoices/:id"               element={<InvoiceDetailPage />} />
            <Route path="/delivery"                   element={<Delivery />} />
            <Route path="/delivery/:deliveryId"       element={<DeliveryDetailPage />} />
            <Route path="/receipt-vouchers"           element={<ReceiptVoucher />} />
            <Route path="/receipt-vouchers/:id"       element={<ReceiptVoucherDetail />} />
            <Route path="/payment-vouchers"           element={<PaymentVoucher />} />
            <Route path="/payment-vouchers/:id"       element={<PaymentVoucherDetail />} />
            <Route path="/credit-notes"               element={<CreditNote />} />
            <Route path="/credit-notes/:id"           element={<CreditNoteDetail />} />
            <Route path="/debit-notes"                element={<DebitNote />} />
            <Route path="/debit-notes/:id"            element={<DebitNoteDetail />} />
            <Route path="/receivables"                element={<Receivables />} />
            <Route path="/receivables/customer/:customerId" element={<CustomerReceivables />} />
            <Route path="/payment-followup"           element={<PaymentFollowup />} />
            <Route path="/payables"                   element={<Payables />} />
            <Route path="/payables/supplier/:supplierId" element={<SupplierPayables />} />
            <Route path="/manhour"                    element={<Manhour />} />
            <Route path="/manhour/new"                element={<ManhourDetailPage />} />
            <Route path="/manhour/:id"                element={<ManhourDetailPage />} />
            <Route path="/manhour/:id/edit"           element={<ManhourDetailPage />} />
            <Route path="/manhour-admin"              element={<ManhourAdmin />} />
            <Route path="/employee"                   element={<Employee />} />
            <Route path="/manhour-rate"               element={<ManhourRate />} />
            <Route path="/my-approvals"               element={<MyApprovalsPage />} />
            <Route path="/approvals-admin"            element={<ApprovalsAdminPage />} />
            <Route path="/settings/approval-policies" element={<ApprovalPoliciesPage />} />
            <Route path="/user-management/menus"               element={<MenuManagement />} />
            {/* ── Reports ── */}
            <Route path="/reports/po"           element={<PoReport />} />
            <Route path="/reports/pr"           element={<PrReport />} />
            <Route path="/reports/job"          element={<JobReport />} />
            <Route path="/reports/job-budget"   element={<JobBudgetReport />} />
            <Route path="/reports/open-po"      element={<OpenPoReport />} />
            <Route path="/reports/vendor-scorecard" element={<VendorScorecard />} />
            <Route path="/reports/grn"          element={<GrnReport />} />
            <Route path="/reports/grn-unreg"    element={<GrnUnregReport />} />
            <Route path="/reports/rtv"          element={<RtvReport />} />
            <Route path="/reports/issue"        element={<IssueReport />} />
            <Route path="/reports/issue-return"         element={<IssueReturnReport />} />
            <Route path="/reports/issue-return-details" element={<IssueReturnDetailsReport />} />
            <Route path="/reports/srv"          element={<SrvReport />} />
            <Route path="/reports/backlog"       element={<BacklogReport />} />
            <Route path="/reports/item-ledger"  element={<JobItemLedgerReport />} />
            <Route path="/reports/invoice"      element={<InvoiceReport />} />
            <Route path="/reports/receipt"      element={<ReceiptVoucherReport />} />
            <Route path="/reports/credit-note"  element={<CreditNoteReport />} />
            <Route path="/reports/debit-note"   element={<DebitNoteReport />} />
            <Route path="/reports/bom"              element={<BomReport />} />
            <Route path="/reports/inventory-grn"    element={<InventoryGrnReport />} />
            <Route path="/reports/stock-balance"    element={<StockBalanceReport />} />
            <Route path="/reports/stock-adjustment" element={<StockAdjustmentReport />} />
            <Route path="/reports/inhouse-stock"    element={<InHouseStockReport />} />
            <Route path="/reports/supplier-invoice" element={<SupplierInvoiceReport />} />
            <Route path="/reports/payment-voucher"  element={<PaymentVoucherReport />} />
            <Route path="/reports/manhour"          element={<ManhourReport />} />
            <Route path="/reports/issue-details"    element={<IssueDetailsReport />} />
            <Route path="/reports/purchase-details" element={<PurchaseDetailsReport />} />
            <Route path="/admin"                             element={<AdminPage />} />
            <Route path="/settings/user-groups"             element={<UserGroups />} />
            <Route path="/settings/email-alerts"            element={<EmailAlertConfig />} />
            <Route path="/settings/alert-logs"              element={<AlertLogs />} />
          </Routes>
          </RouteGuard>
        </main>
      </div>
    </div>
  );
};

export default Layout;

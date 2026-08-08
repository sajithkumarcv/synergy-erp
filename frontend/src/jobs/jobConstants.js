// ─────────────────────────────────────────────────────────────
// jobConstants.js
// Single source of truth for all job-related config:
//   - Status definitions + transitions
//   - Tab definitions + role access
//   - Action config
//   - Formatters
// ─────────────────────────────────────────────────────────────

// ── Status Map ────────────────────────────────────────────────
// IDs must match proj.TBL_JOB_STATUS (1=Active, 2=Waiting, 3=Freezed, 4=Completed, 5=Cancelled)
export const STATUS = {
  1: { id: 1, label: 'Active',    color: '#166534', bg: '#dcfce7', dot: '#16a34a' },
  2: { id: 2, label: 'Waiting',   color: '#854d0e', bg: '#fef9c3', dot: '#ca8a04' },
  3: { id: 3, label: 'Freezed',   color: '#1e40af', bg: '#dbeafe', dot: '#3b82f6' },
  4: { id: 4, label: 'Completed', color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
  5: { id: 5, label: 'Cancelled', color: '#991b1b', bg: '#fee2e2', dot: '#dc2626' },
};

// ── Tab Definitions ───────────────────────────────────────────
// roles: ['*'] = all roles, ['ADMIN','FINANCE'] = specific roles
// Each tab declares an `actionCode` that maps to TBL_MENU_ACTIONS for the Jobs
// menu (MenuId 9). Visibility is controlled per role via Role Permissions →
// the matching "Tab: X" checkbox in the matrix. The legacy `roles` field is
// kept for back-compat but is no longer consulted when `actionCode` is set.
export const JOB_TABS = [
  {
    key:        'overview',
    label:      'Overview',
    icon:       '📋',
    actionCode: 'TAB_OVERVIEW',
    description: 'Job summary, KPIs and activity timeline',
  },
  {
    key:        'expenses',
    label:      'Expenses',
    icon:       '💰',
    actionCode: 'TAB_EXPENSES',
    description: 'Cost entries — add, edit and approve expenses',
    badge: true,
  },
  {
    key:        'engineers',
    label:      'Engineers',
    icon:       '👷',
    actionCode: 'TAB_ENGINEERS',
    description: 'Assign and track team members',
    badge: true,
  },
  {
    key:        'budget',
    label:      'Budget',
    icon:       '🎯',
    actionCode: 'TAB_BUDGET',
    description: 'Budget vs actual cost by category',
  },
  {
    key:        'finance',
    label:      'Finance',
    icon:       '📊',
    actionCode: 'TAB_FINANCE',
    description: 'Order value, invoicing and payment summary',
  },
  {
    key:        'terms',
    label:      'Terms',
    icon:       '📄',
    actionCode: 'TAB_TERMS',
    description: 'Payment, warranty and delivery terms',
  },
  {
    key:        'documents',
    label:      'Documents',
    icon:       '📎',
    actionCode: 'TAB_DOCUMENTS',
    description: 'LPO, drawings, contracts and other job documents',
    badge: true,
  },
  {
    key:        'meta',
    label:      'Meta',
    icon:       '🏷️',
    actionCode: 'TAB_META',
    description: 'Bay, category, quality level and unit count',
  },
  {
    key:        'additional',
    label:      'Additional Jobs',
    icon:       '🔗',
    actionCode: 'TAB_ADDITIONAL',
    description: 'Additional jobs linked to this job as parent',
    parentOnly: true,
  },
  {
    key:        'approval',
    label:      'Approval',
    icon:       '✔',
    actionCode: 'TAB_APPROVAL',
    description: 'Approval workflow — submit and track approval status',
  },
  {
    key:        'history',
    label:      'History',
    icon:       '📜',
    actionCode: 'TAB_HISTORY',
    description: 'Full audit trail — every change, freeze, cancel and revision',
  },
];

// ── Role check helper ─────────────────────────────────────────
// Role names in DB can be multi-word ("Finance Manager", "Operations Manager").
// roleMatches() checks whether the user's role CONTAINS any of the allowed keywords.
// e.g.  "Finance Manager" → contains "FINANCE" → true
//       "Operations Manager" → contains "MANAGER" → true
const roleMatches = (userRole, allowed) => {
  if (!userRole) return false;
  const up = userRole.toUpperCase();
  return allowed.some(k => up === k || up.includes(k));
};

// Tab visibility check.
//   canDoFn — pass in `canDo` from PermissionContext (e.g. tab => canDo('/jobs', code))
//   If a tab has no actionCode, it falls back to the legacy roles[] list.
export const canAccessTab = (tab, userRole, canDoFn) => {
  if (tab.actionCode && typeof canDoFn === 'function') {
    return canDoFn('/jobs', tab.actionCode);
  }
  if (!tab.roles || tab.roles.includes('*')) return true;
  return roleMatches(userRole, tab.roles);
};

// Can user edit a section based on job status?
// Only IsClosed statuses are locked: Freezed(3), Completed(4), Cancelled(5)
export const canEdit = (statusId) => {
  return ![3, 4, 5].includes(Number(statusId));
};

// Can user approve expenses?
export const canApproveExpenses = (userRole) => {
  return roleMatches(userRole, ['ADMIN', 'FINANCE', 'MANAGER']);
};

// Can user set/edit job budgets?
export const canEditBudget = (userRole) => {
  return roleMatches(userRole, ['ADMIN', 'FINANCE', 'MANAGER']);
};

// ── Audit action display config ───────────────────────────────
export const AUDIT_ACTION_CONFIG = {
  CREATED:           { label: 'Job Created',        icon: '✨', color: '#16a34a' },
  UPDATED:           { label: 'Details Updated',    icon: '✏️', color: '#2563eb' },
  STAGE_CHANGED:     { label: 'Stage Changed',      icon: '🔄', color: '#7c3aed' },
  STATUS_CHANGED:    { label: 'Status Changed',     icon: '🔔', color: '#0891b2' },
  EXPENSE_ADDED:     { label: 'Expense Added',      icon: '💰', color: '#d97706' },
  EXPENSE_UPDATED:   { label: 'Expense Updated',    icon: '💰', color: '#b45309' },
  EXPENSE_APPROVED:  { label: 'Expense Approved',   icon: '✅', color: '#16a34a' },
  ENGINEER_ASSIGNED: { label: 'Engineer Assigned',  icon: '👷', color: '#0891b2' },
  ENGINEER_UPDATED:  { label: 'Engineer Updated',   icon: '👷', color: '#0369a1' },
  FINANCE_UPDATED:   { label: 'Finance Updated',    icon: '💵', color: '#059669' },
  META_UPDATED:      { label: 'Meta Updated',       icon: '🏷️', color: '#7c3aed' },
  JOB_COMPLETED:     { label: 'Job Completed',      icon: '✅', color: '#15803d' },
  JOB_CANCELLED:     { label: 'Job Cancelled',      icon: '✖',  color: '#b91c1c' },
  JOB_REVISED:       { label: 'Job Revised',        icon: '🔄', color: '#b45309' },
  JOB_FREEZED:       { label: 'Job Freezed',        icon: '🧊', color: '#0e7490' },
  BUDGET_APPROVED:   { label: 'Budget Approved',    icon: '🔒', color: '#15803d' },
  BUDGET_REVISED:    { label: 'Budget Revised',     icon: '↻',  color: '#b45309' },
};

// ── Formatters ────────────────────────────────────────────────
export const fmt = (n, decimals = 2) =>
  n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : '—';

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtRelative = (d) => {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return fmtDate(d);
};

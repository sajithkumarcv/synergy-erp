export const CUSTOMER_TABS = [
    { key: 'overview',  label: 'Overview',   icon: '📋' },
    { key: 'contacts',  label: 'Contacts',   icon: '👤', badge: true },
    { key: 'addresses', label: 'Addresses',  icon: '📍', badge: true },
];

export const FLAG_CONFIG = {
    GREEN:  { bg: '#dcfce7', color: '#166534', dot: '#16a34a', label: 'Good Standing' },
    YELLOW: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04', label: 'Warning'       },
    RED:    { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626', label: 'Overdue'        },
    BLACK:  { bg: '#1c1c1c', color: '#ffffff', dot: '#111111', label: 'Credit Hold'   },
};

export const getFlag  = (flag) => FLAG_CONFIG[flag] || FLAG_CONFIG.GREEN;

export const initials = (name = '') =>
    name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

export const AVATAR_COLORS = [
    { bg: '#dbeafe', color: '#1e40af' }, { bg: '#d1fae5', color: '#065f46' },
    { bg: '#ede9fe', color: '#5b21b6' }, { bg: '#fef3c7', color: '#92400e' },
    { bg: '#fce7f3', color: '#9d174d' },
];

export const avatarColor = (name = '') =>
    AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

export const fmt = (n) => (n != null ? Number(n).toLocaleString() : '—');

export const FormSection = ({ label }) => (
    <div className="cf-section">
        <span className="cf-section-label">{label}</span>
        <div className="cf-section-line" />
    </div>
);

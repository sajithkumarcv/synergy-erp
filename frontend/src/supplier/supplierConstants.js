export const SUPPLIER_TABS = [
    { key: 'overview',  label: 'Overview',      icon: '📋' },
    { key: 'contacts',  label: 'Contacts',      icon: '👤', badge: true },
    { key: 'addresses', label: 'Addresses',     icon: '📍', badge: true },
    { key: 'banks',     label: 'Bank Accounts', icon: '🏦', badge: true },
];

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
    <div className="sf-section">
        <span className="sf-section-label">{label}</span>
        <div className="sf-section-line" />
    </div>
);

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

// GST rules for a supplier in India (the database procedure enforces the same rules).
export const GST_REGISTERED = ['REGISTERED_REGULAR', 'REGISTERED_COMPOSITION'];

export const isIndiaCountry = (countries, countryId) => {
    const c = (countries || []).find(x => String(x.id) === String(countryId));
    return !!c && /^india$/i.test((c.name || '').trim());
};

// Tax Treatment items: India uses the GST ones, every other country the VAT ones (Overseas is shared).
export const INDIA_TREATMENTS = ['REGISTERED_REGULAR', 'REGISTERED_COMPOSITION', 'UNREGISTERED', 'OVERSEAS'];
export const OTHER_TREATMENTS = ['VAT_REGISTERED', 'VAT_NOT_REGISTERED', 'OVERSEAS'];

export const allowedTreatments = (countries, countryId) => {
    if (!countryId) return [];
    return isIndiaCountry(countries, countryId) ? INDIA_TREATMENTS : OTHER_TREATMENTS;
};

export const treatmentOptions = (options, countries, countryId) => {
    const allowed = allowedTreatments(countries, countryId);
    return (options || []).filter(o => allowed.includes(o.value));
};

export const gstErrors = (form, countries) => {
    const errs = [];
    if (!form.countryId) { errs.push('Country is required.'); return errs; }
    const india = isIndiaCountry(countries, form.countryId);
    if (!form.gstTreatment) { errs.push('Tax Treatment is required.'); return errs; }
    if (!allowedTreatments(countries, form.countryId).includes(form.gstTreatment)) {
        errs.push(india ? 'This Tax Treatment is not valid for a supplier in India.' : 'This Tax Treatment is not valid for a supplier outside India.');
        return errs;
    }
    if (india && GST_REGISTERED.includes(form.gstTreatment)) {
        const t = (form.taxNumber || '').trim();
        if (!t)                   errs.push('GST Number (Tax Number) is required for a GST registered supplier.');
        else if (t.length !== 15) errs.push('GST Number must be 15 characters (GSTIN).');
    }
    if (!india && form.gstTreatment === 'VAT_REGISTERED' && !(form.vatNumber || '').trim() && !(form.taxNumber || '').trim())
        errs.push('VAT Number (TRN) is required for a VAT registered supplier.');
    return errs;
};

export const FormSection = ({ label }) => (
    <div className="sf-section">
        <span className="sf-section-label">{label}</span>
        <div className="sf-section-line" />
    </div>
);

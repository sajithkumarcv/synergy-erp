import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from './Variable.js';
import { useCurrentUser } from './AuthContext';
import { usePermission } from './PermissionContext';
import './procurement/Procurement.css';

const PAGE_SIZES = [50, 100, 200, 500, 1000];

// ── Add / Edit form panel ─────────────────────────────────────────
const CountryForm = ({ initial, onClose, onSaved }) => {
    const currentUser = useCurrentUser();

    const isNew = !initial?.countryId;
    const [form, setForm]   = useState({
        countryName: initial?.countryName || '',
        countryCode: initial?.countryCode || '',
        sortOrder:   initial?.sortOrder   != null ? String(initial.sortOrder) : '0',
        isActive:    initial?.isActive    ?? true,
    });
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = () => {
        const e = {};
        if (!form.countryName.trim()) e.countryName = 'Country name is required.';
        if (!form.countryCode.trim()) e.countryCode = 'Country code is required.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}Country/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                countryId:   isNew ? 0 : initial.countryId,
                countryName: form.countryName.trim(),
                countryCode: form.countryCode.trim().toUpperCase(),
                sortOrder:   parseInt(form.sortOrder) || 0,
                isActive:    form.isActive,
                createdBy:   currentUser,
                modifiedBy:  isNew ? null : currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                onSaved();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 440 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">{isNew ? 'New Country' : 'Edit Country'}</div>
                        {!isNew && <div className="pf-header-sub">{initial.countryCode} — {initial.countryName}</div>}
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>

                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}

                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Country Name <span className="req">*</span></label>
                            <input className={`pf-input${errors.countryName ? ' pf-input-err' : ''}`}
                                type="text" name="countryName" value={form.countryName}
                                onChange={handle} placeholder="e.g. United Arab Emirates" autoFocus />
                            {errors.countryName && <span className="pf-field-err">{errors.countryName}</span>}
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Country Code <span className="req">*</span></label>
                            <input className={`pf-input${errors.countryCode ? ' pf-input-err' : ''}`}
                                type="text" name="countryCode" value={form.countryCode}
                                onChange={handle} placeholder="e.g. AE" maxLength={5}
                                style={{ textTransform: 'uppercase' }} />
                            {errors.countryCode && <span className="pf-field-err">{errors.countryCode}</span>}
                        </div>
                        <div className="pf-field" style={{ flex: '0 0 110px' }}>
                            <label>Sort Order</label>
                            <input className="pf-input" type="number" name="sortOrder"
                                value={form.sortOrder} onChange={handle} min="0" />
                        </div>
                    </div>

                    {!isNew && (
                        <div className="pf-row">
                            <div className="pf-field">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type="checkbox" name="isActive" checked={form.isActive}
                                        onChange={handle}
                                        style={{ width: 15, height: 15, accentColor: '#16a34a' }} />
                                    Active
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : (isNew ? 'Create' : 'Save Changes')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main list page ─────────────────────────────────────────────────
const Country = () => {
    const { canDo } = usePermission();
    const canAdd    = canDo('/country', 'ADD');
    const canEdit   = canDo('/country', 'EDIT');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [search,     setSearch]    = useState('');
    const [pageSize,   setPageSize]  = useState(200);
    const [page,       setPage]      = useState(1);
    const [sortCol,    setSortCol]   = useState('sortOrder');
    const [sortDir,    setSortDir]   = useState('ASC');
    const [formTarget, setFormTarget] = useState(null); // null=closed, false=new, object=edit

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}Country`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => setRows(Array.isArray(data) ? data : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Client-side search + sort + paginate ─────────────────────
    const filtered = rows.filter(r =>
        !search.trim() ||
        (r.countryName || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.countryCode || '').toLowerCase().includes(search.toLowerCase())
    );

    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
        return sortDir === 'ASC' ? cmp : -cmp;
    });

    const totalRows  = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize);

    const handleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
        else { setSortCol(col); setSortDir('ASC'); }
        setPage(1);
    };

    const goPage = p => setPage(Math.max(1, Math.min(p, totalPages)));

    const handleSaved = () => {
        setFormTarget(null);
        load();
    };

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
        return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
    };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {formTarget !== null && (
                <CountryForm
                    initial={formTarget || null}
                    onClose={() => setFormTarget(null)}
                    onSaved={handleSaved}
                />
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Countries</div>
                            <div className="po-page-sub">{totalRows} record{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <input
                                className="pf-input"
                                style={{ width: 200, padding: '5px 10px', fontSize: 13 }}
                                type="text"
                                placeholder="Search name or code…"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                            />
                            <select className="po-select" value={pageSize}
                                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => setFormTarget(false)}>+ New Country</button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <span className="po-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="countryCode">Code</Th>
                                <Th col="countryName">Country Name</Th>
                                <Th col="sortOrder">Sort Order</Th>
                                <Th col="isActive">Status</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 && !loading ? (
                                <tr><td colSpan={5} className="po-empty">No countries found.</td></tr>
                            ) : paginated.map(r => (
                                <tr key={r.countryId} style={!r.isActive ? { opacity: 0.55 } : {}}>
                                    <td>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 12, fontWeight: 700,
                                            background: '#f1f5f9', color: '#334155',
                                            padding: '2px 7px', borderRadius: 4 }}>
                                            {r.countryCode}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 500 }}>{r.countryName}</td>
                                    <td style={{ color: '#64748b' }}>{r.sortOrder}</td>
                                    <td>
                                        {r.isActive
                                            ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Active</span>
                                            : <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Inactive</span>}
                                    </td>
                                    <td>
                                        {canEdit && <button className="po-act-btn po-act-open"
                                            onClick={() => setFormTarget(r)}>Edit</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">
                        Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                        &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}
                    </div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}         disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}  disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`}
                                onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}  disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Country;

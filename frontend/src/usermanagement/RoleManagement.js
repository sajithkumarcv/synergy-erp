import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import '../procurement/Procurement.css';

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_FILTERS = { searchText: '', isActive: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── Role form ─────────────────────────────────────────────────
const RoleForm = ({ editRole, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isEdit = !!editRole;
    const [form, setForm] = useState({
        roleName:       editRole?.roleName       || '',
        roleCode:       editRole?.roleCode       || '',
        description:    editRole?.description    || '',
        isActive:       editRole ? editRole.isActive       : true,
        isEngineerRole: editRole ? !!editRole.isEngineerRole : false,
    });
    const [errors,    setErrors]    = useState({});
    const [serverErr, setServerErr] = useState('');
    const [saving,    setSaving]    = useState(false);

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
        setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.roleName.trim()) e.roleName = 'Role name is required.';
        if (!f.roleCode.trim()) e.roleCode = 'Role code is required.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length) return;
        setServerErr(''); setSaving(true);
        fetch(`${variables.API_URL}role/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                roleId:         editRole?.roleId || 0,
                roleName:       form.roleName.trim(),
                roleCode:       form.roleCode.trim().toUpperCase(),
                description:    form.description.trim() || null,
                isActive:       form.isActive,
                isEngineerRole: !!form.isEngineerRole,
                createdBy:      currentUser,
                modifiedBy:     isEdit ? currentUser : null,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerErr(d.message || 'Error saving.'); return; }
                onSaved(d.roleId);
            })
            .catch(() => setServerErr('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 480 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">{isEdit ? 'Edit Role' : 'New Role'}</div>
                        <div className="pf-header-sub">{isEdit ? `Editing: ${editRole.roleName}` : 'Define a new access role.'}</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverErr && <div className="pf-err">{serverErr}</div>}

                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Role Name <span className="req">*</span></label>
                            <input className={`pf-input${errors.roleName ? ' pf-input-err' : ''}`}
                                name="roleName" value={form.roleName} onChange={handle} placeholder="e.g. Finance Manager" />
                            <FieldErr msg={errors.roleName} />
                        </div>
                        <div className="pf-field">
                            <label>Role Code <span className="req">*</span></label>
                            <input className={`pf-input${errors.roleCode ? ' pf-input-err' : ''}`}
                                name="roleCode" value={form.roleCode} onChange={handle} placeholder="e.g. FIN_MGR"
                                style={{ textTransform: 'uppercase' }} />
                            <FieldErr msg={errors.roleCode} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Description</label>
                            <textarea className="pf-input pf-textarea" name="description" rows={2}
                                value={form.description} onChange={handle}
                                placeholder="Brief description of this role's responsibilities…" />
                        </div>
                    </div>

                    <div className="pf-row" style={{ paddingTop: 4, gap: 24 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handle} style={{ width: 15, height: 15 }} />
                            Active
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" name="isEngineerRole" checked={!!form.isEngineerRole} onChange={handle} style={{ width: 15, height: 15 }} />
                            Engineer Role
                            <span style={{ fontSize: 11, color: '#64748b' }}>(auto-creates engineer record on role assign)</span>
                        </label>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Role'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Delete confirm modal ──────────────────────────────────────
const DeleteConfirm = ({ role, onCancel, onConfirm, deleting }) => (
    <div className="pf-overlay">
        <div className="pf-panel" style={{ maxWidth: 400 }}>
            <div className="pf-header">
                <div className="pf-header-title" style={{ color: '#dc2626' }}>Delete Role?</div>
                <button className="pf-close" onClick={onCancel}>✕</button>
            </div>
            <div className="pf-body">
                <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>
                    Are you sure you want to delete <strong>{role.roleName}</strong>?
                    This action cannot be undone. Roles assigned to users cannot be deleted.
                </p>
            </div>
            <div className="pf-footer">
                <button className="pf-btn-sec" onClick={onCancel}>Cancel</button>
                <button className="pf-btn-pri" style={{ background: '#dc2626', borderColor: '#dc2626' }}
                    onClick={onConfirm} disabled={deleting}>
                    {deleting ? 'Deleting…' : 'Delete Role'}
                </button>
            </div>
        </div>
    </div>
);

// ── Main list page ────────────────────────────────────────────
const RoleManagement = () => {
    const currentUser = useCurrentUser();
    const { registerFilters, unregisterFilters } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/user-management/roles', 'ADD');
    const canEdit   = canDo('/user-management/roles', 'EDIT');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('RoleName');
    const [sortDir,    setSortDir]   = useState('ASC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });

    const [showForm,   setShowForm]  = useState(false);
    const [editRole,   setEditRole]  = useState(null);
    const [deleteRole, setDeleteRole]= useState(null);
    const [deleting,   setDeleting]  = useState(false);
    const [success,    setSuccess]   = useState('');
    const [deleteErr,  setDeleteErr] = useState('');

    const gridRef = useRef({ pageSize: 20, sortCol: 'RoleName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.isActive)   q.set('isActive',   af.isActive);
        fetch(`${variables.API_URL}role/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => {
                const tot = res.totalRows || 0;
                setRows(res.data || []); setTotal(tot);
                setPages(Math.ceil(tot / ps) || 1);
            })
            .catch(console.error).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS); }, [load]); // eslint-disable-line

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        registerFilters('role-management', {
            searchText: { label: 'Search',  type: 'text',   placeholder: 'Role name or code…' },
            isActive:   { label: 'Status',  type: 'select', placeholder: 'All', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('role-management');
    }, []); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage = p => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const handleSaved = () => {
        setShowForm(false); setEditRole(null);
        setSuccess(editRole ? 'Role updated.' : 'Role created.');
        load(page, pageSize, sortCol, sortDir, applied);
        setTimeout(() => setSuccess(''), 4000);
    };

    const confirmDelete = async () => {
        if (!deleteRole) return;
        setDeleting(true); setDeleteErr('');
        try {
            const res = await fetch(
                `${variables.API_URL}role/${deleteRole.roleId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                { method: 'DELETE', headers: authHeaders() }
            );
            const d = await res.json();
            if (!res.ok) { setDeleteErr(d.message || 'Delete failed.'); setDeleting(false); return; }
            setDeleteRole(null);
            setSuccess('Role deleted.');
            load(page, pageSize, sortCol, sortDir, applied);
            setTimeout(() => setSuccess(''), 4000);
        } catch { setDeleteErr('Network error.'); }
        finally { setDeleting(false); }
    };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5, start = Math.max(1, Math.min(page - 2, totalPages - range + 1));
        return Array.from({ length: Math.min(range, totalPages) }, (_, i) => start + i);
    };

    return (
        <div className="po-page">
            {showForm && (
                <RoleForm editRole={editRole}
                    onClose={() => { setShowForm(false); setEditRole(null); }}
                    onSaved={handleSaved} />
            )}
            {deleteRole && (
                <DeleteConfirm role={deleteRole}
                    onCancel={() => { setDeleteRole(null); setDeleteErr(''); }}
                    onConfirm={confirmDelete}
                    deleting={deleting} />
            )}

            {success   && <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>✓ {success}</div>}
            {deleteErr && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>⚠ {deleteErr}</div>}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Role Management</div>
                            <div className="po-page-sub">{totalRows} role{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => { setEditRole(null); setShowForm(true); }}>
                                + New Role
                            </button>}
                        </div>
                    </div>
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner"><div className="po-spinner-ring" /><span className="po-spinner-text">Loading…</span></div>
                        </div>
                    )}
                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="RoleName">Role Name</Th>
                                <Th col="RoleCode">Code</Th>
                                <th>Description</th>
                                <th>Users</th>
                                <th>Engineer</th>
                                <th>Status</th>
                                <Th col="CreatedDate">Created</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={8} className="po-empty">No roles found.</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.roleId}>
                                    <td><span style={{ fontWeight: 600, color: '#1e293b' }}>{r.roleName}</span></td>
                                    <td><span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#1d4ed8', background: '#eff6ff', padding: '2px 6px', borderRadius: 4 }}>{r.roleCode}</span></td>
                                    <td style={{ color: '#64748b', fontSize: 12, maxWidth: 260 }}>{r.description || '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{r.userCount}</span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {r.isEngineerRole
                                            ? <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 10, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>⚙ Yes</span>
                                            : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                                    </td>
                                    <td>
                                        {r.isActive
                                            ? <span className="po-status-badge" style={{ background: '#dcfce7', color: '#166534' }}><span className="po-status-dot" style={{ background: '#22c55e' }} />Active</span>
                                            : <span className="po-status-badge" style={{ background: '#f1f5f9', color: '#475569' }}><span className="po-status-dot" style={{ background: '#94a3b8' }} />Inactive</span>}
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>
                                        {r.createdDate ? new Date(r.createdDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                    <td>
                                        {canEdit && <button className="po-act-btn"
                                            onClick={() => { setEditRole(r); setShowForm(true); }}>Edit</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="po-pagination">
                    <div className="po-page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                    <div className="po-page-controls">
                        <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                        <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                        {pageNums().map(n => (
                            <button key={n} className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                        ))}
                        <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                        <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoleManagement;
export { RoleManagement };

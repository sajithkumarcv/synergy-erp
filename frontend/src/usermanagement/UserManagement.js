import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useFilters } from '../FilterContext';
import { usePermission } from '../PermissionContext';
import '../procurement/Procurement.css';

const PAGE_SIZES = [10, 20, 50];
const DEFAULT_FILTERS = { searchText: '', status: '', roleId: '' };

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="po-sort-none">⇅</span>;
    return <span className="po-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const StatusBadge = ({ isActive, isLocked }) => {
    if (isLocked) return (
        <span className="po-status-badge" style={{ background: '#fef3c7', color: '#92400e' }}>
            <span className="po-status-dot" style={{ background: '#f59e0b' }} />Locked
        </span>
    );
    if (!isActive) return (
        <span className="po-status-badge" style={{ background: '#f1f5f9', color: '#475569' }}>
            <span className="po-status-dot" style={{ background: '#94a3b8' }} />Inactive
        </span>
    );
    return (
        <span className="po-status-badge" style={{ background: '#dcfce7', color: '#166534' }}>
            <span className="po-status-dot" style={{ background: '#22c55e' }} />Active
        </span>
    );
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── Add / Edit User form ──────────────────────────────────────
const UserForm = ({ editUser, roles, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isEdit = !!editUser;
    const [form, setForm] = useState({
        userCode:    editUser?.userCode    || '',
        userName:    editUser?.userName    || '',
        fullName:    editUser?.fullName    || '',
        email:       editUser?.email       || '',
        mobile:      editUser?.mobile      || '',
        password:    '',
        isActive:    editUser ? editUser.isActive  : true,
        isLocked:    editUser ? editUser.isLocked  : false,
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
        if (!f.userCode.trim())  e.userCode  = 'User code is required.';
        if (!f.userName.trim())  e.userName  = 'Username is required.';
        if (!isEdit && !f.password.trim()) e.password = 'Password is required for new users.';
        if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Invalid email format.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length) return;
        setServerErr(''); setSaving(true);
        fetch(`${variables.API_URL}user/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                userId:     editUser?.userId || 0,
                userCode:   form.userCode.trim(),
                userName:   form.userName.trim(),
                fullName:   form.fullName.trim()  || null,
                email:      form.email.trim()     || null,
                mobile:     form.mobile.trim()    || null,
                password:   form.password         || null,
                isActive:   form.isActive,
                isLocked:   form.isLocked,
                createdBy:  currentUser,
                modifiedBy: isEdit ? currentUser : null,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerErr(d.message || 'Error saving.'); return; }
                onSaved(d.userId);
            })
            .catch(() => setServerErr('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 560 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">{isEdit ? 'Edit User' : 'New User'}</div>
                        <div className="pf-header-sub">{isEdit ? `Editing: ${editUser.userName}` : 'Fill in the details below to create a user account.'}</div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {serverErr && <div className="pf-err">{serverErr}</div>}

                    <div className="pf-row">
                        <div className="pf-field">
                            <label>User Code <span className="req">*</span></label>
                            <input className={`pf-input${errors.userCode ? ' pf-input-err' : ''}`} name="userCode" value={form.userCode} onChange={handle} placeholder="e.g. U001" />
                            <FieldErr msg={errors.userCode} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Username <span className="req">*</span></label>
                            <input className={`pf-input${errors.userName ? ' pf-input-err' : ''}`} name="userName" value={form.userName} onChange={handle} placeholder="Login username" autoComplete="off" />
                            <FieldErr msg={errors.userName} />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Full Name</label>
                            <input className="pf-input" name="fullName" value={form.fullName} onChange={handle} placeholder="Display name" />
                        </div>
                    </div>

                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Email</label>
                            <input className={`pf-input${errors.email ? ' pf-input-err' : ''}`} type="email" name="email" value={form.email} onChange={handle} placeholder="user@company.com" />
                            <FieldErr msg={errors.email} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Mobile</label>
                            <input className="pf-input" name="mobile" value={form.mobile} onChange={handle} placeholder="+971 50 000 0000" />
                        </div>
                    </div>

                    {!isEdit && (
                        <div className="pf-row">
                            <div className="pf-field pf-f3">
                                <label>Password <span className="req">*</span></label>
                                <input className={`pf-input${errors.password ? ' pf-input-err' : ''}`} type="password" name="password" value={form.password} onChange={handle} autoComplete="new-password" />
                                <FieldErr msg={errors.password} />
                            </div>
                        </div>
                    )}

                    <div className="pf-row" style={{ gap: 24, alignItems: 'center', paddingTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handle} style={{ width: 15, height: 15 }} />
                            Active
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input type="checkbox" name="isLocked" checked={form.isLocked} onChange={handle} style={{ width: 15, height: 15 }} />
                            Locked
                        </label>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Reset Password form ───────────────────────────────────────
const ResetPasswordForm = ({ user, onClose, onDone }) => {
    const currentUser = useCurrentUser();
    const [pwd,       setPwd]       = useState('');
    const [confirm,   setConfirm]   = useState('');
    const [error,     setError]     = useState('');
    const [saving,    setSaving]    = useState(false);

    const save = () => {
        if (!pwd.trim())         { setError('New password is required.'); return; }
        if (pwd !== confirm)     { setError('Passwords do not match.'); return; }
        if (pwd.length < 6)      { setError('Password must be at least 6 characters.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}user/reset-password`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ userId: user.userId, newPassword: pwd, modifiedBy: currentUser }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setError(d.message || 'Reset failed.'); return; } onDone(); })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 420 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">Reset Password</div>
                        <div className="pf-header-sub">Setting new password for: <strong>{user.userName}</strong></div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}
                    <div className="pf-row"><div className="pf-field pf-f3">
                        <label>New Password <span className="req">*</span></label>
                        <input className="pf-input" type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="new-password" />
                    </div></div>
                    <div className="pf-row"><div className="pf-field pf-f3">
                        <label>Confirm Password <span className="req">*</span></label>
                        <input className="pf-input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                    </div></div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Reset Password'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Assign Role form (per-user) ───────────────────────────────
const AssignRoleForm = ({ user, roles, onClose, onDone }) => {
    const currentUser = useCurrentUser();
    const [assigned, setAssigned] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(null);
    const [error,    setError]    = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}user/${user.userId}/roles`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setAssigned(Array.isArray(d) ? d.map(r => r.roleId) : []))
            .catch(console.error).finally(() => setLoading(false));
    }, [user.userId]);

    const toggle = async (roleId) => {
        const action = assigned.includes(roleId) ? 'REMOVE' : 'ASSIGN';
        setSaving(roleId); setError('');
        try {
            const res = await fetch(`${variables.API_URL}user/role`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ userId: user.userId, roleId, action, actionBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                // Only reflect the change when the server confirms it — otherwise
                // the checkbox would lie about a role that wasn't actually saved.
                setError(d?.message || 'Failed to update role. Please try again.');
                return;
            }
            setAssigned(prev => action === 'ASSIGN' ? [...prev, roleId] : prev.filter(id => id !== roleId));
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSaving(null);
        }
    };

    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 460 }}>
                <div className="pf-header">
                    <div>
                        <div className="pf-header-title">Assign Roles</div>
                        <div className="pf-header-sub">User: <strong>{user.userName}</strong></div>
                    </div>
                    <button className="pf-close" onClick={onClose}>✕</button>
                </div>
                <div className="pf-body">
                    {error && <div className="pf-err" style={{ marginBottom: 10 }}>{error}</div>}
                    {loading ? (
                        <div style={{ color: '#64748b', fontSize: 13 }}>Loading roles…</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {roles.filter(r => r.isActive).map(role => {
                                const checked = assigned.includes(role.roleId);
                                return (
                                    <label key={role.roleId} style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                                        border: `1px solid ${checked ? '#86efac' : '#e2e8f0'}`,
                                        background: checked ? '#f0fdf4' : '#f8fafc',
                                        transition: 'all .15s',
                                    }}>
                                        <input type="checkbox"
                                            checked={checked}
                                            onChange={() => toggle(role.roleId)}
                                            disabled={saving === role.roleId}
                                            style={{ width: 16, height: 16, accentColor: '#22c55e' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{role.roleName}</div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>{role.roleCode}{role.description ? ` — ${role.description}` : ''}</div>
                                        </div>
                                        {saving === role.roleId && <span style={{ fontSize: 11, color: '#64748b' }}>Saving…</span>}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-pri" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
};

// ── Main list page ────────────────────────────────────────────
const UserManagement = () => {
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();
    const { canDo } = usePermission();
    const canAdd    = canDo('/user-management', 'ADD');
    const canEdit   = canDo('/user-management', 'EDIT');

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('CreatedDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [roles,      setRoles]     = useState([]);

    const [showForm,   setShowForm]  = useState(false);
    const [editUser,   setEditUser]  = useState(null);
    const [resetUser,  setResetUser] = useState(null);
    const [assignUser, setAssignUser]= useState(null);
    const [success,    setSuccess]   = useState('');

    const gridRef = useRef({ pageSize: 20, sortCol: 'CreatedDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    // Load roles for filter/forms
    useEffect(() => {
        fetch(`${variables.API_URL}user/roles`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setRoles(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.roleId)     q.set('roleId',     af.roleId);
        fetch(`${variables.API_URL}user/search?${q}`, { headers: authHeaders() })
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
        registerFilters('user-management', {
            searchText: { label: 'Search',  type: 'text',        placeholder: 'Username, email, name…' },
            status:     { label: 'Status',  type: 'select',      placeholder: 'All Statuses', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Locked', label: 'Locked' }] },
            roleId:     { label: 'Role',    type: 'select',      placeholder: 'All Roles', options: [] },
        }, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('user-management');
    }, []); // eslint-disable-line

    useEffect(() => {
        if (!roles.length) return;
        updateFilterDefs('user-management', {
            searchText: { label: 'Search',  type: 'text',   placeholder: 'Username, email, name…' },
            status:     { label: 'Status',  type: 'select', placeholder: 'All Statuses', options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Locked', label: 'Locked' }] },
            roleId:     { label: 'Role',    type: 'select', placeholder: 'All Roles', options: roles.map(r => ({ value: String(r.roleId), label: r.roleName })) },
        });
    }, [roles]); // eslint-disable-line

    const handleSort = col => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage = p => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = ps => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const Th = ({ col, children }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}>
            <div className="po-th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></div>
        </th>
    );

    const pageNums = () => {
        const range = 5, start = Math.max(1, Math.min(page - 2, totalPages - range + 1));
        return Array.from({ length: Math.min(range, totalPages) }, (_, i) => start + i);
    };

    const handleSaved = () => {
        setShowForm(false); setEditUser(null);
        setSuccess(editUser ? 'User updated successfully.' : 'User created successfully.');
        load(page, pageSize, sortCol, sortDir, applied);
        setTimeout(() => setSuccess(''), 4000);
    };

    return (
        <div className="po-page">
            {showForm && (
                <UserForm editUser={editUser} roles={roles}
                    onClose={() => { setShowForm(false); setEditUser(null); }}
                    onSaved={handleSaved} />
            )}
            {resetUser && (
                <ResetPasswordForm user={resetUser}
                    onClose={() => setResetUser(null)}
                    onDone={() => { setResetUser(null); setSuccess('Password reset successfully.'); setTimeout(() => setSuccess(''), 4000); }} />
            )}
            {assignUser && (
                <AssignRoleForm user={assignUser} roles={roles}
                    onClose={() => setAssignUser(null)}
                    onDone={() => { setAssignUser(null); load(page, pageSize, sortCol, sortDir, applied); }} />
            )}

            {success && (
                <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>
                    ✓ {success}
                </div>
            )}

            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">User Management</div>
                            <div className="po-page-sub">{totalRows} user{totalRows !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            {canAdd && <button className="po-btn-pri" onClick={() => { setEditUser(null); setShowForm(true); }}>
                                + New User
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
                                <Th col="UserCode">Code</Th>
                                <Th col="UserName">Username</Th>
                                <Th col="FullName">Full Name</Th>
                                <Th col="Email">Email</Th>
                                <th>Mobile</th>
                                <Th col="RoleName">Role</Th>
                                <th>Status</th>
                                <Th col="CreatedDate">Created</Th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={9} className="po-empty">No users found. Use the filters or create a new user.</td></tr>
                            ) : rows.map(u => (
                                <tr key={u.userId}>
                                    <td><span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#64748b' }}>{u.userCode || '—'}</span></td>
                                    <td>
                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{u.userName}</span>
                                    </td>
                                    <td style={{ color: '#374151' }}>{u.fullName || '—'}</td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>{u.email || '—'}</td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>{u.mobile || '—'}</td>
                                    <td>
                                        {u.roleName
                                            ? <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{u.roleName}</span>
                                            : <span style={{ color: '#94a3b8', fontSize: 11 }}>No role</span>}
                                    </td>
                                    <td><StatusBadge isActive={u.isActive} isLocked={u.isLocked} /></td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>
                                        {u.createdDate ? new Date(u.createdDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                    <td>
                                        {canEdit && <button className="po-act-btn"
                                            onClick={() => { setEditUser(u); setShowForm(true); }}>Edit</button>}
                                        {canEdit && <button className="po-act-btn"
                                            onClick={() => setResetUser(u)}
                                            style={{ color: '#d97706' }}>Reset Pwd</button>}
                                        <button className="po-act-btn"
                                            onClick={() => setAssignUser(u)}
                                            style={{ color: '#7c3aed' }}>Roles</button>
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

export default UserManagement;
export { UserManagement };

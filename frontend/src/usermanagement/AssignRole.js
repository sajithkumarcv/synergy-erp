import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import '../procurement/Procurement.css';
import AlertModal from '../common/AlertModal';

// ── Assign Roles to Users — standalone page ───────────────────
// Allows searching for a user, then toggling their role assignments.
const AssignRole = () => {
    const [users,       setUsers]       = useState([]);
    const [roles,       setRoles]       = useState([]);
    const [searchText,  setSearchText]  = useState('');
    const [loading,     setLoading]     = useState(false);
    const [selectedUser,setSelectedUser]= useState(null);
    const [userRoles,   setUserRoles]   = useState([]);  // roleIds assigned to selected user
    const [loadingRoles,setLoadingRoles]= useState(false);
    const [saving,      setSaving]      = useState(null);
    const [success,     setSuccess]     = useState('');
    const [alertMsg, setAlertMsg] = useState(null);

    // Load all active roles once
    useEffect(() => {
        fetch(`${variables.API_URL}user/roles`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setRoles(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const searchUsers = useCallback(() => {
        setLoading(true);
        const q = new URLSearchParams({ page: 1, pageSize: 50 });
        if (searchText.trim()) q.set('searchText', searchText.trim());
        fetch(`${variables.API_URL}user/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setUsers(d.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [searchText]);

    useEffect(() => { searchUsers(); }, []); // eslint-disable-line

    const selectUser = (user) => {
        setSelectedUser(user);
        setLoadingRoles(true);
        fetch(`${variables.API_URL}user/${user.userId}/roles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setUserRoles(Array.isArray(d) ? d.map(r => r.roleId) : []))
            .catch(console.error)
            .finally(() => setLoadingRoles(false));
    };

    const toggleRole = async (roleId) => {
        if (!selectedUser) return;
        const action = userRoles.includes(roleId) ? 'REMOVE' : 'ASSIGN';
        setSaving(roleId);
        try {
            const res = await fetch(`${variables.API_URL}user/role`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ userId: selectedUser.userId, roleId, action }),
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to update role.'); return; }
            setUserRoles(prev =>
                action === 'ASSIGN' ? [...prev, roleId] : prev.filter(id => id !== roleId)
            );
            setSuccess(`Role ${action === 'ASSIGN' ? 'assigned' : 'removed'} successfully.`);
            setTimeout(() => setSuccess(''), 3000);
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(null); }
    };

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Assign Roles to Users</div>
                            <div className="po-page-sub">Select a user, then toggle their role assignments.</div>
                        </div>
                    </div>
                </div>

                {success && (
                    <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, margin: '0 0 12px' }}>✓ {success}</div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '16px 0' }}>
                    {/* ── Left: User list ── */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>Users</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input className="pf-input" style={{ flex: 1 }}
                                    placeholder="Search users…"
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchUsers()} />
                                <button className="po-btn-pri" style={{ padding: '6px 14px', fontSize: 12 }} onClick={searchUsers}>Search</button>
                            </div>
                        </div>
                        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                            {loading ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading…</div>
                            ) : users.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No users found.</div>
                            ) : users.map(u => {
                                const isSelected = selectedUser?.userId === u.userId;
                                return (
                                    <div key={u.userId} onClick={() => selectUser(u)}
                                        style={{
                                            padding: '10px 16px', cursor: 'pointer',
                                            borderBottom: '1px solid #f1f5f9',
                                            background: isSelected ? '#eff6ff' : '#fff',
                                            borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                                            transition: 'all .12s',
                                        }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '#fff'; }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#1d4ed8' : '#1e293b' }}>{u.userName}</div>
                                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                            {u.fullName || '—'}
                                            {u.roleName && <span style={{ marginLeft: 8, background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{u.roleName}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Right: Role assignment ── */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                Role Assignments
                                {selectedUser && <span style={{ color: '#1d4ed8', marginLeft: 8, textTransform: 'none', fontWeight: 400 }}>— {selectedUser.userName}</span>}
                            </div>
                        </div>
                        <div style={{ padding: 16, maxHeight: 500, overflowY: 'auto' }}>
                            {!selectedUser ? (
                                <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>
                                    <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
                                    <div style={{ fontSize: 13 }}>Select a user on the left to manage their roles.</div>
                                </div>
                            ) : loadingRoles ? (
                                <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading roles…</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {roles.filter(r => r.isActive).map(role => {
                                        const checked = userRoles.includes(role.roleId);
                                        return (
                                            <label key={role.roleId} style={{
                                                display: 'flex', alignItems: 'flex-start', gap: 12,
                                                padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                                                border: `1px solid ${checked ? '#86efac' : '#e2e8f0'}`,
                                                background: checked ? '#f0fdf4' : '#f8fafc',
                                                transition: 'all .15s',
                                                opacity: saving === role.roleId ? .6 : 1,
                                            }}>
                                                <input type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleRole(role.roleId)}
                                                    disabled={saving !== null}
                                                    style={{ width: 16, height: 16, accentColor: '#22c55e', marginTop: 2 }} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{role.roleName}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                        <span style={{ fontFamily: 'Courier New', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{role.roleCode}</span>
                                                        {role.description && <span style={{ marginLeft: 8 }}>{role.description}</span>}
                                                    </div>
                                                </div>
                                                {saving === role.roleId && <span style={{ fontSize: 11, color: '#64748b' }}>Saving…</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default AssignRole;
export { AssignRole };

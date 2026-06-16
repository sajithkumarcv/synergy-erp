import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { variables, authHeaders } from '../Variable';
import '../procurement/Procurement.css';

// ── Role Permissions — single matrix for a role's full access ────────
// One row per menu. First column toggles sidebar visibility
// (TBL_ROLE_MENU.CanView); remaining columns toggle action permissions
// (TBL_ROLE_MENU_ACTION.IsAllowed) for each ActionCode the menu declares.
// Action columns auto-discover from the SP result, so custom codes
// (APPROVE, POST, CONFIRM, REVISE, EXPORT, …) appear automatically.

const PREFERRED_ORDER = ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'POST', 'CONFIRM', 'PRINT', 'EXPORT', 'EXECUTE'];

const labelFor = (code) => {
    const lc = code.toLowerCase();
    return lc.charAt(0).toUpperCase() + lc.slice(1);
};

// Any actionCode containing an underscore is treated as a sub-grouped action.
// "TAB_BUDGET" → group "TAB",  display "Budget"
// "SECTION_JOB_INFO" → group "SECTION", display "Job info"
// "WIDGET_KPI" → group "WIDGET", display "Kpi"
// The group name becomes a labeled sub-row beneath the menu's main row.

const splitCode = (code) => {
    const i = code.indexOf('_');
    if (i < 0) return { prefix: '', tail: code };
    return { prefix: code.slice(0, i), tail: code.slice(i + 1) };
};

const isSubGrouped = (code) => splitCode(code).prefix !== '';

// Pretty plural label for a sub-row group: "TAB" → "Tabs", "SECTION" → "Sections".
const groupLabel = (prefix) => {
    const w = prefix.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1) + 's';
};

// Friendly chip label: prefer ActionName minus its "Tab: " / "Section: " prefix,
// otherwise derive from the code tail.
const subLabel = (actionName, actionCode) => {
    if (actionName) {
        for (const lead of ['Tab: ', 'Section: ', 'Widget: ']) {
            if (actionName.startsWith(lead)) return actionName.slice(lead.length);
        }
        if (actionName) return actionName;
    }
    const tail = splitCode(actionCode).tail.toLowerCase().replace(/_/g, ' ');
    return tail.charAt(0).toUpperCase() + tail.slice(1);
};

const RolePermissions = () => {
    const [roles,        setRoles]        = useState([]);
    const [selectedRole, setSelectedRole] = useState('');
    const [actionRows,   setActionRows]   = useState([]); // from /permission/action
    const [menuRows,     setMenuRows]     = useState([]); // from /permission/menu
    const [loading,      setLoading]      = useState(false);
    const [saving,       setSaving]       = useState(null); // unique cell key
    const [success,      setSuccess]      = useState('');

    // ── Load active roles ─────────────────────────────────────────
    useEffect(() => {
        fetch(`${variables.API_URL}user/roles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRoles(Array.isArray(d) ? d.filter(r => r.isActive) : []))
            .catch(console.error);
    }, []);

    // ── Load both permission tables for the selected role ─────────
    const loadPermissions = useCallback((roleId) => {
        if (!roleId) { setActionRows([]); setMenuRows([]); return; }
        setLoading(true);
        Promise.all([
            fetch(`${variables.API_URL}permission/action/${roleId}`, { headers: authHeaders() }).then(r => r.json()),
            fetch(`${variables.API_URL}permission/menu/${roleId}`,   { headers: authHeaders() }).then(r => r.json()),
        ])
            .then(([acts, mns]) => {
                setActionRows(Array.isArray(acts) ? acts : []);
                setMenuRows(Array.isArray(mns)  ? mns  : []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { loadPermissions(selectedRole); }, [selectedRole, loadPermissions]);

    // ── Pivot into a unified menu map ─────────────────────────────
    // Each menu carries:
    //   - canView      → sidebar visibility (TBL_ROLE_MENU)
    //   - actions      → map of actionCode → action row (TBL_ROLE_MENU_ACTION)
    // We split action codes into two buckets so the main matrix stays narrow:
    //   - CORE codes   → main columns (View, Add, Edit, Delete, Approve, …)
    //   - TAB_* codes  → sub-row chips below the menu row
    const { menus, coreCodes } = useMemo(() => {
        const byMenu = new Map();
        const coreSet = new Set();

        for (const m of menuRows) {
            byMenu.set(m.menuId, {
                menuId:      m.menuId,
                menuName:    m.menuName,
                menuUrl:     m.menuUrl,
                sectionName: m.sectionName || m.parentMenuName || 'Top Level',
                canView:     !!m.canView,
                actions:     {},
            });
        }

        for (const r of actionRows) {
            if (!byMenu.has(r.menuId)) {
                byMenu.set(r.menuId, {
                    menuId:      r.menuId,
                    menuName:    r.menuName,
                    menuUrl:     r.menuUrl,
                    sectionName: r.sectionName || r.parentMenuName || 'Top Level',
                    canView:     false,
                    actions:     {},
                });
            }
            byMenu.get(r.menuId).actions[r.actionCode] = r;
            // Any underscored prefix (TAB_, SECTION_, …) is a sub-grouped action.
            if (!isSubGrouped(r.actionCode)) coreSet.add(r.actionCode);
        }

        const known  = PREFERRED_ORDER.filter(c => coreSet.has(c));
        const extras = [...coreSet].filter(c => !PREFERRED_ORDER.includes(c)).sort();
        return { menus: [...byMenu.values()], coreCodes: [...known, ...extras] };
    }, [actionRows, menuRows]);

    // ── Group menus by sectionName for visual sections ────────────
    // sectionName is "Parent" for 2-level menus and
    // "GrandParent › Parent" for 3-level menus (e.g. "Reports › Procurement")
    // so report sub-groups never mix with their operational counterparts.
    const grouped = useMemo(() => {
        const g = new Map();
        for (const m of menus) {
            const key = m.sectionName || 'Top Level';
            if (!g.has(key)) g.set(key, []);
            g.get(key).push(m);
        }
        return [...g.entries()];
    }, [menus]);

    // ── Toggle sidebar visibility (CanView in TBL_ROLE_MENU) ──────
    const toggleSidebar = (menu) => {
        if (!selectedRole || saving !== null) return;
        const key = `sidebar_${menu.menuId}`;
        const newVal = !menu.canView;
        setSaving(key);

        // Optimistic
        setMenuRows(prev => prev.map(m =>
            m.menuId === menu.menuId ? { ...m, canView: newVal } : m
        ));

        fetch(`${variables.API_URL}permission/menu`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ roleId: parseInt(selectedRole), menuId: menu.menuId, canView: newVal }),
        })
            .then(r => r.json())
            .then(() => {
                setSuccess('Sidebar visibility updated.');
                setTimeout(() => setSuccess(''), 2500);
            })
            .catch(err => {
                console.error(err);
                setMenuRows(prev => prev.map(m =>
                    m.menuId === menu.menuId ? { ...m, canView: menu.canView } : m
                ));
            })
            .finally(() => setSaving(null));
    };

    // ── Toggle one action permission ──────────────────────────────
    const toggleAction = (menu, actionRow) => {
        if (!selectedRole || saving !== null) return;
        const key = `act_${menu.menuId}_${actionRow.actionId}`;
        const newVal = !actionRow.isAllowed;
        setSaving(key);

        setActionRows(prev => prev.map(r =>
            r.menuId === menu.menuId && r.actionId === actionRow.actionId
                ? { ...r, isAllowed: newVal } : r
        ));

        fetch(`${variables.API_URL}permission/action`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                roleId:    parseInt(selectedRole),
                menuId:    menu.menuId,
                actionId:  actionRow.actionId,
                isAllowed: newVal,
            }),
        })
            .then(r => r.json())
            .then(() => {
                setSuccess('Permission updated.');
                setTimeout(() => setSuccess(''), 2500);
            })
            .catch(err => {
                console.error(err);
                setActionRows(prev => prev.map(r =>
                    r.menuId === menu.menuId && r.actionId === actionRow.actionId
                        ? { ...r, isAllowed: actionRow.isAllowed } : r
                ));
            })
            .finally(() => setSaving(null));
    };

    // ── Grant / revoke all actions on a single menu row ───────────
    const toggleAllForMenu = (menu, newVal) => {
        Object.values(menu.actions).forEach(ar => {
            if (ar.isAllowed !== newVal) toggleAction(menu, ar);
        });
    };

    const selectedRoleName = roles.find(r => r.roleId === parseInt(selectedRole))?.roleName || '';

    return (
        <div className="po-page">
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Role Permissions</div>
                            <div className="po-page-sub">Control sidebar visibility and per-action permissions for each role.</div>
                        </div>
                    </div>
                </div>

                {success && (
                    <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, margin: '0 0 12px' }}>✓ {success}</div>
                )}

                {/* Role selector */}
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>Select Role</label>
                        <select
                            className="pf-input"
                            style={{ maxWidth: 320 }}
                            value={selectedRole}
                            onChange={e => setSelectedRole(e.target.value)}>
                            <option value="">— Choose a role —</option>
                            {roles.map(r => (
                                <option key={r.roleId} value={r.roleId}>{r.roleName} ({r.roleCode})</option>
                            ))}
                        </select>
                        {selectedRole && (
                            <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>
                                Showing permissions for <strong>{selectedRoleName}</strong>
                            </span>
                        )}
                    </div>
                </div>

                {/* Permissions matrix */}
                {!selectedRole ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🔐</div>
                        <div style={{ fontSize: 14 }}>Select a role above to configure its permissions.</div>
                    </div>
                ) : loading ? (
                    <div style={{ position: 'relative', minHeight: 120 }}>
                        <div className="po-loading-overlay"><div className="po-spinner-ring" /></div>
                    </div>
                ) : menus.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                        No menus configured in the system.
                    </div>
                ) : (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'auto', maxHeight: 'calc(100vh - 230px)' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', position: 'sticky', top: 0, left: 0, zIndex: 4, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', boxShadow: '2px 0 0 #e2e8f0' }}>Menu</th>
                                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', minWidth: 80, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3, background: '#eff6ff', borderBottom: '2px solid #e2e8f0' }}
                                        title="Whether the menu appears in the sidebar at all">
                                        Sidebar
                                    </th>
                                    {coreCodes.map(code => (
                                        <th key={code} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', minWidth: 70, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            {labelFor(code)}
                                        </th>
                                    ))}
                                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', minWidth: 80, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 3, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>All actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grouped.map(([sectionName, sectionMenus]) => (
                                    <React.Fragment key={sectionName}>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            <td colSpan={coreCodes.length + 3} style={{ padding: '7px 16px', fontWeight: 700, fontSize: 11.5, color: '#475569', letterSpacing: '.04em', position: 'sticky', top: 41, zIndex: 2, background: '#eef2f7', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                                {sectionName.includes(' › ') ? (
                                                    <>
                                                        <span style={{ color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' }}>
                                                            {sectionName.split(' › ')[0]}
                                                        </span>
                                                        <span style={{ color: '#94a3b8', margin: '0 6px' }}>›</span>
                                                        <span style={{ color: '#334155', textTransform: 'uppercase' }}>
                                                            {sectionName.split(' › ')[1]}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span style={{ textTransform: 'uppercase' }}>{sectionName}</span>
                                                )}
                                            </td>
                                        </tr>
                                        {sectionMenus.map((menu, idx) => {
                                            const actionList = Object.values(menu.actions);
                                            const allAllowed = actionList.length > 0 && actionList.every(a => a.isAllowed);
                                            const sidebarKey = `sidebar_${menu.menuId}`;
                                            const sidebarSaving = saving === sidebarKey;
                                            // Group sub-actions by prefix → { TAB: [...], SECTION: [...] }
                                            const subGroups = {};
                                            for (const a of actionList) {
                                                if (!isSubGrouped(a.actionCode)) continue;
                                                const p = splitCode(a.actionCode).prefix;
                                                (subGroups[p] = subGroups[p] || []).push(a);
                                            }
                                            const subGroupEntries = Object.entries(subGroups)
                                                .sort(([a], [b]) => a.localeCompare(b));
                                            subGroupEntries.forEach(([, list]) =>
                                                list.sort((a, b) => a.actionCode.localeCompare(b.actionCode))
                                            );
                                            const hasSubRows = subGroupEntries.length > 0;
                                            return (
                                                <React.Fragment key={menu.menuId}>
                                                    <tr style={{
                                                        borderBottom: hasSubRows ? 'none' : '1px solid #f1f5f9',
                                                        background: idx % 2 === 0 ? '#fff' : '#fafeff',
                                                    }}>
                                                        <td style={{ padding: '9px 16px 9px 28px', color: '#1e293b', fontWeight: 500, position: 'sticky', left: 0, zIndex: 1, background: idx % 2 === 0 ? '#fff' : '#fafeff', boxShadow: '2px 0 0 #f1f5f9' }}>
                                                            {menu.menuName}
                                                            {menu.menuUrl && (
                                                                <span style={{ marginLeft: 8, fontFamily: 'Courier New', background: '#f1f5f9', color: '#64748b', borderRadius: 3, padding: '1px 5px', fontSize: 10.5 }}>{menu.menuUrl}</span>
                                                            )}
                                                        </td>
                                                        {/* Sidebar (CanView) column */}
                                                        <td style={{ textAlign: 'center', padding: '9px 8px', background: '#eff6ff' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!menu.canView}
                                                                onChange={() => toggleSidebar(menu)}
                                                                disabled={saving !== null}
                                                                style={{ width: 15, height: 15, accentColor: '#2563eb', cursor: saving !== null ? 'not-allowed' : 'pointer', opacity: sidebarSaving ? 0.5 : 1 }}
                                                            />
                                                        </td>
                                                        {/* Core action columns */}
                                                        {coreCodes.map(code => {
                                                            const ar = menu.actions[code];
                                                            if (!ar) {
                                                                return <td key={code} style={{ textAlign: 'center', padding: '9px 8px', color: '#cbd5e1' }}>—</td>;
                                                            }
                                                            const cellKey  = `act_${menu.menuId}_${ar.actionId}`;
                                                            const isSaving = saving === cellKey;
                                                            return (
                                                                <td key={code} style={{ textAlign: 'center', padding: '9px 8px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!ar.isAllowed}
                                                                        onChange={() => toggleAction(menu, ar)}
                                                                        disabled={saving !== null}
                                                                        style={{ width: 15, height: 15, accentColor: '#6366f1', cursor: saving !== null ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.5 : 1 }}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                        {/* Grant / Revoke all actions */}
                                                        <td style={{ textAlign: 'center', padding: '9px 8px' }}>
                                                            {actionList.length > 0 ? (
                                                                <button
                                                                    onClick={() => toggleAllForMenu(menu, !allAllowed)}
                                                                    disabled={saving !== null}
                                                                    style={{
                                                                        fontSize: 10.5, padding: '3px 8px', border: '1px solid #e2e8f0', borderRadius: 4,
                                                                        background: allAllowed ? '#fee2e2' : '#f0fdf4',
                                                                        color:      allAllowed ? '#dc2626' : '#16a34a',
                                                                        cursor: saving !== null ? 'not-allowed' : 'pointer',
                                                                        fontWeight: 600,
                                                                    }}>
                                                                    {allAllowed ? 'Revoke all' : 'Grant all'}
                                                                </button>
                                                            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                        </td>
                                                    </tr>

                                                    {/* One sub-row per underscored prefix group (TAB, SECTION, …) */}
                                                    {subGroupEntries.map(([prefix, group], gIdx) => {
                                                        const allOn = group.every(a => a.isAllowed);
                                                        const isLast = gIdx === subGroupEntries.length - 1;
                                                        const label = groupLabel(prefix);
                                                        return (
                                                            <tr key={`${menu.menuId}_${prefix}`} style={{
                                                                borderBottom: isLast ? '1px solid #f1f5f9' : 'none',
                                                                background: idx % 2 === 0 ? '#fff' : '#fafeff',
                                                            }}>
                                                                <td colSpan={coreCodes.length + 3} style={{ padding: `0 16px ${isLast ? 12 : 6}px 44px` }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', minWidth: 70 }}>
                                                                            {label}
                                                                        </span>
                                                                        {group.map(ar => {
                                                                            const cellKey  = `act_${menu.menuId}_${ar.actionId}`;
                                                                            const isSaving = saving === cellKey;
                                                                            const on = !!ar.isAllowed;
                                                                            return (
                                                                                <button
                                                                                    key={ar.actionId}
                                                                                    type="button"
                                                                                    onClick={() => toggleAction(menu, ar)}
                                                                                    disabled={saving !== null}
                                                                                    title={ar.actionCode}
                                                                                    style={{
                                                                                        fontSize: 11, padding: '3px 9px',
                                                                                        border: `1px solid ${on ? '#6366f1' : '#e2e8f0'}`,
                                                                                        borderRadius: 12,
                                                                                        background: on ? '#eef2ff' : '#fff',
                                                                                        color: on ? '#3730a3' : '#64748b',
                                                                                        fontWeight: 600,
                                                                                        cursor: saving !== null ? 'not-allowed' : 'pointer',
                                                                                        opacity: isSaving ? 0.5 : 1,
                                                                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                                                                    }}>
                                                                                    <span style={{ fontSize: 10 }}>{on ? '✓' : '○'}</span>
                                                                                    {subLabel(ar.actionName, ar.actionCode)}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => group.forEach(ar => {
                                                                                if (ar.isAllowed !== !allOn) toggleAction(menu, ar);
                                                                            })}
                                                                            disabled={saving !== null}
                                                                            style={{
                                                                                marginLeft: 'auto',
                                                                                fontSize: 10.5, padding: '3px 9px',
                                                                                border: '1px solid #e2e8f0', borderRadius: 4,
                                                                                background: allOn ? '#fee2e2' : '#f0fdf4',
                                                                                color:      allOn ? '#dc2626' : '#16a34a',
                                                                                cursor: saving !== null ? 'not-allowed' : 'pointer',
                                                                                fontWeight: 600,
                                                                            }}>
                                                                            {allOn ? `Revoke all ${label.toLowerCase()}` : `Grant all ${label.toLowerCase()}`}
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RolePermissions;
export { RolePermissions };

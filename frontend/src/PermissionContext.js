import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from './Variable';
import { useAuth } from './AuthContext';

// ── Shape ────────────────────────────────────────────────────────────────────
// menus  : [{ menuId, parentMenuId, menuName, menuUrl, menuIcon, menuOrder }]
// actions: [{ actionId, menuId, actionName, actionCode, isAllowed }]
//
// Hooks:
//   usePermission()          → { menus, actions, loaded, reload }
//   useCanDo(menuUrl, code)  → bool  — is the given action allowed?
//   useHasMenu(url)          → bool  — is this URL in the user's menu?
// ─────────────────────────────────────────────────────────────────────────────

const PermissionContext = createContext(null);

export const PermissionProvider = ({ children }) => {
    const { auth } = useAuth();

    const [menus,   setMenus]   = useState([]);
    const [actions, setActions] = useState([]);
    const [loaded,  setLoaded]  = useState(false);

    const load = useCallback(async (userId) => {
        if (!userId) { setMenus([]); setActions([]); setLoaded(false); return; }
        try {
            const res = await fetch(
                `${variables.API_URL}menu/user/${userId}`,
                { headers: authHeaders() }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const d = await res.json();
            setMenus(d.menus   || []);
            setActions(d.actions || []);
        } catch (e) {
            console.error('[PermissionContext] Failed to load menus:', e);
            setMenus([]);
            setActions([]);
        } finally {
            setLoaded(true);
        }
    }, []);

    // Reload whenever the logged-in user changes
    useEffect(() => {
        if (auth?.userId) {
            load(auth.userId);
        } else {
            setMenus([]); setActions([]); setLoaded(false);
        }
    }, [auth?.userId, load]);

    // Auto-refresh permissions when the tab regains focus.
    // This lets a user pick up role-permission changes made by an admin in
    // another window without having to log out and back in.
    useEffect(() => {
        if (!auth?.userId) return;
        const onFocus = () => load(auth.userId);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [auth?.userId, load]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    // Does this path exist in the user's permitted menus?
    const hasMenu = (url) => {
        if (!url || url === '#') return false;
        return menus.some(m => m.menuUrl === url);
    };

    // Is this URL reachable (direct match or prefix of a permitted menu URL)?
    const canAccessPath = (path) => {
        if (path === '/') return true;
        return menus.some(m => m.menuUrl && (
            path === m.menuUrl ||
            path.startsWith(m.menuUrl + '/')
        ));
    };

    // Is a specific action allowed for a given menu URL?
    const canDo = (menuUrl, actionCode) => {
        const menu = menus.find(m => m.menuUrl === menuUrl);
        if (!menu) return false;
        const act = actions.find(a => a.menuId === menu.menuId && a.actionCode === actionCode);
        return act?.isAllowed === true;
    };

    // All action codes allowed for a menu URL (useful for conditional button rendering)
    const allowedActions = (menuUrl) => {
        const menu = menus.find(m => m.menuUrl === menuUrl);
        if (!menu) return [];
        return actions
            .filter(a => a.menuId === menu.menuId && a.isAllowed)
            .map(a => a.actionCode);
    };

    return (
        <PermissionContext.Provider value={{
            menus, actions, loaded,
            reload: () => auth?.userId && load(auth.userId),
            hasMenu,
            canAccessPath,
            canDo,
            allowedActions,
        }}>
            {children}
        </PermissionContext.Provider>
    );
};

export const usePermission   = () => useContext(PermissionContext);
export const useHasMenu      = (url)              => useContext(PermissionContext)?.hasMenu(url)          ?? false;
export const useCanDo        = (menuUrl, code)    => useContext(PermissionContext)?.canDo(menuUrl, code)  ?? false;
export const useCanAccessPath = (path)            => useContext(PermissionContext)?.canAccessPath(path)   ?? true;

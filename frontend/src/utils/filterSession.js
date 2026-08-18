// ─────────────────────────────────────────────────────────────
// filterSession
//
// Remembers each list page's applied filters for the length of the
// browser-tab session, so drilling into a record and coming back doesn't
// throw away the search you just set up (open Jobs → filter → click a Job
// No. → back → the filter is still applied).
//
// Storage is sessionStorage, matching the auth strategy in AuthContext:
// per-tab, survives a reload / back-forward navigation, and dies with the
// tab. Cleared on sign-out (see clearSession in AuthContext) so the next
// user on the same machine starts clean.
//
// Written by FilterContext (register / apply / clear) and read back by
// useInitialFilters(defaults, pageKey) — a page opts in simply by passing
// its page key, which must be the same key it hands to registerFilters().
// ─────────────────────────────────────────────────────────────

const PREFIX = 'erp_filters:';

export const loadFilters = (page) => {
    if (!page) return null;
    try {
        const raw = sessionStorage.getItem(PREFIX + page);
        if (!raw) return null;
        const vals = JSON.parse(raw);
        return vals && typeof vals === 'object' ? vals : null;
    } catch {
        return null;   // corrupt entry — behave as if nothing was saved
    }
};

// True when this page has a remembered snapshot in this session. Lets a page
// distinguish "user cleared this filter" from "first visit, apply my default"
// — both look like an empty value in the restored object.
export const hasSavedFilters = (page) => loadFilters(page) !== null;

export const saveFilters = (page, vals) => {
    if (!page) return;
    try { sessionStorage.setItem(PREFIX + page, JSON.stringify(vals || {})); } catch {}
};

export const clearSavedFilters = (page) => {
    if (!page) return;
    try { sessionStorage.removeItem(PREFIX + page); } catch {}
};

// Wipe every page's snapshot — called on sign-out.
export const clearAllSavedFilters = () => {
    try {
        Object.keys(sessionStorage)
            .filter(k => k.startsWith(PREFIX))
            .forEach(k => sessionStorage.removeItem(k));
    } catch {}
};

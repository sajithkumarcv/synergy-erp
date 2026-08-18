import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { loadFilters } from './filterSession';

/**
 * Seeds a list page's filters from navigation state set by whoever linked
 * here with an implied filter (dashboard KPI tiles, "Draft PR" counts, etc.):
 *
 *   navigate('/purchase-requests', { state: { initialFilters: { status: 'Draft' } } });
 *
 * Captured once per mount via useRef — later edits to the filter panel are
 * never clobbered by this, and a plain revisit of the route (sidebar nav,
 * browser back/forward without state, a hard refresh) has no
 * `location.state`, so it falls back to `defaults` untouched.
 *
 * See [[weberp-synergy-fork]] — dashboard tiles previously linked to the
 * unfiltered list page even though the tile itself represented a filtered
 * count (e.g. "Open PRs" → all PRs, not just open ones).
 *
 * ── Session persistence ──────────────────────────────────────
 * Pass `pageKey` (the same key the page gives registerFilters) to opt into
 * remembering the last applied filters for this browser tab, so drilling
 * into a record and coming back keeps the search alive. Precedence:
 *
 *   location.state.initialFilters  →  saved session snapshot  →  defaults
 *
 * A tile-supplied filter set wins outright and is NOT merged with whatever
 * was remembered: the tile represents one specific filtered count, and
 * mixing a leftover Customer/date filter into it would show fewer rows
 * than the number the user clicked. Omit `pageKey` to keep the old
 * defaults-only behaviour.
 */
export const useInitialFilters = (defaults, pageKey) => {
    const location = useLocation();
    return useRef(
        location.state?.initialFilters
            ? { ...defaults, ...location.state.initialFilters }
            : { ...defaults, ...(loadFilters(pageKey) || {}) }
    ).current;
};

export default useInitialFilters;

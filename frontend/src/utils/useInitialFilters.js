import { useRef } from 'react';
import { useLocation } from 'react-router-dom';

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
 */
export const useInitialFilters = (defaults) => {
    const location = useLocation();
    return useRef({ ...defaults, ...(location.state?.initialFilters || {}) }).current;
};

export default useInitialFilters;

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────
// FilterContext
//
// Shared between Layout (renders the vertical filter panel)
// and page components (consume the active filters to query).
//
// Each page registers its own filter definition.
// Layout renders whichever definition matches the current route.
// ─────────────────────────────────────────────────────────────

const FilterContext = createContext(null);

export const DEFAULT_CUSTOMER_FILTERS = {
    searchText:     '',
    categoryId:     '',
    customerType:   '',
    currencyId:     '',
    paymentTermsId: '',
    isActive:       '',
    creditFlag:     '',
    creditHold:     '',
};

export const FilterProvider = ({ children }) => {
    // Which page's filters are currently active
    const [activePage, setActivePage]     = useState(null);      // e.g. 'customer'
    const [filterDefs, setFilterDefs]     = useState({});        // page → filter field definitions
    const [filterValues, setFilterValues] = useState({});        // page → current values (pending)
    const [applied, setApplied]           = useState({});        // page → applied values (fired)
    // onApply callbacks are stored in a ref — NOT state — so storing/updating them
    // never triggers a re-render (which would otherwise create an infinite loop in
    // pages that call registerFilters inside a useEffect with lookup-array deps).
    const onApplyRef = useRef({});

    // Called by a page component when it mounts to register its filters
    const registerFilters = useCallback((page, defs, defaultValues, onApply) => {
        onApplyRef.current[page] = onApply;           // store callback without re-rendering
        setActivePage(page);
        setFilterDefs(prev    => ({ ...prev,    [page]: defs }));
        setFilterValues(prev  => ({ ...prev,    [page]: { ...defaultValues } }));
        setApplied(prev       => ({ ...prev,    [page]: { ...defaultValues } }));
    }, []);

    // Called by a page when it unmounts
    const unregisterFilters = useCallback((page) => {
        setActivePage(p => p === page ? null : p);
    }, []);

    // Patch only the filter definitions for a page (does NOT reset values/applied)
    const updateFilterDefs = useCallback((page, defs) => {
        setFilterDefs(prev => ({ ...prev, [page]: defs }));
    }, []);

    // Update a single filter value (pending — not yet applied)
    const setFilter = useCallback((page, key, value) => {
        setFilterValues(prev => ({
            ...prev,
            [page]: { ...prev[page], [key]: value }
        }));
    }, []);

    // Apply pending filters → fires the page's onApply callback
    const applyFilters = useCallback((page) => {
        const vals = filterValues[page] || {};
        setApplied(prev => ({ ...prev, [page]: { ...vals } }));
        if (onApplyRef.current[page]) onApplyRef.current[page](vals);
    }, [filterValues]);

    // Clear all filters for a page
    const clearFilters = useCallback((page) => {
        const defs = filterDefs[page] || {};
        const empty = Object.fromEntries(Object.keys(defs).map(k => [k, '']));
        setFilterValues(prev => ({ ...prev, [page]: empty }));
        setApplied(prev      => ({ ...prev, [page]: empty }));
        if (onApplyRef.current[page]) onApplyRef.current[page](empty);
    }, [filterDefs]);

    // Count active (non-empty) applied filters for a page
    const activeCount = useCallback((page) => {
        const vals = applied[page] || {};
        return Object.values(vals).filter(v => v !== '').length;
    }, [applied]);

    return (
        <FilterContext.Provider value={{
            activePage,
            filterDefs,
            filterValues,
            applied,
            registerFilters,
            unregisterFilters,
            updateFilterDefs,
            setFilter,
            applyFilters,
            clearFilters,
            activeCount,
        }}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilters = () => {
    const ctx = useContext(FilterContext);
    if (!ctx) throw new Error('useFilters must be inside <FilterProvider>');
    return ctx;
};

export default FilterContext;

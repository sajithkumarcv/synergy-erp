import { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';

// Module-level cache — fetched once per browser session, shared across all callers.
let _cache = null;
let _promise = null;

const fetchOwner = () => {
    if (_promise) return _promise;
    _promise = fetch(`${variables.API_URL}company/owner`, { headers: authHeaders() })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => { _cache = d; return d; })
        .catch(err => { _promise = null; throw err; });
    return _promise;
};

export const clearOwnerCompanyCache = () => { _cache = null; _promise = null; };

/**
 * Returns { company, loading, error, refetch }
 */
const useOwnerCompany = () => {
    const [company, setCompany] = useState(_cache);
    const [loading, setLoading] = useState(!_cache);
    const [error,   setError]   = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        fetchOwner()
            .then(d => { setCompany(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, []);

    useEffect(() => {
        if (_cache) { setCompany(_cache); setLoading(false); return; }
        load();
    }, []); // eslint-disable-line

    const refetch = useCallback(() => {
        clearOwnerCompanyCache();
        load();
    }, [load]);

    return { company, loading, error, refetch };
};

export default useOwnerCompany;

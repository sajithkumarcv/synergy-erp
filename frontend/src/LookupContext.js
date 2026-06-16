import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from './Variable';

const LookupContext = createContext(null);

export const LookupProvider = ({ children }) => {
    const [vlist, setVlist]                   = useState({});
    const [appSettings, setAppSettings]       = useState({}); // { 'Biz.X': 'value' } — non-secret business constants
    const [documentStatuses, setDocumentStatuses] = useState({}); // { MODULE: [DocumentStatus] }
    const [lookups, setLookups] = useState({
        countries:          [],
        currencies:         [],
        paymentTerms:       [],
        deliveryTerms:      [],
        customerCategories: [],
        items:              [],
        uoms:               [],
        jobStatuses:        [],
        expenseCategories:  [],
        budgetCategories:   [],
    });
    const [ready, setReady] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const headers = authHeaders();

            // All fired in ONE parallel batch — no sequential waterfalls
            const [vlistRes, countryRes, currencyRes, payTermRes, dlvTermRes, custCatRes, itemsRes, uomsRes, jobStatusRes, docStatusRes, expCatRes, budgetCatRes] = await Promise.all([
                fetch(variables.API_URL + 'Lookup/vlist',                                      { headers }),
                fetch(variables.API_URL + 'Lookup/country',                                    { headers }),
                fetch(variables.API_URL + 'Lookup/currency-rates',                             { headers }),
                fetch(variables.API_URL + 'Lookup/paymentterms',                               { headers }),
                fetch(variables.API_URL + 'Lookup/deliveryterms',                              { headers }),
                fetch(variables.API_URL + 'Lookup/customercategory',                           { headers }),
                fetch(variables.API_URL + 'item/search?pageSize=500&isActive=true&sortCol=ItemName&sortDir=ASC&page=1', { headers }),
                fetch(variables.API_URL + 'item/uoms',                                         { headers }),
                fetch(variables.API_URL + 'Lookup/jobstatus',                                  { headers }),
                fetch(variables.API_URL + 'documentstatus',                                    { headers }),
                fetch(variables.API_URL + 'Lookup/expensecategories',                          { headers }),
                fetch(variables.API_URL + 'Lookup/budgetcategories',                           { headers }),
            ]);

            const [vlistData, countries, currencies, paymentTerms, deliveryTerms, customerCategories, itemsData, uomsData, jobStatusData, docStatusData, expCatData, budgetCatData] = await Promise.all([
                vlistRes.ok       ? vlistRes.json()    : {},
                countryRes.ok     ? countryRes.json()  : [],
                currencyRes.ok    ? currencyRes.json() : [],
                payTermRes.ok     ? payTermRes.json()  : [],
                dlvTermRes.ok     ? dlvTermRes.json()  : [],
                custCatRes.ok     ? custCatRes.json()  : [],
                itemsRes.ok       ? itemsRes.json()    : { data: [] },
                uomsRes.ok        ? uomsRes.json()     : [],
                jobStatusRes.ok   ? jobStatusRes.json(): [],
                docStatusRes.ok   ? docStatusRes.json(): [],
                expCatRes.ok      ? expCatRes.json()   : [],
                budgetCatRes.ok   ? budgetCatRes.json(): [],
            ]);

            // items endpoint returns paged result; extract .data array and map to id/name/code
            const itemsRaw        = itemsData?.data || (Array.isArray(itemsData) ? itemsData : []);
            const items           = itemsRaw.map(i => ({ id: i.itemId, name: i.itemName || i.itemNameEn || '', code: i.itemCode || '' }));
            const uoms            = (Array.isArray(uomsData) ? uomsData : []).map(u => ({ id: u.uomId, name: u.uomName || u.uomCode || '' }));
            const jobStatuses     = (Array.isArray(jobStatusData) ? jobStatusData : []).map(s => ({ id: s.id, name: s.name }));
            const expenseCategories = Array.isArray(expCatData)    ? expCatData    : [];
            const budgetCategories  = Array.isArray(budgetCatData) ? budgetCatData : [];

            // Group document statuses by moduleName: { PR: [...], PO: [...] }
            const docStatusArr = Array.isArray(docStatusData) ? docStatusData : [];
            const docStatusMap = docStatusArr.reduce((acc, s) => {
                const mod = (s.moduleName || '').toUpperCase();
                if (!acc[mod]) acc[mod] = [];
                acc[mod].push(s);
                return acc;
            }, {});

            console.log('[LookupContext] loaded — vlist groups:', Object.keys(vlistData).length,
                '| countries:', countries.length,
                '| currencies:', currencies.length,
                '| payTerms:', paymentTerms.length,
                '| deliveryTerms:', deliveryTerms.length,
                '| custCategories:', customerCategories.length,
                '| items:', items.length,
                '| uoms:', uoms.length,
                '| jobStatuses:', jobStatuses.length,
                '| docStatuses:', docStatusArr.length,
                '| expenseCategories:', expenseCategories.length,
                '| budgetCategories:', budgetCategories.length);

            setVlist(vlistData);
            setDocumentStatuses(docStatusMap);
            setLookups({ countries, currencies, paymentTerms, deliveryTerms, customerCategories, items, uoms, jobStatuses, expenseCategories, budgetCategories });

            // Non-secret business constants (Biz.*) — never returns SMTP/secrets (prefix fixed server-side)
            try {
                const asRes = await fetch(variables.API_URL + 'appsettings/public', { headers });
                if (asRes.ok) setAppSettings(await asRes.json() || {});
            } catch { /* non-blocking */ }

            setReady(true);
        } catch (e) {
            console.error('[LookupContext] load error:', e);
            setError(e.message);
            setReady(true); // don't block the app on lookup failure
        }
    }, []);

    // Trigger load once on mount
    useEffect(() => { load(); }, [load]);

    // Manual refresh (e.g. after admin adds a new VLIST item)
    const refresh = useCallback(() => { setReady(false); load(); }, [load]);

    // Safe helper — never throws, always returns array.
    // Coerces any non-array value (object / null / undefined) to [] so callers
    // can always .map/.find/.length without a runtime crash.
    const getVList = useCallback((typeName, listName) => {
        const v = vlist[`${typeName}.${listName}`];
        return Array.isArray(v) ? v : [];
    }, [vlist]);

    // Base currency is data-driven (IsBaseCurrency=1) — never hardcode 'AED'.
    // Deployments in other countries simply flag a different base currency.
    const baseCurrency = (lookups.currencies || []).find(c => c.isBaseCurrency) || null;
    const baseCurrencyCode = baseCurrency?.shortName || '';

    // Read a non-secret business constant, e.g. getSetting('Biz.Tax.DefaultVatRate', '5').
    // Always returns a string (or the fallback) — callers coerce as needed.
    const getSetting = useCallback((key, fallback = null) => {
        const v = appSettings[key];
        return v != null && v !== '' ? v : fallback;
    }, [appSettings]);

    // Returns statuses for a module as an array, sorted by SortOrder
    const getModuleStatuses = useCallback((module) => {
        return documentStatuses[(module || '').toUpperCase()] || [];
    }, [documentStatuses]);

    // Returns a single status config object, or null if not found.
    // Shape: { statusCode, statusLabel, badgeBg, badgeColor, badgeDot,
    //          canEdit, canDelete, canUploadDocs, isInitial, isTerminal,
    //          allowedTransitions: string[], sortOrder }
    const getStatusConfig = useCallback((module, statusCode) => {
        const list = documentStatuses[(module || '').toUpperCase()] || [];
        const s = list.find(x => x.statusCode === statusCode);
        if (!s) return null;
        return {
            statusCode:         s.statusCode,
            statusLabel:        s.statusLabel,
            badgeBg:            s.badgeBg,
            badgeColor:         s.badgeColor,
            badgeDot:           s.badgeDot,
            canEdit:            s.canEdit,
            canDelete:          s.canDelete,
            canUploadDocs:      s.canUploadDocs,
            isInitial:          s.isInitial,
            isTerminal:         s.isTerminal,
            allowedTransitions: s.allowedTransitions
                ? s.allowedTransitions.split(',').map(t => t.trim()).filter(Boolean)
                : [],
            sortOrder:          s.sortOrder,
        };
    }, [documentStatuses]);

    return (
        <LookupContext.Provider value={{ vlist, lookups, appSettings, documentStatuses, ready, error, getVList, getSetting, getModuleStatuses, getStatusConfig, refresh, baseCurrency, baseCurrencyCode }}>
            {children}
        </LookupContext.Provider>
    );
};

export const useLookup = () => {
    const ctx = useContext(LookupContext);
    if (!ctx) throw new Error('useLookup must be used inside <LookupProvider>');
    return ctx;
};

export default LookupContext;

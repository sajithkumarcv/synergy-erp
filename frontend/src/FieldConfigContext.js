import React, { createContext, useContext, useState, useEffect } from 'react';
import { variables, authHeaders } from './Variable';

// config shape: { [FORM_KEY]: Set<fieldKey> }
const FieldConfigContext = createContext({});

export const FieldConfigProvider = ({ children }) => {
    const [config, setConfig] = useState({});

    useEffect(() => {
        fetch(`${variables.API_URL}fieldconfig`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(rows => {
                const map = {};
                rows.forEach(({ formKey, fieldKey, isRequired }) => {
                    if (!isRequired) return;
                    if (!map[formKey]) map[formKey] = new Set();
                    map[formKey].add(fieldKey);
                });
                setConfig(map);
            })
            .catch(console.error);
    }, []); // eslint-disable-line

    return (
        <FieldConfigContext.Provider value={config}>
            {children}
        </FieldConfigContext.Provider>
    );
};

/**
 * useFieldConfig(formKey)
 * Returns { isReq } where isReq(fieldKey) → bool.
 *
 * Usage:
 *   const { isReq } = useFieldConfig('PR');
 *   <label>PR Date {isReq('prDate') && <span className="req">*</span>}</label>
 */
export const useFieldConfig = (formKey) => {
    const config = useContext(FieldConfigContext);
    return {
        isReq: (fieldKey) => config[formKey]?.has(fieldKey) ?? false,
    };
};

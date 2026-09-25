import React, { useEffect, useState, useCallback } from 'react';
import { MaintenancePage } from './ErrorPage';

// Maintenance mode for the web app. Two triggers, either one shows the "under maintenance" page:
//   1. public/config.json  ->  "MAINTENANCE": { "Enabled": true, "Message": "...", "Until": "2026-09-25T18:00:00" }
//      (static file: works even when the API is down; edit it on the server, no rebuild)
//   2. the API answering 503 with header X-Maintenance (appsettings.json "Maintenance:Enabled"), or an IIS
//      app_offline.htm (HTML 503) -
//      caught by the fetch watcher below, so people who already have the app open are switched over too.
// While showing the page it re-checks every 20 s and reloads the app by itself once maintenance is over.

const EVT = 'erp:maintenance';

// Wrap window.fetch once: a 503 + X-Maintenance response announces maintenance to the gate.
let watching = false;
export const installMaintenanceWatch = () => {
    if (watching || typeof window === 'undefined' || !window.fetch) return;
    watching = true;
    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const res = await orig(...args);
        try {
            // Our API answers 503 + X-Maintenance (JSON message). IIS's app_offline.htm answers 503 with an
            // HTML page and no such header - that also means "system switched off on purpose".
            const isHtml503 = res.status === 503 && (res.headers.get('content-type') || '').includes('text/html');
            if (res.status === 503 && (res.headers.get('X-Maintenance') || isHtml503)) {
                res.clone().json().then(b => window.dispatchEvent(new CustomEvent(EVT, { detail: b || {} })))
                    .catch(() => window.dispatchEvent(new CustomEvent(EVT, { detail: {} })));
            }
        } catch { /* never break a request */ }
        return res;
    };
};

const fromConfig = () => {
    const m = (window.__APP_CONFIG__ || {}).MAINTENANCE;
    return m && (m.Enabled === true || m.enabled === true)
        ? { message: m.Message || m.message, until: m.Until || m.until }
        : null;
};

// Is maintenance still on? (config.json + API status probe). Resolves to null when the system is back.
const checkNow = async () => {
    try {
        const cfg = await fetch('/config.json', { cache: 'no-store' }).then(r => r.json());
        const m = cfg?.MAINTENANCE;
        if (m && (m.Enabled === true || m.enabled === true)) {
            return { message: m.Message || m.message, until: m.Until || m.until };
        }
        window.__APP_CONFIG__ = cfg;
    } catch { /* config unreadable: fall through to the API probe */ }
    try {
        const base = (window.__APP_CONFIG__ && window.__APP_CONFIG__.API_URL) || '';
        const r = await fetch(`${base}maintenance/status`, { cache: 'no-store' });
        if (r.status === 503) return {};            // API stopped on purpose (IIS app_offline.htm): still in maintenance
        if (r.ok) {
            const b = await r.json();
            if (b.enabled) return { message: b.message, until: b.until };
        }
    } catch { /* API unreachable is not maintenance */ }
    return null;
};

const MaintenanceGate = ({ children }) => {
    const [info, setInfo]         = useState(fromConfig);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        const on = (e) => setInfo(e.detail || {});
        window.addEventListener(EVT, on);
        return () => window.removeEventListener(EVT, on);
    }, []);

    const recheck = useCallback(async () => {
        setChecking(true);
        const still = await checkNow();
        setChecking(false);
        if (still) setInfo(prev => ({ ...(prev || {}), ...still }));   // keep the message we already have
        else window.location.reload();          // back online: reload into the normal app
    }, []);

    useEffect(() => {
        if (!info) return undefined;
        const t = setInterval(recheck, 20000);
        return () => clearInterval(t);
    }, [info, recheck]);

    if (info) return <MaintenancePage message={info.message} until={info.until} onRetry={recheck} checking={checking} />;
    return children;
};

export default MaintenanceGate;

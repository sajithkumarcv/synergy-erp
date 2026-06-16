// ─────────────────────────────────────────────────────────────
// errorLog.js
// Best-effort front-end error logging → backend → TBL_APP_LOG.
// Never throws; failures to log are silently ignored.
// ─────────────────────────────────────────────────────────────
import { variables } from './Variable';

const currentUser = () => {
    try {
        const u = sessionStorage.getItem('erp_user');
        return u ? (JSON.parse(u).username || 'guest') : 'guest';
    } catch {
        return 'guest';
    }
};

// Log a single client error. `error` may be an Error object or a string.
// ctx: { source, action, level }
export const logClientError = (error, ctx = {}) => {
    try {
        const message = typeof error === 'string'
            ? error
            : (error?.message || String(error) || '(no message)');
        const stack = (error && typeof error === 'object') ? (error.stack || null) : null;

        const payload = {
            message,
            stackTrace:  stack,
            source:      ctx.source || null,
            action:      ctx.action || null,
            requestPath: (window.location.pathname || '') + (window.location.search || ''),
            userId:      currentUser(),
            level:       ctx.level || 'Error',
        };

        // keepalive lets the request complete even during page unload / navigation
        fetch(`${variables.API_URL}log/client`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('erp_token') || ''}`,
            },
            body:      JSON.stringify(payload),
            keepalive: true,
        }).catch(() => { /* swallow */ });
    } catch {
        /* logging must never throw */
    }
};

// Install global handlers so uncaught errors and unhandled promise
// rejections are captured app-wide. Call once at app start.
let installed = false;
export const installGlobalErrorLogging = () => {
    if (installed) return;
    installed = true;

    window.addEventListener('error', (e) => {
        const where = e?.filename ? `${e.filename}:${e.lineno || 0}:${e.colno || 0}` : null;
        logClientError(e?.error || e?.message || 'Uncaught error', {
            source: 'window.onerror',
            action: where,
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        const reason = e?.reason;
        const err = reason instanceof Error
            ? reason
            : (reason?.message || (() => { try { return JSON.stringify(reason); } catch { return 'Unhandled rejection'; } })());
        logClientError(err, { source: 'unhandledrejection' });
    });
};

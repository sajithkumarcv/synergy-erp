import React from 'react';

// Static status pages: Not found (404), Something went wrong, Under maintenance.
// Deliberately self-contained (inline styles, no router / context / API calls) so they still render when
// the rest of the app is broken. Buttons use plain window.location so they work outside <Router> too.

const wrap = {
    minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 24, textAlign: 'center', color: '#475569', fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
};
const codeStyle  = { fontSize: 72, fontWeight: 800, lineHeight: 1, letterSpacing: '-2px', color: '#cbd5e1' };
const titleStyle = { fontSize: 22, fontWeight: 700, color: '#1e293b' };
const textStyle  = { fontSize: 14, maxWidth: 460, lineHeight: 1.6 };
const btn = (primary) => ({
    padding: '10px 22px', minHeight: 44, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1px solid #cbd5e1', background: primary ? '#1e40af' : '#fff', color: primary ? '#fff' : '#334155',
});

const goHome = () => { window.location.assign('/'); };
const goBack = () => { if (window.history.length > 1) window.history.back(); else goHome(); };

export const ErrorScreen = ({ icon, code, title, message, detail, actions }) => (
    <div style={wrap} role="alert">
        {icon && <div style={{ fontSize: 44 }}>{icon}</div>}
        {code && <div style={codeStyle}>{code}</div>}
        <div style={titleStyle}>{title}</div>
        {message && <div style={textStyle}>{message}</div>}
        {detail && <div style={{ ...textStyle, fontSize: 12.5, color: '#64748b' }}>{detail}</div>}
        {actions && <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>}
    </div>
);

// URL that matches no page.
export const NotFoundPage = () => (
    <ErrorScreen
        code="404"
        title="Page not found"
        message="The page you are looking for does not exist, or the link is wrong or out of date."
        detail={<code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{window.location.pathname}</code>}
        actions={<>
            <button style={btn(true)}  onClick={goHome}>Go to Dashboard</button>
            <button style={btn(false)} onClick={goBack}>← Go back</button>
        </>}
    />
);

// A page crashed while rendering (used by the error boundaries).
export const CrashPage = ({ onRetry }) => (
    <ErrorScreen
        icon="⚠️"
        title="Something went wrong"
        message="This page hit an unexpected error. The error has been logged so it can be fixed."
        actions={<>
            <button style={btn(true)}  onClick={goHome}>Go to Dashboard</button>
            <button style={btn(false)} onClick={goBack}>← Go back</button>
            <button style={btn(false)} onClick={onRetry || (() => window.location.reload())}>Reload</button>
        </>}
    />
);

// The system has been switched off for maintenance (config.json MAINTENANCE or API 503 + X-Maintenance).
// Full-screen, no app chrome.
export const MaintenancePage = ({ message, until, onRetry, checking }) => {
    const brand = (typeof window !== 'undefined' && window.__BRAND__) || {};
    const logo  = brand.logo ? `${brand._base || ''}${brand.logo}` : null;
    let untilText = null;
    if (until) {
        const d = new Date(until);
        untilText = isNaN(d) ? String(until) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    }
    return (
        <div style={{ ...wrap, minHeight: '100vh', background: 'linear-gradient(160deg,#f8fafc,#e2e8f0)' }}>
            {logo && <img src={logo} alt="" style={{ height: 56, maxWidth: 220, objectFit: 'contain', marginBottom: 6 }} />}
            <div style={{ fontSize: 56 }}>🛠️</div>
            <div style={titleStyle}>{brand.appName ? `${brand.appName} is under maintenance` : 'Under maintenance'}</div>
            <div style={textStyle}>{message || 'We are carrying out scheduled maintenance. Please try again shortly.'}</div>
            {untilText && <div style={{ ...textStyle, fontWeight: 600, color: '#334155' }}>Expected back: {untilText}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button style={btn(true)} onClick={onRetry || (() => window.location.reload())} disabled={checking}>
                    {checking ? 'Checking…' : 'Try again'}
                </button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>This page refreshes by itself as soon as the system is back.</div>
        </div>
    );
};

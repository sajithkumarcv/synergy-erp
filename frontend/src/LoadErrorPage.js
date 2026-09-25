import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorScreen } from './ErrorPage';

// Shown by a detail page when its record could not be loaded (replaces the old inline "⚠ HTTP 404" text).
//   error      the message the page caught, e.g. "HTTP 404" (a missing / mistyped id, or a link to a deleted record)
//   what       "Purchase request"      -> "Purchase request not found"
//   backTo     "/purchase-requests"   -> primary button target (the list)
//   backLabel  "Purchase Requests"    -> "← Back to Purchase Requests"
const btn = (primary) => ({
    padding: '10px 22px', minHeight: 44, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : '1px solid #cbd5e1', background: primary ? '#1e40af' : '#fff', color: primary ? '#fff' : '#334155',
});

const LoadErrorPage = ({ error, what = 'Record', backTo = '/', backLabel = 'Dashboard' }) => {
    const navigate = useNavigate();
    const msg = String(error || '');
    const notFound  = /HTTP 40[04]|not found/i.test(msg);
    const forbidden = /HTTP 403/i.test(msg);

    const actions = (
        <>
            <button style={btn(true)} onClick={() => navigate(backTo)}>← Back to {backLabel}</button>
            {backTo !== '/' && <button style={btn(false)} onClick={() => navigate('/')}>Dashboard</button>}
            {!notFound && !forbidden && <button style={btn(false)} onClick={() => window.location.reload()}>Try again</button>}
        </>
    );

    if (notFound) {
        return <ErrorScreen code="404" title={`${what} not found`}
            message="It may have been deleted, or the link is wrong or out of date."
            detail={<code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{window.location.pathname}</code>}
            actions={actions} />;
    }
    if (forbidden) {
        return <ErrorScreen icon="🔒" title="Access denied"
            message={`You do not have permission to view this ${what.toLowerCase()}.`} actions={actions} />;
    }
    return <ErrorScreen icon="⚠️" title={`Could not load the ${what.toLowerCase()}`}
        message="Something went wrong while loading it. Please try again; if it keeps happening, contact support."
        detail={msg} actions={actions} />;
};

export default LoadErrorPage;

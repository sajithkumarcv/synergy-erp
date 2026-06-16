import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Drop-in replacement for the `onClick={() => navigate('/route')}` pattern that's
 * used in ~110 places across the codebase. The problem with the old pattern is
 * that it renders a <button> with no href, so:
 *   • Ctrl/Cmd+Click does nothing      (no "open in new tab")
 *   • Middle-click does nothing
 *   • Right-click → "Open in new tab"  is missing from the context menu
 *   • Hover doesn't show the URL in the browser status bar
 *
 * RowLink renders an <a href="..."> so all those native behaviours work, AND
 * intercepts the plain left-click to call navigate() instead of doing a full
 * page reload — preserving SPA navigation.
 *
 * Usage:
 *   <RowLink to={`/items/${item.itemId}`}>{item.itemCode}</RowLink>
 *
 *   <RowLink to={`/jobs/${job.jobId}`} style={{ color: '#2e5fa3', fontWeight: 700 }}>
 *     {job.jobId}
 *   </RowLink>
 *
 *   // For row-level "Open" buttons:
 *   <RowLink to={`/customers/${c.customerId}`} className="po-btn-pri">Open</RowLink>
 *
 * Props:
 *   to        — destination URL (string)
 *   children  — what to render inside the link
 *   className — passes through to the <a>
 *   style     — passes through to the <a>
 *   onClick   — optional extra handler (e.g. to clear a search input). Called
 *               AFTER the navigation decision; if you want to cancel navigation
 *               from your handler, call `e.preventDefault()`.
 *   target    — defaults to undefined (in-tab). Set "_blank" to force-new-tab.
 *   title     — pass-through tooltip.
 */
const isModifiedClick = (e) =>
    // Browser convention for "open in new tab" / "open in new window"
    e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ||
    // Middle mouse button
    e.button === 1;

export const RowLink = ({
    to,
    children,
    onClick,
    target,
    rel,
    className,
    style,
    title,
    ...rest
}) => {
    const navigate = useNavigate();

    const handleClick = (e) => {
        if (onClick) onClick(e);
        // Let the browser take over for modifier-clicks (Ctrl/Cmd/Shift/Alt +
        // click and middle-click). The <a href> + native default does the right
        // thing: opens in a new tab, new window, or downloads, per browser config.
        if (isModifiedClick(e)) return;
        // Plain left-click on the same target stays in-app (SPA navigation).
        if (e.defaultPrevented) return;
        // target="_blank" → let the browser open it (no SPA hijack).
        if (target === '_blank') return;
        e.preventDefault();
        navigate(to);
    };

    // Middle-click on macOS Safari fires only "auxclick", not "click", so we
    // mirror to make sure modifier behaviour is uniform across browsers.
    const handleAuxClick = (e) => {
        if (onClick) onClick(e);
        // Aux click (middle button) is always "open in new tab" — the <a> does
        // it natively, so we just don't preventDefault.
    };

    return (
        <a
            href={to}
            onClick={handleClick}
            onAuxClick={handleAuxClick}
            target={target}
            rel={target === '_blank' ? (rel || 'noopener noreferrer') : rel}
            className={className}
            style={{
                // Sensible defaults so existing button-style call sites don't
                // suddenly underline themselves or change colour. Callers can
                // override any of these via `style`.
                color: 'inherit',
                textDecoration: 'none',
                cursor: 'pointer',
                ...style,
            }}
            title={title}
            {...rest}
        >
            {children}
        </a>
    );
};

export default RowLink;

import React from 'react';

/**
 * Shared inline error banner — replaces the system-wide `alert(...)` pattern
 * that hid SP RAISERROR messages behind a popup and froze the UI on network
 * failures. Use together with `useSaveError`:
 *
 *   const err = useSaveError();
 *   ...
 *   await err.guard(() => fetch('/api/...', { ... }));
 *   ...
 *   <InlineError error={err.value} onDismiss={err.clear} />
 *
 * The backend already writes every exception to TBL_APP_LOG via DbCon.WriteLog,
 * so this component only deals with displaying what came back over the wire.
 */
export const InlineError = ({ error, onDismiss, style = {} }) => {
    if (!error) return null;
    return (
        <div style={{
            marginTop: 10,
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderLeft: '4px solid #dc2626',
            borderRadius: 6,
            color: '#991b1b',
            fontSize: 12,
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            ...style,
        }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
            <div style={{ flex: 1 }}>
                <strong>Could not save: </strong>{error}
            </div>
            {onDismiss && (
                <button onClick={onDismiss} aria-label="Dismiss"
                    style={{
                        background: 'transparent', border: 'none',
                        color: '#991b1b', fontSize: 14, cursor: 'pointer',
                        padding: 0, lineHeight: 1,
                    }}>✕</button>
            )}
        </div>
    );
};

/**
 * Hook that wraps a fetch with full error surfacing — covers the three failure
 * modes BOM was hitting:
 *   1. SP RAISERROR / FK violation → returned as 400 with { message } in body.
 *   2. Unexpected 5xx with non-JSON body → falls back to "Save failed (HTTP n)".
 *   3. Network failure / DNS / CORS / abort → caught and rendered, button is
 *      released so the user can retry.
 *
 * Usage:
 *   const err = useSaveError();
 *   const save = async () => {
 *     const ok = await err.guard(async () => {
 *       const res = await fetch('/api/...', { method: 'POST', ... });
 *       if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `HTTP ${res.status}`);
 *     });
 *     if (ok) { ... post-save UI logic ... }
 *   };
 */
export const useSaveError = () => {
    const [value, setValue] = React.useState('');

    const clear = React.useCallback(() => setValue(''), []);

    const guard = React.useCallback(async (run) => {
        setValue('');
        try {
            await run();
            return true;
        } catch (e) {
            setValue(e?.message || 'Operation failed. Please try again.');
            return false;
        }
    }, []);

    return { value, clear, guard, set: setValue };
};

/** Convenience: parse a fetch response and throw an Error with the server message. */
export const ensureOk = async (res) => {
    if (res.ok) return res;
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Save failed (HTTP ${res.status}).`);
};

export default InlineError;

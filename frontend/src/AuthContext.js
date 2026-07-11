import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { variables } from './Variable';

const AuthContext = createContext(null);

// ── Storage strategy ────────────────────────────────────────────────────────
// JWT lives in sessionStorage so the session ends when the browser/tab is
// closed. Any leftover localStorage tokens from the previous strategy are
// cleared on first load so stale sessions don't persist.
//
// Cross-tab sharing: sessionStorage is per-tab, so a freshly opened tab starts
// logged out. To avoid that, a new tab broadcasts a one-off request over
// localStorage; any existing logged-in tab answers with the session, which the
// new tab copies into its OWN sessionStorage. The localStorage keys are written
// and immediately removed (they only exist to carry the `storage` event), so no
// token is persisted to localStorage and the "ends on browser close" rule holds.

const TOKEN_KEY = 'erp_token';
const USER_KEY  = 'erp_user';

const SYNC_REQUEST = 'erp_session_request';   // new tab → "anyone have a session?"
const SYNC_SHARE   = 'erp_session_share';     // existing tab → here it is
const SYNC_LOGOUT  = 'erp_session_logout';    // any tab → everyone log out

// Why the last sign-out happened — read + cleared by the Login page banner.
export const LOGOUT_REASON_KEY = 'erp_logout_reason';

const LOGOUT_REASONS = {
  SESSION_IDLE:  'You were signed out due to inactivity.',
  SESSION_ENDED: 'You were signed out because this account signed in on another PC.',
  DEFAULT:       'Your session has expired. Please sign in again.',
};

// Heartbeat cadence and how recent user input must be to count as "active".
const HEARTBEAT_MS   = 60000;
const ACTIVITY_WINDOW_MS = 70000;

const clearLegacyLocalStorage = () => {
  // Never persist tokens in localStorage; also clear any transient sync keys
  // that might have been left behind so nothing outlives the browser session.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(SYNC_REQUEST);
  localStorage.removeItem(SYNC_SHARE);
  localStorage.removeItem(SYNC_LOGOUT);
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => {
    clearLegacyLocalStorage();
    const token = sessionStorage.getItem(TOKEN_KEY);
    const user  = sessionStorage.getItem(USER_KEY);
    return token ? { token, ...JSON.parse(user) } : null;
  });

  // ── New-tab sync guard ───────────────────────────────────────────────────
  // When a link is opened in a new tab, sessionStorage starts empty so auth
  // is null. Without a guard, App.js immediately fires <Navigate to="/" replace>
  // BEFORE the cross-tab SYNC_SHARE event arrives, stranding the user on the
  // Dashboard regardless of the intended URL.
  //
  // syncPending is true only during the brief window (≤ 200 ms) while we wait
  // for a sibling tab to respond to our SYNC_REQUEST. Once auth arrives (or the
  // timeout fires), it becomes false and the normal login gate is evaluated.
  const [syncPending, setSyncPending] = useState(
    () => !sessionStorage.getItem(TOKEN_KEY)  // only new/empty tabs need the wait
  );

  const login = (data) => {
    const userData = {
      userId:   data.userId,
      username: data.username,
      fullName: data.fullName,
      email:    data.email,
      role:     data.role,
      theme:    data.theme || 'ocean-blue',
    };
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY,  JSON.stringify(userData));
    setAuth({ token: data.token, ...userData });
  };

  // Real user activity (heartbeat sends ?active=1 only when this is recent,
  // so an idle tab can't keep its own session alive).
  const activityRef = useRef(Date.now());

  const clearSession = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setAuth(null);
    // Tell other tabs to log out too (keeps all tabs consistent)
    try { localStorage.setItem(SYNC_LOGOUT, String(Date.now())); localStorage.removeItem(SYNC_LOGOUT); } catch {}
  };

  // User-initiated sign-out: end the server-side session first (fire-and-forget,
  // keepalive survives page unload) so the account frees up for another PC instantly.
  const logout = () => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        fetch(variables.API_URL + 'Auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }
    clearSession();
  };

  // Server-initiated sign-out (session idle / ended / token expired): the session
  // is already dead server-side, so just record why and clear local state.
  const forceLogout = (code) => {
    if (!sessionStorage.getItem(TOKEN_KEY)) return; // already signed out
    try {
      sessionStorage.setItem(LOGOUT_REASON_KEY, LOGOUT_REASONS[code] || LOGOUT_REASONS.DEFAULT);
    } catch {}
    clearSession();
  };

  // ── Cross-tab session sync ────────────────────────────────────────────────
  useEffect(() => {
    const onStorage = (e) => {
      // 1) Another tab is asking for a session — answer if we have one
      if (e.key === SYNC_REQUEST && e.newValue) {
        const token = sessionStorage.getItem(TOKEN_KEY);
        const user  = sessionStorage.getItem(USER_KEY);
        if (token && user) {
          try {
            localStorage.setItem(SYNC_SHARE, JSON.stringify({ token, user }));
            localStorage.removeItem(SYNC_SHARE);  // fire-and-clear: event already carries the value
          } catch {}
        }
      }
      // 2) We received a shared session — adopt it only if we don't have one
      if (e.key === SYNC_SHARE && e.newValue) {
        if (!sessionStorage.getItem(TOKEN_KEY)) {
          try {
            const { token, user } = JSON.parse(e.newValue);
            if (token && user) {
              sessionStorage.setItem(TOKEN_KEY, token);
              sessionStorage.setItem(USER_KEY,  user);
              setAuth({ token, ...JSON.parse(user) });
              setSyncPending(false);   // auth arrived — stop waiting
            }
          } catch {}
        }
      }
      // 3) Another tab logged out — clear this tab too
      if (e.key === SYNC_LOGOUT && e.newValue) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        setAuth(null);
      }
    };

    window.addEventListener('storage', onStorage);

    if (!sessionStorage.getItem(TOKEN_KEY)) {
      // Fresh tab — ask sibling tabs to share their session.
      // Give them 200 ms to respond; after that, fall through to login.
      try { localStorage.setItem(SYNC_REQUEST, String(Date.now())); localStorage.removeItem(SYNC_REQUEST); } catch {}
      const timer = setTimeout(() => setSyncPending(false), 200);
      return () => { window.removeEventListener('storage', onStorage); clearTimeout(timer); };
    }

    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Session enforcement: activity tracking, heartbeat, 401 interceptor ────
  useEffect(() => {
    if (!auth?.token) return;

    const markActivity = () => { activityRef.current = Date.now(); };
    const activityEvents = ['mousedown', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    activityEvents.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));

    // Heartbeat: lets the server idle-close / detect a forced-out session even
    // when the user isn't making API calls. ?active=1 only if there was real
    // user input within the activity window, so an open-but-idle tab times out.
    let checking = false;
    const checkSession = async () => {
      if (checking) return;
      checking = true;
      try {
        const active = Date.now() - activityRef.current < ACTIVITY_WINDOW_MS;
        const res = await fetch(
          variables.API_URL + 'Auth/session-check' + (active ? '?active=1' : ''),
          { headers: { 'Authorization': `Bearer ${auth.token}` } }
        );
        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          forceLogout(body.code);
        }
      } catch {
        // Network hiccup — leave the session alone, next heartbeat will retry.
      } finally {
        checking = false;
      }
    };

    const interval = setInterval(checkSession, HEARTBEAT_MS);
    const onFocus = () => checkSession();
    const onVisibility = () => { if (!document.hidden) checkSession(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    // Global 401 interceptor: if ANY API call comes back 401 with a session
    // code, sign out immediately instead of letting the user keep browsing
    // cached pages until the next heartbeat.
    const origFetch = window.fetch;
    window.fetch = async (input, init) => {
      const res = await origFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (res.status === 401 && url.startsWith(variables.API_URL)) {
          const body = await res.clone().json().catch(() => null);
          if (body && (body.code === 'SESSION_ENDED' || body.code === 'SESSION_IDLE')) {
            forceLogout(body.code);
          }
        }
      } catch {}
      return res;
    };

    return () => {
      activityEvents.forEach(ev => window.removeEventListener(ev, markActivity));
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.fetch = origFetch;
    };
  }, [auth?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme in both storage and auth state (no re-login needed)
  const updateTheme = (theme) => {
    const existing = JSON.parse(sessionStorage.getItem(USER_KEY) || '{}');
    const updated  = { ...existing, theme };
    sessionStorage.setItem(USER_KEY, JSON.stringify(updated));
    setAuth(prev => ({ ...prev, theme }));
  };

  const authHeader = () => ({
    'Content-Type':  'application/json',
    'Accept':        'application/json',
    'Authorization': `Bearer ${auth?.token}`
  });

  return (
    <AuthContext.Provider value={{ auth, login, logout, authHeader, updateTheme, syncPending }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const useCurrentUser = () => {
  const { auth } = useContext(AuthContext);
  return auth?.username || 'system';
};

export const useCurrentUserId = () => {
  const { auth } = useContext(AuthContext);
  return auth?.userId ? parseInt(auth.userId, 10) || 0 : 0;
};

import React from 'react';
import { Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { FilterProvider } from './FilterContext';
import { LookupProvider } from './LookupContext';
import { FieldConfigProvider } from './FieldConfigContext';
import { PermissionProvider } from './PermissionContext';
//import Login from './Login2';
import Login from './Login';
import ResetPassword from './ResetPassword';
import Layout from './Layout';

const App = () => {
  const { auth, syncPending } = useAuth();

  // Password-reset deep link: ?reset-token=… (works without a router).
  // Only honoured when the user is not already signed in.
  const resetToken = new URLSearchParams(window.location.search).get('reset-token');
  if (!auth && resetToken) return <ResetPassword token={resetToken} />;

  // While a new tab is waiting for the cross-tab session sync (≤ 200 ms),
  // render nothing rather than immediately redirecting to "/" — that would
  // discard the intended URL before the sibling tab's SYNC_SHARE arrives.
  if (syncPending) return null;

  // Not authenticated — redirect any deep URL back to "/" then show login.
  // Using replace so the deep URL is removed from browser history (back button
  // won't loop the user back to a protected route after they log in).
  if (!auth) {
    return (
      <>
        {window.location.pathname !== '/' && <Navigate to="/" replace />}
        <Login />
      </>
    );
  }

  // LookupProvider, FieldConfigProvider, and PermissionProvider are inside the
  // auth gate so they only mount (and fire their API calls) AFTER the JWT is set.
  return (
    <PermissionProvider>
      <LookupProvider>
        <FieldConfigProvider>
          <Layout />
        </FieldConfigProvider>
      </LookupProvider>
    </PermissionProvider>
  );
};

const Root = () => (
  <AuthProvider>
    <ThemeProvider>
      <FilterProvider>
        <App />
      </FilterProvider>
    </ThemeProvider>
  </AuthProvider>
);

export default Root;

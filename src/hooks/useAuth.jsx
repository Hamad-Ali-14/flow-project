import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '../services';

// THE single source of truth for "who is signed in". Mounted once at the root (main.jsx),
// above <AuthGate>, so exactly one Supabase auth subscription exists for the whole app.
//
//   status: 'checking'        - restoring a saved session on boot
//           'unauthenticated' - nobody signed in  -> AuthGate shows the Sign In screen
//           'authenticated'   - signed in         -> AuthGate renders the app
//           'recovery'        - opened from a "Forgot password?" e-mail link -> AuthGate shows the
//                               "choose a new password" screen; the app stays closed until it is done
//           'unconfigured'    - Supabase env vars missing (fails closed, never opens the app)
const AuthContext = createContext(null);

// If the stored-session lookup has not answered by then, stop waiting and show the Sign In screen.
export const AUTH_BOOT_TIMEOUT_MS = 1200;
// Turning a recovery link into a session needs a server round trip, so allow longer.
const RECOVERY_BOOT_TIMEOUT_MS = 8000;

// "daud.khan_92@example.com" -> "Daud Khan"
function nameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0].replace(/\d+$/g, '');
  return local.split(/[._\-+\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Best available display name: profile name from the database > auth metadata > email.
export function resolveDisplayName(session, profileName) {
  return (profileName && profileName.trim()) || session?.name || nameFromEmail(session?.email) || 'there';
}

export function AuthProvider({ children, api = inventoryApi }) {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const recoveryInfo = api.auth.recovery || { active: false, error: null, mark() {}, clear() {} };
  const [recovery, setRecovery] = useState(() => Boolean(recoveryInfo.active || recoveryInfo.error));
  const [linkError] = useState(() => recoveryInfo.error); // the link was already used / has expired
  const [notice, setNotice] = useState(null);           // e.g. "Your password was changed ..." shown on Sign In
  const [startInForgot, setStartInForgot] = useState(false);

  useEffect(() => {
    if (api.mode === 'unconfigured') { setSession(null); return undefined; }
    let alive = true;
    // Never hang on a blank screen: past the timeout, fall back to the Sign In screen.
    const timer = setTimeout(() => { if (alive) setSession(prev => (prev === undefined ? null : prev)); }, recoveryInfo.active ? RECOVERY_BOOT_TIMEOUT_MS : AUTH_BOOT_TIMEOUT_MS);
    api.auth.getSession()
      .then(s => {
        if (!alive) return;
        clearTimeout(timer);
        setSession(prev => prev || s); // never overwrite a sign-in that already happened
        // The app is already showing; confirm with the server in the background and eject if revoked.
        if (s && api.auth.verify) api.auth.verify().then(ok => { if (alive && !ok) setSession(null); }).catch(() => {});
      })
      .catch(() => { if (alive) { clearTimeout(timer); setSession(prev => prev || null); } });
    const stop = api.auth.onChange(next => {
      // Token refreshes re-emit the same user; keep identity stable so nothing reloads.
      setSession(prev => (prev && next && prev.email === next.email && prev.name === next.name ? prev : next));
    }, () => setRecovery(true)); // PASSWORD_RECOVERY: the reset link was opened in this tab
    return () => { alive = false; clearTimeout(timer); stop(); };
  }, [api]);

  const signIn = useCallback(async (email, password) => {
    await api.auth.signIn(email, password);
    setNotice(null);
  }, [api]);
  const requestPasswordReset = useCallback(email => api.auth.requestPasswordReset(email), [api]);

  // The recovery link signs the person in, so everything below makes sure the app stays closed
  // until a new password is saved (or the reset is abandoned and that temporary session is dropped).
  const completeRecovery = useCallback(async newPassword => {
    await api.auth.updatePassword(newPassword); // throws -> the reset screen shows the message and stays open
    recoveryInfo.clear();
    setRecovery(false);
    setSession(null);
    setStartInForgot(false);
    setNotice({ tone: 'success', text: 'Your password was changed. Sign in with your new password.' });
    try { await api.auth.signOut({ everywhere: true }); } catch { /* already signed out locally */ }
  }, [api, recoveryInfo]);
  const cancelRecovery = useCallback(async ({ requestNew = false } = {}) => {
    recoveryInfo.clear();
    setRecovery(false);
    setSession(null);
    setNotice(null);
    setStartInForgot(requestNew);
    try { await api.auth.signOut(); } catch { /* already signed out locally */ }
  }, [api, recoveryInfo]);
  // Instant: flip to the Sign In screen first, revoke the stored token right behind it.
  const signOut = useCallback(async () => {
    setSession(null);
    try { await api.auth.signOut(); } catch { /* local state is already signed out */ }
  }, [api]);

  const value = useMemo(() => {
    const status = api.mode === 'unconfigured' ? 'unconfigured'
      : recovery && api.mode === 'live' ? (session === undefined ? 'checking' : 'recovery')
      : session === undefined ? 'checking'
      : session ? 'authenticated' : 'unauthenticated';
    return {
      api, mode: api.mode, status, session: session ?? null, signIn, signOut,
      requestPasswordReset, completeRecovery, cancelRecovery, linkError,
      notice, clearNotice: () => setNotice(null), startInForgot,
    };
  }, [api, session, recovery, linkError, notice, startInForgot, signIn, signOut, requestPasswordReset, completeRecovery, cancelRecovery]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

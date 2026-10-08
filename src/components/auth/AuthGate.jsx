import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabaseConfigStatus } from '../../lib/supabaseClient';
import SignInPanel from './SignInPanel';
import ResetPasswordPanel from './ResetPasswordPanel';

// App-wide login gate. Children (sidebar, dashboard, every page, and the data provider that
// talks to the database) are NOT rendered until a valid session exists. Because the gate sits
// at the root, sign-in happens once and every tab shares that session; signing out unmounts
// the whole app, so no data from the previous user is left in memory.
export default function AuthGate({ children }) {
  const { status, mode, session, signIn, requestPasswordReset, completeRecovery, cancelRecovery, linkError, notice, clearNotice, startInForgot } = useAuth();

  if (status === 'unconfigured') {
    return (
      <div className="auth-gate"><div className="card inv-signin">
        <h2>Supabase is not connected</h2>
        <p>Sign-in needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (project root); then restart npm run dev.</p>
        {supabaseConfigStatus.problems.map(x => <p key={x}>{x}</p>)}
      </div></div>
    );
  }
  if (status === 'checking') {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        <img src="/assets/flow-logo.png" alt="" />
        <div className="auth-spinner" aria-hidden="true" />
        <span>Loading your workspace</span>
      </div>
    );
  }
  if (status === 'recovery') {
    // Opened from the "Forgot password?" e-mail. The app stays closed until a new password is saved.
    return (
      <div className="auth-gate">
        <ResetPasswordPanel
          canReset={Boolean(session) && !linkError}
          email={session?.email}
          onSubmit={completeRecovery}
          onCancel={cancelRecovery}
        />
      </div>
    );
  }
  if (status === 'unauthenticated') {
    return (
      <div className="auth-gate">
        <SignInPanel
          signIn={signIn} title="Sign in to FLOW OPS" intro="Sign in once to access the whole application."
          // Forgot password only exists for the real database (demo mode has no accounts or e-mail).
          requestPasswordReset={mode === 'live' ? requestPasswordReset : undefined}
          notice={notice} onDismissNotice={clearNotice} startInForgot={startInForgot}
        />
      </div>
    );
  }
  // 'authenticated' (live session, or the explicit VITE_DEMO_MODE=true opt-in)
  return <>{children}</>;
}

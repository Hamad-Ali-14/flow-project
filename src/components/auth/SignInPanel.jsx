import React, { useEffect, useState } from 'react';
import { CircleCheck, Eye, EyeOff, LockKeyhole, MailCheck } from 'lucide-react';
import { Alert } from '../tanks/ModalShell';

const RESEND_SECONDS = 60; // matches Supabase's default "one reset e-mail per minute" limit

// Uses Supabase Auth (the system the schema's `profiles` table is built on). Rendered once,
// by <AuthGate> at the app root, when nobody is signed in. `signIn(email, password)` comes
// from useAuth(); on success the auth listener flips the gate open, so nothing else to do here.
//
// "Forgot password?" (only when `requestPasswordReset` is given, i.e. the live database):
//   sign in  ->  enter e-mail  ->  "check your e-mail"  ->  link in the e-mail opens this app on the
//   "choose a new password" screen (ResetPasswordPanel)  ->  back here to sign in with the new password.
export default function SignInPanel({
  signIn, requestPasswordReset, notice, onDismissNotice, startInForgot = false,
  title = 'Sign in to manage inventory',
  intro = 'Tank stock, receipts and shift closing are available to signed-in station staff.',
}) {
  const [view, setView] = useState(startInForgot && requestPasswordReset ? 'forgot' : 'signin'); // 'signin' | 'forgot' | 'sent'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const go = next => { setView(next); setError(''); };

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const sendReset = async event => {
    if (event) event.preventDefault();
    if (busy) return;
    // The cooldown only protects the SAME address from being mailed again straight away
    // (Supabase also limits this server-side); another address can be tried at once.
    if (cooldown > 0 && email.trim().toLowerCase() === sentTo.toLowerCase()) {
      setError(`Please wait ${cooldown}s before sending another e-mail to this address.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
      setCooldown(RESEND_SECONDS);
      setView('sent');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  if (view === 'sent') {
    return (
      <div className="card inv-signin" role="dialog" aria-labelledby="inv-signin-title">
        <div className="modal-mark"><MailCheck size={19} /></div>
        <h2 id="inv-signin-title">Check your e-mail</h2>
        <p>If an account exists for <strong>{sentTo}</strong>, we have sent a link to reset your password. It can take a minute to arrive; check your spam folder too.</p>
        <p>The link opens this app so you can choose a new password. It works once and expires after a while.</p>
        <Alert>{error}</Alert>
        <button type="button" className="button secondary" onClick={() => sendReset()} disabled={busy || cooldown > 0}>
          {busy ? 'Sending...' : cooldown > 0 ? `Send again in ${cooldown}s` : 'Send the e-mail again'}
        </button>
        <div className="inv-forgot center"><button type="button" className="link-btn" onClick={() => go('signin')}>Back to sign in</button></div>
      </div>
    );
  }

  if (view === 'forgot') {
    return (
      <div className="card inv-signin" role="dialog" aria-labelledby="inv-signin-title">
        <div className="modal-mark"><LockKeyhole size={19} /></div>
        <h2 id="inv-signin-title">Forgot your password?</h2>
        <p>Enter the e-mail address of your account and we will send you a link to choose a new password.</p>
        <form onSubmit={sendReset}>
          <label htmlFor="inv-reset-email">Email</label>
          <input id="inv-reset-email" type="email" autoComplete="username" autoFocus required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          <Alert>{error}</Alert>
          <button type="submit" className="button primary" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
        </form>
        <div className="inv-forgot center"><button type="button" className="link-btn" onClick={() => go('signin')} disabled={busy}>Back to sign in</button></div>
      </div>
    );
  }

  return (
    <div className="card inv-signin" role="dialog" aria-labelledby="inv-signin-title">
      <div className="modal-mark"><LockKeyhole size={19} /></div>
      <h2 id="inv-signin-title">{title}</h2>
      <p>{intro}</p>
      {notice && (
        <div className={'inv-alert ' + (notice.tone || 'info')} role="status">
          <CircleCheck size={16} /><span>{notice.text}</span>
        </div>
      )}
      <form onSubmit={submit}>
        <label htmlFor="inv-email">Email</label>
        <input id="inv-email" type="email" autoComplete="username" autoFocus required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
        <label htmlFor="inv-password">Password</label>
        <div className="pw-field">
          <input id="inv-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
          <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {requestPasswordReset && (
          <div className="inv-forgot">
            <button type="button" className="link-btn" onClick={() => { if (onDismissNotice) onDismissNotice(); go('forgot'); }} disabled={busy}>Forgot password?</button>
          </div>
        )}
        <Alert>{error}</Alert>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </div>
  );
}

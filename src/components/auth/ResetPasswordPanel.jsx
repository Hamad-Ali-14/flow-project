import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LinkIcon } from 'lucide-react';
import { Alert } from '../tanks/ModalShell';

export const MIN_PASSWORD_LENGTH = 8;

// Checked in the browser first for a quick message; the server (Supabase Auth) still has the last word.
export function validateNewPassword(password, confirm) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  if (password !== confirm) return 'The two passwords do not match.';
  return '';
}

// Shown INSTEAD of the app when the person arrives from the "Forgot password?" e-mail link
// (AuthGate, status 'recovery'). The link has signed them in temporarily, so the app stays closed
// until a new password is saved; then they are signed out and sign in with it.
//   canReset false = the link was already used, has expired, or never produced a session.
export default function ResetPasswordPanel({ canReset, email, onSubmit, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  if (!canReset || expired) {
    return (
      <div className="card inv-signin" role="dialog" aria-labelledby="inv-reset-title">
        <div className="modal-mark"><LinkIcon size={19} /></div>
        <h2 id="inv-reset-title">This reset link is no longer valid</h2>
        <p>Reset links work only once and expire after a short time. Request a new one and use the newest e-mail.</p>
        <button type="button" className="button primary" onClick={() => onCancel({ requestNew: true })}>Request a new link</button>
        <div className="inv-forgot center"><button type="button" className="link-btn" onClick={() => onCancel()}>Back to sign in</button></div>
      </div>
    );
  }

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    const problem = validateNewPassword(password, confirm);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit(password); // on success the gate moves to Sign In; this panel unmounts
    } catch (e) {
      if (e.code === 'RECOVERY_EXPIRED') setExpired(true);
      else setError(e.message);
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <div className="card inv-signin" role="dialog" aria-labelledby="inv-reset-title">
      <div className="modal-mark"><KeyRound size={19} /></div>
      <h2 id="inv-reset-title">Choose a new password</h2>
      <p>{email ? <>Resetting the password for <strong>{email}</strong>. </> : null}Use at least {MIN_PASSWORD_LENGTH} characters with letters and numbers.</p>
      <form onSubmit={submit}>
        <label htmlFor="inv-new-password">New password</label>
        <div className="pw-field">
          <input id="inv-new-password" type={type} autoComplete="new-password" autoFocus required value={password} onChange={e => { setPassword(e.target.value); setError(''); }} disabled={busy} />
          <button type="button" className="pw-toggle" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <label htmlFor="inv-confirm-password">Confirm new password</label>
        <input id="inv-confirm-password" type={type} autoComplete="new-password" required value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }} disabled={busy} />
        <Alert>{error}</Alert>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Saving...' : 'Save new password'}</button>
      </form>
      <div className="inv-forgot center"><button type="button" className="link-btn" onClick={() => onCancel()} disabled={busy}>Cancel and go back to sign in</button></div>
    </div>
  );
}

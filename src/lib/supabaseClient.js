
// 
import { createClient } from '@supabase/supabase-js';

// THE one Supabase client for the whole app. Nothing else may call createClient().
//
// Only the public anon/publishable key belongs in the browser. Authorization is enforced in
// Postgres (RLS + SECURITY DEFINER functions), never by hiding buttons.
//
// Env names: the documented ones come first; a few common alternatives are accepted so a
// project that already uses them keeps working. Variable VALUES are never logged or shown,
// only names.
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});
const URL_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PROJECT_URL'];
const KEY_NAMES = ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_KEY'];

const pick = names => {
  for (const name of names) {
    const value = String(env[name] ?? '').trim();
    if (value) return { name, value };
  }
  return null;
};

// A JWT-style key whose role claim is service_role (or an sb_secret_ key) bypasses RLS and
// would be exposed to every visitor if bundled into the frontend. Refuse it outright.
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'service_role';
  } catch { return false; }
}

function resolveConfig() {
  const problems = [];
  const url = pick(URL_NAMES);
  const key = pick(KEY_NAMES);
  let cleanUrl = null;

  if (!url) problems.push(`${URL_NAMES[0]} is not set`);
  else {
    try {
      const parsed = new URL(url.value);
      if (!/^https?:$/.test(parsed.protocol) || /YOUR-PROJECT/i.test(url.value)) throw new Error('bad');
      cleanUrl = url.value.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''); // tolerate a pasted API path
    } catch {
      problems.push(`${url.name} is not a valid project URL (expected https://<project>.supabase.co)`);
    }
  }

  if (!key) problems.push(`${KEY_NAMES[0]} is not set`);
  else if (/YOUR-ANON/i.test(key.value)) problems.push(`${key.name} still contains the placeholder value`);
  else if (isSecretKey(key.value)) {
    problems.push(`${key.name} holds a service_role/secret key. Never use that in the browser; use the anon/publishable key instead`);
  }

  return {
    problems,
    url: problems.length ? null : cleanUrl,
    key: problems.length ? null : key.value,
    usedNames: { url: url?.name || null, key: key?.name || null },
    // Names (never values) of every Supabase-looking variable Vite exposed, to spot typos.
    seenNames: Object.keys(env).filter(name => /supa/i.test(name)),
  };
}

const config = resolveConfig();

export const supabaseConfigStatus = Object.freeze({
  problems: config.problems, usedNames: config.usedNames, seenNames: config.seenNames,
});
export const isSupabaseConfigured = config.problems.length === 0;

// Keep users signed in across PWA closes/reopens by default.
// Set VITE_AUTH_PERSIST=session to sign out when the browser session ends, or 'none' for memory only.
const persistMode = ['session', 'none', 'local'].includes(String(env.VITE_AUTH_PERSIST || '').toLowerCase())
  ? String(env.VITE_AUTH_PERSIST).toLowerCase() : 'local';

// Do not delete saved Supabase sessions at startup: doing so forces the login screen every launch.

// ---- Password-recovery link --------------------------------------------------------------

// The e-mail from "Forgot password?" opens this app with the recovery token in the URL
// (#access_token=...&type=recovery) or, if the link was already used / has expired,
// (#error=access_denied&error_code=otp_expired). Supabase turns the token into a real session, which
// would otherwise open the whole app WITHOUT a new password having been chosen. So the intent is
// captured here, before the client consumes the URL, and kept in sessionStorage so a refresh in the
// middle of the reset still lands on the "choose a new password" screen.
const RECOVERY_FLAG = 'flow-auth-recovery';
function readRecoveryFromUrl() {
  if (typeof window === 'undefined') return { fromUrl: false, error: null };
  const params = new URLSearchParams(`${(window.location.hash || '').replace(/^#/, '')}&${(window.location.search || '').replace(/^\?/, '')}`);
  const message = params.get('error_description') || params.get('error');
  return {
    fromUrl: params.get('type') === 'recovery',
    error: message || params.get('error_code') ? { code: params.get('error_code') || 'link_error', message: message || '' } : null,
  };
}
const recoveryUrl = readRecoveryFromUrl();
const store = {
  get() { try { return window.sessionStorage.getItem(RECOVERY_FLAG) === '1'; } catch { return false; } },
  set() { try { window.sessionStorage.setItem(RECOVERY_FLAG, '1'); } catch { /* storage unavailable */ } },
  del() { try { window.sessionStorage.removeItem(RECOVERY_FLAG); } catch { /* storage unavailable */ } },
};
if (recoveryUrl.fromUrl) store.set();

export const recoveryLink = {
  active: recoveryUrl.fromUrl || store.get(),
  error: recoveryUrl.error,
  mark() { store.set(); },
  // Called when the reset is finished or abandoned: forget the flag and tidy the address bar.
  clear() {
    store.del();
    try {
      if (window.location.hash || /[?&](error|code|type)=/.test(window.location.search)) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch { /* ignore */ }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(config.url, config.key, {
    auth: {
      persistSession: persistMode !== 'none',
      storage: persistMode === 'session' ? window.sessionStorage : undefined, // local mode uses Supabase's default localStorage
      autoRefreshToken: true,
    },
  })
  : null;

if (!isSupabaseConfigured && env.DEV) {
  console.warn('[supabase] not configured:', config.problems.join('; '),
    '| Supabase-related variables visible to Vite:', config.seenNames.length ? config.seenNames.join(', ') : '(none)');
}

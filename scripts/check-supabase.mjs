#!/usr/bin/env node
// One-command check of the Supabase connection and the tank inventory setup.
//   npm run check:supabase
//   CHECK_EMAIL=you@example.com CHECK_PASSWORD='...' npm run check:supabase   (also signs in and reads tanks)
// Reads .env.local / .env like Vite does. Prints variable NAMES and results only, never keys or tokens.
// Uses only the public anon key; nothing is written to your database.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const URL_NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PROJECT_URL'];
const KEY_NAMES = ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_KEY'];
let failures = 0;
const line = (status, text, hint) => {
  if (status === 'FAIL') failures += 1;
  console.log(`${status.padEnd(4)}  ${text}${hint ? `\n      -> ${hint}` : ''}`);
};

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}
// Same precedence idea as Vite: real process env > .env.local > .env. (.env.example is never read.)
const files = ['.env', '.env.local'].filter(f => fs.existsSync(path.join(ROOT, f)));
const env = { ...parseEnv(path.join(ROOT, '.env')), ...parseEnv(path.join(ROOT, '.env.local')), ...process.env };
const pick = names => names.map(n => [n, String(env[n] || '').trim()]).find(([, v]) => v);

console.log(`\nFLOW OPS: Supabase check (env files read: ${files.length ? files.join(', ') : 'none'})\n`);

const urlEntry = pick(URL_NAMES);
const keyEntry = pick(KEY_NAMES);
if (!files.length && fs.existsSync(path.join(ROOT, '.env.example'))) {
  line('FAIL', 'No .env or .env.local found', 'Vite never reads .env.example. Copy the VITE_SUPABASE_* lines into .env.local next to package.json.');
}
if (!urlEntry) line('FAIL', `${URL_NAMES[0]} is not set`);
if (!keyEntry) line('FAIL', `${KEY_NAMES[0]} is not set`);
const seen = Object.keys(env).filter(n => /supa/i.test(n));
if (!urlEntry || !keyEntry) {
  console.log(`\nSupabase-related variable names found: ${seen.length ? seen.join(', ') : 'none'}`);
  process.exit(1);
}

let base;
try {
  const u = new URL(urlEntry[1]);
  if (!/^https?:$/.test(u.protocol) || /YOUR-PROJECT/i.test(urlEntry[1])) throw new Error('bad');
  base = urlEntry[1].replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  line('PASS', `${urlEntry[0]} looks like a project URL`);
} catch {
  line('FAIL', `${urlEntry[0]} is not a valid project URL`, 'Expected https://<project-ref>.supabase.co (still the placeholder?)');
  process.exit(1);
}
const key = keyEntry[1];
const isSecret = key.startsWith('sb_secret_') || (() => {
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { return false; }
})();
if (isSecret || /YOUR-ANON/i.test(key)) {
  line('FAIL', `${keyEntry[0]} is ${isSecret ? 'a service_role/secret key' : 'still the placeholder'}`, isSecret ? 'Never use that in the browser. Use the anon / publishable key.' : 'Paste the anon / publishable key from Project Settings > API.');
  process.exit(1);
}
line('PASS', `${keyEntry[0]} is set and is not a secret key`);

const headers = { apikey: key, 'content-type': 'application/json' };
async function call(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + pathname, { method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// 1. Is the project reachable and does it accept this key?
try {
  const r = await call('/auth/v1/settings');
  if (r.status === 200) line('PASS', 'Project reachable and the API key is accepted');
  else if (r.status === 401 || r.status === 403) line('FAIL', `Project reachable but rejected the key (HTTP ${r.status})`, 'Use the anon / publishable key of the SAME project as the URL.');
  else line('FAIL', `Unexpected response from the project (HTTP ${r.status})`, 'Check the URL.');
} catch (e) {
  line('FAIL', `Could not reach ${new URL(base).host}: ${e.cause?.code || e.message}`, 'Check the URL spelling, that the project is not paused, and your network.');
  process.exit(1);
}

// 2. Do the inventory functions exist? (Without a login, an EXISTING function refuses us: that is the pass.)
const dummy = '00000000-0000-0000-0000-000000000000';
const rpcs = {
  get_tank_overview: {}, receive_fuel: { p_tank_id: dummy, p_quantity: 1 }, close_shift: { p_shift_id: dummy, p_readings: [] },
  open_shift: {}, adjust_stock: { p_tank_id: dummy, p_adjustment: 1, p_reason: 'check' }, record_dip_reading: { p_tank_id: dummy, p_dip_mm: 1 },
  list_tank_transactions: { p_tank_id: dummy }, list_dip_readings: { p_tank_id: dummy },
};
let missing = 0;
for (const [name, args] of Object.entries(rpcs)) {
  const r = await call(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
  const msg = String(r.json?.message || '');
  const notFound = r.json?.code === 'PGRST202' || r.json?.code === '42883' || r.status === 404;
  if (notFound) { missing += 1; line('FAIL', `function ${name} does not exist`); }
  else if (r.status === 200) line('FAIL', `function ${name} answered a signed-out request`, 'It should refuse anonymous callers. Re-run database/schema.sql (privileges section).');
  else line('PASS', `function ${name} exists and refuses signed-out callers`);
}
if (missing) console.log('\n      -> Run database/schema.sql in the Supabase SQL editor, then run this check again.');

// 3. Optional: sign in and read the tanks exactly as the app does.
const email = process.env.CHECK_EMAIL; const password = process.env.CHECK_PASSWORD;
if (!email || !password) {
  console.log('\n(To also test sign-in and tank data: CHECK_EMAIL=... CHECK_PASSWORD=... npm run check:supabase)');
} else if (!missing) {
  const login = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!login.json?.access_token) line('FAIL', 'Sign-in failed', 'Wrong email/password, or the user does not exist (Authentication > Users).');
  else {
    line('PASS', `Signed in as ${email}`);
    const ov = await call('/rest/v1/rpc/get_tank_overview', { method: 'POST', body: {}, token: login.json.access_token });
    const m = String(ov.json?.message || '');
    if (m === 'FLOW:NOT_AUTHORIZED') line('FAIL', 'Signed in, but this user has no active staff profile', `Run database/create_profile.sql in the SQL editor.`);
    else if (ov.status !== 200) line('FAIL', `Could not read tanks: ${m || 'HTTP ' + ov.status}`);
    else {
      const tanks = ov.json.tanks || [];
      line(tanks.length ? 'PASS' : 'FAIL', `${tanks.length} tank(s) returned for role "${ov.json.viewer?.role}"`, tanks.length ? '' : 'Run database/inserts.sql.');
      for (const t of tanks) {
        const stock = Number(t.current_stock); const cap = Number(t.capacity);
        console.log(`        ${t.name}: ${t.fuel_name}, ${stock.toLocaleString('en-PK')} L of ${cap.toLocaleString('en-PK')} L (${Math.round((stock / cap) * 100)}%), nozzles ${t.nozzles.map(n => n.nozzle_number).join(', ') || 'none'}`);
      }
      line(ov.json.open_shift ? 'PASS' : 'FAIL', ov.json.open_shift ? `Shift #${ov.json.open_shift.shift_number} is open` : 'No open shift', ov.json.open_shift ? '' : 'Run database/inserts.sql or sign in as a manager and open one.');
    }
  }
}
console.log(failures ? `\n${failures} problem(s) found.\n` : '\nAll checks passed. Start the app with: npm run dev\n');
process.exit(failures ? 1 : 0);

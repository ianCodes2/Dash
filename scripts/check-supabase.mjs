#!/usr/bin/env node
/*
 * Read-only check that the Northstar RPCs exist in the configured
 * Supabase project.
 *
 * Usage: node scripts/check-supabase.mjs
 *
 * It never writes data and never needs a secret key. The publishable
 * key is read from shared/auth.js, so there is only one place to edit.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const authPath = join(root, 'shared', 'auth.js');
const schemaPath = join(root, 'supabase', 'schema.sql');

const auth = await readFile(authPath, 'utf8');
const url = (auth.match(/SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
const key = (auth.match(/SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];

if (!url || !key) {
  console.error('Could not read SUPABASE_URL / SUPABASE_KEY from shared/auth.js');
  process.exit(1);
}

const projectRef = new URL(url).hostname.split('.')[0];
const sqlEditor = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

async function rpc(name, payload) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
  return { status: response.status, data, text };
}

function missing(result) {
  return result.status === 404
    && result.data
    && result.data.code === 'PGRST202'
    && /northstar_/i.test(result.data.message || '');
}

console.log(`Project: ${url}`);

let status;
try {
  status = await rpc('northstar_status', {});
} catch (error) {
  console.error(`Could not reach Supabase: ${error.message}`);
  process.exit(1);
}

if (missing(status)) {
  console.error('\n✗ northstar_status is not in the PostgREST schema cache.');
  console.error('  The schema has not been applied to this project (or was applied elsewhere).');
  console.error(`\n  Fix: open ${sqlEditor}`);
  console.error('  Paste the contents of supabase/schema.sql, run it once, then re-run this check.');
  process.exit(1);
}

if (status.status !== 200) {
  console.error(`\n✗ northstar_status failed with HTTP ${status.status}`);
  console.error(`  ${status.data?.message || status.text.slice(0, 300)}`);
  process.exit(1);
}

const load = await rpc('northstar_load', { p_token: '0'.repeat(64) });
if (missing(load)) {
  console.error('\n✗ northstar_status exists but northstar_load does not.');
  console.error('  The schema is only partly installed. Re-run supabase/schema.sql in full.');
  process.exit(1);
}

if (status.data?.configured) {
  console.log('✓ Schema installed and the workspace has a PIN.');
  console.log('  Open the hub and unlock with your PIN.');
} else {
  console.log('✓ Schema installed. No PIN yet.');
  console.log('  Open the hub and create a 6–12 digit PIN on first visit.');
}
console.log(`\nSQL editor: ${sqlEditor}`);

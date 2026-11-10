import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');

test('GomShip Edge Function does not enforce a dedicated session mode',()=>{
  assert.doesNotMatch(source,/GOMSHIP_AUTH_SESSION_MODE/);
  assert.doesNotMatch(source,/GOMSHIP AUTH blocked: backend session not dedicated/);
});

test('shared authorization still prefers valid tokens and retains guarded refresh',()=>{
  assert.match(source,/async function authRow\(\)/);
  assert.match(source,/\.from\("gomship_auth"\)/);
  assert.match(source,/const isValid = row\.access_token && row\.expires_at/);
  assert.match(source,/if \(isValid && \(!force \|\| \(rejectedToken && row\.access_token !== rejectedToken\)\)\)/);
  assert.match(source,/ROOT \+ "\/auth\/refresh"/);
  assert.match(source,/refresh_token: row\.refresh_token, device_id: row\.device_id/);
  assert.match(source,/\.eq\("refresh_token", row\.refresh_token\)/);
});

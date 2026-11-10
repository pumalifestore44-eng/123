import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const source=name=>readFileSync(new URL(name,root),'utf8');
test('GomShip create action invokes Edge Function, not Extension queue',()=>{
  const form=source('gomship-integration.mjs');
  const fn=form.slice(form.indexOf('export async function submitGomshipForm('));
  assert.match(fn,/await callGomshipFunction\(payload\)/);
  assert.match(fn,/extractGomshipTracking\(result\)/);
  assert.doesNotMatch(fn,/enqueue_gomship_extension_request|queued:true/);
  assert.match(form,/group_order_ids = groupOrderIds\.map\(String\)/);
  assert.match(form,/warehouse_id = byId\('jtWarehouseSelect'\)/);
});
test('Pumalife UI uses resulting carrier waybill and no longer says queued',()=>{
  const app=source('app.js');
  const start=app.indexOf('async function handleGomshipOrderSubmit(');
  const end=app.indexOf('async function ',start+20);
  const handler=app.slice(start,end<0?start+7000:end);
  assert.match(handler,/submitGomshipForm\(\{ groupOrderIds \}\)/);
  assert.match(handler,/rememberLabelAccess\(orderId, result\)/);
  assert.match(handler,/group_synced/);
  assert.doesNotMatch(handler,/result\?\.queued/);
});
test('retired Extension cannot poll, claim or submit a carrier order',()=>{
  const manifest=JSON.parse(source('extensions/gomship-worker/manifest.json'));
  assert.equal(manifest.version,'0.4.0');
  assert.equal(manifest.background,undefined);
  assert.equal(manifest.content_scripts,undefined);
  assert.equal(manifest.host_permissions,undefined);
  assert.equal(manifest.permissions,undefined);
  assert.doesNotMatch(source('extensions/gomship-worker/background.js'),/fetch\(|chrome\.alarms/);
});

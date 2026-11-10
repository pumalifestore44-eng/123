import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function cancelGomshipOrder(input) {');
const end = source.indexOf('async function createOrder(input) {', start);
assert.ok(start !== -1 && end > start);
const extracted = source.slice(start, end);

function sandbox(opts = {}) {
  const calls = [];
  const sourceOrder = { id: 'ORDER-456', jt_waybill_id: 'SPXVN123456' };
  const shipment = {
    order_id: 'ORDER-456', status: opts.status || 'created',
    gomship_order_id: opts.legacy ? null : 754, spx_waybill: 'SPXVN123456',
    response: { data: { id: 754 } }, label_token_hash: 'GRANT-HASH'
  };

  const db = {
    from(table) {
      let kind = 'select';
      let patchValue = null;
      const filters = [];
      const builder = {
        select() { return this; },
        update(fields) { kind = 'update'; patchValue = fields; return this; },
        eq(key, val) { filters.push([key, val]); return this; },
        maybeSingle: async () => {
          if (table === 'gomship_shipments') {
            const verified = filters.every(([key, val]) => shipment[key] === val);
            return { data: verified ? { ...shipment } : null, error: null };
          }
          return { data: { ...sourceOrder }, error: null };
        },
        then(resolve, reject) {
          const run = () => {
            if (kind === 'update' && table === 'gomship_shipments') {
              const permitted = filters.every(([key, val]) => shipment[key] === val);
              calls.push({ op: 'update', table, permitted, fields: patchValue });
              if (permitted) Object.assign(shipment, patchValue);
              return { data: permitted ? [{ order_id: shipment.order_id }] : [], error: null };
            }
            return { data: [], error: null };
          };
          return Promise.resolve().then(run).then(resolve, reject);
        }
      };
      return builder;
    }
  };
  const context = {
    db,
    Date,
    gomshipOrderId: response => response?.data?.id ?? null,
    send: (body, status = 200) => ({ status, body }),
    access: async () => 'test-access-token',
    gomship: async (path, _token, method) => {
      calls.push({ op: 'carrier', path, method });
      if (opts.carrierFailure) return { ok: false, status: 409, data: { message: 'Cannot cancel' } };
      return { ok: true, status: 200, data: { success: true } };
    },
    syncCancelledPumalife: async () => {
      calls.push({ op: 'sync' });
      return opts.syncFailure
        ? { ok: false, message: 'DB unavailable' }
        : { ok: true };
    }
  };
  const cancel = runInNewContext(extracted + '\ncancelGomshipOrder;', context);
  return { cancel, calls, shipment };
}

test('GomShip success performs one DELETE using stored ID, then syncs Pumalife', async () => {
  const run = sandbox();
  const result = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN123456' });
  assert.equal(result.status, 200);
  assert.equal(result.body.cancelled, true);
  assert.deepEqual(run.calls.filter(x => x.op === 'carrier').map(x => [x.path,x.method]),
    [['/orders/754','DELETE']]);
  assert.equal(run.calls.filter(x => x.op === 'sync').length, 1);
  assert.equal(run.shipment.status, 'cancelled');
});

test('GomShip failure never clears Pumalife waybill; cancellation needs review', async () => {
  const run = sandbox({ carrierFailure: true });
  const result = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN123456' });
  assert.equal(result.status, 502);
  assert.equal(run.calls.filter(x => x.op === 'sync').length, 0);
  assert.equal(run.shipment.status, 'cancel_needs_review');
});

test('GomShip cancellation retry after sync failure never sends second DELETE', async () => {
  const run = sandbox({ syncFailure: true });
  const first = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN123456' });
  assert.equal(first.status, 502);
  assert.equal(run.shipment.status, 'cancel_sync_failed');
  const second = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN123456' });
  assert.equal(second.status, 502);
  assert.equal(run.calls.filter(x => x.op === 'carrier').length, 1);
  assert.equal(run.calls.filter(x => x.op === 'sync').length, 2);
});

test('GomShip cancellation denies wrong waybill before any carrier call', async () => {
  const run = sandbox();
  const result = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN999999' });
  assert.equal(result.status, 409);
  assert.equal(run.calls.length, 0);
});
test('Older GomShip order without numeric ID column can cancel from stored creation response', async () => {
  const run = sandbox({ legacy: true });
  const result = await run.cancel({ order_id: 'ORDER-456', waybill_id: 'SPXVN123456' });
  assert.equal(result.status, 200);
  assert.deepEqual(run.calls.filter(x => x.op === 'carrier').map(x => x.path), ['/orders/754']);
  assert.equal(run.shipment.gomship_order_id, 754);
});

test('Missing waybill is rejected before any database mutation or carrier request', async () => {
  const run = sandbox();
  const result = await run.cancel({ order_id: 'ORDER-456' });
  assert.equal(result.status, 400);
  assert.equal(run.calls.length, 0);
});

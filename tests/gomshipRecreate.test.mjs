import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const functionSource = readFileSync(
  new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8'
);
const start = functionSource.indexOf('async function createOrder(input) {');
const end = functionSource.indexOf('\nserve(async req =>', start);
assert.ok(start >= 0 && end > start, 'GomShip createOrder function exists');

function makeHarness(initialStatus = 'cancelled', options = {}) {
  const shipment = initialStatus ? {
    order_id: 'local_16920',
    idempotency_key: 'OLD-CREATE-KEY',
    status: initialStatus,
    response: { data: { id: 754, tracking_number: 'SPXVNOLD' } },
    gomship_order_id: 754,
    spx_waybill: 'SPXVNOLD',
    label_token_hash: 'old-hash',
    cancelled_at: '2026-11-02T10:00:00Z',
    cancel_response: { success: true }
  } : null;
  let current = shipment;
  const archive = [];
  const calls = [];
  let sentOrders = 0;

  const db = {
    from(table) {
      let operation = 'select';
      let updates = {};
      const fields = [];
      return {
        select() { return this; },
        eq(k,v) { fields.push([k,v]); return this; },
        maybeSingle: async () => ({
          data: table === 'pancake_orders'
            ? { id: 'local_16920', jt_waybill_id: options.liveWaybill ?? null, bill_phone_number: '0900000000' }
            : current ? { ...current } : null,
          error: null
        }),
        update(data) { operation = 'update'; updates = data; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation !== 'update' || table !== 'gomship_shipments')
              throw new Error('Unexpected DB operation');
            if (current) Object.assign(current, updates);
            return { error: null };
          }).then(resolve, reject);
        }
      };
    },
    async rpc(name, args) {
      calls.push({ kind:'reserve', name, args });
      if (options.reservationDenied) return { data: { reserved: false, reason: options.reservationDenied }, error:null };
      if (current && current.status !== 'cancelled') return { data: { reserved:false, reason:'previous_'+current.status }, error:null };
      if (options.liveWaybill) return { data: { reserved:false, reason:'order_already_has_waybill' },error:null };
      const recreated = Boolean(current);
      if (recreated) archive.push({ ...current });
      current = {
        order_id: args.p_order_id, idempotency_key: args.p_idempotency_key,
        status: 'creating', request: args.p_request, response: {},
        gomship_order_id: null, spx_waybill: null, label_token_hash: null,
        cancel_response: null, cancelled_at: null
      };
      return { data: { reserved: true, recreated }, error: null };
    }
  };
  const context = {
    db,
    crypto: { randomUUID: () => 'NEW-CREATE-KEY' },
    send: (body, status = 200) => ({ body, status }),
    access: async () => 'MOCK-TOKEN',
    resolveAddress: async () => ({
      province_code:'79',province_name:'Thành phố Hồ Chí Minh',
      ward_code:'27097',ward_name:'Phường Bình Trưng'
    }),
    orderPayload: (_input,address) => ({ receiver_name:'Test customer',province_code:address.province_code }),
    gomship: async (path,_token,method,payload,key) => {
      sentOrders++;
      calls.push({kind:'carrier',path,method,key,payload});
      return { ok:true, status:200, data:{ success:true, data:{id:999,tracking_number:'SPXVNNEW'} } };
    },
    gomshipOrderId: response => response.data?.id ?? null,
    findSpxWaybill: response => response.data?.tracking_number ?? null,
    randomLabelToken: () => 'a'.repeat(64),
    sha256: async () => 'NEW-HASH',
    message: error => error.message
  };
  const createOrder = runInNewContext(
    functionSource.slice(start,end) + '\ncreateOrder;', context
  );
  const input = {
    order_id:'local_16920', receiver:{name:'Test customer',phone:'0900000000'},
    product:{weight:1,price:200000}, cod:0
  };
  return {
    createOrder, input, calls, archive,
    sentOrders: () => sentOrders,
    current: () => current
  };
}

test('Previously cancelled GomShip shipment can be re-created with new carrier ID and idempotency key', async () => {
  const h = makeHarness('cancelled');
  const reply = await h.createOrder(h.input);
  assert.equal(reply.status,200);
  assert.equal(reply.body.success,true);
  assert.equal(reply.body.gomship_order_id,999);
  assert.equal(h.sentOrders(),1);
  assert.equal(h.calls.filter(x=>x.kind==='reserve').length,1);
  assert.equal(h.calls.find(x=>x.kind==='carrier').key,'NEW-CREATE-KEY');
  assert.equal(h.archive.length,1);
  assert.equal(h.archive[0].gomship_order_id,754);
  assert.equal(h.archive[0].status,'cancelled');
  assert.equal(h.archive[0].idempotency_key,'OLD-CREATE-KEY');
  assert.equal(h.current().idempotency_key,'NEW-CREATE-KEY');
  assert.equal(h.current().status,'created');
  assert.equal(h.current().gomship_order_id,999);
  assert.equal(h.current().spx_waybill,'SPXVNNEW');
  assert.equal(h.current().cancel_response,null);
});

test('New sales order still uses same atomic reservation',async()=>{
  const h=makeHarness(null);
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,200);
  assert.equal(h.sentOrders(),1);
  assert.equal(h.archive.length,0);
  assert.equal(h.current().status,'created');
});

for (const status of ['creating','needs_review','cancelling','cancel_needs_review','cancel_sync_failed']) {
  test('Cannot recreate when previous shipment is '+status,async()=>{
    const h=makeHarness(status);
    const result=await h.createOrder(h.input);
    assert.equal(result.status,409);
    assert.equal(result.body.status,status);
    assert.equal(h.sentOrders(),0);
    assert.equal(h.calls.filter(x=>x.kind==='reserve').length,0);
  });
}

test('Previously created shipment is not sent to GomShip a second time',async()=>{
  const h=makeHarness('created');
  const result=await h.createOrder(h.input);
  assert.equal(result.status,200);
  assert.equal(result.body.already_created,true);
  assert.equal(h.sentOrders(),0);
});

test('DB denies cancelled-order reservation if sales order already has a waybill',async()=>{
  const h=makeHarness('cancelled',{reservationDenied:'order_already_has_waybill'});
  const result=await h.createOrder(h.input);
  assert.equal(result.status,409);
  assert.equal(result.body.reason,'order_already_has_waybill');
  assert.equal(h.sentOrders(),0);
  assert.equal(h.archive.length,0);
});

test('Recreation SQL archives old attempt and locks order before reserving new one',()=>{
  const sql=readFileSync(new URL('../supabase/gomship_setup.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists public\.gomship_shipment_history/);
  assert.match(sql,/create or replace function public\.reserve_gomship_shipment/);
  assert.match(sql,/v_previous\.status <> 'cancelled'/);
  assert.match(sql,/for update/);
  assert.match(sql,/insert into public\.gomship_shipment_history/);
  assert.match(sql,/p_idempotency_key/);
  assert.match(sql,/status = 'creating'/);
  assert.match(sql,/label_token_hash = null/);
  assert.match(sql,/grant execute on function public\.reserve_gomship_shipment.*to service_role/);
  assert.match(functionSource,/db\.rpc\(\s*"reserve_gomship_shipment"/);
});

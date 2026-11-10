import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function createOrder(input) {');
const end = source.indexOf('\nserve(async req =>', start);
assert.ok(start > 0 && end > start);

function harness(config = {}) {
  const root = { id:'local_16607', shipping_group_id:'GROUP-1', shipping_group_root_id:'local_16607', jt_waybill_id:null, bill_phone_number:'0900000000' };
  const sibling = { id:'local_16868', shipping_group_id:'GROUP-1', shipping_group_root_id:'local_16607', jt_waybill_id:null, bill_phone_number:'0900000000' };
  const members = [root, sibling];
  if (config.memberWaybill) sibling.jt_waybill_id = 'SPXVNOLD';
  let shipment = config.previousShipment ? {...config.previousShipment} : null;
  const calls = [];
  const db = {
    from(table) {
      let filters = [], operation = 'read', fields = null;
      return {
        select() { return this; },
        eq(k,v) { filters.push([k,v]); return this; },
        update(value) {operation='update'; fields=value;return this;},
        maybeSingle: async () => ({
          data: table === 'pancake_orders' ? { ...root } : shipment ? { ...shipment } : null,
          error: null
        }),
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (operation === 'read' && table === 'pancake_orders') return {data:members.map(m=>({...m})),error:null};
            if (operation === 'update' && table === 'gomship_shipments') {
              Object.assign(shipment, fields);
              return {data:[{order_id:root.id}],error:null};
            }
            throw new Error('Unexpected DB '+table+' '+operation);
          }).then(resolve,reject);
        }
      };
    },
    async rpc(name,args) {
      calls.push({kind:'rpc',name,args});
      if (name === 'claim_grouped_shipment') {
        if (config.claimFailure) return {data:null,error:{message:'Đơn/nhóm đang tạo vận đơn hoặc chờ xác minh kết quả SPX'}};
        members.forEach(m=>m.shipment_claim_token='TOKEN-1');
        return {data:'TOKEN-1',error:null};
      }
      if (name === 'reserve_gomship_shipment') {
        if (config.reserveError) return {data:null,error:{message:'Reservation RPC failed'}};
        if (config.reserveDenied) return {data:{reserved:false,reason:'previous_creating'},error:null};
        shipment = {
          order_id:root.id,idempotency_key:args.p_idempotency_key,
          status:'creating',response:{},spx_waybill:null
        };
        return {data:{reserved:true},error:null};
      }
      if (name === 'release_grouped_shipment') {
        members.forEach(m=>m.shipment_claim_token=null);
        return {data:null,error:null};
      }
      if (name === 'finish_grouped_shipment') {
        if(config.finishError) return {data:null,error:{message:'DB error'}};
        if(config.partialSync) return {data:{count:1},error:null};
        members.forEach(m=>{
          m.jt_waybill_id=args.p_waybill;m.status=9;
          m.shipment_cod=args.p_cod;
          m.shipment_claim_token=null;
        });
        return {data:{count:2,waybill:args.p_waybill},error:null};
      }
      throw new Error('Unexpected RPC '+name);
    }
  };
  const env = {
    db, crypto: {randomUUID:()=> 'KEY-GROUP'},
    send:(body,status=200)=>({status,body}),
    access:async()=> 'TOKEN',
    validatePickupWarehouse: async (input) => { if(config.invalidWarehouse) throw new Error('Không có kho GomShip phù hợp');assert.equal(input.warehouse_id,48);return 48; },
    resolveAddress: async () => ({address_mode:'2-tier',province_code:'79',province_name:'HCM',district_code:'',district_name:'',ward_code:'1',ward_name:'P'}),
    orderPayload: input => ({receiver_name: input.receiver.name,cod_amount: input.cod,product_name:input.product.name}),
    gomship: async (path,token,method,payload,key) => {
      calls.push({kind:'carrier',path,method,key,payload});
      return {ok:true,status:200,data:{success:true,data:{id:833,tracking_number:'SPXVN0123456'}}};
    },
    gomshipOrderId:r=>r.data?.id,
    findSpxWaybill:r=>r.data?.tracking_number,
    randomLabelToken:()=> 'b'.repeat(64),
    sha256: async()=> 'HASH',
    message:e=>String(e.message)
  };
  const createOrder=runInNewContext(source.slice(start,end)+'\ncreateOrder;',env);
  return { createOrder, root, sibling, members, calls, getShipment:()=>shipment, input:{
    order_id:'local_16607', group_order_ids:['local_16607','local_16868'],
    warehouse_id:48,pumalife_warehouse_id:'warehouse-1',
    receiver:{name:'Thùy Phạm',phone:'0900000000'},
    product:{name:'Mã đơn #16607, #16868 - Hai sản phẩm',weight:1,price:999999},cod:0
  }};
}

test('one GomShip POST creates one waybill and atomically finishes both orders', async () => {
  const h=harness();
  const result=await h.createOrder(h.input);
  assert.equal(result.status,200);
  assert.equal(result.body.group_synced,true);
  assert.equal(result.body.group_count,2);
  assert.equal(result.body.gomship_order_id,833);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,1);
  assert.deepEqual(h.members.map(x=>x.jt_waybill_id),['SPXVN0123456','SPXVN0123456']);
  assert.deepEqual(h.members.map(x=>x.shipment_claim_token),[null,null]);
  assert.equal(h.getShipment().status,'created');
  const finish=h.calls.find(x=>x.name==='finish_grouped_shipment');
  assert.equal(finish.args.p_cod,0);
  assert.equal(finish.args.p_warehouse_id,'warehouse-1');
  assert.equal(finish.args.p_token,'TOKEN-1');
});

test('stale group membership rejects before claim or carrier creation', async () => {
  const h=harness();h.input.group_order_ids=['local_16607','old_member'];
  const result=await h.createOrder(h.input);
  assert.equal(result.status,409);
  assert.match(result.body.error,/Thành viên nhóm đã thay đổi/);
  assert.equal(h.calls.length,0);
});

test('group member with waybill prevents creating a second shipment',async()=>{
  const h=harness({memberWaybill:true});
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,409);
  assert.equal(h.calls.length,0);
});

test('claimed group responds with 409 and does not claim an existing waybill', async()=>{
  const h=harness({claimFailure:true});
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,409);
  assert.match(reply.body.error,/đang tạo vận đơn/);
  assert.equal(reply.body.needs_reconciliation,true);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,0);
});

test('failed reservation releases group claim and never POSTs',async()=>{
  const h=harness({reserveDenied:true});
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,409);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,0);
  assert.equal(h.members.every(m=>m.shipment_claim_token===null),true);
});

test('after carrier creation DB sync failure blocks success without retrying POST', async()=>{
  const h=harness({finishError:true});
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,502);
  assert.equal(reply.body.created_on_gomship,true);
  assert.match(reply.body.error,/KHÔNG tạo lại/);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,1);
  assert.equal(h.getShipment().status,'created');
  assert.equal(h.members.every(m=>m.shipment_claim_token==='TOKEN-1'),true);
});
test('reservation RPC error before POST releases group claim', async()=>{
  const h=harness({reserveError:true});
  await assert.rejects(()=>h.createOrder(h.input),/Reservation RPC failed/);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,0);
  assert.equal(h.calls.some(c=>c.name==='release_grouped_shipment'),true);
  assert.equal(h.members.every(x=>x.shipment_claim_token===null),true);
});

test('GomShip created but jt_waybill_id empty requires reconciliation, not a second POST', async()=>{
  const h=harness({previousShipment:{status:'created',response:{data:{id:833}}}});
  const reply=await h.createOrder(h.input);
  assert.equal(reply.status,409);
  assert.equal(reply.body.needs_reconciliation,true);
  assert.match(reply.body.error,/jt_waybill_id.*đang trống/);
  assert.equal(h.calls.filter(c=>c.kind==='carrier').length,0);
});
test('invalid warehouse returns HTTP 400 before any shipment claim, reservation or carrier POST',async()=>{
  const h=harness({invalidWarehouse:true});
  const result=await h.createOrder(h.input);
  assert.equal(result.status,400);
  assert.equal(result.body.reason,'invalid_pickup_warehouse');
  assert.match(result.body.error,/Không có kho GomShip phù hợp/);
  assert.equal(h.calls.some(c=>c.kind==='rpc' || c.kind==='carrier'),false);
});

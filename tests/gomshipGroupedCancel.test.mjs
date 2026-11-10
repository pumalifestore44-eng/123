import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url),'utf8');
const srcFrom = source.indexOf('async function getCancelSource(input) {');
const srcTo = source.indexOf('async function syncCancelledPumalife(',srcFrom);
const cancelFrom = source.indexOf('async function cancelGomshipOrder(input) {');
const cancelTo = source.indexOf('async function createOrder(input) {',cancelFrom);

function makeHarness(options={}) {
  const root = { id:'root_16607',shipping_group_id:'GROUP-1',shipping_group_root_id:'root_16607',jt_waybill_id:'SPXVN123456' };
  const child = {id:'child_16868',shipping_group_id:'GROUP-1',shipping_group_root_id:'root_16607',jt_waybill_id:options.changedWaybill ? 'SPXVNOTHER' : 'SPXVN123456'};
  const ship = {order_id:root.id,status:'created',spx_waybill:'SPXVN123456',gomship_order_id:833,response:{data:{id:833}}};
  const calls=[];
  const db={ from(table) {
    const filters=[];let updates=null;
    const b={
      select() {return this;},
      eq(k,v){filters.push([k,v]);return this;},
      update(value){updates=value;return this;},
      maybeSingle: async()=>{
        const id=filters.find(([k])=>k==='id')?.[1];
        if(table==='pancake_orders')return {data:id===root.id?{...root}:{...child},error:null};
        return {data:filters.every(([k,v])=>ship[k]===v)?{...ship}:null,error:null};
      },
      then(resolve,reject){
        return Promise.resolve().then(()=>{
          if(updates){
            if(table!=='gomship_shipments')throw Error('unexpected update');
            if(filters.every(([k,v])=>ship[k]===v)){Object.assign(ship,updates);return {data:[{order_id:root.id}],error:null}}
            return {data:[],error:null};
          }
          return {data:[],error:null};
        }).then(resolve,reject);
      }
    };return b;
  }};
  const common={
    db,send:(body,status=200)=>({status,body}),
    findSpxWaybill:()=>null,
    gomshipOrderId: r=>r?.data?.id,
    syncCancelledPumalife: async (id,waybill)=> {calls.push({kind:'sync',id,waybill});return {ok:true};},
    gomship: async (path,token,method)=> {calls.push({kind:'carrier',path,method});return {ok:true,status:200,data:{success:true}};},
    access:async()=> 'TOKEN',
    Date,
    message:e=>e?.message||String(e)
  };
  const getCancelSource=runInNewContext(source.slice(srcFrom,srcTo)+'\ngetCancelSource;',common);
  const cancelGomshipOrder=runInNewContext(source.slice(cancelFrom,cancelTo)+'\ncancelGomshipOrder;',common);
  return {getCancelSource,cancelGomshipOrder,calls,root,child,ship};
}

test('cancel lookup on secondary grouped order returns GomShip and resolves shipment root',async()=>{
  const h=makeHarness();
  const result=await h.getCancelSource({order_id:'child_16868'});
  assert.equal(result.status,200);
  assert.equal(result.body.source,'gomship');
  assert.equal(result.body.root_order_id,'root_16607');
  assert.equal(result.body.waybill_id,'SPXVN123456');
});

test('cancel from secondary member only deletes GomShip root shipment',async()=>{
  const h=makeHarness();
  const result=await h.cancelGomshipOrder({order_id:'child_16868',waybill_id:'SPXVN123456'});
  assert.equal(result.status,200);
  assert.equal(result.body.order_id,'root_16607');
  assert.equal(h.ship.status,'cancelled');
  assert.deepEqual(h.calls.filter(c=>c.kind==='carrier').map(x=>[x.path,x.method]),[['/orders/833','DELETE']]);
  assert.deepEqual(h.calls.filter(c=>c.kind==='sync').map(x=>[x.id,x.waybill]),[['root_16607','SPXVN123456']]);
});

test('inconsistent waybill on sibling prevents cancelling root',async()=>{
  const h=makeHarness({changedWaybill:true});
  const result=await h.cancelGomshipOrder({order_id:'child_16868',waybill_id:'SPXVNOTHER'});
  assert.equal(result.status,409);
  assert.equal(h.calls.length,0);
});

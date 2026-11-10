import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isGomshipShipmentByOrder, fetchLabelPdf } from '../gomship-label-client.mjs';
import { signInPumalife, clearPumalifeSession } from '../pumalife-session.mjs';

const edge = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
const a = edge.indexOf('async function verifyGomshipPrintOperator(');
const b = edge.indexOf('/**\n * Never trust a client-provided GomShip order ID',a);
assert.ok(a>=0 && b>a);

function server({email='pumalifestore@gmail.com', identity=true, mismatch=false}={}) {
  const calls=[];
  const orders={
    root:{id:'root',jt_waybill_id:'SPXVN100',shipping_group_root_id:'root',shipping_group_id:'G1'},
    child:{id:'child',jt_waybill_id:mismatch?'SPXVNOTHER':'SPXVN100',shipping_group_root_id:'root',shipping_group_id:'G1'}
  };
  const shipment={order_id:'root',status:'created',gomship_order_id:833,spx_waybill:'SPXVN100'};
  const db={
    auth:{getUser:async token=>({data:{user:identity && token==='AUTH_USER_JWT'
      ?{id:'operator-1',email,role:'authenticated'}:null},error:null})},
    from(table){const filters=[];return {
      select(){return this;},eq(k,v){filters.push([k,v]);return this;},
      maybeSingle:async()=>{const id=filters.find(([k])=>k==='id')?.[1];
        return {data:table==='pancake_orders'?orders[id]||null:shipment,error:null};}
    }}
  };
  const Deno={env:{get:()=>null}};
  const send=(body,status=200)=>({body,status});
  const context={db,Deno,send,getGomshipPdfFromShipment:async ship=>{
    calls.push(ship.gomship_order_id);return {status:200,body:'FAKE_PDF'};
  },String};
  const {getLabelByOrder}=runInNewContext(edge.slice(a,b)+'\n({getLabelByOrder})',context);
  const request=token=>({headers:{get:key=>key==='authorization'?'Bearer '+token:''}});
  return {getLabelByOrder,request,calls};
}

test('backend rejects anon key, even with a correct Pumalife order ID',async()=>{
  const h=server();
  const reply=await h.getLabelByOrder({order_id:'root'},h.request('PUBLIC_ANON_KEY'));
  assert.equal(reply.status,401);
  assert.equal(h.calls.length,0);
});

test('only the account from the primary Pumalife login may fetch PDF',async()=>{
  const h=server({email:'not-pumalife@example.com'});
  const reply=await h.getLabelByOrder({order_id:'root'},h.request('AUTH_USER_JWT'));
  assert.equal(reply.status,403);
  assert.equal(h.calls.length,0);
});

test('same Pumalife Auth login downloads PDF by grouped child order ID',async()=>{
  const h=server();
  const reply=await h.getLabelByOrder({order_id:'child'},h.request('AUTH_USER_JWT'));
  assert.equal(reply.status,200);
  assert.equal(reply.body,'FAKE_PDF');
  assert.deepEqual(h.calls,[833]);
});

test('backend rejects mismatched shipment code for grouped order',async()=>{
  const h=server({mismatch:true});
  const reply=await h.getLabelByOrder({order_id:'child'},h.request('AUTH_USER_JWT'));
  assert.equal(reply.status,409);
  assert.equal(h.calls.length,0);
});

test('main Pumalife login authorizes PDF across browsers without second password prompt',async()=>{
  clearPumalifeSession();
  const storage=new Map();
  globalThis.localStorage={
    getItem:key=>storage.get(key)||null,
    setItem:(key,val)=>storage.set(key,val),
    removeItem:key=>storage.delete(key)
  };
  const requests=[];
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});
    if(String(url).includes('/auth/v1/token?'))
      return new Response(JSON.stringify({
        access_token:'AUTH_USER_JWT',refresh_token:'REFRESH_JWT',expires_in:3600
      }),{status:200,headers:{'content-type':'application/json'}});
    if(JSON.parse(options.body)?.action==='get_cancel_source')
      return new Response(JSON.stringify({success:true,source:'gomship',status:'created'}),{status:200});
    return new Response(new Blob(['%PDF-1.4 fake'],{type:'application/pdf'}),{
      status:200,headers:{'content-type':'application/pdf'}
    });
  };
  assert.equal(await isGomshipShipmentByOrder('root'),true);
  await assert.rejects(()=>fetchLabelPdf('root'),/Phiên Pumalife hết hạn/);
  await signInPumalife('pumalifestore@gmail.com','FAKE_PASSWORD_FOR_TEST');
  const pdf=await fetchLabelPdf('root');
  assert.equal(pdf.type,'application/pdf');
  const printRequest=requests.at(-1);
  assert.equal(printRequest.options.headers.Authorization,'Bearer AUTH_USER_JWT');
  assert.deepEqual(JSON.parse(printRequest.options.body),{
    action:'get_label_by_order',order_id:'root'
  });
  assert.equal(storage.has('is_logged_in'),true);
  assert.equal(storage.has('pumalife:auth:session:v1'),true);
  assert.doesNotMatch(storage.get('pumalife:auth:session:v1'),/FAKE_PASSWORD_FOR_TEST/);
  clearPumalifeSession();
});

test('only the main Pumalife login exists; no extra PDF sign-in form',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const preview=readFileSync(new URL('../gomship-print-preview.mjs',import.meta.url),'utf8');
  assert.match(html,/id="loginForm"/);
  assert.doesNotMatch(html,/gomshipPrintAuthForm/);
  assert.doesNotMatch(preview,/signInGomshipPrint|gomshipPrintOperatorPassword/);
  assert.match(app,/await signInPumalife\(email, pass\)/);
  assert.match(app,/getPumalifeAccessToken\(\)/);
  assert.doesNotMatch(app,/email === 'pumalifestore@gmail.com' && pass/);
  assert.match(edge,/input.action === "get_label_by_order"/);
  assert.match(edge,/db.auth.getUser\(credential\)/);
});

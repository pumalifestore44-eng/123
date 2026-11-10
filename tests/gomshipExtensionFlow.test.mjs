import test from 'node:test';
import assert from 'node:assert/strict';
let sequence=0;
const token='eyJabcdefghijklmnopqrstuvwxyz0123456789.access.signature';
const job={
  id:'11111111-1111-4111-8111-111111111111',
  order_id:'local_17001',
  group_order_ids:['local_17001','local_17002'],
  claim_token:'22222222-2222-4222-8222-222222222222',
  idempotency_key:'33333333-3333-4333-8333-333333333333',
  payload:{
    order_id:'local_17001',address_mode:'3-tier',
    receiver:{name:'Khách thử',phone:'0900000000',detail_address:'Số 3 ngõ 355 Nguyễn Khang',
      province:{name:'Hà Nội'},district:{name:'Quận Cầu Giấy'},ward:{name:'Phường Yên Hòa'}},
    product:{name:'Mã đơn 17001 + 17002, giày x2',weight:1,price:999999},
    cod:0
  }
};
async function setup({tab=true,oldBuild=false,queueEmpty=false,probeStatus=200,
  postStatus=201,postResponse=null,completeFails=false}={}){
  const local={workerBuild:oldBuild?'0.2.0':'0.3.2',enabled:true,warehouseId:24,
    supabaseSession:{access_token:'SIGNED_SUPABASE_JWT',refresh_token:'TEST_SUPABASE_REFRESH',
      expires_at:Date.now()+3600000,email:'pumalifestore@gmail.com'}};
  const session={["gomship_manual_access_token"]:{token,savedAt:Date.now()}};
  const rpcCalls=[],carrierCalls=[],tabCalls=[];
  let handler;
  globalThis.chrome={
    runtime:{id:'test-gomship-extension',onMessage:{addListener(fn){handler=fn}},
      onInstalled:{addListener(){}},onStartup:{addListener(){}}},
    alarms:{create:async()=>{},onAlarm:{addListener(){}}},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    storage:{
      local:{get:async keys=>Object.fromEntries(keys.map(key=>[key,local[key]])),
        set:async fields=>Object.assign(local,fields),remove:async key=>delete local[key]},
      session:{get:async key=>({[key]:session[key]}),set:async fields=>Object.assign(session,fields),
        remove:async key=>delete session[key]}
    },
    tabs:{
      query:async()=>tab?[{id:88,status:'complete',url:'https://shop.gomship.vn/orders'}]:[],
      sendMessage:async(id,message)=>{tabCalls.push(message.kind);
        if(message.kind==='GOMSHIP_TAB_STATUS_V3')return {ok:true,store:'9'};
        throw Error('Unexpected tab command '+message.kind);}
    },
    scripting:{executeScript:async()=>[]}
  };
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.startsWith('https://api.gomship.vn/')){
      carrierCalls.push({url:target,options});
      const path=target.slice('https://api.gomship.vn/api/v1'.length);
      if(path==='/notifications/unread-count')
        return new Response(JSON.stringify({success:true,data:{count:0}}),{status:probeStatus});
      if(path.startsWith('/locations/')){
        let values=[];
        if(path==='/locations/provinces')values=[{code:'01',name:'Thành phố Hà Nội'}];
        else if(path.startsWith('/locations/districts?'))values=[{code:'005',name:'Quận Cầu Giấy'}];
        else if(path.startsWith('/locations/wards?'))values=[{code:'00172',name:'Phường Yên Hòa'}];
        else throw Error('Unexpected location endpoint '+path);
        return new Response(JSON.stringify({success:true,data:values}),{status:200});
      }
      if(path==='/orders')return new Response(JSON.stringify(postResponse||{
        success:true,data:{id:833,details:{tracking_number:'SPXVN0123456'}}
      }),{status:postStatus});
      throw Error('Unexpected carrier request '+path);
    }
    if(!target.startsWith('https://')||!target.includes('.supabase.co/'))
      throw Error('Unexpected non-Supabase request: '+target);
    if(target.includes('/rest/v1/rpc/')){
      const name=target.split('/rpc/')[1];
      rpcCalls.push({name,payload:JSON.parse(options.body)});
      const values={
        claim_gomship_extension_request:queueEmpty?null:structuredClone(job),
        start_gomship_extension_submission:null,
        release_gomship_extension_claim:null,
        complete_gomship_extension_request:completeFails?null:{id:job.id,spx_waybill:'SPXVN0123456'},
        review_gomship_extension_request:null
      };
      if(!(name in values))throw Error('Unexpected RPC '+name);
      return new Response(JSON.stringify(values[name]),{status:completeFails&&name==='complete_gomship_extension_request'?500:200,
        headers:{'Content-Type':'application/json'}});
    }
    if(target.includes('gomship_extension_requests?')){
      const rows=target.includes('status=eq.pending')
        ?[{id:job.id,order_id:job.order_id,status:'pending'}]
        :[{id:job.id,status:local.activeJob?.step==='submitting'?'submitting':'claimed'}];
      return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
    }
    throw Error('Unknown Supabase request: '+target);
  };
  await import('../extensions/gomship-worker/background.js?test='+sequence++);
  assert.ok(handler);
  const invoke=(type,args={},sender={id:'test-gomship-extension'})=>
    new Promise(resolve=>{assert.equal(handler({type,...args},sender,resolve),true);});
  return {local,session,invoke,rpcCalls,carrierCalls,tabCalls};
}
test('upgrade disables automatic processing and clears old session token',async()=>{
  const h=await setup({oldBuild:true});
  const result=await h.invoke('STATUS');
  assert.equal(result.ok,true);
  assert.equal(result.value.build,'0.3.2');
  assert.equal(h.local.enabled,false);
  assert.equal(h.session.gomship_manual_access_token,undefined);
});
test('read-only queue and auth checks do not claim or create an order',async()=>{
  const h=await setup();
  const auth=await h.invoke('CHECK_AUTH');
  const queue=await h.invoke('CHECK_QUEUE');
  assert.equal(auth.value.ready,true);
  assert.equal(queue.value.count,1);
  assert.equal(h.rpcCalls.length,0);
  assert.ok(h.carrierCalls.every(call=>!call.options.method||call.options.method==='GET'));
});
test('one explicit run claims a job and sends one idempotent API POST',async()=>{
  const h=await setup();
  const result=await h.invoke('RUN_ONCE');
  assert.equal(result.ok,true);
  assert.equal(result.value.completed,true);
  assert.equal(result.value.spxWaybill,'SPXVN0123456');
  assert.deepEqual(h.rpcCalls.map(call=>call.name),[
    'claim_gomship_extension_request','start_gomship_extension_submission',
    'complete_gomship_extension_request'
  ]);
  const posts=h.carrierCalls.filter(call=>call.options.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(posts[0].options.headers['Idempotency-Key'],job.idempotency_key);
  assert.equal(posts[0].options.headers['X-Store-Id'],'9');
  assert.equal(h.local.activeJob,undefined);
});
test('expired access token reports HTTP 401 before claiming any job',async()=>{
  const h=await setup({probeStatus:401});
  const result=await h.invoke('RUN_ONCE');
  assert.equal(result.ok,true);
  assert.match(result.value.error,/HTTP 401/);
  assert.equal(h.rpcCalls.length,0);
  assert.equal(h.carrierCalls.filter(call=>call.options.method==='POST').length,0);
});
test('uncertain create failure is reviewed and never retried',async()=>{
  const h=await setup({postStatus:500,postResponse:{success:false,message:'Upstream error'}});
  const result=await h.invoke('RUN_ONCE');
  assert.equal(result.value.needsReview,true);
  assert.deepEqual(h.rpcCalls.map(call=>call.name),[
    'claim_gomship_extension_request','start_gomship_extension_submission',
    'review_gomship_extension_request'
  ]);
  assert.equal(h.carrierCalls.filter(call=>call.options.method==='POST').length,1);
});
test('existing active job blocks additional API submissions',async()=>{
  const h=await setup();
  h.local.activeJob={id:job.id,order_id:job.order_id,claim_token:job.claim_token,step:'submitting'};
  const result=await h.invoke('RUN_ONCE');
  assert.equal(result.value.ok,false);
  assert.equal(h.carrierCalls.filter(call=>call.options.method==='POST').length,0);
  assert.equal(h.rpcCalls.length,0);
});
test('empty queue does not issue carrier POST',async()=>{
  const h=await setup({queueEmpty:true});
  const result=await h.invoke('RUN_ONCE');
  assert.equal(result.value.empty,true);
  assert.equal(h.carrierCalls.filter(call=>call.options.method==='POST').length,0);
});

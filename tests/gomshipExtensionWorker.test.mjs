import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {findWaybill,gomshipOrderId,buildCarrierPayload,validateJob} from '../extensions/gomship-worker/payload.mjs';
import {interpretCarrierReply} from '../extensions/gomship-worker/worker-core.mjs';

const project=new URL('../',import.meta.url);
const file=name=>readFileSync(new URL(name,project),'utf8');
const job={
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  claim_token:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  idempotency_key:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  order_id:'local_17000',
  payload:{
    order_id:'local_17000',address_mode:'3-tier',
    receiver:{
      name:'Khách thử',phone:'0900000000',detail_address:'Số 3 Ngõ 355 Nguyễn Khang',
      province:{name:'Hà Nội'},district:{name:'Q. Cầu Giấy'},ward:{name:'Phường Yên Hòa'}
    },
    product:{name:'Mã đơn #17000 - Túi 3CE Brown Travel Bag x1',weight:1,price:999999},
    cod:0,note:'[CHO THỬ HÀNG]',warehouse_id:'2'
  }
};
test('extension has a complete MV3 package and does not expose remote scripts',()=>{
  const manifest=JSON.parse(file('extensions/gomship-worker/manifest.json'));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.background.type,'module');
  assert.ok(manifest.content_scripts[0].matches.includes('https://shop.gomship.vn/*'));
  assert.ok(manifest.host_permissions.includes('https://api.gomship.vn/*'));
  assert.equal(manifest.version,'0.3.2');
  for(const name of ['background.js','popup.html','popup.js','gomship-content.js','payload.mjs',
    'worker-core.mjs','config.mjs','form-assist.mjs','page-order-observer.js'])assert.ok(existsSync(new URL('extensions/gomship-worker/'+name,project)));
});
test('three-tier payload resolves official GomShip catalog by name and keeps order details',async()=>{
  const paths=[];
  const getLocations=async path=>{
    paths.push(path);
    if(path==='/locations/provinces')return {success:true,data:[
      {code:'01',name:'Thành phố Hà Nội'},{code:'79',name:'Thành phố Hồ Chí Minh'}]};
    if(path.startsWith('/locations/districts?'))return {data:[
      {code:'005',name:'Quận Cầu Giấy'}]};
    if(path.startsWith('/locations/wards?'))return {data:[
      {code:'00172',name:'Phường Yên Hoà'}]};
    throw Error('unexpected location path '+path);
  };
  assert.equal(validateJob(job),true);
  const payload=await buildCarrierPayload(job,getLocations,24);
  assert.equal(payload.address_mode,'3-tier');
  assert.equal(payload.province_code,'01');
  assert.equal(payload.province_name,'Thành phố Hà Nội');
  assert.equal(payload.district_code,'005');
  assert.equal(payload.ward_code,'00172');
  assert.equal(payload.warehouse_id,24);
  assert.equal(payload.product_name,job.payload.product.name);
  assert.equal(payload.product_weight,1000);
  assert.equal(payload.cod_amount,0);
  assert.equal(paths.length,3);
  assert.match(paths[2],/district=Qu%E1%BA%ADn%20C%E1%BA%A7u%20Gi%E1%BA%A5y/);
});
test('two-tier payload keeps empty district and uses official 2-tier endpoints',async()=>{
  const item=structuredClone(job);
  item.payload.address_mode='2-tier';delete item.payload.receiver.district;
  item.payload.receiver.province.name='Thành phố Hồ Chí Minh';
  item.payload.receiver.ward.name='Phường Bình Lợi Trung';
  const paths=[];
  const p=await buildCarrierPayload(item,async path=>{
    paths.push(path);
    return path.includes('provinces-2tier')
      ?[{code:'79',name:'Thành phố Hồ Chí Minh'}]
      :[{code:'27097',name:'Phường Bình Lợi Trung'}];
  },24);
  assert.equal(p.district_code,'');
  assert.equal(p.district_name,'');
  assert.equal(p.ward_code,'27097');
  assert.equal(paths.length,2);
  assert.equal(paths[1],'/locations/wards-2tier?province=79');
});
test('invalid order details are rejected before any carrier POST',async()=>{
  for(const key of ['idempotency_key','order_id']){
    const bad=structuredClone(job);bad[key]='bad';
    assert.throws(()=>validateJob(bad));
  }
  const invalid=structuredClone(job);
  invalid.payload.receiver.ward.name='';
  await assert.rejects(()=>buildCarrierPayload(invalid,()=>{throw Error('GET should not run')},24));
});
test('only accept a real GomShip numeric order ID and SPXVN waybill',()=>{
  const result={data:{id:833,order_code:'GS9-833',details:{tracking_number:'SPXVN0123456'}}};
  assert.equal(findWaybill(result),'SPXVN0123456');
  assert.equal(gomshipOrderId(result),833);
  assert.deepEqual(interpretCarrierReply({ok:true,response:result}),{
    gomshipOrderId:833,spxWaybill:'SPXVN0123456',response:result
  });
  assert.throws(()=>interpretCarrierReply({ok:true,response:{data:{id:833,order_code:'GS9-833'}}}),/thiếu mã/);
});
test('only the extension worker handles API tokens and carrier calls',()=>{
  const background=file('extensions/gomship-worker/background.js');
  const content=file('extensions/gomship-worker/gomship-content.js');
  const observer=file('extensions/gomship-worker/page-order-observer.js');
  assert.doesNotMatch(content,/access_token|refresh_token|Authorization/);
  assert.doesNotMatch(observer,/requestHeaders|Authorization|refresh_token|setRequestHeader/);
  assert.match(background,/https:\/\/api\.gomship\.vn\/api\/v1/);
  assert.match(background,/Idempotency-Key/);
  assert.match(background,/case 'RUN_ONCE':return runOnce\(\)/);
  assert.match(background,/claim_gomship_extension_request/);
  assert.match(background,/start_gomship_extension_submission/);
  assert.match(background,/review_gomship_extension_request/);
  assert.match(background,/complete_gomship_extension_request/);
  assert.doesNotMatch(background,/case 'ENABLE'/);
  assert.doesNotMatch(background,/GOMSHIP_CREATE_V3/);
});
test('SQL queue guards privacy, duplicate orders, and atomic group completion',()=>{
  const sql=file('supabase/gomship_extension_queue.sql');
  assert.match(sql,/enable row level security/i);
  assert.match(sql,/gomship_extension_operator_read/);
  assert.match(sql,/for select to authenticated/);
  assert.match(sql,/for update skip locked/i);
  assert.match(sql,/create unique index.*gomship_extension_queue_one_active_order/is);
  assert.match(sql,/shipment_claim_token/);
  assert.match(sql,/where order_id=item\.order_id/);
  assert.match(sql,/set_config\('app.shipment_sync','off'/);
  assert.match(sql,/if changed<>total then raise exception/);
  assert.match(sql,/status='needs_review'/);
  assert.match(sql,/Intentionally leave all shipment_claim_token values locked/);
  assert.doesNotMatch(sql,/grant (all|insert|update|delete) on public.gomship_extension_requests to anon/i);
});
test('Pumalife button queues instead of calling Edge Function for new GomShip shipments',()=>{
  const source=file('gomship-integration.mjs');
  const submit=source.slice(source.indexOf('export async function submitGomshipForm('));
  assert.match(submit,/enqueue_gomship_extension_request/);
  assert.doesNotMatch(submit,/callGomshipFunction\(payload\)/);
  assert.match(file('app.js'),/if \(result\?\.queued\)/);
});
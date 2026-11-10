import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseGomshipWarehouseList,formatGomshipWarehouse,
  buildGomshipWarehouseCreatePayload} from '../gomship-warehouse.mjs';

const apiWarehouse = {
 id:24,name:'PUMALIFE STORE HCM',contact_name:'PUMALIFE',
 contact_phone:'0902434869',address:'248/21 Hoàng Hoa Thám',
 city:'Thành phố Hồ Chí Minh',district:'',ward:'Phường Bình Lợi Trung',
 province_code:'79',ward_code:'26985',is_default:false
};
const functionSource=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
function isolate(start,end,global={}) {
 const a=functionSource.indexOf(start);
 const b=functionSource.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,start+' missing');
 return runInNewContext(functionSource.slice(a,b)+'\n'+start.match(/function (\w+)/)?.[1],global);
}
test('GET /warehouses parser returns actual contact, address, city and ward fields',()=>{
 for(const value of [
  {success:true,data:[apiWarehouse]},
  {success:true,data:{items:[apiWarehouse]}},
  {success:true,result:{records:[apiWarehouse]}},
  {items:[apiWarehouse]}
 ]) {
  const warehouses=parseGomshipWarehouseList(value);
  assert.equal(warehouses.length,1);
  assert.deepEqual([
    warehouses[0].id,warehouses[0].name,warehouses[0].phone,
    warehouses[0].address,warehouses[0].city,warehouses[0].ward,
    warehouses[0].province_code,warehouses[0].ward_code
  ],[24,'PUMALIFE STORE HCM','0902434869','248/21 Hoàng Hoa Thám',
    'Thành phố Hồ Chí Minh','Phường Bình Lợi Trung','79','26985']);
  assert.match(formatGomshipWarehouse(warehouses[0]),/Phường Bình Lợi Trung/);
 }
});
test('warehouse POST payload matches screenshot field names and never sets default',()=>{
 const data=buildGomshipWarehouseCreatePayload(apiWarehouse);
 assert.deepEqual(data,{
  name:apiWarehouse.name,contact_name:apiWarehouse.contact_name,
  contact_phone:apiWarehouse.contact_phone,address:apiWarehouse.address,
  city:apiWarehouse.city,district:'',province_code:'79',
  ward:apiWarehouse.ward,ward_code:'26985',is_default:false
 });
 assert.throws(()=>buildGomshipWarehouseCreatePayload({...apiWarehouse,contact_phone:'xxx'}),/Số|đầy đủ|liên hệ/);
});
test('server catalog read invokes authenticated GET /warehouses without creating anything',async()=>{
 const from=functionSource.indexOf('function gomshipWarehouseRows(payload) {');
 const to=functionSource.indexOf('async function validatePickupWarehouse(input, token) {',from);
 let methods=[];
 const code=functionSource.slice(from,to);
 // Run only the read functions, not the createStoreWarehouse body.
 const readOnly=code.slice(0,code.indexOf('// This POST is deliberately separate'));
 const module=runInNewContext(readOnly+'\n({gomshipWarehouseRows,gomshipWarehouseDetails,listStoreWarehouses})',{
   gomship:async(path,token,method='GET')=>{
     assert.equal(path,'/warehouses');assert.equal(token,'test-bearer');
     methods.push(method);return {ok:true,data:{success:true,data:[apiWarehouse]}};
   },Error,Number,String,Array,Set
 });
 const rows=await module.listStoreWarehouses('test-bearer');
 assert.deepEqual(methods,['GET']);
 assert.equal(rows[0].id,24);
 const projected=module.gomshipWarehouseDetails(rows[0]);
 assert.equal(projected.contact_phone,'0902434869');
 assert.equal(projected.address,'248/21 Hoàng Hoa Thám');
 assert.equal(projected.ward,'Phường Bình Lợi Trung');
 assert.equal(projected.ward_code,'26985');
});
test('POST /warehouses only after Pumalife authentication and official location validation',async()=>{
 const a=functionSource.indexOf('async function createStoreWarehouse(input, req) {');
 const b=functionSource.indexOf('async function validatePickupWarehouse(input, token) {',a);
 assert.ok(a>0&&b>a);
 let submits=[];
 const deps={
   verifyGomshipPrintOperator:async()=>({ok:true}),
   codeOf:row=>row.code,nameOf:row=>row.name,
   canonicalPlaceName:s=>s.toLowerCase(),
   publicGomshipLocations:async(path)=>path.includes('provinces-2tier')
     ? [{code:'79',name:'Thành phố Hồ Chí Minh'}]
     : [{code:'26985',name:'Phường Bình Lợi Trung'}],
   access:async()=> 'carrier-bearer',
   gomship:async(path,token,method,payload)=>{
     submits.push({path,token,method,payload});
     return {ok:true,status:201,data:{success:true,data:{id:901}}};
   },
   send:(body,status=200)=>({body,status})
 };
 const fn=runInNewContext(functionSource.slice(a,b)+'\ncreateStoreWarehouse',deps);
 const saved=await fn({warehouse:apiWarehouse},{});
 assert.equal(saved.status,201);
 assert.equal(saved.body.warehouse_id,901);
 assert.equal(submits.length,1);
 assert.equal(submits[0].path,'/warehouses');
 assert.equal(submits[0].method,'POST');
 assert.equal(submits[0].payload.is_default,false);
 assert.equal(submits[0].payload.province_code,'79');
 assert.equal(submits[0].payload.ward_code,'26985');
 const invalid=await fn({warehouse:{...apiWarehouse,ward_code:'1234'}},{});
 assert.equal(invalid.status,400);
 assert.equal(submits.length,1);
 const unauthorized=runInNewContext(functionSource.slice(a,b)+'\ncreateStoreWarehouse',{
   ...deps,verifyGomshipPrintOperator:async()=>({ok:false,status:401,error:'Login required'})
 });
 const blocked=await unauthorized({warehouse:apiWarehouse},{});
 assert.equal(blocked.status,401);
 assert.equal(submits.length,1);
});
test('frontend requests signed-in Pumalife session for creating a GomShip warehouse',()=>{
 const front=readFileSync(new URL('../gomship-integration.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(front,/getPumalifeAccessToken/);
 assert.match(front,/authorizedWrite:true/);
 assert.match(front,/action:'create_warehouse'/);
 assert.match(front,/loadGomshipWarehouseCatalog\(\)/);
 assert.match(html,/id="gsWhCreateSubmit"/);
 assert.match(html,/id="gsWhProvince"/);
 assert.match(html,/id="gsWhWard"/);
});
test('direct selection of an official GomShip warehouse works without a Pumalife-side warehouse',async()=>{
 const {validateGomshipWarehouseChoice}=await import('../gomship-warehouse.mjs');
 const official=parseGomshipWarehouseList({data:[apiWarehouse]});
 assert.equal(validateGomshipWarehouseChoice(null,official,'24',{manual:true}).id,24);
 assert.throws(()=>validateGomshipWarehouseChoice(null,official,'24'),/chưa khớp/);
});

test('manual GomShip choice survives catalog refresh when that warehouse remains registered',()=>{
 const source=readFileSync(new URL('../gomship-integration.mjs',import.meta.url),'utf8');
 assert.match(source,/previousManualId/);
 assert.match(source,/select\.value = previousManualId/);
 assert.match(source,/select\.dataset\.selection = 'manual'/);
 assert.match(source,/pumalifeWarehouse\.required = !gomship/);
});

test('opening an order shipment uses its stored Pumalife warehouse, not the default',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/async function loadSpxWarehouses\(preferredWarehouseId = ''\)/);
 assert.match(app,/await loadSpxWarehouses\(order\.warehouse_id\)/);
 assert.match(app,/const current = spxWarehouses\.find\(w => String\(w\.id\) === requestedId\)/);
 assert.match(app,/Kho trên đơn không còn hoạt động/);
 assert.match(app,/select\.value = '';/);
});
test('a manually chosen GomShip warehouse does not leak into the next order, but remains after refresh',()=>{
 const front=readFileSync(new URL('../gomship-integration.mjs',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(front,/loadGomshipWarehouseCatalog\(\{ resetSelection = false \} = \{\}\)/);
 assert.match(front,/!resetSelection && select\?\.dataset\?\.selection === 'manual'/);
 assert.match(front,/parseGomshipWarehouseList\(response\)/);
 assert.match(app,/loadGomshipWarehouseCatalog\(\{ resetSelection: true \}\)/);
});
test('warehouse create accepts nested GomShip response IDs without trusting an invalid ID',()=>{
 const fnSource=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
 const a=fnSource.indexOf('async function createStoreWarehouse(input, req) {');
 const b=fnSource.indexOf('async function validatePickupWarehouse(input, token) {',a);
 const deps={
   verifyGomshipPrintOperator:async()=>({ok:true}),
   codeOf:row=>row.code,nameOf:row=>row.name,
   canonicalPlaceName:s=>s.toLowerCase(),
   publicGomshipLocations:async path=>path.includes('provinces-2tier')
     ? [{code:'79',name:'Thành phố Hồ Chí Minh'}]
     : [{code:'26985',name:'Phường Bình Lợi Trung'}],
   access:async()=> 'carrier-bearer',
   gomship:async()=>({ok:true,status:201,data:{success:true,data:{warehouse:{id:902}}}}),
   send:(body,status=200)=>({body,status})
 };
 const fn=runInNewContext(fnSource.slice(a,b)+'\ncreateStoreWarehouse',deps);
 return fn({warehouse:apiWarehouse},{}).then(result=>{
   assert.equal(result.body.warehouse_id,902);
 });
});

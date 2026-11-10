import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
 parseGomshipWarehouseList,matchLocalWarehouse,suggestGomshipWarehouse,validateGomshipWarehouseChoice
} from '../gomship-warehouse.mjs';

const localA={id:'local-A',name:'Kho Hà Nội',sender_name:'PUMALIFE',sender_phone:'0901234567',sender_detail_address:'12 Nguyễn Trãi'};
const localB={id:'local-B',name:'Kho Hồ Chí Minh',sender_name:'PUMALIFE',sender_phone:'0909876543',sender_detail_address:'248/21 Hoàng Hoa Thám'};
const official=[
 {id:24,name:'Kho Hà Nội',contact_name:'PUMALIFE',phone:'0901234567',specific_address:'12 Nguyễn Trãi'},
 {id:48,name:'Kho Hồ Chí Minh',contact_name:'PUMALIFE',phone:'0909876543',specific_address:'248/21 Hoàng Hoa Thám'}
];
test('read actual GomShip registered warehouse IDs, not Pumalife IDs',()=>{
 const list=parseGomshipWarehouseList({data:{items:official}});
 assert.deepEqual(list.map(x=>x.id),[24,48]);
 assert.equal(matchLocalWarehouse(localA,list)?.id,24);
 assert.equal(matchLocalWarehouse(localB,list)?.id,48);
 assert.equal(validateGomshipWarehouseChoice(localB,list,'48').id,48);
 assert.throws(()=>validateGomshipWarehouseChoice(localB,list,'24'),/chưa khớp/);
 assert.throws(()=>validateGomshipWarehouseChoice(localB,list,'local-B'),/Chưa chọn kho/);
});
test('same phone with a different street must never choose the default warehouse',()=>{
 const list=parseGomshipWarehouseList(official.map(x=>({...x,phone:'0901234567'})));
 const local={...localB,sender_phone:'0901234567'};
 assert.equal(matchLocalWarehouse(local,list)?.id,48);
 assert.throws(()=>validateGomshipWarehouseChoice({...local,sender_detail_address:'999 Khác'},list,24),/chưa khớp/);
});
test('unregistered warehouses are blocked until registered on GomShip',()=>{
 const list=parseGomshipWarehouseList(official);
 assert.equal(matchLocalWarehouse({...localB,sender_detail_address:'44 Đường Mới'},list),null);
 assert.throws(()=>validateGomshipWarehouseChoice(localB,list,'999'),/không có trong tài khoản/);
});
test('edge function uses requested official GomShip warehouse instead of the old fixed id 24',()=>{
 const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
 const from=source.indexOf('function orderPayload(input, addr)');
 const to=source.indexOf('/**\n * GomShip',from);
 assert.ok(from>0&&to>from);
 const orderPayload=runInNewContext(source.slice(from,to)+'\norderPayload',{});
 const input={warehouse_id:48, receiver:{name:'Thử',phone:'0900000000',detail_address:'Nhà số 1'},
   product:{name:'Áo',weight:1,price:200000},cod:0};
 const address={address_mode:'2-tier',province_code:'79',province_name:'Thành phố Hồ Chí Minh',district_code:'',district_name:'',ward_code:'12345',ward_name:'Phường thử'};
 assert.equal(orderPayload(input,address).warehouse_id,48);
 assert.equal(orderPayload({...input,warehouse_id:24},address).warehouse_id,24);
 assert.doesNotMatch(source,/warehouse_id:\s*24,/);
 assert.match(source,/await validatePickupWarehouse\(input, token\)/);
 assert.match(source,/input\.pumalife_warehouse_id \? String\(input\.pumalife_warehouse_id\)/);
 assert.match(source,/input\.action === "list_warehouses"/);
});
test('Pumalife default warehouse is matched to registered GomShip default without requiring identical street spelling',()=>{
 const localDefault={...localA,is_default:true,sender_detail_address:'30/1 Nguyễn Xuân Hữu'};
 const list=parseGomshipWarehouseList({data:[
   {...official[0],is_default:true}, official[1]
 ]});
 const selection=suggestGomshipWarehouse(localDefault,list);
 assert.equal(selection.warehouse.id,24);
 assert.equal(selection.reason,'default');
 assert.equal(validateGomshipWarehouseChoice(localDefault,list,'24').id,24);
 const nonDefault={...localDefault,is_default:false};
 assert.equal(suggestGomshipWarehouse(nonDefault,list),null);
 assert.throws(()=>validateGomshipWarehouseChoice(nonDefault,list,'24'),/chưa khớp/);
});
test('older GomShip warehouse list without default flag can choose previously confirmed store 9 default ID 24, never for another local warehouse',()=>{
 const localDefault={...localA,is_default:true,sender_detail_address:'30/1 Nguyễn Xuân Hữu'};
 const list=parseGomshipWarehouseList({items:official});
 assert.equal(suggestGomshipWarehouse(localDefault,list).warehouse.id,24);
 assert.equal(suggestGomshipWarehouse({...localDefault,is_default:false},list),null);
 assert.equal(validateGomshipWarehouseChoice(localDefault,list,24).id,24);
});
test('a NEW registered default takes priority over historical #24',()=>{
 const list=parseGomshipWarehouseList({data:[
   {...official[0],is_default:false},
   {...official[1],is_default:true}
 ]});
 const localDefault={...localA,is_default:true,sender_detail_address:'address different from both'};
 assert.equal(suggestGomshipWarehouse(localDefault,list).warehouse.id,48);
});
test('manual selection of a GomShip warehouse is allowed ONLY after explicit selection and confirmation',()=>{
 const list=parseGomshipWarehouseList({items:official});
 const local={...localB,sender_detail_address:'New address on Pumalife'};
 assert.throws(()=>validateGomshipWarehouseChoice(local,list,48),/chưa khớp/);
 assert.equal(validateGomshipWarehouseChoice(local,list,48,{manual:true}).id,48);
 assert.throws(()=>validateGomshipWarehouseChoice(local,list,99,{manual:true}),/không có trong tài khoản/);
});
test('catalog parsing supports nested address and avoids marking false-string as default',()=>{
 const list=parseGomshipWarehouseList({data:{warehouses:[{
   warehouse_id:24,name:'PUMALIFE',phone_number:'0774452967',
   address:{detail_address:'30/1 Nguyễn Xuân Hữu',province:'Đà Nẵng'},
   is_default:'false'
 },{warehouse_id:48,name:'Kho khác',is_default:'1',address:'248/21 Hoàng Hoa Thám'}]}});
 assert.equal(list[0].address,'30/1 Nguyễn Xuân Hữu');
 assert.equal(list[0].phone,'0774452967');
 assert.equal(list[0].is_default,false);
 assert.equal(list[1].is_default,true);
});
test('server resolves legacy Pumalife UUID for default warehouse before carrier POST',async()=>{
 const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
 const a=source.indexOf('async function validatePickupWarehouse(input, token) {');
 const b=source.indexOf('\nfunction orderPayload(input, addr) {',a);
 assert.ok(a>0&&b>a);
 let readCount=0;
 const db={
   from(table){
     assert.equal(table,'warehouses');
     return {
       select(){return this;},
       eq(field,value){assert.equal(field,'id');assert.equal(value,'local-default');return this;},
       async maybeSingle(){readCount++;return {data:{
         id:'local-default',is_active:true,is_default:true,
         name:'PUMALIFE STORE',sender_name:'PUMALIFE STORE',
         sender_phone:'0774452967',sender_detail_address:'30/1 Nguyễn Xuân Hữu'
       },error:null};}
     };
   }
 };
 const func=runInNewContext(source.slice(a,b)+'\nvalidatePickupWarehouse',
   {db,listStoreWarehouses:async()=>[{id:24,name:'Store default',is_default:false,address:'not returned'}]});
 const input={warehouse_id:'local-default'};
 const selected=await func(input,'token');
 assert.equal(selected,24);
 assert.equal(input.pumalife_warehouse_id,'local-default');
 assert.equal(readCount,1);
 await assert.rejects(()=>func({},'token'),/Chưa xác định được kho lấy hàng/);
});

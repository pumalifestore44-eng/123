import test from 'node:test';
import assert from 'node:assert/strict';
import {fillGomshipCreateForm} from '../extensions/gomship-worker/form-assist.mjs';
class Field {
  constructor(label){this.label=label;this.tagName='INPUT';this.type='text';
    this.disabled=false;this.parentElement=null;this.name='';this.id='';
    this.placeholder='';this.received=[];this.current='';}
  get labels(){return [{textContent:this.label}]}
  get value(){return this.current}
  set value(v){this.current=v}
  getClientRects(){return [1]}
  getAttribute(){return null}
  dispatchEvent(evt){this.received.push(evt.type)}
}
globalThis.HTMLInputElement=Field;
globalThis.HTMLTextAreaElement=Field;
globalThis.Event=class{constructor(type){this.type=type}};
function doc(fields) {
  return {querySelectorAll(selector){
    if(selector==='input, textarea')return fields;
    if(selector==='label[for]')return [];
    return [];
  }};
}
const job={
  order_id:'local_12345',group_order_ids:['local_12345','local_12346'],
  payload:{
    receiver:{name:'Nguyễn Văn An',phone:'0912345678',
      detail_address:'12 Lê Lợi',province:{name:'Hồ Chí Minh'},
      ward:{name:'Bến Nghé'}},
    product:{name:'Mã đơn #12345 + #12346 - Giày A size 38 x2',weight:1.3,price:999999},
    address_mode:'2-tier',cod:0
  }
};
test('assistant fills labeled fields, handles React events, leaves address selectors manual',()=>{
  const names=['Tên người nhận','Số điện thoại','Địa chỉ cụ thể','Tên sản phẩm','Tiền COD','Giá trị khai báo'];
  const fields=names.map(label=>new Field(label));
  const result=fillGomshipCreateForm(doc(fields),job);
  assert.equal(result.orderId,job.order_id);
  assert.deepEqual(fields.map(f=>f.value),[
    'Nguyễn Văn An','0912345678','12 Lê Lợi',
    job.payload.product.name,'0','999999'
  ]);
  assert.ok(fields.every(f=>f.received.join(',')==='input,change'));
  assert.ok(result.manual.some(v=>v.includes('Tỉnh/Thành phố')));
  assert.ok(result.manual.some(v=>v.includes('Kho GomShip, cân nặng')));
  assert.equal(result.populated.length,6);
});
test('ambiguous fields are never populated',()=>{
  const fields=[new Field('Tên người nhận'),new Field('Tên người nhận')];
  assert.throws(()=>fillGomshipCreateForm(doc(fields),job),/Không tìm thấy ô nhập/);
  assert.ok(fields.every(f=>f.value===''));
});

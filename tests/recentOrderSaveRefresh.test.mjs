import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { refreshRenderedRecentOrder } from '../recent-orders-sync.mjs';

const oldOrder = {
  id:'local_17019', display_id:'17019', bill_full_name:'Ngọc Linh',
  bill_phone_number:'0842101004', shipping_address:{full_address:'Địa chỉ cũ'},
  total_price:3205000, cod:0, status:'Đang nhập hàng',
  items:[{product_name:'Giày cũ',quantity:1}]
};
const changedOrder = {
  ...oldOrder,
  bill_full_name:'Ngọc Linh mới', bill_phone_number:'0999999999',
  shipping_address:{full_address:'Địa chỉ vừa sửa'},
  total_price:3400000, cod:195000, status:'Đã xác nhận',
  items:[{product_name:'Giày Onitsuka Tiger mẫu mới',quantity:2}]
};
const render = (order, index) =>
  [index, order.bill_full_name, order.bill_phone_number,
    order.shipping_address.full_address,order.total_price,
    order.cod,order.status,...order.items.map(x=>x.product_name+' x'+x.quantity)
  ].join(' | ');

test('after save, refreshes exactly one visible recent-order card with all saved values',async()=>{
  const orders=[{id:'local_other'}, {...oldOrder}];
  const untouched={outerHTML:'other',isConnected:true};
  const saved={outerHTML:'old card',isConnected:true};
  const queried=[];
  const container={querySelector:selector=>{
    queried.push(selector);
    return selector.includes('="1"')?saved:untouched;
  }};
  let reads=0,renders=0;
  const didUpdate=await refreshRenderedRecentOrder({
    orderId:'local_17019',orders,container,
    fetchOrder:async id=>{reads++;assert.equal(id,'local_17019');return changedOrder;},
    renderCard:render,
    onRendered:()=>{renders++;}
  });
  assert.equal(didUpdate,true);
  assert.equal(reads,1);
  assert.equal(renders,1);
  assert.deepEqual(queried,['.order-history-card[data-recent-order-index="1"]']);
  assert.equal(untouched.outerHTML,'other');
  assert.equal(orders[1],changedOrder);
  for(const text of ['Ngọc Linh mới','0999999999','Địa chỉ vừa sửa','3400000',
    '195000','Đã xác nhận','Giày Onitsuka Tiger mẫu mới x2']){
    assert.ok(saved.outerHTML.includes(text),text);
  }
});

test('an order not currently shown in the sidebar does not reload messages or fetch',async()=>{
  let called=false;
  const updated=await refreshRenderedRecentOrder({
    orderId:'local_unrelated',orders:[oldOrder],
    container:{querySelector:()=>{called=true;return null;}},
    fetchOrder:async()=>{called=true;return changedOrder;},
    renderCard:render
  });
  assert.equal(updated,false);
  assert.equal(called,false);
});

test('a failed Supabase fetch never replaces a card with unsaved values',async()=>{
  const orders=[oldOrder],card={outerHTML:'original',isConnected:true};
  await assert.rejects(()=>refreshRenderedRecentOrder({
    orderId:oldOrder.id,orders,container:{querySelector:()=>card},
    fetchOrder:async()=>{throw Error('HTTP 503');},renderCard:render
  }),/HTTP 503/);
  assert.equal(card.outerHTML,'original');
  assert.equal(orders[0],oldOrder);
});

test('switching customers while refreshing leaves the new sidebar unmodified',async()=>{
  const orders=[oldOrder],card={outerHTML:'original',isConnected:true};
  const pending=refreshRenderedRecentOrder({
    orderId:oldOrder.id,orders,container:{querySelector:()=>card},
    fetchOrder:async()=>{await Promise.resolve();return changedOrder;},
    renderCard:render
  });
  orders[0]={id:'another-thread-order'};
  card.isConnected=false;
  assert.equal(await pending,false);
  assert.equal(card.outerHTML,'original');
});

test('mismatched order identity is never inserted into a visible card',async()=>{
  const card={outerHTML:'original',isConnected:true};
  await assert.rejects(()=>refreshRenderedRecentOrder({
    orderId:oldOrder.id,orders:[oldOrder],container:{querySelector:()=>card},
    fetchOrder:async()=>({...changedOrder,id:'local_someone_else'}),renderCard:render
  }),/Không tải được dữ liệu đơn vừa lưu/);
  assert.equal(card.outerHTML,'original');
});

test('both save paths trigger by-ID recent-order refresh without loading new messages',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const main=source.slice(source.indexOf('window.saveOrderEdits = async function'),
    source.indexOf('// MODAL-BASED QUICK ORDER EDIT'));
  const side=source.slice(source.indexOf("document.getElementById('btnSaveSideOrderEdit')?.addEventListener('click'"),
    source.indexOf("if (document.readyState === 'loading')",source.indexOf("document.getElementById('btnSaveSideOrderEdit')?.addEventListener('click'")));
  for(const handler of [main,side]){
    assert.match(handler,/await saveEditedOrderSafely\(/);
    assert.match(handler,/await refreshRecentOrdersAfterSave\(orderId\)/);
    assert.doesNotMatch(handler,/window\.activeThread|loadMessages\(/);
  }
  assert.match(source,/data-recent-order-index="\$\{orderIndex\}"/);
  assert.match(source,/orders\.map\(renderRecentOrderCard\)/);
});
test('the actual sidebar HTML renderer displays edited name, address, products and totals',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=source.indexOf('function renderRecentOrderCard(order, orderIndex)');
  const end=source.indexOf('async function fetchCustomerOrdersHistory(thread)',start);
  assert.ok(start>0 && end>start);
  const renderCard=runInNewContext(source.slice(start,end) + '\nrenderRecentOrderCard',{
    normalizeStatusText: status => status,
    getStatusClass: () => 'order-status-importing',
    getStatusCodeFromText: () => 11,
    mergeShipmentButton: () => '',
    shipmentGroupBadge: () => ''
  });
  const oldHTML=renderCard(oldOrder,0);
  const newHTML=renderCard(changedOrder,0);
  assert.match(oldHTML,/data-recent-order-index="0"/);
  assert.ok(newHTML.includes('openRecentOrderEdit(0)'));
  for(const text of ['Ngọc Linh mới','0999999999','Địa chỉ vừa sửa',
    'Giày Onitsuka Tiger mẫu mới','x2','3.400.000','195.000']){
    assert.ok(newHTML.includes(text),'Expected saved value in recent orders: '+text);
  }
  assert.ok(!oldHTML.includes('Giày Onitsuka Tiger mẫu mới'));
});
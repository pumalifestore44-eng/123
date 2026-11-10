import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {refreshRenderedDashboardOrder,loadSavedDashboardOrder} from '../dashboard-order-sync.mjs';

const before={id:'local_17262',display_id:17262,bill_full_name:'Khách cũ',bill_phone_number:'0900000000',
  shipping_address:{full_address:'Địa chỉ cũ'},status:'Chờ xử lý (Mới)',inserted_at:'2026-11-10T10:00:00Z',
  total_price:100000,cod:100000,prepaid:0,shipping_fee:0,surcharge:0,
  items:[{id:1,product_name:'Sản phẩm cũ',retail_price:100000,quantity:1}]};
const after={...before,bill_full_name:'Khách mới',bill_phone_number:'0912345678',
  shipping_address:{full_address:'Địa chỉ mới'},status:'Đã xác nhận',
  total_price:330000,cod:130000,prepaid:200000,shipping_fee:25000,surcharge:5000,
  items:[{id:2,product_name:'Giày mới',retail_price:150000,quantity:2}]};

function makeRow(kind,id,open=false){
  return {dataset:{dashboardOrderId:id},isConnected:true,style:{display:open?'table-row':'none'},
    classList:{contains:value=>value==='order-edit-open'&&open,
      add:value=>{if(value==='order-edit-open')open=true;}},
    replaceWith(replacement){this.isConnected=false;replacement.isConnected=true;
      this._container.rows[kind]=replacement;}};
}
function makeTable(){
  const container={rows:{summary:makeRow('summary','local_17262'),detail:makeRow('detail','local_17262',true)},
    querySelectorAll(selector){return selector==='.order-summary-row'?[this.rows.summary]:
      selector==='.order-edit-detail-row'?[this.rows.detail]:[];}};
  for(const row of Object.values(container.rows)) row._container=container;
  return container;
}
test('save changes only the edited dashboard row and preserves its open panel',async()=>{
  const table=makeTable();let reads=0,rerenders=0;
  const update=await refreshRenderedDashboardOrder({
    orderId:'local_17262',container:table,
    fetchOrder:async id=>{reads++;assert.equal(id,'local_17262');return after;},
    renderRows:order=>{
      const summaryRow=makeRow('summary',order.id);
      const detailRow=makeRow('detail',order.id);
      summaryRow.text=[order.bill_full_name,order.bill_phone_number,order.status,
        order.total_price,order.cod,order.items[0].product_name,order.items[0].quantity].join('|');
      detailRow.text=order.shipping_address.full_address;
      return {summaryRow,detailRow};
    },
    onRendered:(order,{wasOpen})=>{
      rerenders++;
      assert.equal(wasOpen,true);
      assert.equal(order.id,after.id);
    }
  });
  assert.equal(update,true);assert.equal(reads,1);assert.equal(rerenders,1);
  assert.equal(table.rows.detail.style.display,'table-row');
  assert.equal(table.rows.detail.classList.contains('order-edit-open'),true);
  assert.equal(table.rows.detail.text,'Địa chỉ mới');
  for(const value of ['Khách mới','0912345678','Đã xác nhận','330000','130000','Giày mới','2'])
    assert.ok(table.rows.summary.text.includes(value),value);
});
test('refresh does not touch a row on a different page or an order switched during fetch',async()=>{
  const table=makeTable(),original=table.rows.summary;
  assert.equal(await refreshRenderedDashboardOrder({
    orderId:'local_other',container:table,
    fetchOrder:async()=>{throw Error('should not read');},renderRows:()=>null
  }),false);
  const result=refreshRenderedDashboardOrder({
    orderId:before.id,container:table,
    fetchOrder:async()=>{await Promise.resolve();return after;},
    renderRows:()=>{throw Error('should not render after page switch');}
  });
  table.rows.summary=makeRow('summary','local_other');
  assert.equal(await result,false);
  assert.equal(original.isConnected,true);
});
test('mismatched fetched order or failed GET does not overwrite the displayed rows',async()=>{
  const table=makeTable(),original=table.rows.summary;
  await assert.rejects(()=>refreshRenderedDashboardOrder({
    orderId:before.id,container:table,fetchOrder:async()=>({...after,id:'another'}),
    renderRows:()=>null
  }),/không trùng/);
  await assert.rejects(()=>refreshRenderedDashboardOrder({
    orderId:before.id,container:table,fetchOrder:async()=>{throw Error('HTTP 503');},
    renderRows:()=>null
  }),/HTTP 503/);
  assert.equal(table.rows.summary,original);
});
test('loads the saved order and item rows fresh from Supabase, including product and warehouse',async()=>{
  const seen=[];
  const order={...after,items:undefined,warehouse_id:'wh-id'};
  const response=rows=>({ok:true,status:200,json:async()=>rows});
  const value=await loadSavedDashboardOrder({
    orderId:after.id,supabaseUrl:'https://example.supabase.co',supabaseKey:'publickey',
    decorateOrders:async rows=>rows,
    fetcher:async(url,opts)=>{
      seen.push({url,opts});
      if(url.includes('/pancake_orders?'))return response([order]);
      if(url.includes('/pancake_order_items?'))return response([{
        id:2,order_id:after.id,product_id:'prod2',product_name:'Giày mới',quantity:2,retail_price:150000
      }]);
      if(url.includes('/pancake_products?'))return response([{id:'prod2',product_link:'https://example.com/giay'}]);
      if(url.includes('/warehouses?'))return response([{id:'wh-id',sender_name:'Kho thật'}]);
      throw Error('Unexpected request');
    }
  });
  assert.equal(value.bill_full_name,'Khách mới');
  assert.equal(value.items.length,1);
  assert.equal(value.items[0].quantity,2);
  assert.equal(value.items[0].product_link,'https://example.com/giay');
  assert.equal(value.warehouse.sender_name,'Kho thật');
  assert.equal(seen.length,4);
  assert.ok(seen.every(item=>item.opts.cache==='no-store'));
});
test('the actual dashboard renderer reflects freshly saved name, phone, items, totals and address',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const a=source.indexOf('function renderDashboardOrderRows(order) {');
  const b=source.indexOf('// ----------------------------------------------------\n// 8. GLOBAL ORDERS DASHBOARD',a);
  assert.ok(a>0 && b>a);
  const fn=runInNewContext(source.slice(a,b)+'\nrenderDashboardOrderRows',{
    normalizeStatusText:x=>x,getStatusClass:()=>'',getStatusCodeFromText:x=>x==='Đã xác nhận'?1:0,
    dashboardShipmentPrintButton:()=>'',mergeShipmentButton:()=>'',shipmentGroupBadge:()=>'', 
    getPlatformIcon:()=>'',linkedCustomersMap:new Map(),escapeHtml:x=>String(x),
    window:{},Intl,Date
  });
  const html=fn(after);
  for(const expected of ['Khách mới','0912345678','Giày mới','x2','330.000','Đã xác nhận','Địa chỉ mới'])
    assert.ok(html.includes(expected),'Missing: '+expected);
  assert.match(html,/data-dashboard-order-id="local_17262"/);
  assert.match(html,/id="edit-row-local_17262"/);
});
test('both save handlers trigger targeted dashboard refresh without full-table reload',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const main=source.slice(source.indexOf('window.saveOrderEdits = async function'),
    source.indexOf('// MODAL-BASED QUICK ORDER EDIT'));
  const side=source.slice(source.indexOf("document.getElementById('btnSaveSideOrderEdit')?.addEventListener('click'"),
    source.indexOf("if (document.readyState === 'loading')",source.indexOf("document.getElementById('btnSaveSideOrderEdit')?.addEventListener('click'")));
  for(const handler of [main,side]){
    assert.match(handler,/await saveEditedOrderSafely\(/);
    assert.match(handler,/await refreshDashboardOrderAfterSave\(orderId\)/);
    assert.doesNotMatch(handler,/await fetchDashboardOrders\(\)/);
  }
  assert.match(source,/tableBody\.innerHTML = orders\.map\(renderDashboardOrderRows\)\.join\(''\)/);
});

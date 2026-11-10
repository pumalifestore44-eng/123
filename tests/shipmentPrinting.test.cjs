const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
const code=source.slice(source.indexOf('async function incrementJtWaybillPrintCount()'),source.indexOf('// Track J&T Journey journey details'));
function setup({count=0,reject=false,confirm=true}={}){
 const calls=[],notices=[],nodes={jtWaybillDisplayCode:{textContent:'SPX-shared'},jtWaybillPrintCount:{textContent:count},jtWaybillPrintContent:{}};
 const context={currentJtPrintOrderId:'member-b',currentJtPrintCount:count,window:{},console,
  document:{getElementById:id=>nodes[id],createElement:()=>{throw Error('Unexpected print frame')}},
  shipmentRpc:async(name,body)=>{calls.push({name,body});if(reject)throw Error('Vận đơn đã được in ở cửa sổ khác');return count+1},
  fetchDashboardOrders:async()=>calls.push({name:'refresh'}),confirm:()=>confirm,alert:m=>notices.push(m)};
 vm.createContext(context);vm.runInContext(code,context);return {context,calls,notices,nodes};
}
test('printing records a shared shipment atomically and refreshes pending filter',async()=>{
 const {context,calls,nodes}=setup();await context.window.incrementJtWaybillPrintCount();
 assert.equal(calls[0].name,'mark_shipment_printed');
 assert.equal(calls[0].body.p_order_id,'member-b');assert.equal(calls[0].body.p_waybill,'SPX-shared');assert.equal(calls[0].body.p_expected_count,0);
 assert.equal(nodes.jtWaybillPrintCount.textContent,1);assert.equal(calls[1].name,'refresh');
});
test('stale concurrent print stops before opening browser print',async()=>{
 const {context,notices,nodes}=setup({reject:true});await context.window.printJtWaybillContent();
 assert.match(notices[0],/đã được in/);assert.equal(nodes.jtWaybillPrintCount.textContent,0);
});
test('declining a reprint sends no print request',async()=>{
 const {context,calls}=setup({count:1,confirm:false});await context.window.printJtWaybillContent();assert.equal(calls.length,0);
});

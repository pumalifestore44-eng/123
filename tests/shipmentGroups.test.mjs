import test from 'node:test';
import assert from 'node:assert/strict';
import { combineShipmentOrders, mergeShipmentButton, shipmentGroupBadge, normalizeShipmentPhone, assignShipmentPrintOwners, dashboardShipmentPrintButton } from '../shipment-groups.mjs';
const orders = () => [
 {id:'a',display_id:101,shipping_group_id:'group',shipping_group_root_id:'b',cod:80000,items:[{product_name:'Áo',quantity:2}]},
 {id:'b',display_id:102,shipping_group_id:'group',shipping_group_root_id:'b',cod:120000,items:[{product_name:'Giày',quantity:1}]}
];
test('unshipped group combines items/COD and uses selected root without mutating sales orders',()=>{
 const input=orders(),before=structuredClone(input),b=combineShipmentOrders([...input,input[0]],'a');
 assert.equal(b.members.length,2);assert.equal(b.root.id,'b');assert.equal(b.order.id,'a');
 assert.equal(b.order.cod,200000);assert.deepEqual(b.labels,['101','102']);
 assert.deepEqual(b.order.items.map(i=>i._shipment_order),['101','102']);assert.deepEqual(input,before);
});
test('existing shipment uses actual carrier COD instead of adding sales COD again',()=>{
 const input=orders().map(o=>({...o,jt_waybill_id:'SPX-test',shipment_cod:180000}));
 assert.equal(combineShipmentOrders(input,'b').order.cod,180000);
 assert.equal(combineShipmentOrders(input,'b').due,200000);
});
test('zero carrier COD and conflicting shipment codes are handled',()=>{
 const input=orders().map(o=>({...o,jt_waybill_id:'SPX-test',shipment_cod:0}));
 assert.equal(combineShipmentOrders(input,'a').order.cod,0);
 input[1].jt_waybill_id='different';assert.throws(()=>combineShipmentOrders(input,'a'),/nhiều mã/);
});
test('merge control hides after shipment and escapes identifiers',()=>{
 assert.equal(mergeShipmentButton({id:'a',jt_waybill_id:'SPX-test'}),'');
 assert.ok(mergeShipmentButton({id:'a"<'}).includes('a&quot;&lt;'));
 assert.ok(shipmentGroupBadge({...orders()[0],_shipment_members:['<101>']}).includes('&lt;101&gt;'));
 assert.equal(normalizeShipmentPhone('+84 903 123 456'),'0903123456');
});
test('preview from either grouped order uses the maximum shared print count',()=>{
 const input=orders();input[0].bill_print_count=0;input[1].bill_print_count=2;
 assert.equal(combineShipmentOrders(input,'a').order.bill_print_count,2);
 assert.equal(combineShipmentOrders(input,'b').order.bill_print_count,2);
});
test('pending rows allow one print control per waybill while retaining every sales order',()=>{
 const input=orders().map(o=>({...o,jt_waybill_id:'SPX-shared'}));
 const visible=assignShipmentPrintOwners([...input,{id:'c',display_id:103,jt_waybill_id:'SPX-other'}]);
 assert.equal(visible.length,3);
 assert.match(dashboardShipmentPrintButton(visible[0]),/onclick=/);
 const disabled=dashboardShipmentPrintButton(visible[1]);
 assert.match(disabled,/disabled/);assert.match(disabled,/In chung với đơn #101/);assert.ok(!disabled.includes('onclick='));
 assert.match(dashboardShipmentPrintButton(visible[2]),/onclick=/);
 assert.equal(input[0]._shipment_print_owner,undefined);
});
test('a filtered or paginated list with only a sibling still permits printing that visible order',()=>{
 const sibling={...orders()[1],jt_waybill_id:'SPX-shared'};
 assert.match(dashboardShipmentPrintButton(assignShipmentPrintOwners([sibling])[0]),/onclick=/);
 assert.match(dashboardShipmentPrintButton(sibling),/onclick=/,'other filters retain reprint controls');
});

const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),esbuild=require('esbuild');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:800,height:900}});
 await page.setContent('<button data-merge-shipment="a">Gộp giao hàng</button><button data-view-shipment="a">Xem nhóm</button>');
 const code=esbuild.buildSync({entryPoints:['shipment-groups.mjs'],bundle:true,write:false,format:'iife',globalName:'Groups'}).outputFiles[0].text;
 await page.addScriptTag({content:code});
 await page.evaluate(()=>{
 window.calls=[];window.mode='unshipped';
 window.source={id:'a',display_id:101,cod:80000,bill_full_name:'Khách kiểm thử',bill_phone_number:'0903123456',items:[{product_name:'Áo',quantity:2}]};
 window.target={id:'b',display_id:102,cod:120000,bill_full_name:'Khách kiểm thử',bill_phone_number:'0903123456',shipping_address:{full_address:'Địa chỉ kiểm thử'},items:[{product_name:'Giày',quantity:1}]};
 window.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;window.calls.push({url:String(url),body});
 let data;
 if(String(url).includes('rpc/shipment_merge_candidates')) data=[{...target,jt_waybill_id:mode==='existing'?'SPX-test':null}];
 else if(String(url).includes('rpc/merge_order_shipments'))data={count:2,waybill:mode==='existing'?'SPX-test':null};
 else if(String(url).includes('shipping_group_id=eq.'))data=[{...source,shipping_group_id:'group',shipping_group_root_id:'b'},{...target,shipping_group_id:'group',shipping_group_root_id:'b'}];
 else data=[mode==='view'?{...source,shipping_group_id:'group',shipping_group_root_id:'b'}:source];
 return {ok:true,text:async()=>JSON.stringify(data)};
 };
 Groups.setupShipmentGrouping();
 });
 await page.locator('[data-merge-shipment]').click();await page.locator('dialog input[type=radio]').check();
 assert.ok(await page.locator('dialog [data-save]').isEnabled());
 await page.locator('dialog [data-save]').click();await page.getByText('Đã liên kết 2 đơn.').waitFor();
 assert.deepEqual(await page.evaluate(()=>calls.find(c=>c.url.includes('rpc/merge_order_shipments')).body),{p_source_id:'a',p_target_id:'b'});
 await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.evaluate(()=>mode='existing');await page.locator('[data-merge-shipment]').click();await page.locator('dialog input[type=radio]').check();
 assert.ok(await page.locator('dialog [data-save]').isDisabled());await page.locator('[data-cod-check]').check();assert.ok(await page.locator('dialog [data-save]').isEnabled());
 await page.locator('dialog [data-save]').click();await page.getByText('Các đơn dùng chung mã SPX-test').waitFor();await page.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.evaluate(()=>mode='view');await page.locator('[data-view-shipment]').click();await page.getByRole('button',{name:'Tạo giao hàng cho nhóm'}).waitFor();
 const text=await page.locator('dialog').textContent();assert.ok(text.includes('101')&&text.includes('102')&&text.includes('Áo')&&text.includes('Giày')&&text.includes('200.000'));
 await page.locator('dialog').screenshot({path:'.tmp/shipment-group-preview.png'});await page.locator('[data-close]').click();
 // Exercise the actual app submission handler, intercepting every external request.
 const source=fs.readFileSync('app.js','utf8');const handler=source.slice(source.indexOf('async function handleJtOrderSubmit(e)'),source.indexOf('async function handleWalkInOrderSubmit(e)'));
 await page.evaluate(()=>{document.body.innerHTML='<form id="f"><button type="submit"><span>Gửi</span></button></form><div id="jtCreateOrderModal"></div>'+['jtLocalOrderId','jtReceiverName','jtReceiverPhone','jtReceiverAddress','jtGoodsName','jtCodMoney','jtWeight'].map(id=>`<input id="${id}">`).join('')+['jtProvince','jtDistrict','jtWard','jtWarehouseSelect'].map(id=>`<select id="${id}"><option value="1">Test</option></select>`).join('');for(const [id,value]of Object.entries({jtLocalOrderId:'b',jtReceiverName:'Khách',jtReceiverPhone:'0903123456',jtReceiverAddress:'Test',jtGoodsName:'Đơn 101,102: Áo x2,Giày x1',jtCodMoney:'180000'}))document.getElementById(id).value=value;});
 await page.addScriptTag({content:`let activeShipmentBundle={order:{shipping_group_id:'group'},root:{id:'b'},members:[{id:'a'},{id:'b'}]};const SUPABASE_URL='https://test',SUPABASE_KEY='test';const activeThread=null;const spxWarehouses=[{id:1}];function getSpxAddressVersion(){return 2}function fetchDashboardOrders(){};window.alerts=[];window.alert=m=>alerts.push(m);window.scenario='success';window.actions=[];async function shipmentRpc(name,body){actions.push({name,body});if(name==='claim_grouped_shipment'&&scenario==='locked')throw Error('Đang tạo vận đơn');return name==='claim_grouped_shipment'?'token':{count:2};};window.fetch=async(url,options)=>{const body=JSON.parse(options.body);actions.push({name:body.action||'create',body});if(scenario==='network')throw Error('Network lost');if(body.action)return{ok:true,json:async()=>({success:true,estimated_shipping_fee:10000})};return {ok:true,json:async()=>scenario==='reject'?{success:false,error:'Rejected'}:{success:true,spx_tn:'SPX-test',order_sn:'VN-test'}}};${handler};window.submitGroup=()=>handleJtOrderSubmit({preventDefault(){},target:document.getElementById('f')});`});
 await page.evaluate(()=>submitGroup());let actions=await page.evaluate(()=>actions);assert.deepEqual(actions.map(a=>a.name),['claim_grouped_shipment','create','finish_grouped_shipment','get_order_extra']);assert.equal(actions[2].body.p_cod,180000);
 for(const [scenario,expected]of [['locked',['claim_grouped_shipment']],['network',['claim_grouped_shipment','create']],['reject',['claim_grouped_shipment','create','release_grouped_shipment']]]){
 await page.evaluate(s=>{window.scenario=s;actions=[]},scenario);await page.evaluate(()=>submitGroup());assert.deepEqual(await page.evaluate(()=>actions.map(a=>a.name)),expected);
 }
 console.log('UI: unshipped/existing merge, COD review, group details, atomic create flow, duplicate lock, unknown outcome and rejected-request release passed');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

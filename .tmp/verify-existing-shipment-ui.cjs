const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),esbuild=require('esbuild');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:760,height:880}});
 await page.setContent('<body></body>');await page.addStyleTag({content:fs.readFileSync('style.css','utf8')});
 await page.evaluate(html=>{const d=new DOMParser().parseFromString(html,'text/html');document.body.appendChild(d.getElementById('jtCreateOrderModal'));document.getElementById('jtCreateOrderModal').style.display='flex'},fs.readFileSync('index.html','utf8'));
 await page.addScriptTag({content:esbuild.buildSync({entryPoints:['existing-shipment.mjs'],bundle:true,write:false,format:'iife',globalName:'Existing'}).outputFiles[0].text});
 await page.evaluate(()=>{
 window.calls=[];window.saved=0;window.alert=()=>{};
 window.fetch=async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});if(!String(url).includes('/rpc/attach_existing_spx_shipment'))throw Error('Unexpected API');return {ok:true,text:async()=>JSON.stringify({count:2})}};
 window.controls=Existing.setupExistingShipment({getBundle:()=>({root:{id:'root-b'},order:{cod:130000},labels:['16915','16916'],members:[{id:'a'},{id:'root-b'}]}),onSaved:async()=>saved++});controls.reset();
 });
 assert.ok(await page.locator('#jtOrderForm').isVisible());await page.locator('[data-spx-entry-mode="existing"]').click();
 assert.ok(await page.locator('#jtOrderForm').isHidden());assert.equal(await page.locator('#spxExistingCod').inputValue(),'130000');
 await page.locator('#spxExistingCode').fill('spxvn06556927884a');await page.locator('#spxExistingCod').fill('100000');await page.locator('#spxExistingConfirm').check();
 await page.locator('#jtCreateOrderModal .modal-card').screenshot({path:'.tmp/existing-shipment-preview.png'});
 await page.locator('#spxExistingForm button[type=submit]').click();await page.waitForFunction(()=>saved===1);
 const calls=await page.evaluate(()=>calls);assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/rpc/attach_existing_spx_shipment'));assert.deepEqual(calls[0].body,{p_order_id:'root-b',p_expected_ids:['a','root-b'],p_waybill:'SPXVN06556927884A',p_order_sn:null,p_cod:100000});
 await page.evaluate(()=>{controls.reset();document.getElementById('jtCreateOrderModal').style.display='flex'});assert.ok(await page.locator('#jtOrderForm').isVisible());assert.equal(await page.locator('#spxExistingCode').inputValue(),'');
 console.log('Existing shipment UI: independent form, optional Order SN, shared-group save, one RPC and no carrier API, reset to create mode passed');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

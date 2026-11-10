const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict'),esbuild=require('esbuild');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1000,height:450}});
 await page.setContent('<div><button id="btnReloadAllOrders">Tải lại</button></div><div id="orders-tab-content"><table style="width:100%;font:16px sans-serif;border-collapse:collapse"><thead><tr><th>Mã đơn</th><th>Vận đơn</th><th>In bill</th></tr></thead><tbody id="dashboardOrdersTableBody"></tbody></table></div><div id="jtWaybillPrintModal"><span id="jtWaybillPrintCount">0</span><div id="jtWaybillPrintContent"><span id="jtWaybillDisplayCode">SPXVN06556927884A</span></div></div>');
 await page.addScriptTag({content:esbuild.buildSync({entryPoints:['shipment-groups.mjs'],bundle:true,write:false,format:'iife',globalName:'Groups'}).outputFiles[0].text});
 await page.evaluate(()=>{
  const rows=Groups.assignShipmentPrintOwners([{id:'a',display_id:16722,jt_waybill_id:'SPXVN06556927884A'},{id:'b',display_id:16613,jt_waybill_id:'SPXVN06556927884A'}]);
  document.getElementById('dashboardOrdersTableBody').innerHTML=rows.map(o=>`<tr><td style="padding:24px">${o.display_id}</td><td>${o.jt_waybill_id}</td><td>${Groups.dashboardShipmentPrintButton(o)}</td></tr>`).join('');
  window.marked=[];window.pickWaybillTemplate=async()=> 'spx';window.openJtWaybillPrintPreview=async()=>{};window.incrementJtWaybillPrintCount=async()=>marked.push('SPX-shared');
 });
 await page.addScriptTag({content:fs.readFileSync('bulk-waybill-print.js','utf8')});await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 assert.equal(await page.locator('#dashboardOrdersTableBody tr').count(),2);
 assert.equal(await page.locator('#dashboardOrdersTableBody button[onclick]').count(),1);
 assert.equal(await page.locator('#dashboardOrdersTableBody button:disabled').count(),1);
 assert.match(await page.locator('#dashboardOrdersTableBody button:disabled').textContent(),/16722/);
 assert.equal(await page.locator('.bulk-waybill-cb').count(),1);
 await page.locator('#orders-tab-content').screenshot({path:'.tmp/pending-print-controls.png'});
 await page.locator('#bulkWaybillSelectAll').check();await page.locator('#bulkWaybillPrintBtn').click();await page.waitForTimeout(220);
 assert.equal(await page.locator('iframe').evaluate(f=>f.contentDocument.querySelectorAll('.p').length),1);
 assert.deepEqual(await page.evaluate(()=>marked),['SPX-shared']);
 console.log('Pending list: two rows, one enabled print button, one disabled reference, one checkbox, one printed page');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

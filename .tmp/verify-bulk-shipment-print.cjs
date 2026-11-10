const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});try{
const page=await browser.newPage();await page.setContent(`<div><button id="btnReloadAllOrders">Tải lại</button></div><div id="orders-tab-content"><table><thead><tr><th>Mã đơn</th></tr></thead><tbody id="dashboardOrdersTableBody">${['a','b'].map(id=>`<tr><td>${id}<button onclick="openJtWaybillPrintPreview('${id}')">In bill</button></td></tr>`).join('')}</tbody></table></div><div id="jtWaybillPrintModal"><div id="jtWaybillPrintCount">0</div><div id="jtWaybillPrintContent"><span id="jtWaybillDisplayCode">SPX-shared</span></div></div>`);
await page.evaluate(()=>{window.marked=[];window.pickWaybillTemplate=async()=> 'spx';window.openJtWaybillPrintPreview=async()=>{};window.incrementJtWaybillPrintCount=async()=>marked.push('SPX-shared')});
await page.addScriptTag({content:fs.readFileSync('bulk-waybill-print.js','utf8')});await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
await page.locator('#bulkWaybillSelectAll').check();await page.locator('#bulkWaybillPrintBtn').click();await page.waitForTimeout(220);
assert.deepEqual(await page.evaluate(()=>marked),['SPX-shared']);assert.equal(await page.locator('iframe').evaluate(f=>f.contentDocument.querySelectorAll('.p').length),1);
console.log('Two sales orders sharing a waybill produce one page and one shared print record');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});

const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 520, height: 1000 } });
        await page.setContent('<body style="padding:24px;background:#f1f5f9"></body>');
        await page.evaluate(html => {
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            document.body.appendChild(parsed.getElementById('jtWaybillPrintContent'));
            const fields = {jtPrintTime:'17:51 20/10/2026',jtWaybillDisplayCode:'SPXVN06443836531A',jtPrintReceiverName:'Quỳnh',jtPrintReceiverAddress:'(Thôn Tam Giáp cũ), thôn Liên Hà, xã Liên Minh, Ninh Bình',jtPrintReceiverPhone:'SĐT: 0968311328',jtPrintReceiverOrderCode:'Mã đơn hàng: 16856',jtPrintTotalQty:'1',jtPrintProductsList:'giày new balance 530 gs steel grey gr530ka - 40 x 1',jtPrintCODAmount:'0 đ',jtPrintSpxFirstSort:'MBD-28-17-VB10-N',jtPrintSpxThirdSort:'LM 01',jtPrintSpxReturnSort:'DN-36-23-CL14-N'};
            for (const [id,value] of Object.entries(fields)) { const el=document.getElementById(id); if(el)el.textContent=value; }
            for (const id of ['jtPrintSpxSortCodes','jtPrintSpxThirdSort','jtPrintSpxReturnSort']) document.getElementById(id).style.display='block';
        }, fs.readFileSync('index.html', 'utf8'));
        await page.addScriptTag({ path: 'qrcode.min.js' });
        await page.addScriptTag({ path: 'JsBarcode.all.min.js' });
        const app = fs.readFileSync('app.js', 'utf8');
        const graphics = app.slice(app.indexOf('        // Render Barcode'), app.indexOf('        // Decode carrier/region'));
        await page.evaluate(code => { const order = { jt_waybill_id:'SPXVN06443836531A' }; new Function('order',code)(order); }, graphics);
        await page.waitForFunction(() => document.querySelector('#jtWaybillQRCode img')?.getAttribute('src')?.startsWith('data:'));
        await page.screenshot({path:'.tmp/waybill-large-qr-preview.png',fullPage:true});
        const rowPositions = await page.evaluate(() => {
            const box = id => document.getElementById(id).getBoundingClientRect();
            const barcode=box('jtWaybillBarcodeRow'), qr=box('jtWaybillQrRow'), address=box('jtWaybillAddressRow'), route=box('jtPrintSpxFirstSort');
            return {barcodeBottom:barcode.bottom, qrTop:qr.top, qrBottom:qr.bottom,addressTop:address.top,routeTop:route.top,routeBottom:route.bottom};
        });
        assert.ok(rowPositions.barcodeBottom <= rowPositions.qrTop);
        assert.ok(rowPositions.qrBottom <= rowPositions.addressTop);
        assert.ok(rowPositions.routeTop >= rowPositions.qrTop && rowPositions.routeBottom <= rowPositions.qrBottom);
        await page.locator('#jtWaybillPrintContent').screenshot({path:'.tmp/waybill-requested-layout.png'});

        await page.evaluate(() => { const el=document.getElementById('jtWaybillPrintContent');el.style.width='74mm';el.style.maxWidth='74mm';el.style.padding='4px';el.style.border='none'; });
        const metrics = await page.evaluate(() => {
            const label=document.getElementById('jtWaybillPrintContent'),qr=document.getElementById('jtWaybillQRCode');
            return {width:label.getBoundingClientRect().width,height:label.getBoundingClientRect().height,qr:qr.getBoundingClientRect().width,scrollWidth:label.scrollWidth};
        });
        console.log('Print dimensions:', JSON.stringify(metrics));
        console.log(await page.evaluate(() => [...document.getElementById('jtWaybillPrintContent').children].map(el => ({text:el.textContent.trim().slice(0,25),height:el.getBoundingClientRect().height}))));
        console.log(await page.evaluate(() => {const root=document.getElementById('jtWaybillPrintContent'),right=root.getBoundingClientRect().right;return [...root.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().right>right+1).map(el=>({tag:el.tagName,id:el.id,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,30)}))}));
        assert.ok(metrics.scrollWidth <= Math.ceil(metrics.width), 'Label must not overflow horizontally');
        await page.screenshot({path:'.tmp/waybill-large-qr-print.png',fullPage:true});
        const qrImage = await page.locator('#jtWaybillQRCode').screenshot();
        await page.addScriptTag({path:'public/html5-qrcode.min.js'});
        const decoded = await page.evaluate(async base64 => {
            const el=document.createElement('div');el.id='decode-reader';document.body.appendChild(el);
            const blob=await (await fetch('data:image/png;base64,'+base64)).blob();
            const reader=new Html5Qrcode('decode-reader');
            return await reader.scanFile(new File([blob],'qr.png',{type:'image/png'}),false);
        }, qrImage.toString('base64'));
        assert.equal(decoded,'SPXVN06443836531A');
        console.log('PASS: generated enlarged QR decodes at actual 74mm print width; label has no horizontal overflow.');
    } finally { await browser.close(); }
})().catch(err => {console.error(err);process.exitCode=1});

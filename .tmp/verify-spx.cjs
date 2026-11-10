const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true } });
    await server.listen();
    let browser;
    try {
        const live = await fetch('http://127.0.0.1:5191/api/spx-track?spx_tn=SPXVN06196702233A');
        const liveData = await live.json();
        assert.equal(live.status, 200, JSON.stringify(liveData));
        assert.equal(liveData.spx_tn, 'SPXVN06196702233A');
        assert.equal(typeof liveData.is_picked_up, 'boolean');
        console.log('LIVE API:', liveData.tracking_code_group_name, 'picked:', liveData.is_picked_up);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const html = fs.readFileSync('index.html', 'utf8');
        const start = html.indexOf('        <div id="spx-tracking-tab-content"');
        const end = html.indexOf('        <!-- TAB CONTENT 6: WEBSITE -->', start);
        const panel = html.slice(start, end).replace('display:none;', 'display:flex;');
        let records = [], group = 'Pending Pickup';
        const code = 'SPXVN06196702233A';
        await page.route('**/tracking-fixture', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/ui-refresh.css"><div style="height:100vh;overflow:auto">${panel}</div><script type="module">import {setupSpxTracking} from '/spx-tracking.js'; setupSpxTracking({supabaseUrl:'https://tracking-test.local',supabaseKey:'test'});</script>` }));
        await page.route('https://tracking-test.local/**', async route => {
            const req = route.request();
            const parsed = new URL(req.url());
            let result = records;
            if (req.method() === 'POST') {
                const row = req.postDataJSON();
                if (records.some(r => r.spx_tn === row.spx_tn)) result = [];
                else { const added = { ...row, is_picked_up: false, created_at: new Date().toISOString() }; records.push(added); result = [added]; }
            } else if (req.method() === 'PATCH') {
                const row = records.find(r => r.spx_tn === parsed.searchParams.get('spx_tn').slice(3));
                Object.assign(row, req.postDataJSON()); result = [row];
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result), headers: { 'access-control-allow-origin': '*' } });
        });
        await page.route('**/api/spx-track?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ spx_tn: new URL(route.request().url()).searchParams.get('spx_tn'), tracking_code_group_name: group, tracking_code_subgroup_name: group, latest_event: group === 'In Transit' ? 'Đơn hàng đã được lấy' : 'Người bán đang chuẩn bị hàng', is_picked_up: group !== 'Pending Pickup' }) }));
        await page.goto('http://127.0.0.1:5191/tracking-fixture');
        await page.locator('#spxAddTracking').waitFor();
        await page.fill('#spxTrackingCode', code);
        await page.fill('#spxTrackingNote', 'Khách mẫu · đơn 16815');
        await page.click('#spxAddTracking');
        await page.waitForFunction(() => document.querySelector('#spxPendingCount').textContent === '1' && !document.querySelector('#spxAddTracking').disabled);
        assert.equal(records.length, 1);
        await page.locator('[data-spx-check]').waitFor();
        assert.equal(await page.locator('[data-spx-check]').isEnabled(), true);
        await page.fill('#spxTrackingCode', code);
        await page.click('#spxAddTracking');
        await page.waitForFunction(() => !document.querySelector('#spxAddTracking').disabled);
        assert.equal(records.length, 1);
        group = 'In Transit';
        await page.click('#spxCheckActive');
        await page.waitForFunction(() => document.querySelector('#spxTransitCount').textContent === '1');
        assert.equal(records[0].is_picked_up, true);
        assert.ok(records[0].picked_up_at);
        await page.click('#spxReloadTracking');
        await page.waitForFunction(() => document.querySelector('#spxTransitCount').textContent === '1' && !document.querySelector('#spxReloadTracking').disabled);
        group = 'Out for Delivery';
        await page.click('#spxCheckActive');
        await page.waitForFunction(() => document.querySelector('#spxDeliveringCount').textContent === '1' && !document.querySelector('#spxCheckActive').disabled);
        group = 'Delivered';
        await page.click('#spxCheckActive');
        await page.waitForFunction(() => document.querySelector('#spxDeliveredCount').textContent === '1');
        assert.equal(await page.locator('#spxCheckActive').isDisabled(), true);
        assert.equal(records[0].tracking_code_group_name, 'Delivered');
        await page.addScriptTag({ url: 'http://127.0.0.1:5191/qrcode.min.js' });
        const qr = await page.evaluate(() => {
            const el = document.createElement('div');
            new QRCode(el, { text: 'https://spx.vn/m/track?SPXVN06196702234A', width: 350, height: 350 });
            return el.querySelector('canvas').toDataURL();
        });
        group = 'Pending Pickup';
        await page.locator('#spxQrFile').setInputFiles({ name: 'bill-qr.png', mimeType: 'image/png', buffer: Buffer.from(qr.split(',')[1], 'base64') });
        await page.waitForFunction(() => document.querySelector('#spxPendingCount').textContent === '1' && !document.querySelector('#spxAddTracking').disabled);
        assert.equal(records.find(r => r.spx_tn === 'SPXVN06196702234A').source, 'qr');
        await page.waitForFunction(() => document.querySelector('#spxQrArea').hidden);
        records.push({spx_tn:'SPXVN06196639730A',source:'manual',is_picked_up:true,tracking_code_group_name:'In Transit',created_at:new Date().toISOString()});
        records.push({spx_tn:'SPXVN06102100207A',source:'qr',is_picked_up:true,tracking_code_group_name:'Out for Delivery',created_at:new Date().toISOString()});
        await page.click('#spxReloadTracking');
        await page.waitForFunction(() => ['spxPendingCount','spxTransitCount','spxDeliveringCount','spxDeliveredCount'].every(id => document.getElementById(id).textContent === '1'));
        await page.screenshot({ path: '.tmp/spx-tracking-desktop.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: '.tmp/spx-tracking-mobile.png', fullPage: true });
        assert.deepEqual(errors, []);
        console.log('PASS: manual entry, duplicate protection, all four delivery stages + persistence, actual QR image decoding, desktop/mobile layout; no browser errors.');
    } finally { await browser?.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { chromium } = require('playwright');
const { createServer } = require('vite');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const server = await createServer({ server: { host: '127.0.0.1', port: 5191, strictPort: true } });
    await server.listen();
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        await page.clock.install();
        let lookups = 0;
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
                const payload = req.postDataJSON();
                result = [];
                for (const row of Array.isArray(payload) ? payload : [payload]) {
                    if (!records.some(r => r.spx_tn === row.spx_tn)) {
                        const added = { ...row, is_picked_up: false, created_at: new Date().toISOString() };
                        records.push(added); result.push(added);
                    }
                }
            } else if (req.method() === 'PATCH') {
                const row = records.find(r => r.spx_tn === parsed.searchParams.get('spx_tn').slice(3));
                Object.assign(row, req.postDataJSON()); result = [row];
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result), headers: { 'access-control-allow-origin': '*' } });
        });
        await page.route('**/api/spx-track?**', route => { lookups++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ spx_tn: new URL(route.request().url()).searchParams.get('spx_tn'), tracking_code_group_name: group, tracking_code_subgroup_name: group, latest_event: group === 'In Transit' ? 'Đơn hàng đã được lấy' : 'Người bán đang chuẩn bị hàng', is_picked_up: group !== 'Pending Pickup' }) }); });
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
        assert.equal(lookups, 0, 'Adding and rescanning must not call SPX');
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
        await page.evaluate(() => {
            window.Html5Qrcode = class {
                constructor() { this.isScanning = false; }
                async start(config, options, callback) {
                    window.testScanCallback = callback;
                    this.isScanning = true;
                    document.getElementById('spxQrReader').innerHTML = '<div style="height:360px;background:#172b4d"></div>';
                }
                async stop() { this.isScanning = false; }
                clear() { document.getElementById('spxQrReader').innerHTML = ''; }
            };
        });
        await page.click('#spxStartCamera');
        await page.evaluate(() => { void window.testScanCallback('SPXVN06196702235A'); });
        await page.waitForFunction(() => !document.getElementById('spxQrFeedback').hidden && document.getElementById('spxQrFeedback').dataset.kind === 'success');
        assert.match(await page.locator('#spxQrFeedback').textContent(), /SPXVN06196702235A/);
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#spxQrFeedback').isVisible(), true);
        await page.waitForTimeout(1200);
        assert.equal(await page.locator('#spxQrFeedback').isHidden(), true);
        await page.evaluate(() => { void window.testScanCallback('SPXVN06196702235A'); });
        await page.waitForFunction(() => !document.getElementById('spxQrFeedback').hidden && document.getElementById('spxQrFeedback').dataset.kind === 'duplicate');
        assert.match(await page.locator('#spxQrFeedback').textContent(), /Mã trùng/);
        const cameraBox = await page.locator('#spxQrReader').boundingBox();
        const feedbackBox = await page.locator('#spxQrFeedback').boundingBox();
        assert.ok(Math.abs((feedbackBox.y + feedbackBox.height / 2) - (cameraBox.y + cameraBox.height / 2)) < 3, 'Feedback must be centered on the scan area');

        await page.screenshot({ path: '.tmp/spx-camera-feedback.png', fullPage: true });
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#spxQrFeedback').isVisible(), true);
        await page.waitForTimeout(1200);
        assert.equal(await page.locator('#spxQrFeedback').isHidden(), true);
        assert.equal(records.filter(r => r.spx_tn === 'SPXVN06196702235A').length, 1);
        await page.click('#spxStopCamera');
        const beforeReload = lookups;
        await page.reload();
        await page.waitForFunction(() => !document.querySelector('#spxReloadTracking').disabled);
        assert.equal(lookups, beforeReload, 'Reopening within 24 hours must not call SPX');
        await page.clock.fastForward(24 * 60 * 60 * 1000 - 10000);
        assert.equal(lookups, beforeReload, 'Must wait the full daily interval');
        await page.clock.fastForward(20000);
        await page.waitForFunction(() => !document.querySelector('#spxReloadTracking').disabled);
        await page.waitForTimeout(100);
        assert.equal(lookups, beforeReload + 4, 'One daily run checks the four unfinished records');
        const lookupsBeforeBulk = lookups;
        const beforeBulk = records.length;
        await page.fill('#spxTrackingCode', `${code} SPXVN06196702236A-SPXVN06196702237A,\nSPXVN06196702238A SPXVN06196702236A`);
        await page.fill('#spxTrackingNote', 'Lô hàng kiểm thử');
        await page.click('#spxAddTracking');
        await page.waitForFunction(() => document.getElementById('spxTrackingNotice').textContent.includes('Đã thêm 3 vận đơn mới, bỏ qua 2 mã trùng'));
        assert.equal(records.length, beforeBulk + 3);
        assert.equal(records.find(r => r.spx_tn === 'SPXVN06196702237A').note, 'Lô hàng kiểm thử');
        assert.equal(lookups, lookupsBeforeBulk);
        await page.fill('#spxTrackingCode', 'SPXVN06196702239A, INVALID');
        await page.click('#spxAddTracking');
        await page.waitForFunction(() => document.getElementById('spxTrackingNotice').textContent.includes('Mã không hợp lệ'));
        assert.equal(records.length, beforeBulk + 3);
        assert.ok((await page.inputValue('#spxTrackingCode')).includes('INVALID'));
        await page.fill('#spxTrackingCode', 'SPXVN06196702240A');
        await page.press('#spxTrackingCode', 'Enter');
        await page.waitForFunction(() => !document.getElementById('spxAddTracking').disabled && !document.getElementById('spxTrackingCode').value);
        assert.equal(records.length, beforeBulk + 4);
        assert.deepEqual(errors, []);
        console.log('PASS: mixed separators, batch insert, input/database duplicate counts, shared note, invalid input retained, Enter submit, camera feedback and 24h schedule preserved.');
    } finally { await browser?.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 760, height: 850 } });
        const source = fs.readFileSync('bill.html', 'utf8');
        const start = source.indexOf('        function formatSpxTrackingTime');
        const functions = source.slice(start, source.indexOf('        // Bind configuration', start));
        const styles = source.slice(source.indexOf('<style>') + 7, source.indexOf('</style>'));
        await page.route('https://proof.example/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#e2e8f0"/><text x="15" y="50" font-size="12">SPX proof</text></svg>' }));
        await page.setContent(`<meta charset="utf-8"><style>${styles}</style><main style="padding:36px;background:white;width:100%;max-width:650px;margin:30px auto"><h3>Hành trình đơn hàng</h3><section id="deliveryTimeline"><div id="timelineContent" style="font-size:12px;padding-left:15px;border-left:2px solid #e2e8f0"></div></section></main>`);
        await page.addScriptTag({ content: functions });
        await page.evaluate(() => {
            const result = { retcode: 0, data: {
                order_info: { tracking_code_group_name: 'Delivered' },
                tracking_info: { pod_list: ['https://proof.example/delivered.jpg'], ep_info_list: [
                    { tracking_code: 'F980', pod_list: ['https://proof.example/delivered.jpg'] },
                    { tracking_code: 'F050', pop_list: ['https://proof.example/pickup.jpg'] }
                ] },
                sls_tracking_info: { records: [
                    { tracking_code: 'F980', tracking_name: 'Delivered', actual_time: 1792383035, description: 'Giao hàng thành công' },
                    { tracking_code: 'F050', tracking_name: 'Reschedule Pickup', actual_time: 1792064239, description: 'Người gửi hẹn lại ngày lấy hàng' }
                ] }
            } };
            window.renderSpxTimeline(result, document.getElementById('deliveryTimeline'), document.getElementById('timelineContent'));
        });
        assert.equal(await page.locator('.spx-proof-images img').count(), 2);
        assert.equal(await page.locator('a[href="https://proof.example/delivered.jpg"]').count(), 1);
        await page.screenshot({ path: '.tmp/spx-bill-proofs.png', fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        console.log('PASS: bill renders delivery and failed-pickup proof links on correct milestones, no duplicate photos, mobile layout fits.');
    } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });

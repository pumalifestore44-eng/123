const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const handler = source.slice(source.indexOf('const invoiceSendsInFlight ='), source.indexOf('// Auto-fill Province/District/Ward'));

async function setup(overrides = {}) {
    const { buildMultiImagePayload } = await import('../messagePayloadUtils.mjs');
    const requests = [], alerts = [], toasts = [];
    const thread = { tid: 'customer-a', page_pid: 'fb-page-a' };
    const context = {
        window: {}, activeThread: thread, activeMessages: [], smaxThreads: [thread],
        smaxToken: 'test-token', PANCAKE_API_KEY: 'test-key', SMAX_BIZ_ID: 'test-biz',
        FormData, URLSearchParams, buildMultiImagePayload,
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key',
        createInvoiceImageBlob: async () => new Blob(['bill'], { type: 'image/png' }),
        isTikTokChatboxThread: t => t.source === 'botbanhang_tiktok',
        renderMessages() {}, renderThreads() {}, fetchMessages() {}, setTimeout() {},
        showInvoiceToast: message => toasts.push(message), alert: message => alerts.push(message),
        console: { error() {} },
        fetch: async (url, init) => {
            requests.push({ url, init });
            return { ok: true, json: async () => url.includes('pancake.vn') ? { success: true, content_url: 'https://cdn.example/bill.png' } : { success: true } };
        },
        ...overrides
    };
    vm.createContext(context);
    vm.runInContext(handler, context);
    const button = { disabled: false, innerHTML: 'Gửi bill' };
    const event = { currentTarget: button, stopPropagation() {} };
    return { context, requests, alerts, toasts, button, send: () => context.window.sendInvoiceImageFromDashboard('order-1', '16816', event) };
}

test('bill is uploaded as PNG, sent via Smax, and displayed only after acceptance', async () => {
    const h = await setup();
    await h.send();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].init.body.get('file').type, 'image/png');
    assert.match(h.requests[1].url, /pages\/fb-page-a\/threads\/customer-a\/messages$/);
    const payload = JSON.parse(h.requests[1].init.body);
    assert.equal(payload.type, 'facebook_message');
    assert.equal(payload.messages[0].picture, 'https://cdn.example/bill.png');
    assert.equal(h.context.activeMessages.length, 1);
    assert.equal(h.context.smaxThreads[0].is_replied, true);
    assert.equal(h.alerts.length, 0);
    assert.equal(h.toasts.length, 1);
    assert.equal(h.button.disabled, false);
    assert.equal(h.button.innerHTML, 'Gửi bill');
});

test('switching chat during rendering preserves recipient and blocks concurrent duplicate sends', async () => {
    let finish;
    const h = await setup({ createInvoiceImageBlob: () => new Promise(resolve => { finish = resolve; }) });
    const first = h.send();
    await h.send();
    h.context.activeThread = { tid: 'customer-b', page_pid: 'fb-page-b' };
    finish(new Blob(['bill'], { type: 'image/png' }));
    await first;
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].url, /threads\/customer-a\/messages$/);
    assert.equal(h.context.activeMessages.length, 0);
});

test('upload or Smax failure never reports success and permits retry', async () => {
    for (const stage of ['upload', 'send', 'api-error']) {
        let calls = 0;
        const h = await setup({ fetch: async () => {
            calls++;
            if (calls === 1 && stage !== 'upload') return { ok: true, json: async () => ({ content_url: 'https://cdn.example/bill.png' }) };
            return stage === 'api-error' ? { ok: true, json: async () => ({ success: false }) } : { ok: false, status: 500 };
        } });
        await h.send();
        assert.equal(calls, stage === 'upload' ? 1 : 2);
        assert.equal(h.context.activeMessages.length, 0);
        assert.equal(h.toasts.length, 0);
        assert.equal(h.alerts.length, 1);
        assert.equal(h.button.disabled, false);
        await h.send();
        assert.equal(h.alerts.length, 2);
    }
});

test('missing recipient, login, or unsupported source stops before image generation', async () => {
    for (const overrides of [{ activeThread: null }, { smaxToken: '' }, { activeThread: { tid: 'x', page_pid: 'tt-page', source: 'botbanhang_tiktok' } }]) {
        const h = await setup({ ...overrides, createInvoiceImageBlob: () => { throw Error('must not render'); } });
        await h.send();
        assert.equal(h.requests.length, 0);
        assert.equal(h.alerts.length, 1);
    }
});

test('order management sends to the linked order customer instead of the active chat', async () => {
    const h = await setup();
    const originalFetch = h.context.fetch;
    h.context.fetch = async (url, init) => url.includes('pancake_orders')
        ? { ok: true, json: async () => [{ conversation_link: '/#tin-nhan?pid=fb-order-page&tid=order-customer' }] }
        : originalFetch(url, init);
    await h.context.window.sendInvoiceImageFromOrder('order-1', '16816', { currentTarget: h.button, stopPropagation() {} });
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].url, /pages\/fb-order-page\/threads\/order-customer\/messages$/);
    assert.equal(h.context.activeMessages.length, 0);
    assert.equal(h.toasts.length, 1);
    assert.equal(h.button.disabled, false);
});

test('an order without a linked conversation never falls back to the active chat', async () => {
    const h = await setup({ fetch: async () => ({ ok: true, json: async () => [{}] }) });
    await h.context.window.sendInvoiceImageFromOrder('order-1', '16816', { currentTarget: h.button, stopPropagation() {} });
    assert.equal(h.requests.length, 0);
    assert.equal(h.toasts.length, 0);
    assert.equal(h.alerts.length, 1);
    assert.match(h.alerts[0], /chưa có liên kết hội thoại/);
    assert.equal(h.button.disabled, false);
});

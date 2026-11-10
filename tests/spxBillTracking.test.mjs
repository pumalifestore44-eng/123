import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { toBillTrackingResponse } from '../supabase/functions/_shared/spx-bill-tracking.mjs';

const require = createRequire(import.meta.url);
const { transformSync } = require('esbuild');
const bill = fs.readFileSync(new URL('../bill.html', import.meta.url), 'utf8');
const waybill = 'SPXVN06688398327A';
const photo = 'https://spx.shopee.vn/downloads/test-delivered.jpg';
const pop = 'https://spx.shopee.vn/downloads/test-pickup.jpg';
const payload = () => ({ retcode: 0, data: {
    order_info: { spx_tn: waybill, tracking_code_group_name: 'Delivered', cod_amount: 100000 },
    sender_info: { sender_phone: 'private' }, deliver_info: { deliver_phone: 'private' }, payment_info: { payment_trade_id: 'private' },
    sls_tracking_info: { records: [{ tracking_code: 'F980', tracking_name: 'Delivered', actual_time: 200 }, { tracking_code: 'F050', actual_time: 100 }] },
    tracking_info: { pod_list: [photo, photo, 'javascript:alert(1)'], returning_start_time: 0,
        ep_info_list: [{ tracking_code: 'F980', pod_list: [photo] }, { tracking_code: 'F050', pop_list: [pop] }] }
} });

test('bill response retains proof fields without exposing management/customer details', () => {
    const result = toBillTrackingResponse(payload(), waybill);
    assert.deepEqual(result.data.tracking_info.pod_list, [photo]);
    assert.deepEqual(result.data.tracking_info.ep_info_list[1].pop_list, [pop]);
    assert.equal(result.data.tracking_info.returning_start_time, 0);
    assert.equal(result.data.sender_info, undefined);
    assert.equal(result.data.deliver_info, undefined);
    assert.equal(result.data.payment_info, undefined);
    assert.equal(result.data.order_info.cod_amount, undefined);
    assert.throws(() => toBillTrackingResponse(payload(), 'SPXVN00000000000A'), /không khớp/);
    assert.throws(() => toBillTrackingResponse({ retcode: 100 }, waybill), /Phiên đăng nhập/);
});

test('bill renders delivery and pickup proof on matching milestones with no duplicate images', () => {
    const context = { URL };
    vm.createContext(context);
    vm.runInContext(bill.slice(bill.indexOf('        function escapeSpxHtml'), bill.indexOf('        function renderSpxTimeline')), context);
    const result = toBillTrackingResponse(payload(), waybill);
    const used = new Set();
    const delivered = context.renderSpxProofs(result, { tracking_code: 'F980' }, used);
    assert.match(delivered, /Ảnh bằng chứng giao hàng/);
    assert.equal((delivered.match(/<img /g) || []).length, 1);
    const pickup = context.renderSpxProofs(result, { tracking_code: 'F050' }, used);
    assert.ok(pickup.includes(pop));
    assert.equal(context.renderSpxProofs(result, { tracking_code: 'F050' }, used), '');
    assert.equal(context.renderSpxProofs(result, { tracking_code: 'F510' }, used), '');
});

test('historical pickup events do not inherit the current Delivered status', () => {
    const context = {};
    vm.createContext(context);
    const start = bill.indexOf('        const SPX_STATUS_TRANSLATIONS');
    vm.runInContext(bill.slice(start, bill.indexOf('        function escapeSpxHtml', start)), context);
    assert.equal(context.translateSpxStatus({ tracking_name: 'Reschedule Pickup' }, 'Delivered'), 'Hẹn lại ngày lấy hàng');
    assert.equal(context.translateSpxStatus({ tracking_name: 'Some historical event' }, 'Delivered'), 'Cập nhật hành trình');
});

test('bill fetches authenticated proof data and falls back visibly when the function is unavailable', async () => {
    const context = { URLSearchParams, AbortSignal, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_KEY: 'test-key', console: { error() {} } };
    vm.createContext(context);
    vm.runInContext(bill.slice(bill.indexOf('        async function fetchSpxTracking'), bill.indexOf('        function formatSpxTrackingTime')), context);
    const requests = [];
    context.fetch = async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => toBillTrackingResponse(payload(), waybill) }; };
    const full = await context.fetchSpxTracking(waybill, 'order-1');
    assert.ok(full.data.tracking_info.pod_list.includes(photo));
    assert.equal(JSON.parse(requests[0].options.body).order_id, 'order-1');
    assert.equal(JSON.parse(requests[0].options.body).action, 'get_bill_tracking');
    assert.ok(requests[0].url.endsWith('/functions/v1/create-order'));
    context.fetch = async url => url.includes('/functions/')
        ? { ok: false, json: async () => ({ error: 'not deployed' }) }
        : { ok: true, json: async () => ({ retcode: 0, data: { order_info: { spx_tn: waybill } } }) };
    const fallback = await context.fetchSpxTracking(waybill, 'order-1');
    assert.equal(fallback.retcode, 0);
    assert.equal(fallback.proof_unavailable, true);
});

const edgeSource = fs.readFileSync(new URL('../supabase/functions/create-order/index.ts', import.meta.url), 'utf8');
function edgeHarness({ cookie = 'test-cookie', orderSn = 'VN2645138089362702', orderId = '16422' } = {}) {
    let handler, requested = false;
    const query = { select() { return this; }, eq(field, id) { assert.equal(field, 'id'); assert.equal(id, orderId); return this; }, async maybeSingle() { return { data: { id: orderId, jt_waybill_id: waybill, order_spx: orderSn }, error: null }; } };
    const context = {
        URL, Response, AbortSignal, console: { log() {}, error() {} },
        Deno: { env: { get: key => key === 'SPX_COOKIE' ? cookie : 'test-config' } },
        require: name => name.includes('server.ts') ? { serve: fn => { handler = fn; } }
            : name.includes('supabase-js') ? { createClient: () => ({ from: () => query }) } : { toBillTrackingResponse },
        fetch: async (url, options) => {
            requested = true;
            assert.ok(url.includes('/logistic/order/get_order_info?order_sn=VN2645138089362702'));
            assert.equal(options.headers.cookie, 'test-cookie');
            return { ok: true, json: async () => payload(), text: async () => JSON.stringify(payload()) };
        }
    };
    vm.createContext(context);
    // Substitute only the configured cookie in this isolated runtime; never use a real session in tests.
    const configuredSource = edgeSource.replace(/const SPX_COOKIE\s*=[\s\S]*?;(?=\s*const SPX_HEADERS)/, 'const SPX_COOKIE = Deno.env.get("SPX_COOKIE") || "";');
    vm.runInContext(transformSync(configuredSource, { loader: 'ts', format: 'cjs' }).code, context);
    return { call: (body = { action: 'get_bill_tracking', order_id: orderId }) => handler({ method: 'POST', json: async () => body }), requested: () => requested, findOrderSn: context.findOrderSnInObject };
}
test('Edge Function resolves order_sn from the bill before fetching private SPX details', async () => {
    const edge = edgeHarness();
    const response = await edge.call();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.tracking_info.pod_list, [photo]);
    assert.equal(edge.requested(), true);
});

test('local bill identifiers with underscores are accepted; invalid identifiers are rejected', async () => {
    const edge = edgeHarness({ orderId: 'local_16422' });
    const response = await edge.call();
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.tracking_info.pod_list, [photo]);
    for (const invalid of ['', 'id?x=1', '../bill', 'x'.repeat(81)]) {
        assert.equal((await edge.call({ action: 'get_bill_tracking', order_id: invalid })).status, 400);
    }
});
test('missing cookie or saved order_sn stops the authenticated request', async () => {
    for (const [options, status] of [[{ cookie: '' }, 503], [{ orderSn: '' }, 422]]) {
        const edge = edgeHarness(options);
        assert.equal((await edge.call()).status, status);
        assert.equal(edge.requested(), false);
    }
});

test('combined function keeps create/cancel/extra routing and resolves only matching order_sn', async () => {
    const edge = edgeHarness();
    for (const [body, message] of [[{}, 'receiver'], [{action: 'cancel'}, 'Thiếu'], [{action: 'get_order_extra'}, 'Thiếu']]) {
        const response = await edge.call(body);
        assert.equal(response.status, 400);
        assert.ok((await response.json()).error.includes(message));
    }
    assert.equal(edge.requested(), false);
    const sample = { data: { list: [
        {order_info: {spx_tn: 'SPXVN00000000000A', order_sn: 'VN00000000000000'}},
        {order_info: {spx_tn: waybill, order_sn: 'VN2645138089362702', sls_tn: 'VN269918875736C'}}
    ]}};
    assert.equal(edge.findOrderSn(sample, waybill), 'VN2645138089362702');
    assert.equal(edge.findOrderSn({data:{sls_tn:'VN269918875736C',spx_tn:waybill}}, waybill), null);
});

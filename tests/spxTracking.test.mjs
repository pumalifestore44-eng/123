import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSpxCode, extractSpxCodes, parseSpxTracking, buildSpxTrackingPatch, getSpxStage, shouldCheckSpxTracking, SPX_AUTO_CHECK_INTERVAL, isSpxAutoCheckDue } from '../spx-tracking-utils.mjs';
import handler from '../api/spx-track.js';

const code = 'SPXVN06196702233A';
test('bulk input accepts mixed separators and removes repeated codes', () => {
    const result = extractSpxCodes('spxvn06196702233a SPXVN06196702234A-SPXVN06196702235A,\nSPXVN06196702233A');
    assert.deepEqual(result.codes, [code, 'SPXVN06196702234A', 'SPXVN06196702235A']);
    assert.equal(result.duplicates, 1);
    assert.deepEqual(extractSpxCodes(`https://spx.vn/m/track?${code}`).codes, [code]);
    assert.throws(() => extractSpxCodes(`${code},INVALID`), /INVALID/);
    assert.throws(() => extractSpxCodes(' , - \n'));
});
test('automatic lookup waits a full 24 hours and never treats missing/future timestamps as due', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    assert.equal(isSpxAutoCheckDue(now - SPX_AUTO_CHECK_INTERVAL + 1, now), false);
    assert.equal(isSpxAutoCheckDue(now - SPX_AUTO_CHECK_INTERVAL, now), true);
    assert.equal(isSpxAutoCheckDue(now - 2 * SPX_AUTO_CHECK_INTERVAL, now), true);
    for (const timestamp of [0, undefined, 'invalid', now + 1000]) assert.equal(isSpxAutoCheckDue(timestamp, now), false);
});
const response = group => ({ retcode: 0, data: {
    order_info: { spx_tn: code, tracking_code_group_name: group },
    sls_tracking_info: { records: [{ actual_time: 100, description: 'Old' }, { actual_time: 200, description: 'Latest' }] }
} });

test('extracts manual and QR tracking codes, rejects ambiguous input', () => {
    assert.equal(extractSpxCode(`  ${code.toLowerCase()} `), code);
    assert.equal(extractSpxCode(`https://spx.vn/m/track?${code}`), code);
    assert.equal(extractSpxCode(`https://spx.vn/track?spx_tn=${code}`), code);
    assert.throws(() => extractSpxCode('https://example.com/bill?id=123'));
    assert.throws(() => extractSpxCode(`${code} SPXVN06196702234A`), /nhiều mã/);
});

test('pickup is recognized from SPX status and newest event is selected', () => {
    assert.equal(parseSpxTracking(response('Pending Pickup'), code).is_picked_up, false);
    const result = parseSpxTracking(response('In Transit'), code);
    assert.equal(result.is_picked_up, true);
    assert.equal(result.latest_event, 'Latest');
    assert.throws(() => parseSpxTracking({ retcode: 1, message: 'not found' }, code), /not found/);
    assert.throws(() => parseSpxTracking(response('In Transit'), 'SPXVN06196702234A'), /không khớp/);
    assert.throws(() => parseSpxTracking({ data: {} }, code));
});

test('classifies all four stages including direct delivery lookup without pickup history', () => {
    for (const [group, stage] of [
        ['Pending Pickup', 'pending_pickup'], ['In Transit', 'in_transit'],
        ['Out for Delivery', 'out_for_delivery'], ['Delivering', 'out_for_delivery'],
        ['Delivered', 'delivered'], ['Delivered Successfully', 'delivered']
    ]) {
        const result = parseSpxTracking(response(group), code);
        assert.equal(getSpxStage(result), stage);
        assert.equal(result.is_picked_up, stage !== 'pending_pickup');
        assert.equal(shouldCheckSpxTracking(result), stage !== 'delivered');
        const saved = buildSpxTrackingPatch({}, result);
        assert.equal(Boolean(saved.picked_up_at), stage !== 'pending_pickup');
    }
});

test('delivery subgroup refines In Transit and failed delivery is never marked delivered', () => {
    assert.equal(getSpxStage({ tracking_code_group_name: 'In Transit', tracking_code_subgroup_name: 'Out for Delivery' }), 'out_for_delivery');
    assert.equal(getSpxStage({ tracking_code_group_name: 'In Transit', tracking_code_subgroup_name: 'Delivered' }), 'delivered');
    assert.equal(getSpxStage({ tracking_code_group_name: 'Delivery Failed', is_picked_up: true }), 'in_transit');
    assert.equal(shouldCheckSpxTracking({ tracking_code_group_name: 'Delivery Failed', is_picked_up: true }), true);
    assert.equal(getSpxStage({ tracking_code_group_name: 'Pending Pickup', is_picked_up: true }), 'pending_pickup');
});

test('pickup milestone is retained after later statuses and rescans', () => {
    const now = '2026-10-16T05:00:00.000Z';
    const picked = buildSpxTrackingPatch({}, parseSpxTracking(response('In Transit'), code), now);
    assert.equal(picked.picked_up_at, now);
    assert.equal(picked.last_checked_at, now);
    const later = buildSpxTrackingPatch(picked, parseSpxTracking(response('Delivered'), code), '2026-10-17T05:00:00.000Z');
    assert.equal(later.is_picked_up, true);
    assert.equal(later.picked_up_at, now);
    assert.equal(later.tracking_code_group_name, 'Delivered');
});

function resMock() {
    return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; } };
}
test('API validates requests before any network request', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('unexpected fetch'); };
    try {
        for (const [req, status] of [[{ method: 'POST', url: '/api/spx-track' }, 405], [{ method: 'GET', url: '/api/spx-track?spx_tn=invalid' }, 400]]) {
            const res = resMock(); await handler(req, res); assert.equal(res.statusCode, status);
        }
    } finally { globalThis.fetch = original; }
});
test('API sends required SPX headers and returns normalized pickup result', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
        assert.equal(new URL(url).searchParams.get('spx_tn'), code);
        assert.equal(options.headers.source, 'mobile');
        assert.equal(options.headers.referer, `https://spx.vn/m/track?${code}`);
        return { ok: true, json: async () => response('In Transit') };
    };
    try {
        const res = resMock(); await handler({ method: 'GET', url: `/api/spx-track?spx_tn=${code}` }, res);
        assert.equal(res.statusCode, 200); assert.equal(res.body.is_picked_up, true);
        assert.equal(res.body.spx_tn, code);
    } finally { globalThis.fetch = original; }
});
test('SPX application errors and invalid JSON never become successful lookups', async () => {
    const original = globalThis.fetch;
    try {
        for (const mock of [
            { ok: true, json: async () => ({ retcode: 100, message: 'not found' }) },
            { ok: true, json: async () => { throw new Error('Invalid JSON'); } },
            { ok: false, status: 403 }
        ]) {
            globalThis.fetch = async () => mock;
            const res = resMock(); await handler({ method: 'GET', url: `/api/spx-track?spx_tn=${code}` }, res);
            assert.equal(res.statusCode, 502); assert.ok(res.body.error);
        }
    } finally { globalThis.fetch = original; }
});

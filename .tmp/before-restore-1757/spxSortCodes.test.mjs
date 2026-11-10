import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../supabase/functions/create-order/index.ts', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function findOrderRecordInListAllOrder('), source.indexOf('async function executeOrderFlow('));
const orderSn = 'VN2645138089362702';
const waybill = 'SPXVN06688398327A';
function harness(fetch) {
    const context = { fetch, AbortSignal, SPX_BASE_URL: 'https://spx.vn', SPX_HEADERS: {},
        console: { log() {}, warn() {}, error() {} }, parseResponse: response => response.json(),
        setTimeout: resolve => resolve() };
    vm.createContext(context);
    vm.runInContext(functions, context);
    return context;
}

test('sort lookup fetches the exact shipment outside the recent-order window', async () => {
    const calls = [];
    const ctx = harness(async url => {
        calls.push(url);
        return { json: async () => ({ retcode: 0, data: {
            order_info: { order_sn: orderSn, spx_tn: waybill },
            sort_code_info: { r_first_sort_code: 'MBD-28-17-VB10-N', r_third_sort_code: 'LM 01' }
        } }) };
    });
    const result = await ctx.getOrderExtraInfoFromListAllOrder([waybill, orderSn]);
    assert.equal(result.sort_code_info.r_first_sort_code, 'MBD-28-17-VB10-N');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('get_order_info?order_sn=' + orderSn));
});

test('wrong shipment cannot supply routing codes; list fallback still works', async () => {
    const ctx = harness(async url => ({ json: async () => ({ retcode: 0, data: url.includes('get_order_info')
        ? { order_info: { order_sn: orderSn, spx_tn: 'SPXOTHER' }, sort_code_info: { r_first_sort_code: 'WRONG' } }
        : { list: [{ spx_tn: waybill, sort_code_info: { r_first_sort_code: 'CORRECT' } }] }
    }) }));
    assert.equal((await ctx.getOrderExtraInfoFromListAllOrder([waybill, orderSn])).sort_code_info.r_first_sort_code, 'CORRECT');
});

test('SPX failure leaves routing unavailable instead of inventing a code', async () => {
    const ctx = harness(async () => ({ json: async () => ({ retcode: 100, message: 'expired' }) }));
    const result = await ctx.getOrderExtraInfoFromListAllOrder([waybill, orderSn]);
    assert.equal(result.sort_code_info, null);
});

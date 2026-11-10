import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../supabase/functions/create-order/index.ts', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function findOrderRecordInListAllOrder('), source.indexOf('async function executeOrderFlow('));
const waybill = 'SPXVN06196702233A';
function harness(pages) {
    const requests = [];
    const context = { AbortSignal, SPX_BASE_URL: 'https://spx.vn', SPX_HEADERS: {},
        console: { log() {}, warn() {}, error() {} }, setTimeout: fn => fn(),
        parseResponse: r => r.json(),
        fetch: async (url, options) => {
            const body = JSON.parse(options.body);
            requests.push(body);
            assert.ok(requests.length < 10, 'pagination must terminate');
            return { json: async () => ({ retcode: 0, data: pages(body.offset, requests.length) }) };
        }
    };
    vm.createContext(context);
    vm.runInContext(helpers, context);
    return { lookup: () => context.getOrderExtraInfoFromListAllOrder([waybill]), requests };
}
const order = code => ({ order_info: { spx_tn: code }, sort_code_info: { r_first_sort_code: 'SE1-63-20-TA03' } });

test('finds shipment 63, beyond the old 60-shipment cap', async () => {
    const list = Array.from({ length: 100 }, (_, i) => order(i === 62 ? waybill : `OTHER${i}`));
    const h = harness(() => ({ list, total: 105 }));
    assert.equal((await h.lookup()).sort_code_info.r_first_sort_code, 'SE1-63-20-TA03');
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].page_size, 100);
    const { start, end } = h.requests[0].date_range_list[0];
    assert.equal(end - start, 91 * 86400);
});

test('reaches older shipment on second page, then stops at total for missing shipment', async () => {
    const h = harness(offset => ({ list: offset === 0 ? Array.from({length:100}, (_, i) => order(`OTHER${i}`)) : [order(waybill)], total: 101 }));
    assert.equal((await h.lookup()).sort_code_info.r_first_sort_code, 'SE1-63-20-TA03');
    assert.deepEqual(h.requests.map(r => r.offset), [0, 100]);
    const missing = harness(() => ({ list: [order('OTHER')], total: 1 }));
    assert.equal((await missing.lookup()).sort_code_info, null);
    assert.equal(missing.requests.length, 1);
});

test('missing total stops on an empty page', async () => {
    const h = harness(offset => ({ list: offset === 0 ? [order('OTHER')] : [] }));
    assert.equal((await h.lookup()).sort_code_info, null);
    assert.deepEqual(h.requests.map(r => r.offset), [0,100]);
});

function detailHarness(detail, listSort = { r_first_sort_code: 'FROM-LIST' }) {
    const calls = [], orderSn = 'VN263129740655985E';
    const context = { AbortSignal, SPX_BASE_URL: 'https://spx.vn', SPX_HEADERS: {},
        console: { log() {}, warn() {}, error() {} }, setTimeout: fn => fn(), parseResponse: r => r.json(),
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { json: async () => options.method === 'GET' ? detail : ({ retcode:0, data:{total:1,list:[{
                order_info:{order_sn:orderSn,spx_tn:waybill},sort_code_info:listSort
            }]} }) };
        }
    };
    vm.createContext(context);vm.runInContext(helpers,context);
    return { calls, lookup:()=>context.getOrderExtraInfoFromListAllOrder([waybill,orderSn]) };
}

test('uses sort codes nested in exact order details before listing orders', async () => {
    const h=detailHarness({retcode:0,data:{order_info:{order_sn:'VN263129740655985E',spx_tn:waybill,estimated_shipping_fee:11000},
        parcel_info:{sort_code_info:{r_first_sort_code:'FROM-DETAIL'}}}});
    const result=await h.lookup();
    assert.equal(result.sort_code_info.r_first_sort_code,'FROM-DETAIL');
    assert.equal(result.estimated_shipping_fee,11000);
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].options.method,'GET');
    assert.ok(h.calls[0].options.headers.referer.endsWith('/VN263129740655985E'));
});

test('detail without sort codes keeps its fee and obtains routing from list', async () => {
    const h=detailHarness({retcode:0,data:{order_info:{order_sn:'VN263129740655985E',spx_tn:waybill,estimated_shipping_fee:11000}}});
    const result=await h.lookup();
    assert.equal(result.sort_code_info.r_first_sort_code,'FROM-LIST');
    assert.equal(result.estimated_shipping_fee,11000);
    assert.deepEqual(h.calls.map(c=>c.options.method),['GET','POST']);
});

test('unrelated detail response and SPX errors cannot supply another shipment routing or fee', async () => {
    for (const detail of [
        {retcode:0,data:{order_info:{order_sn:'VN263129740655985E',spx_tn:'SPXOTHER',estimated_shipping_fee:999},sort_code_info:{r_first_sort_code:'WRONG'}}},
        {retcode:100,message:'session expired'}
    ]) {
        const h=detailHarness(detail);const result=await h.lookup();
        assert.equal(result.sort_code_info.r_first_sort_code,'FROM-LIST');
        assert.equal(result.estimated_shipping_fee,null);
    }
});

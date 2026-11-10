import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildGomshipPayloadFromForm, callGomshipFunction, listGomshipLegacyLocations, extractGomshipTracking, setupGomshipControls, submitGomshipForm, loadGomshipWarehouseCatalog, syncGomshipWarehouseSelection } from '../gomship-integration.mjs';
import { rememberLabelAccess, hasGomshipLabelAccess, fetchLabelPdf } from '../gomship-label-client.mjs';
import { initializeGomshipPrintPreview, prepareGomshipPrintPreview, selectGomshipPdf, isGomshipPdfSelected, getGomshipPdfPrintUrl } from '../gomship-print-preview.mjs';
import { primarySupabase } from '../supabase-config.mjs';

const fields = new Map();
const input = (id, value) => fields.set(id, { value });
const option = (id, value, name) => fields.set(id, {
  value,
  selectedIndex: 0,
  options: [{ value, dataset: { name }, textContent: name }]
});

function mockForm(addressType = '1') {
  fields.clear();
  input('jtLocalOrderId', 'TEST-123');
  input('jtReceiverName', 'Khách thử');
  input('jtReceiverPhone', '0900000000');
  input('jtReceiverAddress', '123 Đường thử');
  input('jtGoodsName', 'giày');
  input('jtWeight', '1.2');
  input('jtCodMoney', '100000');
  input('gomshipPaymentMethod', '0');
  input('gomshipProductValue', '999999');
  input('gomshipNote', '[CHO THỬ HÀNG]');
  input('gomshipProvinceCode', '');
  input('gomshipDistrictCode', '');
  input('gomshipWardCode', '');
  option('jtProvince', '1000', 'Thành phố Hồ Chí Minh');
  option('jtDistrict', '2000', 'Phường Bình Lợi Trung');
  option('jtWard', '3000', 'Phường khác');
  globalThis.document = {
    getElementById: id => fields.get(id) || null,
    querySelector: () => ({ value: addressType })
  };
}

async function mockRegisteredPickupWarehouse(sent, ids = {local:'local-B', official:48}) {
  const localName='Kho Hồ Chí Minh', localPhone='0909876543', localAddress='248/21 Hoàng Hoa Thám';
  fields.set('jtWarehouseSelect',{
    value:ids.local,selectedIndex:0,
    options:[{dataset:{localName,senderName:'PUMALIFE',senderPhone:localPhone,senderAddress:localAddress}}]
  });
  const warehouseSelect={
    value:'',options:[],dataset:{},
    replaceChildren(...options){this.options=[...options];this.value=options[0]?.value || '';},
    add(opt){this.options.push(opt);}
  };
  fields.set('gomshipWarehouseSelect',warehouseSelect);
  fields.set('gomshipWarehouseStatus',{textContent:''});
  globalThis.Option = class {constructor(text,value){this.textContent=text;this.value=value;}};
  globalThis.fetch=async(url,opts)=>{
    const body=JSON.parse(opts.body);
    if(body.action==='list_warehouses')return new Response(JSON.stringify({
      success:true,items:[
        {id:24,name:'Kho Hà Nội',phone:'0901234567',specific_address:'12 Nguyễn Trãi'},
        {id:48,name:localName,phone:localPhone,specific_address:localAddress}
      ]
    }),{status:200});
    sent.push({url,body});
    return new Response(JSON.stringify({success:true,gomship_response:{data:{id:833}}}),{status:200});
  };
  await loadGomshipWarehouseCatalog();
  assert.equal(warehouseSelect.value,String(ids.official));
}

test('GomShip 2-tier sends official province/ward names and codes, not SPX location IDs', () => {
  mockForm('1');
  option('jtProvince', '44', 'Tỉnh Quảng Trị');
  option('jtDistrict', '00123', 'Phường mẫu (test)');
  fields.get('jtProvince').options[0].dataset.source = 'gomship';
  fields.get('jtDistrict').options[0].dataset.source = 'gomship';
  input('gomshipProvinceCode', '95');
  input('gomshipWardCode', '99999');
  const body = buildGomshipPayloadFromForm();
  assert.equal(body.receiver.province.name, 'Tỉnh Quảng Trị');
  assert.equal(body.receiver.ward.name, 'Phường mẫu (test)');
  assert.equal(body.address_mode, '2-tier');
  assert.equal(body.receiver.district, undefined);
  assert.equal(body.province_code, '44');
  assert.equal(body.ward_code, '00123');
  assert.equal(body.product.weight, 1.2);
  assert.equal(body.order_id, 'TEST-123');
  assert.equal(body.action, 'create');
});
test('GomShip payment dropdown defaults to sender 0 and allows receiver 1 in both address modes',()=>{
  const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="gomshipPaymentMethod"/);
  assert.match(html,/<option value="0" selected>Người gửi trả/);
  assert.match(html,/<option value="1">Người nhận trả/);
  for (const addressType of ['1','2']) {
    mockForm(addressType);
    for (const id of addressType === '2'
      ? ['jtProvince','jtDistrict','jtWard'] : ['jtProvince','jtDistrict']) {
      fields.get(id).options[0].dataset.source = 'gomship';
    }
    assert.equal(buildGomshipPayloadFromForm().payment_method, 0);
    input('gomshipPaymentMethod','1');
    assert.equal(buildGomshipPayloadFromForm().payment_method, 1);
    input('gomshipPaymentMethod','2');
    assert.throws(()=>buildGomshipPayloadFromForm(),/Người trả phí vận chuyển/);
  }
});

test('receiver-pay selection appears in confirmation and is forwarded to Function JSON',async()=>{
  mockForm('1');
  for(const id of ['jtProvince','jtDistrict']) fields.get(id).options[0].dataset.source='gomship';
  input('gomshipPaymentMethod','1');
  const sent=[];
  let prompt='';
  globalThis.window={confirm:(message)=>{prompt=message;return true;}};
  await mockRegisteredPickupWarehouse(sent);
  const result=await submitGomshipForm();
  assert.equal(result.result.success,true);
  assert.equal(sent.length,1);
  assert.equal(sent[0].body.action,'create');
  assert.equal(sent[0].body.order_id,'TEST-123');
  assert.equal(sent[0].body.payment_method,1);
  assert.equal(sent[0].body.warehouse_id,48);
  assert.equal(sent[0].body.pumalife_warehouse_id,'local-B');
  assert.match(prompt,/Kho lấy hàng GomShip: Kho Hồ Chí Minh/);
  assert.match(prompt,/Người nhận trả/);
});

test('switching Pumalife warehouses switches the actual GomShip warehouse ID before create',async()=>{
  mockForm('1');
  for(const id of ['jtProvince','jtDistrict']) fields.get(id).options[0].dataset.source='gomship';
  const sent=[];
  globalThis.window={confirm:()=>true};
  await mockRegisteredPickupWarehouse(sent);
  assert.equal(fields.get('gomshipWarehouseSelect').value,'48');

  const local=fields.get('jtWarehouseSelect');
  local.value='local-A';
  local.options=[{dataset:{
    localName:'Kho Hà Nội',senderName:'PUMALIFE',
    senderPhone:'0901234567',senderAddress:'12 Nguyễn Trãi'
  }}];
  syncGomshipWarehouseSelection();
  assert.equal(fields.get('gomshipWarehouseSelect').value,'24');
  await submitGomshipForm();
  assert.equal(sent[0].body.warehouse_id,24);
  assert.equal(sent[0].body.pumalife_warehouse_id,'local-A');
  assert.notEqual(sent[0].body.warehouse_id,sent[0].body.pumalife_warehouse_id);

  local.value='local-C';
  local.options=[{dataset:{
    localName:'Kho chưa có trên GomShip',senderName:'PUMALIFE',
    senderPhone:'0909876543',senderAddress:'55 Đường mới'
  }}];
  syncGomshipWarehouseSelection();
  assert.equal(fields.get('gomshipWarehouseSelect').value,'');
  await assert.rejects(()=>submitGomshipForm(),/Chưa chọn kho lấy hàng GomShip/);
  assert.equal(sent.length,1);
});

test('default Pumalife warehouse automatically resolves the original GomShip default when text differs',async()=>{
  mockForm('1');
  for(const id of ['jtProvince','jtDistrict']) fields.get(id).options[0].dataset.source='gomship';
  const sent=[];
  globalThis.window={confirm:()=>true};
  await mockRegisteredPickupWarehouse(sent);
  const local=fields.get('jtWarehouseSelect');
  local.value='local-default';
  local.options=[{dataset:{
    localName:'PUMALIFE STORE',senderName:'PUMALIFE STORE',
    senderPhone:'0774452967',senderAddress:'30/1 Nguyễn Xuân Hữu',
    localDefault:'true'
  }}];
  syncGomshipWarehouseSelection();
  assert.equal(fields.get('gomshipWarehouseSelect').value,'24');
  await submitGomshipForm();
  assert.equal(sent.length,1);
  assert.equal(sent[0].body.warehouse_id,24);
  assert.equal(sent[0].body.pumalife_warehouse_id,'local-default');
});
test('unmatched Pumalife warehouse may select GomShip warehouse without writing an incorrect local warehouse ID',async()=>{
  mockForm('1');
  for(const id of ['jtProvince','jtDistrict']) fields.get(id).options[0].dataset.source='gomship';
  const sent=[];
  globalThis.window={confirm:()=>true};
  await mockRegisteredPickupWarehouse(sent);
  const local=fields.get('jtWarehouseSelect');
  local.value='local-special';
  local.options=[{dataset:{
    localName:'PUMALIFE Kho B',senderName:'PUMALIFE',
    senderPhone:'0909876543',senderAddress:'Địa chỉ mới'
  }}];
  syncGomshipWarehouseSelection();
  const official=fields.get('gomshipWarehouseSelect');
  assert.equal(official.value,'');
  official.value='48';
  official.dataset.selection='manual';
  await submitGomshipForm();
  assert.equal(sent[0].body.warehouse_id,48);
  assert.equal(sent[0].body.pumalife_warehouse_id,undefined);
});
test('payment choice only appears with GomShip and does not affect the direct SPX flow',()=>{
  const changed = {};
  const provider = {
    value:'gomship',dataset:{},
    addEventListener:(name,callback)=>{changed[name]=callback;}
  };
  const payerGroup = {hidden:true,style:{}};
  const heading = {textContent:''}, btn = {textContent:''};
  globalThis.document = {getElementById:id=>({
    shipmentCarrier:provider,
    gomshipPaymentMethodGroup:payerGroup,
    shipmentModalHeading:heading,jtSubmitLabel:btn
  }[id] || null)};
  setupGomshipControls();
  assert.equal(payerGroup.hidden,false);
  assert.equal(payerGroup.style.display,'');
  provider.value='spx';
  changed.change();
  assert.equal(payerGroup.hidden,true);
  assert.equal(payerGroup.style.display,'none');
  provider.value='gomship';
  changed.change();
  assert.equal(payerGroup.hidden,false);
});

test('backend sends selected payment_method to GomShip POST payload; legacy callers default to 0',()=>{
  const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
  const start = source.indexOf('function orderPayload(input, addr)');
  const end = source.indexOf('/**\n * GomShip',start);
  assert.ok(start>0 && end>start);
  const orderPayload=runInNewContext(source.slice(start,end)+'\norderPayload',{});
  const addr={address_mode:'2-tier',province_code:'79',
    province_name:'Thành phố Hồ Chí Minh',district_code:'',district_name:'',
    ward_code:'12345',ward_name:'Phường thử nghiệm'};
  const input={receiver:{name:'Khách',phone:'0900000000',detail_address:'123 Đường thử'},
    product:{name:'Hàng thử',weight:1,price:900000},cod:50000};
  assert.equal(orderPayload(input,addr).payment_method,0);
  assert.equal(orderPayload({...input,payment_method:0},addr).payment_method,0);
  assert.equal(orderPayload({...input,payment_method:1},addr).payment_method,1);
  assert.equal(orderPayload({...input,payment_method:'1'},addr).payment_method,1);
  for(const invalid of ['abc',2,-1,'2',null+'x']){
    assert.throws(()=>orderPayload({...input,payment_method:invalid},addr),/Người trả phí/);
  }
});
test('GomShip 2-tier rejects stale SPX dropdown values and obsolete manual GomShip codes',()=>{
  mockForm('1');
  input('gomshipProvinceCode', '79');
  input('gomshipWardCode', '12345');
  assert.throws(()=>buildGomshipPayloadFromForm(),
    /Địa chỉ 2 cấp chưa tải từ GomShip/);
});

test('GomShip 3-tier uses codes from GomShip dropdowns, never SPX IDs or stale manual codes', () => {
  mockForm('2');
  option('jtProvince', '79', 'Thành phố Hồ Chí Minh');
  option('jtDistrict', '765', 'Quận Bình Thạnh');
  option('jtWard', '26923', 'Phường 05');
  for (const id of ['jtProvince', 'jtDistrict', 'jtWard'])
    fields.get(id).options[0].dataset.source = 'gomship';
  input('gomshipProvinceCode', '999');
  input('gomshipDistrictCode', '999');
  input('gomshipWardCode', '999');
  const body = buildGomshipPayloadFromForm();
  assert.equal(body.address_mode, '3-tier');
  assert.equal(body.receiver.province.name, 'Thành phố Hồ Chí Minh');
  assert.equal(body.receiver.district.name, 'Quận Bình Thạnh');
  assert.equal(body.receiver.ward.name, 'Phường 05');
  assert.equal(body.province_code, '79');
  assert.equal(body.district_code, '765');
  assert.equal(body.ward_code, '26923');
});

test('GomShip 3-tier refuses legacy SPX location IDs even with stale manual codes', () => {
  mockForm('2');
  input('gomshipProvinceCode', '79');
  input('gomshipDistrictCode', '765');
  input('gomshipWardCode', '26923');
  assert.throws(() => buildGomshipPayloadFromForm(), /Địa chỉ 3 cấp chưa tải từ GomShip/);
});

test('GomShip 3-tier options load from Function proxy without browser GomShip credentials', async () => {
  const requests = [];
  globalThis.fetch = async (url, opts) => {
    requests.push({url, body: JSON.parse(opts.body)});
    return new Response(JSON.stringify({success:true,items:[
      {code:'96',name:'Tỉnh Cà Mau'}, {code:'44',name:'Tỉnh Quảng Bình'}
    ]}), {status:200});
  };
  const list = await listGomshipLegacyLocations('provinces');
  assert.deepEqual(list, [{code:'96',name:'Tỉnh Cà Mau'},{code:'44',name:'Tỉnh Quảng Bình'}]);
  assert.equal(requests[0].body.action,'list_locations');
  assert.equal(requests[0].body.level,'provinces');
  assert.match(requests[0].url,/\/functions\/v1\/gomship-create-order$/);
});

test('test_auth reuses project anon JWT and never creates a shipment', async () => {
  mockForm();
  const requests = [];
  globalThis.fetch = async (url, opts) => {
    requests.push({ url, opts });
    return new Response(JSON.stringify({ success: true, action: 'test_auth' }), { status: 200 });
  };
  const response = await callGomshipFunction({ action: 'test_auth' });
  assert.equal(response.success, true);
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0].opts.body).action, 'test_auth');
  assert.equal(requests[0].opts.headers.apikey, primarySupabase.anonKey);
  assert.equal(requests[0].opts.headers.Authorization, 'Bearer ' + primarySupabase.anonKey);
  assert.equal(requests[0].opts.headers['x-gomship-admin-key'], undefined);
  assert.equal(requests[0].url, primarySupabase.url + '/functions/v1/gomship-create-order');
});

test('failed function response propagates HTTP status to UI', async () => {
  mockForm();
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, error: 'Không tìm thấy gomship_auth' }), { status: 500 });
  await assert.rejects(
    () => callGomshipFunction({ action: 'test_auth' }),
    /HTTP 500.*Không tìm thấy gomship_auth/
  );
});
test('GomShip location requests use verified /locations endpoints', () => {
  const fn = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  assert.match(fn, /"\/locations\/provinces-2tier"/);
  assert.match(fn, /"\/locations\/wards-2tier\?province="/);
  assert.doesNotMatch(fn, /(?<!locations)"\/provinces-2tier"/);
});
test('3-tier GomShip payload includes district codes and 2-tier remains compatible', async () => {
  const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  const from = source.indexOf('function listFrom(');
  const to = source.indexOf('/**\n * GomShip', from);
  assert.ok(from > 0 && to > from);
  const { resolveAddress, orderPayload } = runInNewContext(
    source.slice(from, to).replace('async function publicGomshipLocations(path: string)',
      'async function publicGomshipLocations(path)') + '\n({ resolveAddress, orderPayload })', {}
  );
  const receiver = {
    name: 'Tuấn', phone: '0357573070', detail_address: '248/21 hoàng hoa thám',
    province: { name: 'Thành phố Hồ Chí Minh' },
    district: { name: 'Quận Bình Thạnh' }, ward: { name: 'Phường 05' }
  };
  const input = {
    address_mode: '3-tier', receiver,
    province_code: '79', district_code: '765', ward_code: '26923',
    product: { name: 'Giày', weight: 1, price: 999999 }, cod: 0
  };
  const resolved = await resolveAddress(input, 'unused');
  const payload = orderPayload(input, resolved);
  assert.equal(payload.address_mode, '3-tier');
  assert.equal(payload.province_code, '79');
  assert.equal(payload.district_code, '765');
  assert.equal(payload.district_name, 'Quận Bình Thạnh');
  assert.equal(payload.ward_code, '26923');
  assert.equal(payload.ward_name, 'Phường 05');
  assert.equal(payload.product_weight, 1000);
  assert.equal(payload.specific_address, '248/21 hoàng hoa thám');
  const twoTier = await resolveAddress({
    address_mode: '2-tier', receiver,
    province_code: '79', province_name: 'Thành phố Hồ Chí Minh',
    ward_code: '27097', ward_name: 'Phường Bình Trưng'
  }, 'unused');
  const oldPayload = orderPayload({ receiver, product: { weight: 1, price: 999999 } }, twoTier);
  assert.equal(oldPayload.address_mode, '2-tier');
  assert.equal(oldPayload.district_code, '');
  assert.equal(oldPayload.district_name, '');
});

test('GomShip labels require an order-scoped capability and never take arbitrary GomShip IDs', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: k => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v)
  };
  const fakeToken = 'a'.repeat(64);
  const stored = rememberLabelAccess('ORDER-456', {
    label_access: { token: fakeToken, gomship_order_id: 754 }
  });
  assert.equal(stored, true);
  assert.equal(hasGomshipLabelAccess('ORDER-456'), true);
  assert.equal(hasGomshipLabelAccess('OTHER-ORDER'), false);
  const requests = [];
  globalThis.fetch = async (url, opts) => {
    requests.push({ url, body: JSON.parse(opts.body) });
    return new Response(new Blob(['%PDF-1.4 mock PDF'], { type: 'application/pdf' }), {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    });
  };
  const file = await fetchLabelPdf('ORDER-456');
  assert.equal(file.type, 'application/pdf');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.action, 'get_label');
  assert.equal(requests[0].body.order_id, 'ORDER-456');
  assert.equal(requests[0].body.label_token, fakeToken);
  assert.equal(requests[0].body.gomship_order_id, undefined);
  await assert.rejects(() => fetchLabelPdf('OTHER-ORDER'), /Phiên Pumalife hết hạn/);
});

test('PDF endpoint is tied to shipment record, requires capability, and checks PDF magic bytes', () => {
  const fn = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  const sql = readFileSync(new URL('../supabase/gomship_setup.sql', import.meta.url), 'utf8');
  assert.match(fn, /if \(input\.action === "get_label"\) return await getLabel\(input\)/);
  assert.match(fn, /\.eq\("label_token_hash", hash\)/);
  assert.match(fn, /\.eq\("order_id", orderId\)/);
  assert.match(fn, /\.eq\("status", "created"\)/);
  assert.match(fn, /"\/orders\/" \+ id \+ "\/label"/);
  assert.match(fn, /pdf\.slice\(0, 5\)/);
  assert.match(fn, /new Uint8Array\(32\)/);
  assert.match(sql, /gomship_order_id bigint/);
  assert.match(sql, /label_token_hash text/);
});
test('GomShip order ID is read from order response, not the SPX waybill', () => {
  const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  const from = source.indexOf('function gomshipOrderId(');
  const to = source.indexOf('async function sha256(', from);
  assert.ok(from > 0 && to > from);
  const helpers = source.slice(from, to);
  const getId = runInNewContext(helpers + '\n gomshipOrderId;', {});
  assert.equal(getId({ success: true, data: { id: 754, code: 'GSS-261102-754' } }), 754);
  assert.equal(getId({ data: { order: { id: '754' } } }), 754);
  assert.equal(getId({ data: { tracking_number: 'SPXVN06385125646B' } }), null);
});
test('Only one print modal is used: two SPX templates and optional GomShip PDF tab', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(page, /data-waybill-template="spx"/);
  assert.match(page, /data-waybill-template="legacy"/);
  assert.match(page, /id="gomshipPdfTemplateTab"/);
  assert.match(page, /id="gomshipPdfPreview"/);
  assert.match(page, /id="gomshipPdfStatus"/);
  assert.doesNotMatch(page, /id="gomshipPrintAuthForm"/);
  // GomShip PDF appears first, followed by the two SPX templates.
  const pdfPosition = page.indexOf('id="gomshipPdfTemplateTab"');
  const spxPosition = page.indexOf('data-waybill-template="spx"');
  const legacyPosition = page.indexOf('data-waybill-template="legacy"');
  assert.ok(pdfPosition >= 0 && pdfPosition < spxPosition && spxPosition < legacyPosition);
  assert.match(app, /prepareGomshipPrintPreview\(shipmentBundle\.root\.id\)/);
  assert.match(app, /void autoSelectGomshipPdfIfAvailable\(shipmentBundle\.root\.id\)/);
  const modalOpen = app.indexOf("document.getElementById('jtWaybillPrintModal').style.display = 'flex'");
  const pdfAutoselect = app.indexOf('void autoSelectGomshipPdfIfAvailable(', modalOpen);
  assert.ok(modalOpen >= 0 && pdfAutoselect > modalOpen, 'PDF loads after modal opens');
  assert.match(app, /isGomshipPdfSelected\(\)/);
  assert.match(app, /getGomshipPdfPrintUrl\(\)/);
  assert.doesNotMatch(page, /Tải PDF GomShip/);
  assert.doesNotMatch(app, /gomshipLabelButtons/);
  assert.doesNotMatch(page, /gomshipLabelActions/);
});

test('GomShip PDF tab previews only with per-order access and restores SPX on switch', async () => {
  const classTab = (type) => ({
    dataset: { waybillTemplate: type },
    attrs: {},
    style: {},
    callbacks: {},
    setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener(type, cb) { this.callbacks[type] = cb; }
  });
  const spx = classTab('spx');
  const legacy = classTab('legacy');
  const gomship = classTab('');
  const iframe = { style: {}, src: '' };
  const panel = { style: {}, querySelector: () => iframe };
  const content = { style: {}, dataset: { waybillTemplate: 'spx' } };
  const status = { textContent: '' };
  const hint = { textContent: '' };
  const nodes = {
    gomshipPdfTemplateTab: gomship,
    jtWaybillPrintContent: content,
    gomshipPdfPreview: panel,
    gomshipPdfStatus: status,
    jtPrintEditHint: hint
  };
  globalThis.document = {
    getElementById: id => nodes[id] || null,
    querySelectorAll: () => [spx, legacy]
  };
  globalThis.fetch = async () =>
    new Response(new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), {
      headers: { 'content-type': 'application/pdf' }
    });
  initializeGomshipPrintPreview();
  assert.equal(prepareGomshipPrintPreview('ORDER-456'), true);
  assert.equal(gomship.style.display, 'block');
  await selectGomshipPdf();
  assert.equal(isGomshipPdfSelected(), true);
  assert.equal(content.style.display, 'none');
  assert.equal(panel.style.display, 'flex');
  assert.match(getGomshipPdfPrintUrl(), /^blob:/);
  assert.equal(iframe.style.display, 'block');
  assert.match(status.textContent, /PDF/);
  spx.callbacks.click();
  assert.equal(isGomshipPdfSelected(), false);
  assert.equal(getGomshipPdfPrintUrl(), '');
  assert.equal(content.style.display, 'flex');
  assert.equal(panel.style.display, 'none');
  assert.equal(spx.attrs['aria-selected'], 'true');
  assert.equal(prepareGomshipPrintPreview('OTHER-ORDER'), false);
  assert.equal(gomship.style.display, 'none');
  assert.equal(isGomshipPdfSelected(), false);
  assert.equal(content.style.display, 'flex');
  assert.equal(spx.attrs['aria-selected'], 'true');
});

test('GomShip returns only SPXVN waybill even if an internal carrier order_code comes first', () => {
  const result = extractGomshipTracking({
    gomship_order_id: 833,
    gomship_response: {
      data: { order_code: 'GSS-833', id: 833, details: { tracking_number: 'SPXVN0123456' } }
    }
  });
  assert.equal(result.waybill, 'SPXVN0123456');
  assert.equal(extractGomshipTracking({
    spx_waybill: 'spxvn112233',
    gomship_response: { data: { order_code:'GSS-833' } }
  }).waybill, 'SPXVN112233');
  assert.equal(extractGomshipTracking({
    gomship_response: { data: { id:833, order_code:'GSS-833' } }
  }).waybill, '');
});

test('GomShip bundled form sends member IDs and warehouse; browser no longer blocks grouping', () => {
  const form = readFileSync(new URL('../gomship-integration.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
  assert.match(form,/payload\.group_order_ids = groupOrderIds\.map\(String\)/);
  assert.match(form,/payload\.warehouse_id = warehouse\.id/);
  assert.match(form,/payload\.pumalife_warehouse_id = local\.id/);
  assert.doesNotMatch(app,/Chưa hỗ trợ tạo đơn gộp qua GomShip/);
  assert.match(app,/submitGomshipForm\(\{ groupOrderIds \}\)/);
  assert.match(app,/result\.group_synced/);
  assert.match(backend,/claim_grouped_shipment/);
  assert.match(backend,/finish_grouped_shipment/);
  assert.match(backend,/group_count: groupIds\.length/);
});
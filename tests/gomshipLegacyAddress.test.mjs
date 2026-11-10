import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
const from = source.indexOf('function listFrom(');
const to = source.indexOf('/**\n * GomShip', from);
assert.ok(from >= 0 && to > from);
const helpers = source.slice(from, to)
  .replace('async function publicGomshipLocations(path: string)',
           'async function publicGomshipLocations(path)');

function setup() {
  const requests = [];
  const catalog = {
    '/locations/provinces': [
      { code: '01', name: 'Thành phố Hà Nội' },
      { code: '79', name: 'Thành phố Hồ Chí Minh' },
      { code: '95', name: 'Tỉnh Bạc Liêu' },
      { code: '96', name: 'Tỉnh Cà Mau' },
      { code: '44', name: 'Tỉnh Quảng Bình' }
    ],
    ['/locations/districts?province=' + encodeURIComponent('Thành phố Hồ Chí Minh')]: [
      { code: '765', name: 'Quận Bình Thạnh' },
      { code: '760', name: 'Quận 1' }
    ],
    ['/locations/wards?province=' + encodeURIComponent('Thành phố Hồ Chí Minh') +
      '&district=' + encodeURIComponent('Quận Bình Thạnh')]: [
      { code: '26923', name: 'Phường 5' },
      { code: '26924', name: 'Phường 6' }
    ],
    ['/locations/districts?province=' + encodeURIComponent('Tỉnh Cà Mau')]: [
      { code:'964', name:'Thành phố Cà Mau' }
    ],
    ['/locations/wards?province=' + encodeURIComponent('Tỉnh Cà Mau') +
      '&district=' + encodeURIComponent('Thành phố Cà Mau')]: [
      { code:'32062', name:'Phường 7' }
    ],
    ['/locations/districts?province=' + encodeURIComponent('Tỉnh Quảng Bình')]: [
      { code:'450', name:'Huyện Quảng Ninh' }
    ],
    ['/locations/wards?province=' + encodeURIComponent('Tỉnh Quảng Bình') +
      '&district=' + encodeURIComponent('Huyện Quảng Ninh')]: [
      { code:'19039', name:'Thị trấn Quán Hàu' }
    ],
    ['/locations/districts?province=' + encodeURIComponent('Thành phố Hà Nội')]: [
      { code: '005', name: 'Quận Cầu Giấy' },
      { code: '001', name: 'Quận Ba Đình' }
    ],
    ['/locations/wards?province=' + encodeURIComponent('Thành phố Hà Nội') +
      '&district=' + encodeURIComponent('Quận Cầu Giấy')]: [
      { code: '00172', name: 'Phường Yên Hoà' },
      { code: '00175', name: 'Phường Trung Hoà' }
    ]
  };
  const gomship = async (path, token) => {
    requests.push({ path, token });
    if (!(path in catalog)) return { ok: false, status: 404, data: { success: false } };
    return { ok: true, status: 200, data: { success: true, data: catalog[path] } };
  };
  const { resolveAddress, orderPayload } = runInNewContext(
    helpers + '\n({ resolveAddress, orderPayload })',
    { gomship, AbortSignal, Error, String, Number, encodeURIComponent,
      message: err => String(err?.message ?? err) }
  );
  const receiver = {
    name: 'Tuấn', phone: '0357573070',
    province: { name: 'Thành phố Hồ Chí Minh' },
    district: { name: 'Quận Bình Thạnh' },
    ward: { name: 'Phường 05' },
    detail_address: '248/21 hoàng hoa thám'
  };
  return { resolveAddress, orderPayload, requests, receiver };
}

test('GomShip 3-tier names resolve against official provinces/districts/wards endpoints', async () => {
  const { resolveAddress, orderPayload, requests, receiver } = setup();
  const input = { address_mode: '3-tier', receiver, product: { weight: 1, price: 999999 } };
  const address = await resolveAddress(input, 'token');
  assert.equal(address.province_code, '79');
  assert.equal(address.district_code, '765');
  assert.equal(address.ward_code, '26923');
  assert.equal(address.ward_name, 'Phường 5');
  assert.equal(orderPayload(input, address).address_mode, '3-tier');
  assert.equal(orderPayload(input, address).district_name, 'Quận Bình Thạnh');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].path, '/locations/provinces');
  assert.equal(requests[1].path, '/locations/districts?province=' + encodeURIComponent('Thành phố Hồ Chí Minh'));
  assert.equal(requests[2].path, '/locations/wards?province=' +
    encodeURIComponent('Thành phố Hồ Chí Minh') + '&district=' + encodeURIComponent('Quận Bình Thạnh'));
});

test('GomShip can fill missing district code with province and ward codes supplied', async () => {
  const { resolveAddress, requests, receiver } = setup();
  const address = await resolveAddress({
    address_mode: '3-tier', receiver, province_code: '79', ward_code: '26923'
  }, 'token');
  assert.equal(address.district_code, '765');
  assert.equal(requests.length, 3);
});

test('Complete 3-tier codes require no lookup', async () => {
  const { resolveAddress, requests, receiver } = setup();
  const address = await resolveAddress({
    address_mode: '3-tier', receiver,
    province_code: '79', district_code: '765', ward_code: '26923'
  }, 'token');
  assert.equal(address.district_code, '765');
  assert.equal(requests.length, 0);
});

test('Reject mismatched ward code and name, do not silently pick a different ward', async () => {
  const { resolveAddress, receiver } = setup();
  await assert.rejects(() => resolveAddress({
    address_mode: '3-tier', receiver,
    district_code: '765', ward_code: '26924'
  }, 'token'), /Tên và mã phường\/xã không khớp/);
});

test('Reject unknown ward code instead of silently creating another shipment', async () => {
  const { resolveAddress, receiver } = setup();
  await assert.rejects(() => resolveAddress({
    address_mode: '3-tier', receiver,
    district_code: '765', ward_code: '99999'
  }, 'token'), /Không tìm thấy phường\/xã mã 99999/);
});

test('SPX abbreviations TP./Q./P. resolve to GomShip names and canonical location URLs', async () => {
  const { resolveAddress, requests, receiver } = setup();
  receiver.province.name = 'TP. Hồ Chí Minh';
  receiver.district.name = 'Q. Bình Thạnh';
  receiver.ward.name = 'P. 05';
  const address = await resolveAddress({ address_mode: '3-tier', receiver }, 'token');
  assert.equal(address.province_code, '79');
  assert.equal(address.province_name, 'Thành phố Hồ Chí Minh');
  assert.equal(address.district_code, '765');
  assert.equal(address.district_name, 'Quận Bình Thạnh');
  assert.equal(address.ward_code, '26923');
  assert.equal(address.ward_name, 'Phường 5');
  assert.equal(requests.length, 3);
  assert.equal(requests[1].path, '/locations/districts?province=' + encodeURIComponent('Thành phố Hồ Chí Minh'));
  assert.equal(requests[2].path, '/locations/wards?province=' +
    encodeURIComponent('Thành phố Hồ Chí Minh') + '&district=' + encodeURIComponent('Quận Bình Thạnh'));
});

test('Named SPX aliases with a supplied province/district code remain valid', async () => {
  const { resolveAddress, receiver } = setup();
  receiver.province.name = 'TP. Hồ Chí Minh';
  receiver.district.name = 'Q. Bình Thạnh';
  const address = await resolveAddress({address_mode:'3-tier', receiver,
    province_code:'79', district_code:'765'}, 'token');
  assert.equal(address.province_code, '79');
  assert.equal(address.district_code, '765');
  assert.equal(address.ward_code, '26923');
});
test('Hà Nội / Quận Cầu Giấy / Phường Yên Hòa resolves against official GomShip 3-tier catalog', async () => {
  const { resolveAddress, requests, receiver } = setup();
  receiver.province.name = 'Hà Nội';
  receiver.district.name = 'Quận Cầu Giấy';
  receiver.ward.name = 'Phường Yên Hòa';
  receiver.detail_address = 'Số 3, ngõ 355 Nguyễn Khang';
  const address = await resolveAddress({ address_mode: '3-tier', receiver }, 'token');
  assert.equal(address.province_name, 'Thành phố Hà Nội');
  assert.equal(address.province_code, '01');
  assert.equal(address.district_name, 'Quận Cầu Giấy');
  assert.equal(address.district_code, '005');
  assert.equal(address.ward_name, 'Phường Yên Hoà');
  assert.equal(address.ward_code, '00172');
  assert.equal(requests.length, 3);
  assert.equal(requests[1].path, '/locations/districts?province=' + encodeURIComponent('Thành phố Hà Nội'));
  assert.equal(requests[2].path, '/locations/wards?province=' +
    encodeURIComponent('Thành phố Hà Nội') + '&district=' + encodeURIComponent('Quận Cầu Giấy'));
});

test('Hanoi optional Thành phố prefix is accepted but wrong province name remains rejected', async () => {
  const { resolveAddress, receiver } = setup();
  receiver.province.name = 'Hà Nội';
  receiver.district.name = 'Quận Cầu Giấy';
  receiver.ward.name = 'Phường Yên Hòa';
  const accepted = await resolveAddress({
    address_mode: '3-tier', receiver, province_code: '01'
  }, 'token');
  assert.equal(accepted.province_code, '01');
  await assert.rejects(() => resolveAddress({
    address_mode: '3-tier', receiver, province_code: '79'
  }, 'token'), /Tên và mã tỉnh\/thành không khớp/);
});
test('3-tier Cà Mau matches GomShip prefixed tỉnh without changing the official name sent to API',async()=>{
  const { resolveAddress, receiver, requests }=setup();
  receiver.province.name='Cà Mau';
  receiver.district.name='Thành phố Cà Mau';
  receiver.ward.name='Phường 7';
  const result=await resolveAddress({address_mode:'3-tier',receiver},'token');
  assert.equal(result.province_name,'Tỉnh Cà Mau');
  assert.equal(result.province_code,'96');
  assert.equal(result.district_code,'964');
  assert.equal(result.ward_code,'32062');
  assert.equal(requests.length,3);
  assert.equal(requests[1].path,'/locations/districts?province='+encodeURIComponent('Tỉnh Cà Mau'));
});

test('3-tier Quảng Bình matches GomShip prefixed tỉnh, but does not convert the address to a new province',async()=>{
  const { resolveAddress, receiver, requests }=setup();
  receiver.province.name='Quảng Bình';
  receiver.district.name='Huyện Quảng Ninh';
  receiver.ward.name='Thị trấn Quán Hàu';
  const result=await resolveAddress({address_mode:'3-tier',receiver},'token');
  assert.equal(result.province_name,'Tỉnh Quảng Bình');
  assert.equal(result.province_code,'44');
  assert.equal(result.district_name,'Huyện Quảng Ninh');
  assert.equal(result.ward_name,'Thị trấn Quán Hàu');
  assert.equal(requests[1].path,'/locations/districts?province='+encodeURIComponent('Tỉnh Quảng Bình'));
});

test('3-tier prefixed tỉnh names also validate against explicitly supplied GomShip codes',async()=>{
  const { resolveAddress, receiver }=setup();
  receiver.province.name='Cà Mau';
  receiver.district.name='Thành phố Cà Mau';
  receiver.ward.name='Phường 7';
  const result=await resolveAddress({address_mode:'3-tier',receiver,province_code:'96'},'token');
  assert.equal(result.province_code,'96');
  assert.equal(result.ward_code,'32062');
  await assert.rejects(()=>resolveAddress({address_mode:'3-tier',receiver,
    province_code:'44'},'token'),/Tên và mã tỉnh\/thành không khớp/);
  // Code 95 belongs to Bạc Liêu, not Cà Mau in the real 63-province catalog.
  await assert.rejects(()=>resolveAddress({address_mode:'3-tier',receiver,
    province_code:'95'},'token'),/Tên và mã tỉnh\/thành không khớp/);
});

test('3-tier returns precise catalog-not-found rather than generic ambiguous error',async()=>{
  const { resolveAddress, receiver }=setup();
  receiver.province.name='Tỉnh không có thật';
  await assert.rejects(()=>resolveAddress({address_mode:'3-tier',receiver},'token'),
    /Không tìm thấy địa chỉ.*danh mục GomShip/);
});

test('duplicate normalized administrative names with different codes remain ambiguous',()=>{
  const { matchName }=runInNewContext(helpers+'\n({matchName})',{
    gomship:async()=>({ok:true,data:[]}),message:e=>e.message,encodeURIComponent
  });
  assert.throws(()=>matchName([
    {code:'96',name:'Tỉnh Cà Mau'}, {code:'95',name:'Cà Mau'}
  ],'Cà Mau'),/khớp 2 mục GomShip với mã khác nhau/);
  const sameCode=matchName([
    {code:'96',name:'Tỉnh Cà Mau'}, {code:'96',name:'Cà Mau'}
  ],'Cà Mau');
  assert.equal(sameCode.code,'96');
});

test('missing 3-tier province is reported accurately if API catalog omitted it',()=>{
  const {matchName}=runInNewContext(helpers+'\n({matchName})',{
    gomship:async()=>({ok:true,data:[]}),message:e=>e.message,encodeURIComponent
  });
  assert.throws(()=>matchName([{code:'79',name:'Thành phố Hồ Chí Minh'}],'Quảng Bình'),
    /Không tìm thấy địa chỉ "Quảng Bình" trong danh mục GomShip \(1 mục\)/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Snapshot of actual GomShip /locations/provinces response supplied 05/11/2026.
// Runtime loads the live catalog; this is only a regression-test fixture.
const catalog=[
  {
    "code": "01",
    "name": "Thành phố Hà Nội",
    "administrative_level": "Thành phố Trung ương"
  },
  {
    "code": "02",
    "name": "Tỉnh Hà Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "04",
    "name": "Tỉnh Cao Bằng",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "06",
    "name": "Tỉnh Bắc Kạn",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "08",
    "name": "Tỉnh Tuyên Quang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "10",
    "name": "Tỉnh Lào Cai",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "11",
    "name": "Tỉnh Điện Biên",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "12",
    "name": "Tỉnh Lai Châu",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "14",
    "name": "Tỉnh Sơn La",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "15",
    "name": "Tỉnh Yên Bái",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "17",
    "name": "Tỉnh Hoà Bình",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "19",
    "name": "Tỉnh Thái Nguyên",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "20",
    "name": "Tỉnh Lạng Sơn",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "22",
    "name": "Tỉnh Quảng Ninh",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "24",
    "name": "Tỉnh Bắc Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "25",
    "name": "Tỉnh Phú Thọ",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "26",
    "name": "Tỉnh Vĩnh Phúc",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "27",
    "name": "Tỉnh Bắc Ninh",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "30",
    "name": "Tỉnh Hải Dương",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "31",
    "name": "Thành phố Hải Phòng",
    "administrative_level": "Thành phố Trung ương"
  },
  {
    "code": "33",
    "name": "Tỉnh Hưng Yên",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "34",
    "name": "Tỉnh Thái Bình",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "35",
    "name": "Tỉnh Hà Nam",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "36",
    "name": "Tỉnh Nam Định",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "37",
    "name": "Tỉnh Ninh Bình",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "38",
    "name": "Tỉnh Thanh Hóa",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "40",
    "name": "Tỉnh Nghệ An",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "42",
    "name": "Tỉnh Hà Tĩnh",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "44",
    "name": "Tỉnh Quảng Bình",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "45",
    "name": "Tỉnh Quảng Trị",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "46",
    "name": "Tỉnh Thừa Thiên Huế",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "48",
    "name": "Thành phố Đà Nẵng",
    "administrative_level": "Thành phố Trung ương"
  },
  {
    "code": "49",
    "name": "Tỉnh Quảng Nam",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "51",
    "name": "Tỉnh Quảng Ngãi",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "52",
    "name": "Tỉnh Bình Định",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "54",
    "name": "Tỉnh Phú Yên",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "56",
    "name": "Tỉnh Khánh Hòa",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "58",
    "name": "Tỉnh Ninh Thuận",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "60",
    "name": "Tỉnh Bình Thuận",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "62",
    "name": "Tỉnh Kon Tum",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "64",
    "name": "Tỉnh Gia Lai",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "66",
    "name": "Tỉnh Đắk Lắk",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "67",
    "name": "Tỉnh Đắk Nông",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "68",
    "name": "Tỉnh Lâm Đồng",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "70",
    "name": "Tỉnh Bình Phước",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "72",
    "name": "Tỉnh Tây Ninh",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "74",
    "name": "Tỉnh Bình Dương",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "75",
    "name": "Tỉnh Đồng Nai",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "77",
    "name": "Tỉnh Bà Rịa - Vũng Tàu",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "79",
    "name": "Thành phố Hồ Chí Minh",
    "administrative_level": "Thành phố Trung ương"
  },
  {
    "code": "80",
    "name": "Tỉnh Long An",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "82",
    "name": "Tỉnh Tiền Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "83",
    "name": "Tỉnh Bến Tre",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "84",
    "name": "Tỉnh Trà Vinh",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "86",
    "name": "Tỉnh Vĩnh Long",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "87",
    "name": "Tỉnh Đồng Tháp",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "89",
    "name": "Tỉnh An Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "91",
    "name": "Tỉnh Kiên Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "92",
    "name": "Thành phố Cần Thơ",
    "administrative_level": "Thành phố Trung ương"
  },
  {
    "code": "93",
    "name": "Tỉnh Hậu Giang",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "94",
    "name": "Tỉnh Sóc Trăng",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "95",
    "name": "Tỉnh Bạc Liêu",
    "administrative_level": "Tỉnh"
  },
  {
    "code": "96",
    "name": "Tỉnh Cà Mau",
    "administrative_level": "Tỉnh"
  }
];
const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
const from=source.indexOf('function listFrom(');
const to=source.indexOf('function addressModeOf(',from);
assert.ok(from>=0 && to>from);
const helpers=source.slice(from,to)
  .replace('async function publicGomshipLocations(path: string)',
           'async function publicGomshipLocations(path)');
function mock({response={success:true,data:catalog},status=200}={}){
  const requests=[];
  const ctx={
    gomship:async()=>{throw Error('Carrier authentication must not be used by the public catalog')},
    ROOT:'https://api.gomship.vn/api/v1',
    fetch:async(url,options)=>{
      requests.push({url,options});
      return {ok:status>=200&&status<300,status,json:async()=>response};
    },
    AbortSignal,Error,String,Number,encodeURIComponent,console
  };
  const api=runInNewContext(helpers+
    '\n({publicGomshipLocations,listFrom,nameOf,codeOf,matchName})',ctx);
  return {api,requests};
}
test('supplied old 3-tier catalog has 63 unique official codes, including Bạc Liêu 95 and Cà Mau 96',()=>{
  assert.equal(catalog.length,63);
  assert.equal(new Set(catalog.map(x=>x.code)).size,63);
  assert.equal(new Set(catalog.map(x=>x.name)).size,63);
  const byName=name=>catalog.find(x=>x.name===name)?.code;
  assert.equal(byName('Tỉnh Cà Mau'),'96');
  assert.equal(byName('Tỉnh Bạc Liêu'),'95');
  assert.equal(byName('Tỉnh Quảng Bình'),'44');
  assert.equal(byName('Thành phố Hồ Chí Minh'),'79');
  assert.equal(byName('Thành phố Hà Nội'),'01');
});
test('all 63 official names resolve to their exact GomShip code; old aliases remain supported',()=>{
  const {api}=mock();
  for(const expected of catalog){
    const actual=api.matchName(catalog,expected.name);
    assert.equal(api.codeOf(actual),expected.code,expected.name);
    assert.equal(api.nameOf(actual),expected.name);
  }
  assert.equal(api.codeOf(api.matchName(catalog,'Cà Mau')),'96');
  assert.equal(api.codeOf(api.matchName(catalog,'Quảng Bình')),'44');
  assert.equal(api.codeOf(api.matchName(catalog,'TP. Hồ Chí Minh')),'79');
  assert.throws(()=>api.matchName(catalog,'Tỉnh không tồn tại'),/Không tìm thấy/);
});
test('3-tier catalog GET uses no GomShip bearer/refresh and preserves zero-leading codes',async()=>{
  const {api,requests}=mock();
  const found=await api.publicGomshipLocations('/locations/provinces');
  assert.equal(found.length,63);
  assert.equal(found[0].code,'01');
  assert.equal(found.at(-1).code,'96');
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.gomship.vn/api/v1/locations/provinces');
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.headers.Authorization,undefined);
  assert.equal(requests[0].options.body,undefined);
});
test('public location function rejects other API paths and carrier HTTP errors',async()=>{
  const ok=mock();
  await assert.rejects(()=>ok.api.publicGomshipLocations('/auth/refresh'),/không hợp lệ/);
  assert.equal(ok.requests.length,0);
  const bad=mock({status:404,response:{success:false,message:'Not Found'}});
  await assert.rejects(()=>bad.api.publicGomshipLocations('/locations/provinces'),/HTTP 404/);
});
test('list_locations dispatch does not refresh GomShip auth',()=>{
  const start=source.indexOf('if (input.action === "list_locations")');
  const end=source.indexOf('if (input.action === "list_warehouses")',start);
  const action=source.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.match(action,/await publicGomshipLocations\(path\)/);
  assert.doesNotMatch(action,/await access\(\)|await locations\(path/);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Official 34-province 2-tier response copied from the user's GomShip API sample.
// Runtime remains live via the GomShip /locations/provinces-2tier endpoint.
const catalog=[
  {
    "code": "01",
    "name": "Thành phố Hà Nội"
  },
  {
    "code": "04",
    "name": "Tỉnh Cao Bằng"
  },
  {
    "code": "08",
    "name": "Tỉnh Tuyên Quang"
  },
  {
    "code": "11",
    "name": "Tỉnh Điện Biên"
  },
  {
    "code": "12",
    "name": "Tỉnh Lai Châu"
  },
  {
    "code": "14",
    "name": "Tỉnh Sơn La"
  },
  {
    "code": "15",
    "name": "Tỉnh Lào Cai"
  },
  {
    "code": "19",
    "name": "Tỉnh Thái Nguyên"
  },
  {
    "code": "20",
    "name": "Tỉnh Lạng Sơn"
  },
  {
    "code": "22",
    "name": "Tỉnh Quảng Ninh"
  },
  {
    "code": "24",
    "name": "Tỉnh Bắc Ninh"
  },
  {
    "code": "25",
    "name": "Tỉnh Phú Thọ"
  },
  {
    "code": "31",
    "name": "Thành phố Hải Phòng"
  },
  {
    "code": "33",
    "name": "Tỉnh Hưng Yên"
  },
  {
    "code": "37",
    "name": "Tỉnh Ninh Bình"
  },
  {
    "code": "38",
    "name": "Tỉnh Thanh Hóa"
  },
  {
    "code": "40",
    "name": "Tỉnh Nghệ An"
  },
  {
    "code": "42",
    "name": "Tỉnh Hà Tĩnh"
  },
  {
    "code": "44",
    "name": "Tỉnh Quảng Trị"
  },
  {
    "code": "46",
    "name": "Thành phố Huế"
  },
  {
    "code": "48",
    "name": "Thành phố Đà Nẵng"
  },
  {
    "code": "51",
    "name": "Tỉnh Quảng Ngãi"
  },
  {
    "code": "52",
    "name": "Tỉnh Gia Lai"
  },
  {
    "code": "56",
    "name": "Tỉnh Khánh Hòa"
  },
  {
    "code": "66",
    "name": "Tỉnh Đắk Lắk"
  },
  {
    "code": "68",
    "name": "Tỉnh Lâm Đồng"
  },
  {
    "code": "75",
    "name": "Tỉnh Đồng Nai"
  },
  {
    "code": "79",
    "name": "Thành phố Hồ Chí Minh"
  },
  {
    "code": "80",
    "name": "Tỉnh Tây Ninh"
  },
  {
    "code": "82",
    "name": "Tỉnh Đồng Tháp"
  },
  {
    "code": "86",
    "name": "Tỉnh Vĩnh Long"
  },
  {
    "code": "91",
    "name": "Tỉnh An Giang"
  },
  {
    "code": "92",
    "name": "Thành phố Cần Thơ"
  },
  {
    "code": "96",
    "name": "Tỉnh Cà Mau"
  }
];
const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
const from=source.indexOf('function listFrom('),to=source.indexOf('function addressModeOf(',from);
assert.ok(from>0 && to>from);
const helpers=source.slice(from,to).replace(
  'async function publicGomshipLocations(path: string)',
  'async function publicGomshipLocations(path)'
);
function fixture(){
  const requests=[];
  const mockGet=async(url, options)=>{
    requests.push({url,options});
    if(url.endsWith('/locations/provinces-2tier'))
      return {ok:true,status:200,json:async()=>({success:true,data:catalog})};
    if(url.endsWith('/locations/wards-2tier?province=44'))
      return {ok:true,status:200,json:async()=>({success:true,data:[
        {code:'00123',name:'Xã thử nghiệm'}
      ]})};
    throw Error('Unexpected catalog route '+url);
  };
  const api=runInNewContext(helpers+
    '\n({publicGomshipLocations,codeOf,nameOf,matchName})',{
      ROOT:'https://api.gomship.vn/api/v1',
      fetch:mockGet,AbortSignal,Error,Number,String,console
    });
  return {api,requests};
}
test('provided 2-tier province catalog has 34 unique official names and codes',()=>{
  assert.equal(catalog.length,34);
  assert.equal(new Set(catalog.map(row=>row.code)).size,34);
  assert.equal(new Set(catalog.map(row=>row.name)).size,34);
  const map=Object.fromEntries(catalog.map(row=>[row.name,row.code]));
  assert.equal(map['Tỉnh Cà Mau'],'96');
  assert.equal(map['Tỉnh Quảng Trị'],'44');
  assert.equal(map['Thành phố Huế'],'46');
  assert.equal(map['Tỉnh Gia Lai'],'52');
  assert.equal(map['Thành phố Hà Nội'],'01');
  assert.equal(map['Thành phố Hồ Chí Minh'],'79');
  assert.equal(map['Tỉnh Quảng Bình'],undefined);
  assert.equal(map['Tỉnh Bạc Liêu'],undefined);
});
test('all 34 2-tier names match exactly and preserve leading-zero codes',()=>{
  const {api}=fixture();
  for(const row of catalog){
    const actual=api.matchName(catalog,row.name);
    assert.equal(api.codeOf(actual),row.code,row.name);
  }
  assert.equal(api.codeOf(api.matchName(catalog,'Cà Mau')),'96');
  assert.equal(api.codeOf(api.matchName(catalog,'Quảng Trị')),'44');
  assert.equal(api.codeOf(api.matchName(catalog,'Hà Nội')),'01');
  assert.throws(()=>api.matchName(catalog,'Quảng Bình'),/Không tìm thấy/);
});
test('2-tier public GET requests use official endpoints with no refresh or POST',async()=>{
  const {api,requests}=fixture();
  const provinces=await api.publicGomshipLocations('/locations/provinces-2tier');
  assert.equal(provinces.length,34);
  assert.equal(provinces[0].code,'01');
  const wards=await api.publicGomshipLocations('/locations/wards-2tier?province=44');
  assert.equal(wards[0].code,'00123');
  assert.equal(requests[0].url,'https://api.gomship.vn/api/v1/locations/provinces-2tier');
  assert.equal(requests[1].url,'https://api.gomship.vn/api/v1/locations/wards-2tier?province=44');
  assert.ok(requests.every(x=>x.options.method==='GET'));
  assert.ok(requests.every(x=>!x.options.headers.Authorization));
});
test('backend list_locations action allows 2-tier and uses supplied province code, not SPX names',()=>{
  const start=source.indexOf('if (input.action === "list_locations")');
  const end=source.indexOf('if (input.action === "list_warehouses")',start);
  const block=source.slice(start,end);
  assert.match(block,/level === "provinces-2tier"/);
  assert.match(block,/level === "wards-2tier"/);
  assert.match(block,/safeName\(input.province_code\)/);
  assert.match(block,/await publicGomshipLocations\(path\)/);
  assert.doesNotMatch(block,/await access\(\)/);
});
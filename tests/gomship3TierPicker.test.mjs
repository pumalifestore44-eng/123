import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../app.js', import.meta.url),'utf8');
const from=app.indexOf('function isGomshipLegacyPicker()');
const to=app.indexOf('async function loadSpxWarehouses()',from);
assert.ok(from>=0 && to>from);
const cascade=app.slice(from,to);

class FakeOption {
  constructor(text='',value='',defaultSelected=false,selected=false){
    this.textContent=text;
    this.value=String(value);
    this.dataset={};
    this.disabled=false;
    this.selected=selected;
  }
  setAttribute(name,value){
    if(name==='data-name')this.dataset.name=value;
  }
  getAttribute(name){return name==='data-name'?this.dataset.name:null;}
}
class FakeSelect {
  constructor(id){
    this.id=id;
    this.options=[];
    this._value='';
    this.disabled=false;
  }
  set innerHTML(value){
    // Placeholder HTML always starts with a single disabled empty option.
    const match=value.match(/<option[^>]*>(.*?)<\/option>/);
    this.replaceChildren(new FakeOption(match?.[1]||'', ''));
  }
  get innerHTML(){return '';}
  add(option){this.options.push(option);}
  appendChild(option){this.add(option);}
  replaceChildren(...children){
    this.options=[...children];
    this._value=children.find(o=>o.selected)?.value||'';
  }
  get value(){return this._value;}
  set value(v){
    this._value=String(v);
    this.options.forEach(o=>o.selected=o.value===this._value);
  }
  get selectedIndex(){return this.options.findIndex(o=>o.value===this._value);}
}
function setup({carrier='gomship',threeTier=true,handler}={}){
  const elems=Object.fromEntries(['jtProvince','jtDistrict','jtWard']
    .map(id=>[id,new FakeSelect(id)]));
  const spxCalls=[],gomshipCalls=[];
  const dataset={
    provinces:[{code:'96',name:'Tỉnh Cà Mau'},{code:'44',name:'Tỉnh Quảng Bình'}],
    districts:[{code:'964',name:'Thành phố Cà Mau'}],
    wards:[{code:'32062',name:'Phường 7'}],
    'provinces-2tier':[{code:'01',name:'Thành phố Hà Nội'},
      {code:'44',name:'Tỉnh Quảng Trị'},{code:'96',name:'Tỉnh Cà Mau'}],
    'wards-2tier':[{code:'00001',name:'Phường mẫu (test)'}]
  };
  const ctx={
    document:{getElementById:id=>elems[id], createElement:()=>new FakeOption()},
    Option:FakeOption,console,
    isGomshipSelected:()=>carrier==='gomship',
    isJtNewAddressSystem:()=>!threeTier,
    updateJtAddressUI:()=>{},
    getSpxAddressVersion:()=>threeTier?0:2,
    refreshSpxSearchablePicker:()=>{},
    refreshAllSpxSearchablePickers:()=>{},
    fetchSpxRegions:async(...args)=>{
      spxCalls.push(args);
      return [{location_id:700,name:'SPX region'}];
    },
    listGomshipLocations:async(level,parents)=>{
      gomshipCalls.push({level,parents});
      return handler?handler(level,parents):dataset[level];
    },
    Map, JSON, String, Promise
  };
  const api=runInNewContext(cascade+
    '\n({loadJtProvinces,loadJtDistricts,loadJtWards})',ctx);
  return {api,elems,spxCalls,gomshipCalls};
}
test('GomShip 3-tier picker uses province/district/ward from GomShip with exact official codes',async()=>{
  const h=setup();
  await h.api.loadJtProvinces();
  assert.equal(h.elems.jtProvince.options[1].value,'96');
  assert.equal(h.elems.jtProvince.options[1].dataset.name,'Tỉnh Cà Mau');
  assert.equal(h.elems.jtProvince.options[1].dataset.source,'gomship');
  h.elems.jtProvince.value='96';
  await h.api.loadJtDistricts('96');
  assert.equal(h.elems.jtDistrict.options[1].value,'964');
  h.elems.jtDistrict.value='964';
  await h.api.loadJtWards('964');
  assert.equal(h.elems.jtWard.options[1].value,'32062');
  assert.equal(h.elems.jtWard.options[1].dataset.name,'Phường 7');
  assert.deepEqual(h.spxCalls,[]);
  assert.deepEqual(h.gomshipCalls.map(x=>x.level),['provinces','districts','wards']);
  assert.equal(h.gomshipCalls[1].parents.province,'Tỉnh Cà Mau');
  assert.equal(h.gomshipCalls[2].parents.district,'Thành phố Cà Mau');
});
test('GomShip new 2-tier uses its own 34-province list and wards by province CODE',async()=>{
  const newer=setup({threeTier:false});
  await newer.api.loadJtProvinces();
  assert.deepEqual(newer.gomshipCalls.map(x=>x.level),['provinces-2tier']);
  assert.equal(newer.elems.jtProvince.options[1].value,'01');
  assert.equal(newer.elems.jtProvince.options[2].value,'44');
  assert.equal(newer.elems.jtProvince.options[2].dataset.name,'Tỉnh Quảng Trị');
  assert.equal(newer.elems.jtProvince.options[2].dataset.source,'gomship');
  newer.elems.jtProvince.value='44';
  await newer.api.loadJtDistricts('44');
  assert.equal(newer.gomshipCalls[1].level,'wards-2tier');
  assert.equal(newer.gomshipCalls[1].parents.provinceCode,'44');
  assert.equal(newer.elems.jtDistrict.options[1].value,'00001');
  assert.equal(newer.elems.jtDistrict.options[1].dataset.source,'gomship');
  assert.equal(newer.spxCalls.length,0);
  assert.equal(newer.elems.jtProvince.disabled,false);
  assert.equal(newer.elems.jtDistrict.disabled,false);
});
test('direct SPX keeps its own list in both 2 and 3-tier modes',async()=>{
  for(const threeTier of [true,false]){
    const h=setup({carrier:'spx',threeTier});
    await h.api.loadJtProvinces();
    assert.equal(h.spxCalls.length,1);
    assert.equal(h.gomshipCalls.length,0);
    assert.equal(h.elems.jtProvince.disabled,false);
  }
});
test('stale district results never overwrite a newer GomShip province selection',async()=>{
  let resolveA;
  const h=setup({
    handler:async(level,parents)=>{
      if(level==='provinces')return [{code:'96',name:'Tỉnh Cà Mau'},{code:'44',name:'Tỉnh Quảng Bình'}];
      if(level==='districts' && parents.province==='Tỉnh Cà Mau')
        return new Promise(resolve=>resolveA=resolve);
      if(level==='districts')return [{code:'450',name:'Huyện Quảng Ninh'}];
      return [];
    }
  });
  await h.api.loadJtProvinces();
  h.elems.jtProvince.value='96';
  const stale=h.api.loadJtDistricts('96');
  h.elems.jtProvince.value='44';
  await h.api.loadJtDistricts('44');
  resolveA([{code:'964',name:'Thành phố Cà Mau'}]);
  await stale;
  assert.equal(h.elems.jtDistrict.options[1].value,'450');
  assert.equal(h.elems.jtDistrict.options[1].dataset.name,'Huyện Quảng Ninh');
});
test('no implicit fallback to SPX when GomShip 3-tier catalog is unavailable',async()=>{
  const h=setup({handler:async()=>{throw Error('Carrier list unavailable')}});
  await h.api.loadJtProvinces();
  assert.equal(h.elems.jtProvince.disabled,true);
  assert.equal(h.elems.jtProvince.value,'');
  assert.equal(h.spxCalls.length,0);
});
test('stale GomShip 2-tier wards from a previous province cannot overwrite new selection',async()=>{
  let resolvePrevious;
  const h=setup({threeTier:false,handler:async(level,parents)=>{
    if(level==='provinces-2tier')return [
      {code:'44',name:'Tỉnh Quảng Trị'}, {code:'96',name:'Tỉnh Cà Mau'}];
    if(level==='wards-2tier' && parents.provinceCode==='44')
      return new Promise(resolve=>resolvePrevious=resolve);
    if(level==='wards-2tier')return [{code:'33333',name:'Xã hiện tại'}];
    return [];
  }});
  await h.api.loadJtProvinces();
  h.elems.jtProvince.value='44';
  const pending=h.api.loadJtDistricts('44');
  h.elems.jtProvince.value='96';
  await h.api.loadJtDistricts('96');
  resolvePrevious([{code:'22222',name:'Phường cũ'}]);
  await pending;
  assert.equal(h.elems.jtDistrict.options[1].value,'33333');
});

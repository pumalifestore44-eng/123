import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  parseGomshipAdministrativeAddress, findGomshipAdministrativeOption, resolveAddressAutofillCarrier
} from '../gomship-address-autofill.mjs';

const exact='60/5J ấp Thới Tây 2, Xã Hóc Môn, Thành phố Hồ Chí Minh';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('window.autoFillAddressFromDetail = async function() {');
const end=source.indexOf('\n};',start);
assert.ok(start>0 && end>start);
const handlerSource=source.slice(start,end+3);
const makeOption=(value,name)=>({
  value, dataset:{source:'gomship',name}, textContent:name
});
test('correctly parses Hóc Môn NEW 2-tier address while preserving full detail',()=>{
  assert.deepEqual(parseGomshipAdministrativeAddress(exact),{
    province:'Thành phố Hồ Chí Minh', district:'', ward:'Xã Hóc Môn', twoTier:true
  });
});
test('canonical administrative names match TP. HCM to the precise GomShip province',()=>{
  const province={options:[makeOption('79','Thành phố Hồ Chí Minh'),
    makeOption('01','Thành phố Hà Nội')]};
  assert.equal(findGomshipAdministrativeOption(province,'TP. Hồ Chí Minh').value,'79');
  const wards={options:[makeOption('99999','Xã Hóc Môn'),
    makeOption('88888','Phường Hóc Môn')]};
  assert.equal(findGomshipAdministrativeOption(wards,'Xã Hóc Môn').value,'99999');
});
test('rejects ambiguous name matches or SPX-coded options rather than choosing wrong ward',()=>{
  assert.equal(findGomshipAdministrativeOption({options:[
    makeOption('1','Xã Hóc Môn'),makeOption('2','Xã Hóc Môn')
  ]},'Xã Hóc Môn'),null);
  assert.equal(findGomshipAdministrativeOption({options:[
    {value:'1234',dataset:{name:'Xã Hóc Môn',source:'spx'},textContent:'Xã Hóc Môn'}
  ]},'Xã Hóc Môn'),null);
});
function harness({oldMode=true,raw=exact,carrier='gomship',pickerGomship=false}={}){
  // Native radios share the same name: checking one clears the other.
  let selectedNew=!oldMode;
  const radio2={
    get checked(){return selectedNew;},
    set checked(value){if(value) selectedNew=true;}
  };
  const radio3={
    get checked(){return !selectedNew;},
    set checked(value){if(value) selectedNew=false;}
  };
  const nodes={
    jtReceiverAddress:{value:raw},
    jtProvince:{value:'',options:[]},
    jtDistrict:{value:'',options:[]},
    jtWard:{value:'',options:[]},
    shipmentCarrier:{value:carrier, selectedOptions:[{textContent:carrier==='gomship'
      ?'GomShip → SPX Express':'SPX Express trực tiếp'}]}
  };
  if(pickerGomship) nodes.jtProvince.options=[makeOption('68','Tỉnh Lâm Đồng')];
  const calls={province:0,district:0,ward:0,alerts:[],spxFetch:0};
  const document={
    getElementById:id=>nodes[id],
    querySelector:selector=>selector.includes('value="1"')?radio2:
      selector.includes('value="2"')?radio3:null
  };
  const mode=()=>radio2.checked;
  const ctx={
    window:{},document,
    isGomshipSelected:()=>true,
    isJtNewAddressSystem:mode,
    parseGomshipAdministrativeAddress,findGomshipAdministrativeOption,
    resolveAddressAutofillCarrier,
    loadJtProvinces:async()=>{
      calls.province++;
      nodes.jtProvince.options=raw.includes('Lâm Đồng')
        ? [makeOption('68','Tỉnh Lâm Đồng')]
        : /bà rịa.{0,3}vũng tàu/i.test(raw)
          ? [makeOption('77','Tỉnh Bà Rịa - Vũng Tàu')]
          : [makeOption('79','Thành phố Hồ Chí Minh')];
    },
    loadJtDistricts:async()=>{
      calls.district++;
      nodes.jtDistrict.options=mode()
        ? (raw.includes('Lâm Đồng')
            ? [makeOption('12345','Phường mẫu')]
            : /mô xoài/i.test(raw)
              ? [makeOption('WARD-BARIA','Phường Bà Rịa')]
              : [makeOption('77777','Xã Hóc Môn')])
        : /xuyên mộc/i.test(raw)
          ? [makeOption('751','Huyện Xuyên Mộc')]
          : /phú mỹ/i.test(raw)
            ? [makeOption('754','Thành phố Phú Mỹ')]
            : raw.toLowerCase().includes('tân bình')
              ? [makeOption('766','Quận Tân Bình')]
              : [makeOption('765','Quận Bình Thạnh')];
    },
    loadJtWards:async()=>{
      calls.ward++;
      nodes.jtWard.options=/phước bửu/i.test(raw)
        ? [makeOption('26620','Thị trấn Phước Bửu')]
        : /phước hòa/i.test(raw)
          ? [makeOption('26713','Phường Phước Hoà')]
          : raw.toLowerCase().includes('tân bình')
            ? [makeOption('11111','Phường 2')]
            : [makeOption('26923','Phường 05')];
    },
    refreshSpxSearchablePicker:()=>{},
    lucide:{createIcons:()=>{}},
    alert:m=>calls.alerts.push(m),
    console,
    fetch:async()=>{calls.spxFetch++;throw Error('SPX search must not be called')},
    Array,Error,String
  };
  runInNewContext(handlerSource,ctx);
  return {trigger:ctx.window.autoFillAddressFromDetail,nodes,radio2,radio3,calls};
}
test('auto-fill switches old 3-tier to GomShip NEW 2-tier for the actual Hóc Môn address',async()=>{
  const h=harness();
  await h.trigger();
  assert.equal(h.radio2.checked,true);
  assert.equal(h.nodes.jtProvince.value,'79');
  assert.equal(h.nodes.jtDistrict.value,'77777');
  assert.equal(h.nodes.jtReceiverAddress.value,exact);
  assert.equal(h.calls.province,1);
  assert.equal(h.calls.district,1);
  assert.equal(h.calls.ward,0);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('auto-fill old 3-tier address restores legacy mode with district and ward',async()=>{
  const raw='248/21 Hoàng Hoa Thám, Phường 05, Quận Bình Thạnh, TP. Hồ Chí Minh';
  const h=harness({oldMode:false,raw});
  await h.trigger();
  assert.equal(h.radio3.checked,true);
  assert.equal(h.nodes.jtProvince.value,'79');
  assert.equal(h.nodes.jtDistrict.value,'765');
  assert.equal(h.nodes.jtWard.value,'26923');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('missing GomShip ward shows helpful error, never selects a different ward',async()=>{
  const h=harness();
  h.nodes.jtReceiverAddress.value='60/5J ấp Thới Tây 2, Xã Không Tồn Tại, Thành phố Hồ Chí Minh';
  await h.trigger();
  assert.equal(h.calls.alerts.length,1);
  assert.match(h.calls.alerts[0],/Không tìm thấy phường\/xã "Xã Không Tồn Tại"/);
  assert.equal(h.nodes.jtDistrict.value,'');
});
test('unprefixed province Lâm Đồng autofills from the GomShip catalog, never SPX',async()=>{
  const raw='1/91 Nguyễn Hữu Cảnh, Phường mẫu, Lâm Đồng';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Lâm Đồng',district:'',ward:'Phường mẫu',twoTier:true
  });
  const h=harness({raw,oldMode:true});
  await h.trigger();
  assert.equal(h.radio2.checked,true);
  assert.equal(h.nodes.jtProvince.value,'68');
  assert.equal(h.nodes.jtDistrict.value,'12345');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('GomShip carrier always chooses GomShip route even when the selected option label differs',()=>{
  assert.equal(resolveAddressAutofillCarrier({
    carrierValue:'gomship',carrierLabel:'SPX Express trực tiếp',provinceOptions:[]
  }),'gomship');
});
test('mismatched SPX selected + GomShip province picker does not send SPX fuzzy API',async()=>{
  const h=harness({carrier:'spx',pickerGomship:true});
  await h.trigger();
  assert.equal(h.calls.spxFetch,0);
  assert.equal(h.calls.alerts.length,1);
  assert.match(h.calls.alerts[0],/Danh sách địa chỉ đang thuộc GomShip/);
});
test('invalid carrier state does not silently fallback to SPX',async()=>{
  const h=harness({carrier:'unknown'});
  await h.trigger();
  assert.equal(h.calls.spxFetch,0);
  assert.match(h.calls.alerts[0],/Chưa xác định được đơn vị vận chuyển/);
});
test('old 3-tier HCMC from image: unlabeled Tân Bình is matched only against GomShip district catalog',async()=>{
  const raw='2b Phố quang, phường 2, tân bình, Hồ Chí Minh';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Hồ Chí Minh',district:'tân bình',ward:'phường 2',twoTier:false
  });
  const h=harness({raw,oldMode:false});
  await h.trigger();
  assert.equal(h.radio3.checked,true);
  assert.equal(h.nodes.jtProvince.value,'79');
  assert.equal(h.nodes.jtDistrict.value,'766');
  assert.equal(h.nodes.jtWard.value,'11111');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.equal(h.calls.district,1);
  assert.equal(h.calls.ward,1);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});

test('unmatched unlabeled district cannot silently choose a different GomShip district',async()=>{
  const raw='2b Phố quang, phường 2, Quận không có thật, Hồ Chí Minh';
  const h=harness({raw,oldMode:false});
  await h.trigger();
  assert.equal(h.calls.spxFetch,0);
  assert.equal(h.nodes.jtDistrict.value,'');
  assert.equal(h.calls.alerts.length,1);
  assert.match(h.calls.alerts[0],/Không tìm thấy quận\/huyện/);
});
test('actual order #17226 style: no ward prefix, auto-fill GomShip Bà Rịa 2-tier',async()=>{
  const raw='105 mô xoài, bà rịa, hồ chí minh';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'hồ chí minh',district:'',ward:'bà rịa',twoTier:true
  });
  const h=harness({oldMode:true,raw});
  await h.trigger();
  assert.equal(h.radio2.checked,true);
  assert.equal(h.radio3.checked,false);
  assert.equal(h.nodes.jtProvince.value,'79');
  assert.equal(h.nodes.jtDistrict.value,'WARD-BARIA'); // synthetic API code, not a hardcoded GomShip mapping
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.equal(h.calls.province,1);
  assert.equal(h.calls.district,1);
  assert.equal(h.calls.ward,0);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('Bà Rịa also auto-fills in already selected GomShip 2-tier mode',async()=>{
  const raw='105 Mô Xoài, Bà Rịa, Thành phố Hồ Chí Minh';
  const h=harness({oldMode:false,raw});
  await h.trigger();
  assert.equal(h.radio2.checked,true);
  assert.equal(h.nodes.jtProvince.value,'79');
  assert.equal(h.nodes.jtDistrict.value,'WARD-BARIA');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.deepEqual(h.calls.alerts,[]);
});
test('bare district or other unclear text is never guessed as a ward code',()=>{
  assert.deepEqual(parseGomshipAdministrativeAddress('Bà Rịa, Hồ Chí Minh'),{
    province:'Hồ Chí Minh',district:'',ward:'',twoTier:false
  });
  assert.deepEqual(parseGomshipAdministrativeAddress('105 Mô Xoài, Thành phố Bà Rịa, TP. Hồ Chí Minh'),{
    province:'TP. Hồ Chí Minh',district:'Thành phố Bà Rịa',ward:'',twoTier:false
  });
});
test('unmatched unlabeled locality does not select a different GomShip ward',async()=>{
  const raw='105 Mô Xoài, địa danh không có thật, Hồ Chí Minh';
  const h=harness({oldMode:false,raw});
  await h.trigger();
  assert.equal(h.nodes.jtDistrict.value,'');
  assert.equal(h.calls.spxFetch,0);
  assert.equal(h.calls.alerts.length,1);
  assert.match(h.calls.alerts[0],/Không tìm thấy phường\/xã/);
});
test('3-tier without any prefixes: Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu',async()=>{
  const raw='Phước Bửu, Xuyên Mộc, Bà Rịa Vũng Tàu';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Bà Rịa Vũng Tàu',district:'Xuyên Mộc',ward:'Phước Bửu',twoTier:false
  });
  // User was viewing 3-tier. The API catalog, not a guessed code, confirms it.
  const h=harness({raw,oldMode:true});
  await h.trigger();
  assert.equal(h.radio3.checked,true);
  assert.equal(h.nodes.jtProvince.value,'77');
  assert.equal(h.nodes.jtDistrict.value,'751');
  assert.equal(h.nodes.jtWard.value,'26620');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.equal(h.calls.district,1);
  assert.equal(h.calls.ward,1);
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('3-tier detailed street with all admin prefixes omitted also resolves by live hierarchy',async()=>{
  const raw='5/10 Nguyễn Huệ, Phước Bửu, Xuyên Mộc, Bà Rịa - Vũng Tàu';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Bà Rịa - Vũng Tàu',district:'Xuyên Mộc',ward:'Phước Bửu',twoTier:false
  });
  const h=harness({raw,oldMode:false});
  await h.trigger();
  assert.equal(h.radio3.checked,true);
  assert.equal(h.nodes.jtProvince.value,'77');
  assert.equal(h.nodes.jtDistrict.value,'751');
  assert.equal(h.nodes.jtWard.value,'26620');
  assert.equal(h.nodes.jtReceiverAddress.value,raw);
  assert.deepEqual(h.calls.alerts,[]);
});
test('3-tier with explicit district but unprefixed Phước Hòa ward',async()=>{
  const raw='5/10 Nguyễn Huệ, Phước Hòa, Thị xã Phú Mỹ, Bà Rịa Vũng Tàu';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Bà Rịa Vũng Tàu',district:'Thị xã Phú Mỹ',ward:'Phước Hòa',twoTier:false
  });
  const h=harness({raw,oldMode:true});
  await h.trigger();
  assert.equal(h.nodes.jtDistrict.value,'754');
  assert.equal(h.nodes.jtWard.value,'26713');
  assert.equal(h.calls.spxFetch,0);
  assert.deepEqual(h.calls.alerts,[]);
});
test('prefixed ward without a district remains 2-tier and is never treated as 3-tier',()=>{
  const raw='105 Mô Xoài, Phường Bà Rịa, Thành phố Hồ Chí Minh';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Thành phố Hồ Chí Minh',district:'',ward:'Phường Bà Rịa',twoTier:true
  });
});
test('3-tier refuses an unknown district in real GomShip catalog rather than substituting SPX',async()=>{
  const raw='Phước Bửu, Huyện Không Tồn Tại, Bà Rịa Vũng Tàu';
  const h=harness({raw,oldMode:true});
  await h.trigger();
  assert.equal(h.nodes.jtDistrict.value,'');
  assert.equal(h.calls.spxFetch,0);
  assert.match(h.calls.alerts[0],/Không tìm thấy quận\/huyện/);
});
test('verified GomShip Phú Mỹ catalog: unlabeled Phước Hòa/Phú Mỹ resolves official codes',async()=>{
  const raw='5/10 Nguyễn Huệ, Phước Hòa, Phú Mỹ, Bà Rịa Vũng Tàu';
  assert.deepEqual(parseGomshipAdministrativeAddress(raw),{
    province:'Bà Rịa Vũng Tàu', district:'Phú Mỹ',ward:'Phước Hòa',twoTier:false
  });
  const h=harness({raw,oldMode:true});
  await h.trigger();
  assert.equal(h.nodes.jtProvince.value,'77');
  assert.equal(h.nodes.jtDistrict.value,'754');
  assert.equal(h.nodes.jtWard.value,'26713');
  assert.deepEqual(h.calls.alerts,[]);
  assert.equal(h.calls.spxFetch,0);
});

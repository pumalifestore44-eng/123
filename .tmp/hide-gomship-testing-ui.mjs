import {readFileSync,writeFileSync} from 'node:fs';
const root="smax-chat-manager - Copy (2)/";
function edit(path, mutator) { const original=readFileSync(root+path,'utf8'); const revised=mutator(original);if(revised===original)throw Error('No change: '+path);writeFileSync(root+path,revised);console.log('Updated '+path); }
edit('index.html', source=>{
  const start=source.indexOf('                    <div id="gomshipSettings" hidden');
  const marker='\n                    </div>\n                </section>';
  const end=source.indexOf(marker,start);
  if(start===-1||end<=start)throw Error('GomShip settings block not found');
  const old=source.slice(start,end);
  for(const id of ['gomshipTestAddress','gomshipProvinceCode','gomshipDistrictCode','gomshipWardCode','gomshipProductValue','gomshipNote','gomshipTestStatus'])if(!old.includes(id))throw Error('Unexpected markup: '+id);
  const hidden=[
   '                    <!-- GomShip address codes resolve automatically; keep payload defaults without a test/config panel. -->',
   '                    <input type="hidden" id="gomshipProvinceCode" value="">',
   '                    <input type="hidden" id="gomshipDistrictCode" value="">',
   '                    <input type="hidden" id="gomshipWardCode" value="">',
   '                    <input type="hidden" id="gomshipProductValue" value="999999">',
   '                    <input type="hidden" id="gomshipNote" value="[CHO THỬ HÀNG]">'
  ].join('\n');
  return source.slice(0,start)+hidden+source.slice(end+('\n                    </div>').length);
});
edit('gomship-integration.mjs', source=>{
  const old=`    const settings = byId('gomshipSettings');
    if (settings) { settings.hidden = !gomship; settings.style.display = gomship ? 'grid' : 'none'; }
`;
  if(source.split(old).length!==2)throw Error('Missing toggle');
  source=source.replace(old,'');
  const start=source.indexOf("  const testAddressBtn = byId('gomshipTestAddress');");
  const end=source.indexOf('  refreshView();',start);
  if(start===-1||end<=start)throw Error('Missing address testing event block');
  return source.slice(0,start)+source.slice(end);
});

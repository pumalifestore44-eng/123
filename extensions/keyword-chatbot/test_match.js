const fs = require('fs');
const path = require('path');

const configPath = path.resolve(__dirname, 'config.json');
function readConfig(){ return JSON.parse(fs.readFileSync(configPath,'utf8')); }

const config = readConfig();
console.log('Loaded rules:', JSON.stringify(config.rules, null, 2));

const examples = [
  'chốt đơn',
  'Chốt đơn',
  'Dạ đơn hàng pumalife15339 đã được tạo thành công.',
  'Đơn hàng đã chốt đơn',
  'đủ size ý',
  '[attach]'
];

for(const text of examples){
  const snippet = text.replace(/\s+/g,' ').slice(0,200);
  const origin = 'shop';
  console.log('\n--- testing:', snippet);
  for(const rule of (config.rules||[])){
    console.log('rule', rule.name, 'triggerType', rule.triggerType);
    if(!rule.active){ console.log(' rule inactive'); continue; }
    if(rule.triggerType === 'customer' && origin !== 'customer'){ console.log(' skip due triggerType'); continue; }
    if(rule.triggerType === 'shop' && origin !== 'shop'){ console.log(' skip due triggerType'); continue; }
    if(rule.triggerType === 'both') console.log(' rule applies to both');
    const normText = text.toLowerCase().replace(/\s+/g,' ').trim();
    const normKeywords = (rule.keywords||[]).map(k=> (typeof k==='string'?k:'').toLowerCase().replace(/\s+/g,' ').trim()).filter(Boolean);
    console.log(' normText:', normText);
    console.log(' normKeywords:', normKeywords);
    const matched = normKeywords.find(kw => normText.includes(kw));
    console.log(' matched =>', matched || 'no');
  }
}

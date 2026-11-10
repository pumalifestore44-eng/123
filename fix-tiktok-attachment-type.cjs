const fs=require('fs');
const p='smax-chat-manager - Copy (2)/app.js';
let s=fs.readFileSync(p,'utf8');
const old="attachments:[{url:imageUrl}],metadata,org_id";
const next="attachments:[{url:imageUrl,type:'image'}],metadata,org_id";
if(!s.includes(old)) throw new Error('TikTok attachment payload target not found');
s=s.replace(old,next);
fs.writeFileSync(p,s);
console.log('TikTok attachment type=image applied');

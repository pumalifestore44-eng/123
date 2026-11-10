const fs=require('fs');
const p='smax-chat-manager - Copy (2)/app.js';
let s=fs.readFileSync(p,'utf8');
const old="function getTikTokChatboxAuthorization(){return window.TIKTOK_CHATBOX_AUTHORIZATION||localStorage.getItem('tiktok_chatbox_authorization')||'';}";
const next=`let TIKTOK_CHATBOX_AUTH_CACHE='';
async function loadTikTokChatboxAuth(){
  try{
    const url=SUPABASE_URL+'/rest/v1/integration_settings?select=value&key=eq.tiktok_botbanhang_authorization&limit=1';
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY}});
    if(!r.ok)throw Error('integration_settings '+r.status);
    const rows=await r.json();
    const value=String(rows?.[0]?.value||'').trim();
    if(value)TIKTOK_CHATBOX_AUTH_CACHE=value;
    return value;
  }catch(e){console.error('[TikTok BotBanHang] load config error:',e);return '';}
}
function getTikTokChatboxAuthorization(){return window.TIKTOK_CHATBOX_AUTHORIZATION||TIKTOK_CHATBOX_AUTH_CACHE||localStorage.getItem('tiktok_chatbox_authorization')||'';}
async function ensureTikTokChatboxAuthorization(){return getTikTokChatboxAuthorization()||await loadTikTokChatboxAuth();}`;
if(!s.includes(old))throw Error('TikTok auth getter not found');
s=s.replace(old,next);
const a="const authorization=getTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang.');";
const b="const authorization=await ensureTikTokChatboxAuthorization();if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');";
s=s.split(a).join(b);
const c="const authorization=getTikTokChatboxAuthorization(); if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang.');";
const d="const authorization=await ensureTikTokChatboxAuthorization(); if(!authorization)throw Error('Chưa cấu hình Authorization TikTok BotBanHang trong integration_settings.');";
s=s.split(c).join(d);
fs.writeFileSync(p,s);
console.log('TikTok BotBanHang config loader applied');
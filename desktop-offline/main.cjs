const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const { startLocalBridge } = require('./local-bridge.cjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PROJECT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_DIR, 'offline-data');
const THREAD_DIR = path.join(DATA_DIR, 'threads');
const MESSAGE_DIR = path.join(DATA_DIR, 'messages');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
function ensureDirs(){ for(const d of [DATA_DIR,THREAD_DIR,MESSAGE_DIR,MEDIA_DIR]) fs.mkdirSync(d,{recursive:true}); }
function safe(v){ return String(v||'unknown').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180); }
function writeJson(file,data){ ensureDirs(); const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8'); fs.renameSync(tmp,file); }
function readJson(file){ try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;} }
ipcMain.handle('offline:saveThreads',(_e,scope,threads)=>{const p={scope,savedAt:new Date().toISOString(),threads:Array.isArray(threads)?threads:[]};writeJson(path.join(THREAD_DIR,safe(scope)+'.json'),p);return p;});
ipcMain.handle('offline:readThreads',(_e,scope)=>readJson(path.join(THREAD_DIR,safe(scope)+'.json')));
ipcMain.handle('offline:saveMessages',(_e,key,thread,messages)=>{const p={key,savedAt:new Date().toISOString(),thread,messages:Array.isArray(messages)?messages:[]};writeJson(path.join(MESSAGE_DIR,safe(key)+'.json'),p);return p;});
ipcMain.handle('offline:readMessages',(_e,key)=>readJson(path.join(MESSAGE_DIR,safe(key)+'.json')));
ipcMain.handle('offline:dataPath',()=>DATA_DIR);
ipcMain.handle('offline:cacheMedia',async(_e,url)=>{if(!/^https?:\/\//i.test(String(url||'')))return null;ensureDirs();const hash=crypto.createHash('sha1').update(url).digest('hex');const existing=fs.readdirSync(MEDIA_DIR).find(n=>n.startsWith(hash+'.'));if(existing)return'pumalife://media/'+encodeURIComponent(existing);const res=await net.fetch(url);if(!res.ok)throw new Error('Media HTTP '+res.status);const type=(res.headers.get('content-type')||'').split(';')[0].trim();const ext=type.includes('png')?'png':type.includes('webp')?'webp':type.includes('gif')?'gif':type.includes('jpeg')||type.includes('jpg')?'jpg':'bin';const name=hash+'.'+ext;fs.writeFileSync(path.join(MEDIA_DIR,name),Buffer.from(await res.arrayBuffer()));return'pumalife://media/'+encodeURIComponent(name);});
protocol.registerSchemesAsPrivileged([{scheme:'pumalife',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
function createWindow(){ensureDirs();const win=new BrowserWindow({width:1500,height:930,minWidth:1050,minHeight:680,title:'Pumalife Chat Offline',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});win.loadURL('pumalife://app/index.html');startLocalBridge(win);}
app.whenReady().then(()=>{protocol.handle('pumalife',request=>{const url=new URL(request.url);let target;if(url.host==='media')target=path.join(MEDIA_DIR,decodeURIComponent(url.pathname).replace(/^\/+/,''));else{let rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');if(!rel)rel='index.html';target=path.normalize(path.join(PROJECT_DIR,rel));}const root=url.host==='media'?MEDIA_DIR:PROJECT_DIR;if(!path.normalize(target).startsWith(path.normalize(root)))return new Response('Forbidden',{status:403});return net.fetch('file:///'+target.replace(/\\/g,'/'));});createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
const fs=require('fs'),path=require('path');
const p=path.join(__dirname,'main.cjs'); let s=fs.readFileSync(p,'utf8');
if(!s.includes("require('./local-bridge.cjs')")){s="const { startLocalBridge } = require('./local-bridge.cjs');\n"+s; const m=s.indexOf('mainWindow.load'); if(m<0) throw Error('load marker missing'); const e=s.indexOf('\n',m); s=s.slice(0,e+1)+'  startLocalBridge(mainWindow);\n'+s.slice(e+1); fs.writeFileSync(p,s);}
const h=path.join(__dirname,'..','index.html'); let x=fs.readFileSync(h,'utf8'); if(!x.includes('desktop-offline/bridge-renderer.js')){x=x.replace('</body>','<script src="desktop-offline/bridge-renderer.js"></script>\n</body>');fs.writeFileSync(h,x);} console.log('bridge injected');

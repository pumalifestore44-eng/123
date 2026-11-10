import {readFileSync} from 'node:fs';
for(const f of ['app.js','index.html','ui-refresh.js']){
 const lines=readFileSync(new URL('../'+f,import.meta.url),'utf8').split('\n');
 const hits=[];
 for(let i=0;i<lines.length;i++) if(/loginForm|loginScreen|authentication|signInWith|signIn|auth\.getUser|employee|staff/i.test(lines[i])) hits.push((i+1)+':'+lines[i].slice(0,210));
 console.log(f+'\n'+hits.slice(0,80).join('\n'));
}
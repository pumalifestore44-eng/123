import {readFileSync} from 'node:fs';
for(const f of ['app.js','index.html','ui-refresh.js']){
  const lines=readFileSync(new URL('../'+f,import.meta.url),'utf8').split('\n');
  const out=[];
  lines.forEach((line,i)=>{
    if(/is_logged_in|logOut|logout|signOut|loginScreen|clearPumalifeSession/i.test(line)) out.push((i+1)+': '+line.slice(0,200));
  });
  console.log(f+'\n'+out.join('\n'));
}
import fs from 'node:fs/promises';
const urls=[
'https://img.ltwebstatic.com/v4/j/spmp/2026/10/15/25/1792059552f87fa9dcd440f215a2b820c46d27f480.jpg',
'https://img.ltwebstatic.com/v4/j/spmp/2026/10/15/89/179205955410cb1065cc38a620dcd05aebe73d3aac.jpg',
'https://img.ltwebstatic.com/v4/j/spmp/2026/10/15/11/1792059556852a543df6494a051a5cd69d22b25051.jpg',
'https://img.ltwebstatic.com/v4/j/spmp/2026/10/15/21/17920595580a605a3a802cbb6828a6eb8dc72b7bf9.jpg'];
await Promise.all(urls.map(async(u,i)=>{try{let r=await fetch(u,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(String(r.status));let b=Buffer.from(await r.arrayBuffer());await fs.writeFile(new URL(`./jq-${i}.jpg`,import.meta.url),b);console.log({i,bytes:b.length});}catch(e){console.log({i,error:e.message})}}));
await fs.writeFile(new URL('./jq-sources.json',import.meta.url),JSON.stringify(urls));

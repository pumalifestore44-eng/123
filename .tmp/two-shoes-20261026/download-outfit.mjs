import fs from 'node:fs/promises';
const urls=['https://cms-cdn.thesolesupplier.co.uk/2022/05/adidas-astir-outfit-2.png','https://cms-cdn.thesolesupplier.co.uk/2022/05/adidas-astir-styling-1.png'];
for(let i=0;i<urls.length;i++){let r=await fetch(urls[i]);if(!r.ok)throw Error(String(r.status));await fs.writeFile(new URL(`./outfit-${i}.png`,import.meta.url),Buffer.from(await r.arrayBuffer()));}

import fs from 'node:fs/promises';
await Promise.all(['2562','2706','2606','2597'].map(async(n)=>{const r=await fetch(`https://cms-cdn.thesolesupplier.co.uk/2022/05/dsc-${n}.jpg`);if(!r.ok)throw Error(`${n}:${r.status}`);await fs.writeFile(new URL(`./scene-${n}.jpg`,import.meta.url),Buffer.from(await r.arrayBuffer()));console.log(n+' downloaded');}));

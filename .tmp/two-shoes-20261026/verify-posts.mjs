import fs from 'node:fs/promises';
import {supabase} from '../../../autoclick/web-app/src/lib/supabase.js';
const manifest=JSON.parse(await fs.readFile(new URL('./manifest.json',import.meta.url),'utf8'));
const {data,error}=await supabase.from('posts').select('*').in('id',[13013,13014,13015,13016]);if(error)throw error;
const checks=data.map(r=>{const p=manifest.posts.find(p=>p.platforms===r.platforms);return {id:r.id,platform:r.platforms,status:r.status,scheduled_at:r.scheduled_at,images:r.image_url.split(',').filter(x=>x.trim()).length,verified:!!p&&r.content===p.content&&r.image_url===p.imageUrls.join(', ')&&new Date(r.scheduled_at).getTime()===new Date(p.scheduled_at).getTime(),publicationUrl:r.post_url||r.published_url||null};});
if(checks.length!==4||checks.some(c=>!c.verified))throw Error('Read-back mismatch');
const receipt=JSON.parse(await fs.readFile(new URL('../../../autoclick/web-app/posting-receipts/'+manifest.taskId+'.json',import.meta.url),'utf8'));
console.log(JSON.stringify({checks,triggers:receipt.triggers},null,2));await fs.writeFile(new URL('./verification.json',import.meta.url),JSON.stringify({verifiedAt:new Date().toISOString(),checks,triggers:receipt.triggers},null,2));

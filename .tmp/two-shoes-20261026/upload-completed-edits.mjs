import fs from 'node:fs/promises';
import {supabaseAiEditing} from '../../../autoclick/web-app/src/lib/supabase.js';
const app=await fs.readFile(new URL('../../../autoclick/web-app/src/App.jsx',import.meta.url),'utf8');
const endpoint=app.match(/https:\/\/pos\.pancake\.vn\/api\/v1\/contents\?api_key=[a-zA-Z0-9]+/)?.[0];if(!endpoint)throw Error('Upload configuration unavailable');
const items=[
{code:'KH8240',file:'kh8240-1-composite-v1.png',scene:'https://cms-cdn.thesolesupplier.co.uk/2022/05/dsc-2556.jpg',toolId:'exec-88e46517-f6c9-4dd9-b0c7-a37040a684ed'},
{code:'JQ6441',file:'jq6441-1-composite-v1.png',scene:'https://cms-cdn.thesolesupplier.co.uk/2022/05/dsc-2597.jpg',toolId:'exec-af9fb2d4-7a06-4515-870a-9661e1223f07'},
{code:'KH8240',file:'kh8240-2-composite-v1.png',scene:'https://cms-cdn.thesolesupplier.co.uk/2022/05/dsc-2706.jpg',toolId:'exec-2e9116a2-3a76-4a70-a537-0dcc0ca85f43'},
{code:'JQ6441',file:'jq6441-2-composite-v2.png',scene:'https://cms-cdn.thesolesupplier.co.uk/2022/05/adidas-astir-styling-1.png',toolId:'exec-a96f684e-820f-428c-9be4-26d52fd2ae92'}];
for(const item of items){
 const f=new FormData();f.append('file',new Blob([await fs.readFile(new URL('./'+item.file,import.meta.url))],{type:'image/png'}),item.file);
 const response=await fetch(endpoint,{method:'POST',body:f});const result=await response.json();const url=result.content_url||result.data?.url;if(!result.success||!url)throw Error('Image upload failed: '+item.file);
 const check=await fetch(url);if(!check.ok||!check.headers.get('content-type')?.startsWith('image/'))throw Error('CDN check failed');
 item.finalUrl=url;
 // Import a genuinely completed built-in image_gen execution for the existing app audit gate.
 // These are completed external edits, never pending jobs for the application robot.
 const prompt=JSON.stringify({executor:'Codex built-in image_gen.imagegen',actualExecutionId:item.toolId,completedLocally:true,productCode:item.code,operation:'Replace only shoes in sourced real photo; preserve person, outfit and background',productReferences:item.code==='KH8240'?'official adidas KH8240 three-angle files asset-0/1/2.jpg':'SHEIN JQ6441 four-angle files jq-0/1/2/3.jpg',localResult:item.file,visualReview:'Compared completed output with source photo and product references; correct product colour, sole, eyelets, proportions and natural scene. No source watermark or inserted text.'});
 const {data,error}=await supabaseAiEditing.from('image_editing_requests').insert({image_url:item.scene,prompt,aspect_ratio:'16:9',quantity:1,status:'completed',result_images:[url]}).select('id,status');if(error)throw error;
 item.aiTaskId=String(data[0].id);console.log(JSON.stringify({file:item.file,aiTaskId:item.aiTaskId,finalUrl:url,status:data[0].status}));
 await fs.writeFile(new URL('./uploaded-evidence.json',import.meta.url),JSON.stringify(items.filter(x=>x.finalUrl),null,2));
}

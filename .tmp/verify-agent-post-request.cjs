const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true});try{const p=await b.newPage({viewport:{width:1100,height:850}});
await p.route('http://smax.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await p.goto('http://smax.test/');
await p.addStyleTag({content:fs.readFileSync('style.css','utf8')+'\n'+fs.readFileSync('ai-agent.css','utf8')});
await p.evaluate(()=>{
 window.SMAX_PUBLIC_SUPABASE={url:'https://test.supabase.co',anonKey:'fake'};window.SMAX_PANCAKE_UPLOAD={endpoint:'https://upload.test',apiKey:'fake'};
 window.posts=[];window.reads=[];window.savedRows={ai_agent_requests:[],ai_post_requests:[{id:'old-post',request_text:'Yêu cầu đăng bài cũ',created_at:new Date(Date.now()-60000).toISOString(),status:'pending',metadata:{}}]};
 window.fetch=async(url,options={})=>{
 if(String(url).startsWith('https://upload.test'))return{ok:true,json:async()=>({content_url:'https://images.test/product.png'})};
 const table=new URL(url).pathname.split('/').pop();if(!(table in savedRows))throw Error('Unexpected request');if(String(url).includes('request_post'))throw Error('Legacy column accessed');
 if(options.method==='POST'){const data=JSON.parse(options.body);posts.push({...data,_table:table});savedRows[table].push({...data,id:'saved-'+posts.length,status:'pending',created_at:new Date().toISOString()});return{ok:true}};
 return{ok:true,json:async()=>[...savedRows[table]].reverse()};
 };
});
await p.addScriptTag({content:fs.readFileSync('ai-agent.js','utf8')});await p.locator('#aiAgentLauncher').click();await p.locator('#aiAgentRequestType').selectOption('post');await p.getByText('Yêu cầu đăng bài cũ',{exact:false}).waitFor();
assert.equal(await p.locator('.ai-agent-post-label').count(),1);
await p.locator('#aiAgentRequestType').selectOption('post');await p.locator('#aiAgentInput').fill('Đăng bài sản phẩm kiểm thử lên Zalo lúc 19h');
await p.locator('#aiAgentImageInput').setInputFiles({name:'product.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64')});
await p.waitForFunction(()=>document.getElementById('aiAgentSend').disabled===false);await p.locator('#aiAgentSend').click();await p.waitForFunction(()=>posts.length===1&&document.getElementById('aiAgentSend').disabled===false);
let posts=await p.evaluate(()=>posts);assert.match(posts[0].request_text,/Đăng bài sản phẩm/);assert.match(posts[0].request_text,/https:\/\/images.test\/product.png/);assert.equal(posts[0].metadata.request_type,'post');assert.equal(posts[0]._table,'ai_post_requests');assert.ok(!('request_post' in posts[0]));assert.equal(await p.locator('.ai-agent-post-label').count(),2);
await p.locator('.ai-agent-panel').screenshot({path:'.tmp/agent-post-request-preview.png'});
await p.locator('#aiAgentRequestType').selectOption('general');await p.locator('#aiAgentInput').fill('Yêu cầu chung kiểm thử');await p.locator('#aiAgentSend').click();await p.waitForFunction(()=>posts.length===2&&document.getElementById('aiAgentSend').disabled===false);
posts=await p.evaluate(()=>posts);assert.equal(posts[1].request_text,'Yêu cầu chung kiểm thử');assert.ok(!('request_post' in posts[1]));assert.equal(posts[1]._table,'ai_agent_requests');assert.equal(await p.locator('.ai-agent-status.is-queued').count(),1);await p.locator('#aiAgentRequestType').selectOption('post');await p.waitForFunction(()=>document.querySelectorAll('.ai-agent-post-label').length===2);assert.ok(!(await p.locator('#aiAgentMessages').textContent()).includes('Yêu cầu chung kiểm thử'));
console.log('AI Agent: post request and history use dedicated ai_post_requests; general requests use ai_agent_requests; no request_post access, images retained, queue status preserved');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});


import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import {normalizeStoredRealImages, uploadRealImageBatch} from '../real-image-batch-upload.mjs';
import {persistRealProductImages} from '../real-image-upload-controller.mjs';

const makeImage = name => new File(['fake image bytes'], name, {type:'image/png'});
function mockNetwork({existing=true, fail=[]}={}) {
  const state={images:existing?['https://img.test/old.png']:[], calls:[], rows:existing?1:0};
  async function fetchImpl(url,request={}) {
    const method=request.method||'GET';
    state.calls.push({url,method,body:request.body});
    if(url.includes('/pancake_orders?'))
      return new Response(JSON.stringify([{bill_full_name:'Khách thử',display_id:16924}]),{status:200});
    if(url.includes('pos.pancake.vn')) {
      const file=request.body.get('file');
      if(fail.includes(file.name)) return new Response('upload failed',{status:500});
      return new Response(JSON.stringify({content_url:'https://img.test/'+file.name}),{status:200});
    }
    if(url.includes('/chatbot_images?order_id=')&&method==='GET')
      return new Response(JSON.stringify(state.rows?[{id:81,hinhanh:[...state.images]}]:[]),{status:200});
    if(url.includes('/chatbot_images?id=')&&method==='PATCH') {
      state.images=JSON.parse(request.body).hinhanh;
      return new Response(null,{status:204});
    }
    if(url.includes('/chatbot_images?on_conflict=order_id')&&method==='POST') {
      const payload=JSON.parse(request.body);
      assert.equal(payload.order_id,'16924');
      state.images=payload.hinhanh;
      state.rows++;
      return new Response(JSON.stringify([{id:81}]),{status:201});
    }
    throw Error('Unexpected request '+method+' '+url);
  }
  return {state,fetchImpl};
}
const upload=(files,network,onProgress)=>persistRealProductImages({
  orderId:'local_16924',files,fetchImpl:network.fetchImpl,
  supabaseUrl:'https://example.supabase.co',supabaseKey:'fake-test-key',
  pancakeApiKey:'fake-test-key',onProgress
});

test('upload 3 selected images, append to existing photo and save in one PATCH',async()=>{
  const net=mockNetwork();
  const progresses=[];
  const result=await upload([makeImage('a.png'),makeImage('b.png'),makeImage('c.png')],
    net,step=>progresses.push(step));
  assert.equal(result.saved,true);
  assert.equal(result.uploaded.length,3);
  assert.deepEqual(net.state.images,[
    'https://img.test/old.png','https://img.test/a.png',
    'https://img.test/b.png','https://img.test/c.png'
  ]);
  assert.deepEqual(progresses.map(x=>x.completed),[1,2,3]);
  assert.equal(net.state.calls.filter(x=>x.method==='PATCH').length,1);
  assert.equal(net.state.calls.filter(x=>x.method==='POST'&&x.url.includes('pos.pancake.vn')).length,3);
});

test('empty order photos: create row once with all selected image URLs',async()=>{
  const net=mockNetwork({existing:false});
  const result=await upload([makeImage('a.png'),makeImage('b.png')],net);
  assert.equal(result.saved,true);
  assert.equal(net.state.rows,1);
  assert.deepEqual(net.state.images,['https://img.test/a.png','https://img.test/b.png']);
  assert.equal(net.state.calls.filter(x=>x.url.includes('on_conflict=order_id')).length,1);
});

test('one failed image does not discard other successes or earlier images',async()=>{
  const net=mockNetwork({fail:['bad.png']});
  const result=await upload([makeImage('a.png'),makeImage('bad.png'),makeImage('b.png')],net);
  assert.equal(result.errors.length,1);
  assert.equal(result.errors[0].name,'bad.png');
  assert.equal(result.uploaded.length,2);
  assert.deepEqual(net.state.images,['https://img.test/old.png','https://img.test/a.png','https://img.test/b.png']);
  assert.equal(net.state.calls.filter(x=>x.method==='PATCH').length,1);
});
test('when all uploads fail, no Supabase images are modified',async()=>{
  const net=mockNetwork({fail:['bad.png']});
  const result=await upload([makeImage('bad.png')],net);
  assert.equal(result.saved,false);
  assert.deepEqual(net.state.images,['https://img.test/old.png']);
  assert.equal(net.state.calls.some(x=>x.url.includes('/chatbot_images?')),false);
});
test('duplicate CDN URLs are not stored twice',async()=>{
  const net=mockNetwork();
  net.state.images.push('https://img.test/a.png');
  await upload([makeImage('a.png'),makeImage('b.png')],net);
  assert.deepEqual(net.state.images,[
    'https://img.test/old.png','https://img.test/a.png','https://img.test/b.png'
  ]);
});
test('single-file compatibility, file-type validation and legacy stored URLs',async()=>{
  const net=mockNetwork();
  const result=await upload([makeImage('one.png')],net);
  assert.equal(result.uploaded.length,1);
  assert.deepEqual(normalizeStoredRealImages('{"https://example/a.png","https://example/b.png"}'),[
    'https://example/a.png','https://example/b.png'
  ]);
  const state={created:0};
  const invalid=await uploadRealImageBatch([{name:'note.txt',type:'text/plain'}],{
    uploadFile:async()=>{throw Error('must not call upload')},
    readExisting:async()=>{state.created++;return null},
    updateExisting:async()=>{state.created++},
    createNew:async()=>{state.created++}
  });
  assert.equal(invalid.saved,false);
  assert.equal(state.created,0);
});
test('dashboard and quick-edit inputs allow selecting multiple images and share same uploader',()=>{
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(app,/id="real-image-input-\$\{order\.id\}" accept="image\/\*" multiple/);
  assert.match(html,/id="side-real-image-input" accept="image\/\*" multiple/);
  assert.match(app,/await window\.handleRealImageUpload\(_sideEditOrderId, e, \{ side: true \}\)/);
  assert.match(app,/const files = Array\.from\(input\?\.files \|\| \[\]\)/);
  assert.doesNotMatch(app,/const dt=new DataTransfer\(\)/);
});
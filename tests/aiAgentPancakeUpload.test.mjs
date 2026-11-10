import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../ai-agent.js', import.meta.url), 'utf8');
const from = source.indexOf('function getPancakeUploadConfig() {');
const to = source.indexOf('function createAgentIcon() {', from);
assert.ok(from >= 0 && to > from);

function uploadHarness(payload, {status=200, apiKey='fake-public-key', acceptFile=true}={}) {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({url,options});
    assert.equal(options.method,'POST');
    assert.equal(url, 'https://pos.pancake.vn/api/v1/contents?api_key=' + apiKey);
    assert.ok(options.body instanceof FormData);
    if(acceptFile) assert.equal(options.body.get('file')?.name,'image.png');
    return {ok:status>=200&&status<300,status,
      json:async()=>payload,text:async()=>JSON.stringify(payload)};
  };
  const functions=runInNewContext(source.slice(from,to) +
      '\n({uploadAiAgentImageToPancake,isPublicAiAgentImageUrl})',{
    window:{SMAX_PANCAKE_UPLOAD:{endpoint:'https://pos.pancake.vn/api/v1/contents',apiKey}},
    fetch:fakeFetch, FormData, URL, encodeURIComponent, Error
  });
  return {functions,calls,file:new File(['image-data'],'image.png',{type:'image/png'})};
}

test('upload uses Pancake contents API and returns direct CDN URL, never local blob',async()=>{
  const url='https://content.pancake.vn/abc/test-image.png';
  const harness=uploadHarness({success:true,content_url:url});
  assert.equal(await harness.functions.uploadAiAgentImageToPancake(harness.file),url);
  assert.equal(harness.calls.length,1);
  assert.equal(harness.functions.isPublicAiAgentImageUrl(url),true);
});
test('accepts nested content_url and URL fields from Pancake response',async()=>{
  const url='https://cdn.pancake.vn/photos/item.webp';
  for(const data of [{data:{content_url:url}},{data:{url}},{url}]) {
    const h=uploadHarness(data);
    assert.equal(await h.functions.uploadAiAgentImageToPancake(h.file),url);
  }
});
test('rejects blob URL even if Pancake returns success; does not send a blob attachment',async()=>{
  const invalid=['blob:https://pumalifeorder.vercel.app/fake-id','data:image/png;base64,abc',
    'javascript:alert(1)','http://localhost/file','/relative/path','',null];
  for(const url of invalid) {
    const h=uploadHarness({success:true,content_url:url});
    await assert.rejects(()=>h.functions.uploadAiAgentImageToPancake(h.file),/link HTTPS công khai/);
    assert.equal(h.functions.isPublicAiAgentImageUrl(url),false);
  }
});
test('a blob first with a valid nested URL selects the actual public URL',async()=>{
  const url='https://content.pancake.vn/files/real.png';
  const h=uploadHarness({success:true,content_url:'blob:https://pumalifeorder.vercel.app/temporary',data:{url}});
  assert.equal(await h.functions.uploadAiAgentImageToPancake(h.file),url);
});
test('HTTP error, JSON success:false, and nonimage files fail instead of being marked uploaded',async()=>{
  const h=uploadHarness({message:'Unauthorized'},{status:401});
  await assert.rejects(()=>h.functions.uploadAiAgentImageToPancake(h.file),/Unauthorized/);
  const bad=uploadHarness({success:false,message:'Pancake rejected',content_url:'https://content.pancake.vn/x.png'});
  await assert.rejects(()=>bad.functions.uploadAiAgentImageToPancake(bad.file),/Pancake rejected/);
  const notImage=uploadHarness({content_url:'https://content.pancake.vn/x.png'});
  await assert.rejects(()=>notImage.functions.uploadAiAgentImageToPancake(new File(['x'],'malware.exe',{type:'application/octet-stream'})),/không phải hình ảnh/);
  assert.equal(notImage.calls.length,0);
});

function fakeNode(tag='div') {
  return {
    tag, children:[], style:{},dataset:{},className:'',textContent:'',src:'',href:'',
    setAttribute(k,v){this[k]=v;},
    append(...items){this.children.push(...items);},
    appendChild(item){this.children.push(item);},
    addEventListener(k,fn){this['on'+k]=fn;}
  };
}
function previewHarness({returnedUrl='https://content.pancake.vn/uploaded.png',reject=null}={}) {
  let revoked=[];
  const original={
    id:'image-1',file:{type:'image/png'},fileName:'image.png',
    previewUrl:'blob:https://pumalifeorder.vercel.app/temporary-image',
    url:'',status:'uploading',error:''
  };
  const attachmentsEl=fakeNode();
  const state={pendingAttachments:[original],isSending:false,sendBtn:{},
    attachBtn:{},productBtn:{},requestType:{},helperText:{textContent:''},
    attachmentsEl};
  const a=source.indexOf('    const updateComposerState = () => {');
  const b=source.indexOf("    attachBtn.addEventListener('click'",a);
  assert.ok(a>0&&b>a);
  const run=source.slice(a,b);
  const scope={
    ...state,document:{createElement:fakeNode},URL:{
      revokeObjectURL:url=>revoked.push(url)
    },console,
    isPublicAiAgentImageUrl:value=>typeof value==='string'&&value.startsWith('https://'),
    uploadAiAgentImageToPancake:async()=>{if(reject)throw Error(reject);return returnedUrl;}
  };
  runInNewContext(run+ '\nthis.runUpload=uploadPendingAttachment; this.draw=renderPendingAttachments;',scope);
  return {scope,original,revoked,attachmentsEl};
}

test('after real upload, preview uses Pancake URL and releases browser blob',async()=>{
  const h=previewHarness();
  await h.scope.runUpload(h.original);
  assert.equal(h.original.status,'done');
  assert.equal(h.original.url,'https://content.pancake.vn/uploaded.png');
  assert.equal(h.original.previewUrl,'');
  assert.deepEqual(h.revoked,['blob:https://pumalifeorder.vercel.app/temporary-image']);
  const card=h.attachmentsEl.children.at(-1);
  const link=card.children[0];
  assert.equal(link.tag,'a');
  assert.equal(link.href,h.original.url);
  assert.equal(link.children[0].src,h.original.url);
  assert.equal(h.scope.sendBtn.disabled,false);
});
test('failed upload keeps local preview for retry/removal and prevents send',async()=>{
  const h=previewHarness({reject:'HTTP 503'});
  await h.scope.runUpload(h.original);
  assert.equal(h.original.status,'error');
  assert.equal(h.original.url,'');
  assert.equal(h.revoked.length,0);
  const card=h.attachmentsEl.children.at(-1);
  assert.equal(card.children[0].tag,'img');
  assert.match(card.children[0].src,/^blob:/);
  assert.equal(h.scope.sendBtn.disabled,true);
});
test('metadata, request text and history filter cannot persist blob URLs',()=>{
  const submission=source.slice(source.indexOf("form.addEventListener('submit'"),source.indexOf('    renderPendingAttachments();\n    render();',source.indexOf("form.addEventListener('submit'")));
  assert.match(submission,/\.filter\(item => item\.status === 'done' && isPublicAiAgentImageUrl\(item\.url\)\)/);
  assert.match(submission,/image_urls: readyImageUrls/);
  assert.match(submission,/attachments: readyImageUrls\.map/);
  assert.match(submission,/Hình ảnh Pancake/);
  assert.match(source,/row\.metadata\.image_urls\.filter\(isPublicAiAgentImageUrl\)/);
  const css=readFileSync(new URL('../ai-agent.css',import.meta.url),'utf8');
  assert.match(css,/\.ai-agent-attachment-card > a > img/);
});

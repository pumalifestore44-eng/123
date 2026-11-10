import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extensions/gomship-worker/gomship-content.js',import.meta.url),'utf8');
function fixture({store='9',loggedIn=true,createPage=true}={}){
  let listener;
  const outgoing=[];
  const win={listeners:{},addEventListener(type,fn){this.listeners[type]=fn}};
  const chrome={
    runtime:{
      id:'fake-extension',getURL:name=>'chrome-extension://fake/'+name,
      onMessage:{addListener:fn=>{listener=fn}},
      sendMessage:async msg=>{outgoing.push(msg)}
    }
  };
  const localStorage={getItem:key=>key==='active_store_id'?store:null};
  const document={
    body:{innerText:loggedIn
      ?(createPage?'Tạo đơn hàng\nNgười nhận':'Quản lý đơn hàng')
      :'Đăng nhập\nMật khẩu'},
    querySelector(selector){
      if(selector==='input[type="password"]')return loggedIn?null:{type:'password'};
      if(selector==='input,textarea')return createPage?{}:null;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='h1,h2,h3')return createPage?[{textContent:'Tạo đơn hàng'}]:[];
      return [];
    }
  };
  const context={chrome,window:win,document,location:{origin:'https://shop.gomship.vn'},
    localStorage,sessionStorage:{getItem:()=>null},globalThis:null};
  context.globalThis=context;
  runInNewContext(source,context);
  const send=kind=>{
    let response;
    listener({kind},{id:chrome.runtime.id},answer=>{response=answer});
    return response;
  };
  return {send,win,outgoing};
}
test('logged-in GomShip form is recognized without access_token storage',()=>{
  const f=fixture();
  const status=f.send('GOMSHIP_TAB_STATUS_V2');
  assert.equal(status.ok,true);
  assert.equal(status.store,'9');
});
test('wrong store, login screen and non-creation page are rejected',()=>{
  assert.equal(fixture({store:'12'}).send('GOMSHIP_TAB_STATUS_V2').ok,false);
  assert.match(fixture({loggedIn:false}).send('GOMSHIP_TAB_STATUS_V2').reason,/đăng nhập/i);
  assert.match(fixture({createPage:false}).send('GOMSHIP_TAB_STATUS_V2').reason,/Tạo đơn hàng/);
});
test('only noncredential order IDs from same-page result events are forwarded',async()=>{
  const f=fixture();
  f.win.listeners.message({
    source:f.win,origin:'https://shop.gomship.vn',
    data:{source:'pumalife-gomship-create-observer-v2',type:'order_result',
      gomshipOrderId:833,spxWaybill:'SPXVN0123456'}
  });
  await Promise.resolve();
  assert.deepEqual(JSON.parse(JSON.stringify(f.outgoing)),[
    {type:'GOMSHIP_ORDER_OBSERVED_V2',gomshipOrderId:833,spxWaybill:'SPXVN0123456'}
  ]);
  f.win.listeners.message({
    source:f.win,origin:'https://evil.invalid',
    data:{source:'pumalife-gomship-create-observer-v2',type:'order_result',
      gomshipOrderId:9,spxWaybill:'SPXVN0999999'}
  });
  await Promise.resolve();
  assert.equal(f.outgoing.length,1);
});
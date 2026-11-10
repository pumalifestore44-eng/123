import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(
  new URL('../extensions/gomship-worker/page-order-observer.js',import.meta.url),'utf8');
test('observer reads only IDs from official GomShip POST response, does not alter request',async()=>{
  const messages=[],calls=[];
  const answer={success:true,data:{
    id:833,shipment:{shipping:{tracking_number:'SPXVN0123456'}}
  }};
  const win={
    postMessage:message=>messages.push(message),
    fetch:async(...args)=>{
      calls.push(args);
      return {
        ok:true,
        clone:()=>({json:async()=>answer})
      };
    }
  };
  const context={window:win,URL,Reflect,Number,String,Object,WeakMap,Promise,
    location:{href:'https://shop.gomship.vn/orders/create',origin:'https://shop.gomship.vn'}};
  runInNewContext(code,context);
  await win.fetch('https://api.gomship.vn/api/v1/orders',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1);
  assert.equal(messages.length,1);
  assert.equal(messages[0].gomshipOrderId,833);
  assert.equal(messages[0].spxWaybill,'SPXVN0123456');
  assert.doesNotMatch(JSON.stringify(messages),/Bearer|Authorization|refresh_token/i);
  await win.fetch('https://api.gomship.vn/api/v1/notifications/unread-count',{method:'GET'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages.length,1);
});
test('observer ignores failed POST and non-GomShip hosts',async()=>{
  const messages=[];
  const win={
    postMessage:msg=>messages.push(msg),
    fetch:async()=>({ok:false,clone:()=>({json:async()=>({data:{id:90}})})})
  };
  runInNewContext(code,{
    window:win,URL,Reflect,Number,String,Object,WeakMap,Promise,
    location:{href:'https://shop.gomship.vn/',origin:'https://shop.gomship.vn'}
  });
  await win.fetch('https://api.gomship.vn/api/v1/orders',{method:'POST'});
  await win.fetch('https://another.site/api/v1/orders',{method:'POST'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages.length,0);
});

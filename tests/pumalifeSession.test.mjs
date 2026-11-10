import test from 'node:test';
import assert from 'node:assert/strict';
import { signInPumalife, getPumalifeAccessToken, clearPumalifeSession } from '../pumalife-session.mjs';

function storage() {
  const items=new Map();
  globalThis.localStorage={
    getItem:key=>items.get(key)||null,
    setItem:(key,value)=>items.set(key,value),
    removeItem:key=>items.delete(key)
  };
  clearPumalifeSession();
  return items;
}

test('Pumalife main login stores one session usable by GomShip but never saves password',async()=>{
  const items=storage(), calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    return new Response(JSON.stringify({access_token:'SIGNED_JWT',refresh_token:'REFRESH',
      expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
  };
  const access=await signInPumalife('pumalifestore@gmail.com','NOT_A_REAL_PASSWORD');
  assert.equal(access,'SIGNED_JWT');
  assert.equal(await getPumalifeAccessToken(),'SIGNED_JWT');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/grant_type=password/);
  assert.equal(items.get('is_logged_in'),'true');
  assert.doesNotMatch(items.get('pumalife:auth:session:v1'),/NOT_A_REAL_PASSWORD/);
  clearPumalifeSession();
});

test('a restored expired login refreshes automatically without showing an extra login',async()=>{
  const items=storage();
  items.set('pumalife:auth:session:v1',JSON.stringify({
    access_token:'EXPIRED',refresh_token:'OLD_REFRESH',expires_at:Date.now()-1000
  }));
  let requested='';
  globalThis.fetch=async(url,opts)=>{
    requested=url;
    assert.equal(JSON.parse(opts.body).refresh_token,'OLD_REFRESH');
    return new Response(JSON.stringify({
      access_token:'FRESH_JWT',refresh_token:'FRESH_REFRESH',expires_in:3600
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  assert.equal(await getPumalifeAccessToken(),'FRESH_JWT');
  assert.match(requested,/grant_type=refresh_token/);
  assert.equal(JSON.parse(items.get('pumalife:auth:session:v1')).access_token,'FRESH_JWT');
  clearPumalifeSession();
});

test('existing local login flag without signed session is not authorization to print',async()=>{
  const items=storage();
  items.set('is_logged_in','true');
  assert.equal(await getPumalifeAccessToken(),null);
  clearPumalifeSession();
});

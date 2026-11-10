import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
const start=source.indexOf('async function access(force = false');
const end=source.indexOf('async function gomship(',start);
assert.ok(start>=0 && end>start);
const fn=source.slice(start,end);
function harness({expired=false, mode='dedicated'}={}) {
  const state={
    access_token:'CURRENT',
    refresh_token:'REFRESH_SESSION',
    expires_at: new Date(Date.now()+(expired?-120:1200)*1000).toISOString()
  };
  const calls={refresh:0,dbUpdate:0};
  const db={from(table){
    assert.equal(table,'gomship_auth');
    let next=null,conditions=[];
    return {
      update(fields){next=fields;return this;},
      eq(key,value){conditions.push([key,value]);return this;},
      select:async()=>{
        calls.dbUpdate++;
        assert.deepEqual(conditions,[['id',9],['refresh_token','REFRESH_SESSION']]);
        Object.assign(state,next);
        return {data:[{id:9}],error:null};
      }
    };
  }};
  const fetch=async(url,options)=>{
    calls.refresh++;
    assert.match(url,/\/auth\/refresh$/);
    assert.equal(options.method,'POST');
    assert.deepEqual(JSON.parse(options.body),{
      refresh_token:'REFRESH_SESSION',device_id:'DEDICATED_DEVICE'
    });
    return {ok:true,status:200,json:async()=>({success:true,data:{
      access_token:'NEXT_ACCESS',refresh_token:'NEXT_REFRESH',expires_in:900
    }})};
  };
  const context={authRow:async()=>({...state,device_id:'DEDICATED_DEVICE'}),
    db,fetch,ROOT:'https://api.gomship.vn/api/v1',STORE_ID:9,Date,Number,
    AbortSignal,JSON,Error,String,
    Deno:{env:{get:(name)=>name==='GOMSHIP_AUTH_SESSION_MODE'?mode:null}},
    console:{warn:()=>{},info:()=>{}}};
  const access=runInNewContext(fn+'\naccess;',context);
  return {access,calls,state};
}

test('normal order creation reuses valid token without triggering refresh',async()=>{
  const h=harness();
  assert.equal(await h.access(),'CURRENT');
  assert.equal(h.calls.refresh,0);
});

test('401 with an older token reuses a new token already stored by another worker',async()=>{
  const h=harness();
  assert.equal(await h.access(true,'STALE_TOKEN'),'CURRENT');
  assert.equal(h.calls.refresh,0);
});

test('401 with the current token refreshes once and persists rotated token',async()=>{
  const h=harness();
  assert.equal(await h.access(true,'CURRENT'),'NEXT_ACCESS');
  assert.equal(h.calls.refresh,1);
  assert.equal(h.state.refresh_token,'NEXT_REFRESH');
});

test('expired access token refreshes once, then subsequent calls reuse result',async()=>{
  const h=harness({expired:true});
  assert.equal(await h.access(),'NEXT_ACCESS');
  assert.equal(h.calls.refresh,1);
  assert.equal(await h.access(),'NEXT_ACCESS');
  assert.equal(h.calls.refresh,1);
});

test('shared browser session is not used by backend even with a valid access token',async()=>{
  const h=harness({mode:'shared'});
  await assert.rejects(()=>h.access(),/backend đang dùng phiên chưa tách/);
  assert.equal(h.calls.refresh,0);
  assert.equal(h.calls.dbUpdate,0);
});

test('shared browser session blocks token rotation on expiry instead of logging out web',async()=>{
  const h=harness({expired:true,mode:'shared'});
  await assert.rejects(()=>h.access(),/backend đang dùng phiên chưa tách/);
  assert.equal(h.calls.refresh,0);
  assert.equal(h.calls.dbUpdate,0);
});

test('shared browser session also blocks forced refresh after 401',async()=>{
  const h=harness({mode:'shared'});
  await assert.rejects(()=>h.access(true,'CURRENT'),/backend đang dùng phiên chưa tách/);
  assert.equal(h.calls.refresh,0);
});

test('test_auth no longer forces refresh and retry sites pass rejected token',()=>{
  assert.match(source,/if \(input.action === "test_auth"\) \{[\s\S]*?await access\(\);/);
  assert.doesNotMatch(source,/if \(input.action === "test_auth"\) \{\s*await access\(true\)/);
  assert.match(source,/access\(true, labelToken\)/);
  assert.match(source,/access\(true, token\)/);
});

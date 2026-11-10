// Read-only live check; no customer data and no POST /orders.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts',import.meta.url),'utf8');
const from=source.indexOf('function listFrom(');
const to=source.indexOf('/**\n * GomShip',from);
const base='https://api.gomship.vn/api/v1';
const visited=[];
const gomship=async path=>{
  const url=base+path;visited.push(path);
  const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  const data=await r.json();
  return {ok:r.ok && data?.success!==false,status:r.status,data};
};
const {resolveAddress}=runInNewContext(source.slice(from,to)+'\n({resolveAddress})',
  {gomship,encodeURIComponent,String,Number,Error,message:e=>String(e?.message||e)});
const input={address_mode:'3-tier',receiver:{
  province:{name:'TP. Hồ Chí Minh'},
  district:{name:'Q. Bình Thạnh'},
  ward:{name:'Phường 05'}
}};
try {
  const address=await resolveAddress(input,'not-used');
  console.log(JSON.stringify({success:true,address,requests:visited},null,2));
} catch(e) {
  console.error(JSON.stringify({success:false,error:String(e?.message||e),requests:visited},null,2));
  process.exitCode=1;
}
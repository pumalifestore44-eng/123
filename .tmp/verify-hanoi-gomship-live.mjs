// Read-only verification using official GomShip location catalog; never POST orders.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../supabase/functions/gomship-create-order/index.ts', import.meta.url), 'utf8');
const from = source.indexOf('function listFrom(');
const to = source.indexOf('/**\n * GomShip', from);
const requests=[];
const gomship=async path=>{
  requests.push(path);
  const response = await fetch('https://api.gomship.vn/api/v1'+path,{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)
  });
  const data=await response.json();
  return {ok:response.ok && data.success!==false,status:response.status,data};
};
const {resolveAddress}=runInNewContext(source.slice(from,to)+'\n({resolveAddress})',{
  gomship,encodeURIComponent,String,Number,Error,message:e=>String(e?.message||e)
});
const input={address_mode:'3-tier',receiver:{
 province:{name:'Hà Nội'},district:{name:'Quận Cầu Giấy'},ward:{name:'Phường Yên Hòa'}
}};
const address=await resolveAddress(input,'unused');
console.log(JSON.stringify({address,requests},null,2));

// Read-only probe of user-supplied, public GomShip address endpoints.
const urls = [
  'https://api.gomship.vn/api/v1/locations/districts?province=' + encodeURIComponent('Thành phố Hồ Chí Minh'),
  'https://api.gomship.vn/api/v1/locations/wards?province=' + encodeURIComponent('Thành phố Hồ Chí Minh') + '&district=' + encodeURIComponent('Quận Bình Thạnh'),
  'https://api.gomship.vn/api/v1/locations/provinces'
];
for (const url of urls) {
  try {
    const r = await fetch(url, {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(8500)});
    const v=await r.json().catch(()=>null);
    const a=[v,v?.data,v?.data?.items,v?.data?.districts,v?.data?.wards,v?.data?.provinces,v?.data?.list,v?.data?.results,v?.items,v?.list].find(Array.isArray);
    console.log(JSON.stringify({route:new URL(url).pathname, status:r.status,rootType:Array.isArray(v)?'array':typeof v, topKeys:typeof v==='object'&&v?Object.keys(v).slice(0,10):[], dataKeys:v?.data&&!Array.isArray(v.data)&&typeof v.data==='object'?Object.keys(v.data).slice(0,10):[], count:a?.length, first:a?.slice(0,3), msg:v?.message}));
  } catch(e) { console.log(JSON.stringify({route:new URL(url).pathname,error:String(e?.message||e)}));}
}
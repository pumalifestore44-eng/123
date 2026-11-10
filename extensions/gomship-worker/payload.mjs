export const SPX_PATTERN = /^SPXVN[A-Z0-9]+$/;
export function findWaybill(node, depth=0) {
  if (depth>7 || !node || typeof node!=='object') return null;
  for (const key of ['tracking_number','tracking_code','tracking_no','waybill_id','waybill_number',
    'waybill_code','carrier_tracking_number','spx_tn','shipping_code']) {
    const code=String(node[key]??'').trim().toUpperCase();
    if(SPX_PATTERN.test(code))return code;
  }
  for(const nested of Object.values(node)){
    if(nested && typeof nested==='object'){
      const found=findWaybill(nested,depth+1);if(found)return found;
    }
  }
  return null;
}
export function gomshipOrderId(result) {
  const data=result?.data?.data??result?.data??result;
  const id=Number(data?.id??data?.order?.id??data?.order_id);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
export function validateJob(job) {
  if(!job || typeof job!=='object' || !job.id || !job.claim_token ||
     !/^[0-9a-f-]{36}$/i.test(String(job.idempotency_key)))
    throw Error('Hàng đợi không có khóa tạo đơn hợp lệ');
  const p=job.payload;
  if(!p || p.order_id!==job.order_id || !['2-tier','3-tier'].includes(p.address_mode))
    throw Error('Thông tin địa chỉ/chủ đơn không hợp lệ');
  const receiver=p.receiver||{},product=p.product||{};
  if(!String(receiver.name||'').trim()||!/^\+?[0-9]{9,15}$/.test(String(receiver.phone||'').replace(/[\s-]/g,''))||
     !String(receiver.detail_address||'').trim())throw Error('Thiếu thông tin người nhận');
  if(!String(receiver.province?.name||'').trim()||!String(receiver.ward?.name||'').trim()||
    (p.address_mode==='3-tier'&&!String(receiver.district?.name||'').trim()))
    throw Error('Thiếu tỉnh/quận/phường');
  if(!String(product.name||'').trim()||!(Number(product.weight)>0)||
     !(Number(product.price)>0)||!(Number(p.cod)>=0))
    throw Error('Sản phẩm, giá trị, khối lượng hoặc COD không hợp lệ');
  return true;
}
const canonical=value=>String(value||'').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')
  .replace(/^tp(?:\.\s*|\s+)/,'thanh pho ')
  .replace(/^q(?:\.\s*|\s+)/,'quan ')
  .replace(/^p(?:\.\s*|\s+)/,'phuong ')
  .replace(/\b0+(\d+)\b/g,'$1')
  .replace(/^thanh pho /,'').replace(/\s+/g,' ').trim();
export function matchName(list,name) {
  const matches=list.filter(x=>canonical(x?.name)===canonical(name));
  if(matches.length!==1)throw Error('Không khớp duy nhất tên địa giới: '+name);
  return matches[0];
}
export function parseCatalog(result) {
  const values=[result,result?.data,result?.data?.data,result?.data?.items,
    result?.data?.districts,result?.data?.wards,result?.data?.provinces,
    result?.districts,result?.wards,result?.provinces];
  const array=values.find(Array.isArray);
  if(!array)throw Error('API địa giới không trả về danh sách');
  return array;
}
export async function buildCarrierPayload(job, getLocations, warehouseId=24) {
  validateJob(job);
  const p=job.payload;
  const province=matchName(parseCatalog(await getLocations('/locations/'+
    (p.address_mode==='3-tier'?'provinces':'provinces-2tier'))),p.receiver.province.name);
  const provinceName=province.name,provinceCode=String(province.code);
  let district=null;
  if(p.address_mode==='3-tier'){
    district=matchName(parseCatalog(await getLocations('/locations/districts?province='+
      encodeURIComponent(provinceName))),p.receiver.district.name);
  }
  const ward=matchName(parseCatalog(await getLocations(p.address_mode==='3-tier'
    ?'/locations/wards?province='+encodeURIComponent(provinceName)+'&district='+encodeURIComponent(district.name)
    :'/locations/wards-2tier?province='+encodeURIComponent(provinceCode)
  )),p.receiver.ward.name);
  const grams=Math.round(Number(p.product.weight)*1000),carrierWarehouse=Number(warehouseId);
  if(!Number.isSafeInteger(grams)||grams<1||grams>200000||
     !Number.isSafeInteger(carrierWarehouse)||carrierWarehouse<1)
    throw Error('Khối lượng hoặc kho GomShip không hợp lệ');
  return {
    receiver_name:p.receiver.name.trim(),receiver_phone:p.receiver.phone.replace(/[\s-]/g,''),
    address_mode:p.address_mode,
    province_code:provinceCode,province_name:provinceName,
    district_code:district?String(district.code):'',district_name:district?.name||'',
    ward_code:String(ward.code),ward_name:ward.name,
    specific_address:p.receiver.detail_address.trim(),cod_amount:Number(p.cod),
    order_type:1,pickup_type:2,payment_method:0,
    carrier_code:'shopee_express',service_code:'standard',
    note:String(p.note||'[CHO THỬ HÀNG]'),delivery_requirement:'try_on',
    warehouse_id:carrierWarehouse,product_code:'',product_name:p.product.name.trim(),
    product_weight:grams,product_height:null,product_width:null,product_length:null,
    product_value:Number(p.product.price)
  };
}

import {findWaybill,gomshipOrderId} from './payload.mjs';
export function interpretCarrierReply(reply) {
  if(!reply || reply.ok!==true || !reply.response)
    throw Error(reply?.error||'Không nhận được phản hồi tạo vận đơn (cần đối chiếu)');
  const data=reply.response;
  if(data.success===false)throw Error(data.message||'GomShip từ chối tạo đơn');
  const id=gomshipOrderId(data),waybill=findWaybill(data);
  if(!id||!waybill)throw Error('GomShip có phản hồi nhưng thiếu mã ID hoặc SPXVN; cần đối chiếu thủ công');
  return {gomshipOrderId:id,spxWaybill:waybill,response:data};
}
export function validateWarehouseId(value) {
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<1||number>100000)throw Error('Mã kho GomShip không hợp lệ');
  return number;
}

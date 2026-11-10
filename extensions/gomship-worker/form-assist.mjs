// Assisted entry only: never submits a shipment, collects auth, or changes rates.
// React/Vue controlled inputs require the native setter plus input/change events.
const normalize=value=>String(value??'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d')
  .replace(/[*:]/g,' ').replace(/\s+/g,' ').trim();

function visible(el){
  return !el.disabled && el.type!=='password' && el.type!=='hidden' &&
    (!el.getClientRects || el.getClientRects().length>0);
}
function labelsFor(el,doc){
  const values=[el.name,el.id,el.placeholder,el.getAttribute('aria-label')];
  const labelById=el.id?[...doc.querySelectorAll('label[for]')]
    .filter(l=>l.getAttribute('for')===el.id):[];
  for(const label of [...(el.labels||[]),...labelById])
    values.push(label.textContent);
  let parent=el.parentElement;
  for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){
    const inputs=[...parent.querySelectorAll('input,textarea')]
      .filter(item=>item.type!=='hidden');
    if(inputs.length===1 && inputs[0]===el){
      for(const label of parent.querySelectorAll('label')){
        if(label.textContent)values.push(label.textContent);
      }
      if(parent.getAttribute('data-label'))values.push(parent.getAttribute('data-label'));
    }
  }
  return normalize(values.filter(Boolean).join(' '));
}
function matchUniqueInput(doc,expressions,used){
  const candidates=[...doc.querySelectorAll('input, textarea')]
    .filter(el=>visible(el)&&!used.has(el))
    .filter(el=>expressions.some(re=>re.test(labelsFor(el,doc))));
  return candidates.length===1?candidates[0]:null;
}
function setValue(el,value){
  const proto=el.tagName==='TEXTAREA'
    ?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
  if(setter)setter.call(el,String(value));
  else el.value=String(value);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
export function fillGomshipCreateForm(doc,job){
  const p=job?.payload;
  if(!job?.order_id||!p?.receiver||!p?.product)
    throw Error('Thiếu thông tin người nhận hoặc sản phẩm trong hàng đợi Supabase');
  const receiver=p.receiver;
  const fields=[
    {name:'Tên người nhận',keys:[/ten nguoi nhan/,/receiver.?name/],value:receiver.name},
    {name:'Số điện thoại người nhận',keys:[/so dien thoai/,/receiver.?phone/],value:receiver.phone},
    {name:'Địa chỉ cụ thể',keys:[/dia chi cu the/,/so nha, ten duong/,/specific.?address/],
      value:receiver.detail_address},
    {name:'Tên sản phẩm và mã đơn',keys:[/ten san pham/,/product.?name/],value:p.product.name},
    {name:'Tiền COD',keys:[/tien cod/,/thu ho/,/cod.?amount/],value:p.cod},
    {name:'Giá trị khai báo',keys:[/gia tri khai bao/,/product.?value/],value:p.product.price}
  ];
  // Weight is intentionally manual: the site may require grams while the
  // Pumalife payload stores kilograms. We must not silently change units.
  const populated=[],manual=[],used=new Set();
  for(const field of fields){
    const input=matchUniqueInput(doc,field.keys,used);
    if(input && field.value!==null && field.value!==undefined && String(field.value).trim()!==''){
      setValue(input,field.value);
      used.add(input);
      populated.push(field.name);
    }else manual.push(field.name);
  }
  if(!populated.length)
    throw Error('Không tìm thấy ô nhập phù hợp. Hãy mở trang Tạo đơn hàng của GomShip.');
  manual.push('Chọn '+(p.address_mode==='3-tier'?'Cũ (3 cấp)':'Mới (2 cấp)'));
  manual.push('Tỉnh/Thành phố: '+String(receiver.province?.name||''));
  if(p.address_mode==='3-tier')manual.push('Quận/Huyện: '+String(receiver.district?.name||''));
  manual.push('Phường/Xã: '+String(receiver.ward?.name||''));
  manual.push('Kho GomShip, cân nặng: '+String(p.product.weight||'')+' kg');
  manual.push('Kiểm tra giá trị, tiền COD, phí vận chuyển và điều kiện thử hàng');
  return {
    orderId:job.order_id,populated,manual,
    instruction:'Đã điền một số ô. Kiểm tra toàn bộ địa chỉ và đơn hàng, chuẩn bị gửi trong Extension trước khi tự tạo trên GomShip.'
  };
}
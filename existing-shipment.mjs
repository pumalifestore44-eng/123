import { shipmentRpc } from './shipment-groups.mjs';

export function validateExistingShipment(code, orderSn, cod) {
    code=String(code||'').trim().toUpperCase();orderSn=String(orderSn||'').trim().toUpperCase();
    if(!/^SPXVN[A-Z0-9]{6,30}$/.test(code)) throw new Error('Vui lòng nhập đúng mã vận đơn SPX bắt đầu bằng SPXVN.');
    if(orderSn&&!/^VN[A-Z0-9]{6,40}$/.test(orderSn)) throw new Error('Order SN không hợp lệ; có thể để trống nếu chưa có.');
    if(String(cod).trim()===''||!Number.isSafeInteger(Number(cod))||Number(cod)<0) throw new Error('COD phải là số tiền nguyên từ 0 trở lên.');
    return {code,orderSn,cod:Number(cod)};
}

export function setupExistingShipment({getBundle,onSaved}) {
    let busy=false;
    const el=id=>document.getElementById(id);
    const setMode=mode=>{
        if(busy)return;
        el('jtOrderForm').style.display=mode==='create'?'flex':'none';
        el('spxExistingForm').style.display=mode==='existing'?'flex':'none';
        document.querySelectorAll('[data-spx-entry-mode]').forEach(b=>{
            const active=b.dataset.spxEntryMode===mode;b.setAttribute('aria-pressed',String(active));
            b.style.background=active?'#fff0eb':'var(--bg-panel)';b.style.color=active?'#e34523':'var(--text-main)';
        });
    };
    document.addEventListener('click',e=>{const b=e.target.closest?.('[data-spx-entry-mode]');if(b)setMode(b.dataset.spxEntryMode);});
    document.addEventListener('submit',async e=>{
        if(e.target.id!=='spxExistingForm')return;e.preventDefault();if(busy)return;
        const button=e.target.querySelector('button[type="submit"]'),error=el('spxExistingError');error.textContent='';
        try{
            const input=validateExistingShipment(el('spxExistingCode').value,el('spxExistingOrderSn').value,el('spxExistingCod').value);
            if(!el('spxExistingConfirm').checked)throw new Error('Vui lòng kiểm tra vận đơn và đánh dấu xác nhận.');
            const bundle=getBundle();if(!bundle)throw new Error('Hãy mở lại cửa sổ từ đơn cần liên kết.');
            busy=true;button.disabled=true;button.textContent='Đang lưu mã…';
            await shipmentRpc('attach_existing_spx_shipment',{p_order_id:String(bundle.root.id),p_expected_ids:bundle.members.map(o=>String(o.id)),p_waybill:input.code,p_order_sn:input.orderSn||null,p_cod:input.cod});
            el('jtCreateOrderModal').style.display='none';
            try{await onSaved();}catch(err){console.warn('Đã lưu mã nhưng chưa tải lại được danh sách:',err.message);}
            alert('Đã lưu mã vận đơn '+input.code+' cho '+bundle.members.length+' đơn.');
        }catch(err){error.textContent=err.message;}
        finally{busy=false;button.disabled=false;button.textContent='Lưu mã vận đơn có sẵn';}
    });
    return {reset(){
        if(!el('spxExistingForm'))return;
        el('spxExistingForm').reset();el('spxExistingError').textContent='';
        const bundle=getBundle();el('spxExistingCod').value=bundle?.order.cod??0;
        el('spxExistingOrders').textContent='Liên kết cho đơn #'+(bundle?.labels||[]).join(', #');setMode('create');
    }};
}

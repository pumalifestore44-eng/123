import { primarySupabase } from './supabase-config.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const shipmentCode = order => String(order?.jt_waybill_id || order?.spx_tn || order?.sls_tn || '').trim();
export const orderLabel = order => String(order.display_id ?? order.id);
export const normalizeShipmentPhone = value => String(value || '').replace(/\D/g,'').replace(/^84(?=\d{9}$)/,'0');
const amount = value => (Number(value)||0).toLocaleString('vi-VN')+' đ';
const headers = { apikey:primarySupabase.anonKey, Authorization:`Bearer ${primarySupabase.anonKey}`, 'Content-Type':'application/json' };
async function request(path, options = {}) {
    const response = await fetch(primarySupabase.url+'/rest/v1/'+path, { ...options, headers:{...headers,...options.headers} });
    const text = await response.text(); let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
        if (path==='rpc/attach_existing_spx_shipment' && ['PGRST202','42883'].includes(data?.code)) throw new Error('Cần chạy file attach_existing_spx_shipment.sql trên Supabase để lưu mã có sẵn.');
        if (path==='rpc/mark_shipment_printed' && ['PGRST202','42883'].includes(data?.code)) throw new Error('Cần chạy file sync_shipment_printing.sql trên Supabase để đồng bộ trạng thái in theo mã vận đơn.');
        if (['PGRST202','PGRST204','42703','42883'].includes(data?.code)) throw new Error('Chưa cài đặt tính năng lưu nhóm giao hàng. Cần chạy file enable_grouped_shipments.sql trên Supabase trước.');
        throw new Error(data?.message || data?.error || `Không lưu được nhóm giao hàng (HTTP ${response.status})`);
    }
    return data;
}
export const shipmentRpc = (name, body) => request('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
export async function fetchShipmentOrder(id) {
    const rows = await request('pancake_orders?id=eq.'+encodeURIComponent(id)+'&select=*,items:pancake_order_items(*)');
    if (!rows?.[0]) throw new Error('Không tìm thấy đơn hàng');
    return rows[0];
}

export function combineShipmentOrders(input, requestedId) {
    const members = [...new Map(input.map(o=>[String(o.id),o])).values()];
    const requested = members.find(o=>String(o.id)===String(requestedId)) || members[0];
    if (!requested) throw new Error('Nhóm không có đơn hàng');
    const root = members.find(o=>String(o.id)===String(requested.shipping_group_root_id)) || requested;
    const codes = [...new Set(members.map(shipmentCode).filter(Boolean))];
    if (codes.length>1) throw new Error('Nhóm có nhiều mã vận đơn khác nhau, cần kiểm tra trước khi in/tạo giao hàng');
    const items = members.flatMap(o=>(o.items||[]).map(item=>({...item,_shipment_order:orderLabel(o)})));
    const labels = members.map(orderLabel);
    const due = members.reduce((sum,o)=>sum+(Number(o.cod)||0),0);
    const carrier = members.find(o=>o.shipment_cod!=null) || root;
    const cod = codes.length ? Number(carrier.shipment_cod ?? carrier.cod)||0 : due;
    return { members, root, labels, due,
        order:{...root,id:requested.id,items,cod,jt_waybill_id:codes[0]||null,
            bill_print_count:Math.max(0,...members.map(o=>Number(o.bill_print_count)||0)),_shipment_order_codes:labels} };
}

export async function loadShipmentBundle(order) {
    let members = [order];
    if (order.shipping_group_id || shipmentCode(order)) {
        const filter = order.shipping_group_id ? 'shipping_group_id=eq.'+encodeURIComponent(order.shipping_group_id) : 'jt_waybill_id=eq.'+encodeURIComponent(shipmentCode(order));
        const rows = await request('pancake_orders?'+filter+'&select=*,items:pancake_order_items(*)&order=inserted_at.asc&limit=1001');
        if (rows.length>1000) throw new Error('Nhóm có quá nhiều đơn, cần kiểm tra dữ liệu liên kết');
        members = [...rows,order];
    }
    return combineShipmentOrders(members,order.id);
}

export async function decorateShipmentOrders(orders) {
    const groups = [...new Set(orders.map(o=>o.shipping_group_id).filter(Boolean))];
    if (!groups.length) return orders;
    const rows = await request('pancake_orders?select=id,display_id,shipping_group_id&shipping_group_id=in.('+groups.map(encodeURIComponent).join(',')+')&limit=1001');
    if (rows.length>1000) throw new Error('Có quá nhiều đơn trong các nhóm giao hàng đang xem');
    return orders.map(o=>({...o,_shipment_members:rows.filter(r=>r.shipping_group_id===o.shipping_group_id).map(orderLabel)}));
}

// Choose among visible rows: searching for just one member still leaves it printable.
export function assignShipmentPrintOwners(orders) {
    const owners = new Map();
    return orders.map(order => {
        const code = shipmentCode(order);
        if (!code) return order;
        if (!owners.has(code)) owners.set(code, { id:String(order.id), label:orderLabel(order) });
        return { ...order, _shipment_print_owner:owners.get(code) };
    });
}

export function dashboardShipmentPrintButton(order) {
    const owner = order._shipment_print_owner;
    if (owner && owner.id !== String(order.id)) {
        return `<button type="button" disabled data-shared-print-order="${esc(order.id)}" title="Dùng chung vận đơn với đơn #${esc(owner.label)}. Chỉ cần in một bill cho cả nhóm." style="padding:4px 7px;font-size:0.68rem;border-radius:4px;background:#e2e8f0;color:#64748b;border:1px solid #cbd5e1;cursor:not-allowed;">In chung với đơn #${esc(owner.label)}</button>`;
    }
    return `<button type="button" class="btn-primary-quick" onclick="window.openJtWaybillPrintPreview(${esc(JSON.stringify(String(order.id)))}, event)" style="padding:3px 6px;font-size:0.68rem;border-radius:4px;background-color:#DC2626;color:#fff;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="printer" style="width:10px;height:10px;"></i> In bill</button>`;
}

export function shipmentGroupBadge(order) {
    if (!order.shipping_group_id) return '';
    const labels = order._shipment_members || [];
    return `<button type="button" data-view-shipment="${esc(order.id)}" style="margin-top:6px;padding:5px 7px;border:1px solid #bfdbfe;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-size:11px;cursor:pointer;">📦 Giao gộp${labels.length?' · '+labels.map(esc).join(', '):''}</button>`;
}
export function mergeShipmentButton(order, { compact = false } = {}) {
    if (shipmentCode(order)) return '';
    const sizing = compact
        ? 'flex:1.15;min-width:0;margin:0;padding:5px 3px;height:32px;font-size:10.5px;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:2px;'
        : 'margin-top:6px;padding:6px 9px;font-size:12px;';
    return `<button type="button" data-merge-shipment="${esc(order.id)}" style="${sizing}border:1px solid #2563eb;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-weight:600;cursor:pointer;">📦 Gộp giao hàng</button>`;
}

function makeDialog(title) {
    const dialog=document.createElement('dialog');
    dialog.style.cssText='width:min(620px,94vw);max-height:88vh;border:1px solid #dbe3ef;border-radius:14px;padding:0;color:#173154;background:white;font:14px/1.4 sans-serif;z-index:10000';
    dialog.innerHTML=`<div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center"><strong>${esc(title)}</strong><button data-close style="border:0;background:none;font-size:22px;cursor:pointer">×</button></div><div data-body style="padding:16px 20px;overflow:auto;max-height:65vh"></div><div data-footer style="padding:14px 20px;border-top:1px solid #e2e8f0"></div>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.appendChild(dialog); dialog.showModal();return dialog;
}

export function setupShipmentGrouping({ onChanged = async()=>{} } = {}) {
    document.addEventListener('click', async event=>{
        const button=event.target.closest?.('[data-merge-shipment],[data-view-shipment]');
        if (!button) return;event.preventDefault();event.stopPropagation();
        if (button.dataset.mergeShipment) await openMerge(button.dataset.mergeShipment,onChanged);
        else await openGroup(button.dataset.viewShipment);
    },true);
}

async function openGroup(id) {
    const dialog=makeDialog('Nhóm giao hàng'),body=dialog.querySelector('[data-body]');body.textContent='Đang tải nhóm…';
    try {
        const bundle=await loadShipmentBundle(await fetchShipmentOrder(id));
        body.innerHTML=`<strong>${esc(shipmentCode(bundle.order)||'Nhóm chưa tạo mã vận đơn')}</strong><p>Kiện gửi theo người nhận và địa chỉ của đơn #${esc(orderLabel(bundle.root))}.</p>${bundle.members.map(o=>`<div style="padding:10px 0;border-bottom:1px solid #e2e8f0"><strong>Đơn #${esc(orderLabel(o))}</strong> · COD đơn: ${amount(o.cod)}<div>${(o.items||[]).map(i=>esc(i.product_name||i.name)+' × '+esc(i.quantity||1)).join('<br>')}</div></div>`).join('')}<p>${shipmentCode(bundle.order)?'COD trên kiện: '+amount(bundle.order.cod):'Tổng COD các đơn (cần kiểm tra phí ship chung): '+amount(bundle.due)}</p>`;
        if (!shipmentCode(bundle.order)) {
            const btn=document.createElement('button');btn.textContent='Tạo giao hàng cho nhóm';btn.className='btn-primary-quick';
            btn.onclick=()=>{dialog.close();window.openSpxCreateModal(bundle.root.id);};dialog.querySelector('[data-footer]').appendChild(btn);
        }
    } catch(error) { body.textContent=error.message; }
}

async function openMerge(id,onChanged) {
    const dialog=makeDialog('Gộp giao hàng'),body=dialog.querySelector('[data-body]'),footer=dialog.querySelector('[data-footer]');body.textContent='Đang tìm đơn cùng khách hàng…';
    try {
        const source=await fetchShipmentOrder(id);
        if (shipmentCode(source)) throw new Error('Đơn đã có mã vận đơn. Hãy tải lại danh sách.');
        const sourceBundle=await loadShipmentBundle(source);
        const candidates=await shipmentRpc('shipment_merge_candidates',{p_order_id:String(id)});
        let selected=null;
        body.innerHTML=`<p>Gộp <strong>${sourceBundle.labels.map(l=>'#'+esc(l)).join(', ')}</strong> với một đơn khác cùng số điện thoại người nhận.</p><p style="color:#64748b">Các đơn giữ nguyên tiền hàng, cọc và lịch sử riêng. Kiện dùng người nhận/địa chỉ của đơn bạn chọn bên dưới.</p><input data-search placeholder="Tìm mã đơn, mã vận đơn hoặc tên khách…" style="box-sizing:border-box;width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:7px"><div data-options style="margin-top:10px"></div><div data-review style="margin-top:12px"></div>`;
        footer.innerHTML='<button data-save disabled style="padding:10px 16px;border:0;border-radius:7px;background:#2563eb;color:white;font-weight:700;cursor:pointer">Xác nhận gộp giao hàng</button><span data-error role="alert" style="display:block;color:#dc2626;margin-top:7px"></span>';
        const save=footer.querySelector('[data-save]'),review=body.querySelector('[data-review]');
        const reviewSelection=()=>{
            if(!selected){save.disabled=true;return;}
            const code=shipmentCode(selected);
            review.innerHTML=`<div style="padding:12px;border:1px solid #bfdbfe;border-radius:8px;background:#eff6ff"><strong>${code?'Dùng chung mã '+esc(code):'Liên kết trước, tạo một mã vận đơn sau'}</strong><div>Người nhận: ${esc(selected.bill_full_name)} · ${esc(selected.bill_phone_number)}</div><div>${esc(selected.shipping_address?.full_address||selected.shipping_address?.address||'Chưa có địa chỉ')}</div>${code?'<p style="color:#9a3412">Thao tác này chỉ liên kết đơn. Không tự thêm sản phẩm hoặc thay đổi COD trên SPX. Bạn cần kiểm tra/cập nhật kiện trên SPX trước khi giao cho tài xế.</p><label><input data-cod-check type="checkbox"> Tôi đã kiểm tra COD và nội dung kiện trên SPX.</label>':'<p>Khi tạo giao hàng từ bất kỳ đơn nào trong nhóm, sản phẩm và mã đơn được gộp chung. Hãy kiểm tra lại COD/phí ship trước khi gửi SPX.</p>'}</div>`;
            save.disabled=!!code;review.querySelector('[data-cod-check]')?.addEventListener('change',e=>save.disabled=!e.target.checked);
        };
        const render=()=>{
            const query=body.querySelector('[data-search]').value.trim().toLowerCase(),options=body.querySelector('[data-options]');options.replaceChildren();
            const visible=candidates.filter(o=>[orderLabel(o),shipmentCode(o),o.bill_full_name].join(' ').toLowerCase().includes(query));
            if(!visible.length){options.textContent='Không có đơn phù hợp. Chỉ hiển thị đơn cùng khách, chưa lấy/giao/hủy hàng.';return;}
            visible.forEach(o=>{const label=document.createElement('label');label.style.cssText='display:block;padding:11px;border:1px solid #dbe3ef;border-radius:8px;margin-bottom:8px;cursor:pointer';label.innerHTML=`<input type="radio" name="shipment-target" ${selected?.id===o.id?'checked':''}> <strong>Đơn #${esc(orderLabel(o))}</strong> · ${esc(o.bill_full_name)}<div style="padding-left:20px;font-size:12px;color:#475569">${esc(shipmentCode(o)||'Chưa có mã vận đơn')} · COD đơn: ${amount(o.cod)}<br>${esc(o.shipping_address?.full_address||o.shipping_address?.address||'Chưa có địa chỉ')}${o.shipping_group_id?'<br>Đã thuộc nhóm — sẽ gộp cả nhóm':''}</div>`;label.querySelector('input').onchange=()=>{selected=o;reviewSelection();};options.appendChild(label);});
        };
        body.querySelector('[data-search]').oninput=render;render();
        save.onclick=async()=>{
            if(!selected||save.disabled)return;save.disabled=true;save.textContent='Đang lưu nhóm…';
            try{
                const result=await shipmentRpc('merge_order_shipments',{p_source_id:String(id),p_target_id:String(selected.id)});
                body.innerHTML=`<strong style="color:#15803d">Đã liên kết ${esc(result.count)} đơn.</strong><p>${result.waybill?'Các đơn dùng chung mã '+esc(result.waybill):'Nhóm chưa có vận đơn. Tạo giao hàng từ một đơn trong nhóm để tự liên kết mã cho tất cả.'}</p>`;
                footer.replaceChildren();const close=document.createElement('button');close.textContent='Đóng';close.className='btn-primary-quick';close.onclick=()=>dialog.close();footer.appendChild(close);
                try { await onChanged(); } catch(error) { console.warn('Đã lưu nhóm nhưng chưa tải lại được danh sách:',error.message); }
            }catch(error){footer.querySelector('[data-error]').textContent=error.message;save.disabled=false;save.textContent='Xác nhận gộp giao hàng';}
        };
    } catch(error) {body.textContent=error.message;}
}

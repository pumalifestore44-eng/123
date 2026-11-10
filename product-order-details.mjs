const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderProductOrderItems(items, productId) {
    const ordered = [...items].sort((a,b) => Number(String(b.product_id)===String(productId))-Number(String(a.product_id)===String(productId)));
    return ordered.map(item => {
        let info=item.variation_info || {};
        if(typeof info==='string'){try{info=JSON.parse(info)||{}}catch{info={}}}
        if(typeof info!=='object')info={};
        const name=String(item.product_name || item.name || info.name || 'Sản phẩm').trim();
        const fields=Array.isArray(info.fields)?info.fields:[];
        const details=fields.map(field=>{
            if(!field || typeof field!=='object')return '';
            const value=field.value ?? field.option ?? field.text;
            return value==null || value==='' ? '' : [field.name || field.label,value].filter(Boolean).join(': ');
        }).filter(Boolean);
        if(!details.length){
            const variant=item.variation_label || item.variation_name || info.variation_label || (info.name!==name?info.name:'');
            if(variant)details.push(String(variant));
            if(info.size || item.size)details.push('Size: '+(info.size || item.size));
            if(info.color || item.color)details.push('Màu: '+(info.color || item.color));
        }
        const matched=String(item.product_id)===String(productId);
        const sku=item.sku || info.sku;
        const note=item.item_note || info.item_note || item.note;
        return `<div style="padding:8px 10px;margin:4px 0;border-radius:7px;border:1px solid ${matched?'#c7d2fe':'var(--border)'};background:${matched?'#eef2ff':'var(--bg-panel)'};line-height:1.5;overflow-wrap:anywhere;">
            <div style="display:flex;gap:8px;align-items:flex-start;"><strong style="flex:1;min-width:0;">${escape(name)}</strong><strong style="white-space:nowrap;">×${escape(item.quantity ?? 1)}</strong></div>
            ${details.length?`<div style="font-size:0.8rem;color:#334155;">${escape([...new Set(details)].join(' · '))}</div>`:''}
            ${sku?`<div style="font-size:0.74rem;color:var(--text-muted);">SKU: ${escape(sku)}</div>`:''}
            ${note?`<div style="font-size:0.76rem;color:var(--text-muted);">Ghi chú: ${escape(note)}</div>`:''}
            ${!matched?'<div style="font-size:0.7rem;color:var(--text-muted);">Sản phẩm khác trong đơn</div>':''}
        </div>`;
    }).join('') || '<span style="color:var(--text-muted);">Chưa có thông tin sản phẩm</span>';
}

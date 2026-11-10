export function installDesktopOrderBridge(config) {
  if (!config || !config.baseUrl || !config.apiKey) return;
  window.__desktopOrderApi = async function(cmd) {
    try {
      const h={apikey:config.apiKey,Authorization:'Bearer '+config.apiKey};
      const customer=String(cmd.customer||'').trim(), sku=String(cmd.sku||'').trim(), size=String(cmd.size||'').trim();
      const price=Number(cmd.price||0), qty=Math.max(1,Number(cmd.quantity||1));
      let r=await fetch(config.baseUrl+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&bill_full_name=ilike.*'+encodeURIComponent(customer)+'*&order=inserted_at.desc&limit=1',{headers:h});
      if(!r.ok) throw new Error(await r.text());
      let orders=await r.json();
      if(!orders.length){
        r=await fetch(config.baseUrl+'/rest/v1/pancake_orders?select=*,items:pancake_order_items(*)&order=inserted_at.desc&limit=200',{headers:h});
        if(!r.ok) throw new Error(await r.text());
        orders=(await r.json()).filter(o=>JSON.stringify(o).toLowerCase().includes(customer.toLowerCase())).slice(0,1);
      }
      if(!orders.length) return {ok:false,error:'Không tìm thấy đơn gần nhất của '+customer};
      const o=orders[0];
      r=await fetch(config.baseUrl+'/rest/v1/pancake_products?select=id,name,image_url,product_code,pancake_variations(id,product_id,name,retail_price,images,sku,variation_label,fields)&or=(product_code.ilike.*'+encodeURIComponent(sku)+'*,name.ilike.*'+encodeURIComponent(sku)+'*)&limit=50',{headers:h});
      if(!r.ok) throw new Error(await r.text());
      const p=(await r.json())[0];
      if(!p) return {ok:false,error:'Không tìm thấy SKU '+sku};
      const v=(p.pancake_variations||[]).find(x=>[x.name,x.variation_label,JSON.stringify(x.fields||[])].join(' ').toLowerCase().includes(size.toLowerCase()));
      if(!v) return {ok:false,error:'Không tìm thấy '+sku+' size '+size};
      const current=Array.isArray(o.items)?o.items:[];
      if(current.some(x=>String(x.product_name||'').toLowerCase().includes(sku.toLowerCase())&&String(x.product_name||'').includes(size))) return {ok:false,error:'Sản phẩm đã có trong đơn #'+o.display_id};
      const name=(p.name||sku)+' - '+size;
      const row={order_id:o.id,product_id:p.id,product_name:name,retail_price:price,quantity:qty,discount_each_product:0,item_note:'',variation_info:{name,type:'product',images:v.images?.length?v.images:(p.image_url?[p.image_url]:[]),retail_price:price,item_note:'',sku:v.sku||sku,size}};
      r=await fetch(config.baseUrl+'/rest/v1/pancake_order_items',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)});
      if(!r.ok) throw new Error('Thêm sản phẩm lỗi: '+await r.text());
      const all=current.concat([row]);
      const subtotal=all.reduce((n,x)=>n+((Number(x.retail_price||x.price)||0)-(Number(x.discount_each_product||x.discount)||0))*(Number(x.quantity)||1),0);
      const total=subtotal+Number(o.shipping_fee||0)+Number(o.surcharge||0), cod=Math.max(0,total-Number(o.prepaid||0));
      r=await fetch(config.baseUrl+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id),{method:'PATCH',headers:{...h,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({total_price:total,cod})});
      if(!r.ok) throw new Error('Cập nhật tổng lỗi: '+await r.text());
      r=await fetch(config.baseUrl+'/rest/v1/pancake_orders?id=eq.'+encodeURIComponent(o.id)+'&select=display_id,bill_full_name,total_price,cod,items:pancake_order_items(*)',{headers:h});
      const verified=(await r.json())[0];
      const found=verified?.items?.some(x=>String(x.product_name||'')===name&&Number(x.retail_price)===price&&Number(x.quantity)===qty);
      return found?{ok:true,displayId:verified.display_id,customer:verified.bill_full_name,sku,size,price,quantity:qty,total:verified.total_price,cod:verified.cod}:{ok:false,error:'Không xác minh được sản phẩm sau khi ghi'};
    } catch(e){ return {ok:false,error:e.message}; }
  };
}

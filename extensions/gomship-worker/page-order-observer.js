// MAIN-world response observer for the official GomShip create-order action.
// It neither reads request headers nor intercepts credentials, and does not
// initiate a shipment. Only numeric GomShip ID + SPX tracking code are emitted.
(()=> {
  if(window.__pumalifeGomshipOrderObserverV2)return;
  window.__pumalifeGomshipOrderObserverV2=true;
  const isCreate=(method,url)=>{
    if(String(method||'GET').toUpperCase()!=='POST')return false;
    try {
      const u=new URL(String(url),location.href);
      return u.origin==='https://api.gomship.vn' &&
        u.pathname.replace(/\/+$/,'')==='/api/v1/orders';
    }catch{return false;}
  };
  const getIds=data=>{
    // GomShip may place the numeric order ID and SPX waybill in different
    // response branches. Scan all bounded branches, never request headers.
    const seen=new Set();
    let numericId=null,tracking=null;
    function walk(node,depth=0){
      if(!node || typeof node!=='object' || depth>7 || seen.has(node))return;
      seen.add(node);
      const id=Number(node.gomship_order_id ?? node.order?.id ??
        node.order_id ?? node.id);
      if(!numericId && Number.isSafeInteger(id) && id>0)numericId=id;
      for(const key of ['tracking_number','tracking_code','tracking_no',
        'waybill_id','waybill_number','waybill_code','spx_tn','shipping_code']){
        const value=String(node[key]||'').trim().toUpperCase();
        if(!tracking && /^SPXVN[A-Z0-9]{5,75}$/.test(value))tracking=value;
      }
      for(const child of Object.values(node))if(child&&typeof child==='object')walk(child,depth+1);
    }
    walk(data);
    return numericId && tracking ? {id:numericId,tracking}:null;
  };
  const post=data=>{
    const id=getIds(data);
    if(!id)return;
    window.postMessage({
      source:'pumalife-gomship-create-observer-v2',
      type:'order_result',gomshipOrderId:id.id,spxWaybill:id.tracking
    },location.origin);
  };
  const nativeFetch=window.fetch;
  if(typeof nativeFetch==='function'){
    window.fetch=function(...args){
      const request=args[0],options=args[1]||{};
      const url=typeof request==='string'?request:request?.url;
      const method=options.method||request?.method||'GET';
      const pending=Reflect.apply(nativeFetch,this,args);
      if(isCreate(method,url)){
        Promise.resolve(pending).then(response=>{
          if(response.ok)response.clone().json().then(post).catch(()=>{});
        }).catch(()=>{});
      }
      return pending;
    };
  }
  const proto=window.XMLHttpRequest?.prototype;
  if(proto){
    const open=proto.open,send=proto.send;
    const requests=new WeakMap();
    proto.open=function(method,url,...args){
      requests.set(this,{tracked:isCreate(method,url)});
      return Reflect.apply(open,this,[method,url,...args]);
    };
    proto.send=function(...args){
      const current=requests.get(this);
      if(current?.tracked){
        this.addEventListener('loadend',()=>{
          try{
            if(this.status<200||this.status>=300)return;
            const data=this.responseType==='json'?this.response:
              (!this.responseType||this.responseType==='text'?JSON.parse(this.responseText):null);
            post(data);
          }catch{}
        },{once:true});
      }
      return Reflect.apply(send,this,args);
    };
  }
})();
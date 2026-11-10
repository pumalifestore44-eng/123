// Multi-select waybill printing. Kept separate from app.js/order loading.
(function(){
  const selected=new Set();
  function rows(){return [...document.querySelectorAll('#dashboardOrdersTableBody tr')];}
  function sync(){
    document.querySelectorAll('.bulk-waybill-cb').forEach(cb=>cb.checked=selected.has(cb.dataset.orderId));
    const b=document.getElementById('bulkWaybillPrintBtn'), n=selected.size;
    if(b){b.disabled=!n;b.textContent='🖨 In bill đã chọn ('+n+')';}
    const a=document.getElementById('bulkWaybillSelectAll');
    const c=[...document.querySelectorAll('.bulk-waybill-cb')];
    if(a){a.checked=c.length>0&&c.every(x=>x.checked);a.indeterminate=c.some(x=>x.checked)&&!a.checked;}
  }
  function enhance(){
    const body=document.getElementById('dashboardOrdersTableBody'); if(!body)return;
    const head=document.querySelector('#orders-tab-content table thead tr'); if(!head)return;
    if(!document.getElementById('bulkWaybillHead')){
      const th=document.createElement('th');th.id='bulkWaybillHead';th.style.cssText='width:42px;padding:16px 8px;text-align:center';
      th.innerHTML='<input id="bulkWaybillSelectAll" type="checkbox" title="Chọn tất cả bill đang hiển thị">';
      head.insertBefore(th,head.firstElementChild);
      th.querySelector('input').addEventListener('change',e=>{document.querySelectorAll('.bulk-waybill-cb').forEach(cb=>{cb.checked=e.target.checked;if(cb.checked)selected.add(cb.dataset.orderId);else selected.delete(cb.dataset.orderId)});sync()});
    }
    rows().forEach(tr=>{
      const shared=tr.querySelector('[data-shared-print-order]');
      if(shared)selected.delete(shared.dataset.sharedPrintOrder);
      if(tr.querySelector('.bulk-waybill-cell'))return;
      const print=tr.querySelector('button[onclick*="openJtWaybillPrintPreview"]:not(:disabled)');
      const td=document.createElement('td');td.className='bulk-waybill-cell';td.style.cssText='width:42px;padding:12px 8px;text-align:center';td.addEventListener('click',e=>e.stopPropagation());td.addEventListener('dblclick',e=>e.stopPropagation());
      if(print){
        const m=(print.getAttribute('onclick')||'').match(/openJtWaybillPrintPreview\((?:'|")?([^,'")]+)/);
        const id=m&&m[1];
        if(id){td.innerHTML='<input type="checkbox" class="bulk-waybill-cb" data-order-id="'+id+'" title="Chọn bill này">';td.firstChild.checked=selected.has(id);td.firstChild.addEventListener('click',e=>e.stopPropagation());td.firstChild.addEventListener('change',e=>{e.stopPropagation();e.target.checked?selected.add(id):selected.delete(id);sync()});}
      }
      tr.insertBefore(td,tr.firstElementChild);
    });
    let btn=document.getElementById('bulkWaybillPrintBtn');
    if(!btn){
      const reload=document.getElementById('btnReloadAllOrders');if(reload){btn=document.createElement('button');btn.id='bulkWaybillPrintBtn';btn.className='btn-secondary-quick';btn.style.cssText='padding:10px 16px;border-radius:8px';btn.disabled=true;btn.textContent='🖨 In bill đã chọn (0)';reload.parentNode.insertBefore(btn,reload);btn.addEventListener('click',printSelected);}
    }
    sync();
  }
  function wait(ms){return new Promise(r=>setTimeout(r,ms))}
  async function printSelected(){
    const ids=[...selected];if(!ids.length)return;
    const template=typeof window.pickWaybillTemplate==='function'?await window.pickWaybillTemplate():'spx';
    if(!template)return;
    const pages=[];
    const printedWaybills=new Set();
    try{
      for(const id of ids){
        await window.openJtWaybillPrintPreview(id,{stopPropagation(){}},template);
        await wait(80);
        const src=document.getElementById('jtWaybillPrintContent');if(!src)continue;
        const waybill=src.querySelector('#jtWaybillDisplayCode')?.textContent.trim();
        if(waybill&&printedWaybills.has(waybill))continue;
        if(waybill)printedWaybills.add(waybill);
        const count=Number(document.getElementById('jtWaybillPrintCount')?.textContent)||0;
        if(count>0&&!confirm('Vận đơn '+waybill+' đã in '+count+' lần. Bạn muốn in lại?'))continue;
        const clone=src.cloneNode(true), sc=src.querySelectorAll('canvas'), cc=clone.querySelectorAll('canvas');
        sc.forEach((c,i)=>{try{const im=document.createElement('img');im.src=c.toDataURL();im.style.cssText=c.style.cssText;if(cc[i])cc[i].replaceWith(im)}catch(_){}});
        if(typeof window.incrementJtWaybillPrintCount!=='function')throw Error('Chưa tải xong chức năng ghi nhận in bill');
        await window.incrementJtWaybillPrintCount();
        pages.push(clone.innerHTML);
      }
      const modal=document.getElementById('jtWaybillPrintModal');if(modal)modal.style.display='none';
      if(!pages.length)throw Error('Không có bill hợp lệ');
      const f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0';document.body.appendChild(f);
      const d=f.contentWindow.document;d.open();d.write('<html><head><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.p{width:74mm;max-width:74mm;padding:4px;page-break-after:always;break-after:page;font-size:11px;line-height:1.25}.p:last-child{page-break-after:auto}@media print{@page{margin:0;size:75mm 105mm}.p{width:74mm!important;max-width:74mm!important}}</style></head><body>'+pages.map(x=>'<div class="p">'+x+'</div>').join('')+'</body></html>');d.close();
      setTimeout(()=>{f.contentWindow.focus();f.contentWindow.print();setTimeout(()=>f.remove(),1000)},300);
    }catch(e){console.error('Bulk print:',e);alert('Không thể in nhiều bill: '+e.message)}
  }
  const obs=new MutationObserver(()=>enhance());document.addEventListener('DOMContentLoaded',()=>{enhance();const b=document.getElementById('dashboardOrdersTableBody');if(b)obs.observe(b,{childList:true})});
})();

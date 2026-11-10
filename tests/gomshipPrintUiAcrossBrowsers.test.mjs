import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareGomshipPrintPreview, autoSelectGomshipPdfIfAvailable,
  isGomshipPdfSelected, getGomshipPdfPrintUrl, closeGomshipPrintPreview
} from '../gomship-print-preview.mjs';

function createElement(extra={}) {
  return {
    style:{},hidden:false,value:'',attrs:{},listeners:{},
    setAttribute(name,value){this.attrs[name]=value;},
    addEventListener(name,callback){this.listeners[name]=callback;},
    ...extra
  };
}

test('fresh browser shows GomShip tab and main-login expiry hint without a second login form',async()=>{
  const localStorage=new Map(), sessionStorage=new Map();
  globalThis.localStorage={
    getItem:k=>localStorage.get(k)||null,
    setItem:(k,v)=>localStorage.set(k,v),
    removeItem:k=>localStorage.delete(k)
  };
  globalThis.sessionStorage={
    getItem:k=>sessionStorage.get(k)||null,
    setItem:(k,v)=>sessionStorage.set(k,v),
    removeItem:k=>sessionStorage.delete(k)
  };
  const tab=createElement();
  const spx=createElement({dataset:{waybillTemplate:'spx'}});
  const other=createElement({dataset:{waybillTemplate:'legacy'}});
  const iframe=createElement({src:'about:blank'});
  const panel=createElement({querySelector:()=>iframe});
  const form=createElement({querySelector:()=>createElement()});
  const status=createElement({textContent:''});
  const hint=createElement({textContent:''});
  const html=createElement({dataset:{waybillTemplate:'spx'}});
  const controls={
    gomshipPdfTemplateTab:tab,
    gomshipPdfPreview:panel,
    gomshipPdfStatus:status,
    gomshipPrintAuthForm:form,
    jtWaybillPrintContent:html,
    jtPrintEditHint:hint
  };
  globalThis.document={
    getElementById:id=>controls[id]||null,
    querySelectorAll:()=>[spx,other]
  };
  const calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push({url,opts});
    return new Response(JSON.stringify({success:true,source:'gomship',status:'created'}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  assert.equal(prepareGomshipPrintPreview('local_16607'),false);
  assert.equal(tab.style.display,'none');
  assert.equal(await autoSelectGomshipPdfIfAvailable('local_16607'),true);
  assert.equal(tab.style.display,'block');
  assert.equal(isGomshipPdfSelected(),true);
  assert.equal(panel.style.display,'flex');
  assert.notEqual(form.style.display,'flex');
  assert.equal(getGomshipPdfPrintUrl(),'');
  assert.match(status.textContent,/Phiên Pumalife hết hạn/);
  assert.equal(JSON.parse(calls[0].opts.body).action,'get_cancel_source');
  assert.equal(calls.length,1,'No PDF is requested without Auth or local capability');
  closeGomshipPrintPreview();
  assert.equal(isGomshipPdfSelected(),false);
  assert.equal(panel.style.display,'none');
});
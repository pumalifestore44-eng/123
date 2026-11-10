const el=id=>document.getElementById(id);
const show=(id,value)=>{el(id).hidden=!value};
const note=value=>{el('message').textContent=String(value??'')};
async function rpc(type,args={}){
  const result=await chrome.runtime.sendMessage({type,...args});
  if(!result?.ok)throw Error(result?.error||'Không liên lạc được với Extension');
  return result.value;
}
let pending=false;
async function act(action){
  if(pending)return;
  pending=true;
  try{await action();}
  catch(error){note('Lỗi: '+String(error?.message||error));}
  finally{pending=false;}
}
async function render(){
  const s=await rpc('STATUS');
  el('version').textContent='v'+s.build;
  show('loginSection',!s.connected);
  show('workerSection',s.connected);
  el('identity').textContent=s.email||'Pumalife';
  el('bearerStatus').textContent=s.gomshipAuthSaved
    ?'Đã lưu access token trong phiên Chrome'
    :'Chưa lưu access token GomShip';
  el('warehouse').value=String(s.warehouseId||24);
  show('normalControls',!s.active);
  show('recovery',Boolean(s.active));
  if(s.active){
    const active=s.active;
    el('activeOrder').textContent=active.order_id;
    el('activeStep').textContent=active.step;
    el('carrierResult').textContent=active.carrierResult
      ?'GomShip ID '+active.carrierResult.gomshipOrderId+' · '+active.carrierResult.spxWaybill
      :'Chưa xác định được kết quả. Kiểm tra GomShip trước khi thử thao tác tiếp.';
    el('release').disabled=active.step!=='claimed';
    el('saveResult').disabled=!active.carrierResult||active.step!=='submitting';
    el('review').disabled=active.step!=='submitting';
  }
  note((s.lastStatus||'')+(s.lastError?'\n'+s.lastError:''));
}
el('loginForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  void act(async()=>{
    note('Đang kết nối Supabase...');
    await rpc('LOGIN',{email:el('email').value.trim(),password:el('password').value});
    el('password').value='';
    await render();
  });
});
el('saveBearer').addEventListener('click',()=>void act(async()=>{
  const value=el('gomshipBearer').value.trim();
  if(!value)throw Error('Nhập access token GomShip');
  await rpc('SAVE_GOMSHIP_AUTH',{authorization:value});
  el('gomshipBearer').value='';
  await render();
  note('Đã lưu token trong phiên Chrome. Nhấn Kiểm tra phiên trước khi chạy API.');
}));
el('clearBearer').addEventListener('click',()=>void act(async()=>{
  await rpc('CLEAR_GOMSHIP_AUTH');
  el('gomshipBearer').value='';
  await render();
  note('Đã xóa token khỏi phiên Chrome.');
}));
el('checkAuth').addEventListener('click',()=>void act(async()=>{
  const result=await rpc('CHECK_AUTH');
  el('authStatus').textContent=(result.ready?'ĐÃ KẾT NỐI · ':'CHƯA SẴN SÀNG · ')+result.diagnostic;
}));
el('queue').addEventListener('click',()=>void act(async()=>{
  const q=await rpc('CHECK_QUEUE');
  note('Đang chờ: '+q.count+(q.more?'+':'')+(q.first?' · Đơn tiếp theo '+q.first:''));
}));
el('saveWarehouse').addEventListener('click',()=>void act(async()=>{
  await rpc('SAVE_WAREHOUSE',{warehouseId:Number(el('warehouse').value)});
  await render();
}));
el('runOnce').addEventListener('click',()=>void act(async()=>{
  if(!confirm('Gửi một yêu cầu tạo vận đơn thật qua API GomShip? Chỉ xử lý một job.'))return;
  note('Đang kiểm tra phiên, địa chỉ và gửi một yêu cầu API...');
  const result=await rpc('RUN_ONCE');
  await render();
  if(result?.completed)note('Đã tạo '+result.orderId+' · '+result.spxWaybill);
  else if(result?.empty)note('Hàng đợi trống.');
  else if(result?.error)note('Dừng: '+result.error+
    (result.needsReview?'\nCần đối chiếu GomShip; không gửi lại.':''));
}));
el('reconcile').addEventListener('click',()=>void act(async()=>{
  const result=await rpc('RECONCILE');
  await render();
  note('Supabase: '+(result.server?.status||'không tìm thấy')+
    (result.server?.spx_waybill?' · '+result.server.spx_waybill:''));
}));
el('release').addEventListener('click',()=>void act(async()=>{
  if(!confirm('Chỉ nhả khóa nếu chắc chắn chưa bắt đầu POST. Tiếp tục?'))return;
  await rpc('RELEASE');
  await render();
}));
el('saveResult').addEventListener('click',()=>void act(async()=>{
  if(!confirm('Lưu mã đã nhận từ API về Supabase? Không gửi POST lần nữa.'))return;
  const result=await rpc('SAVE_RESULT');
  await render();
  note('Đã lưu '+result.spxWaybill);
}));
el('review').addEventListener('click',()=>void act(async()=>{
  if(!confirm('Chuyển job sang needs_review? Hệ thống sẽ giữ khóa và không gửi lại.'))return;
  await rpc('NEEDS_REVIEW',{reason:'Người vận hành chưa xác định được kết quả API GomShip'});
  await render();
}));
el('logout').addEventListener('click',()=>void act(async()=>{
  await rpc('LOGOUT');
  await render();
}));
void render().catch(error=>note(error?.message||String(error)));

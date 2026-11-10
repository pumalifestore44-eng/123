-- Pumalife GomShip Chrome Extension queue
-- Run in Primary Supabase SQL Editor AFTER enable_grouped_shipments.sql and gomship_setup.sql.
-- Does not send any requests to GomShip and does not create shipments during setup.
-- The only allowed operator below is the Pumalife Supabase Auth account.
-- If the real Pumalife Supabase Auth email differs, adjust it BEFORE execution.

create extension if not exists pgcrypto;

create table if not exists public.gomship_extension_requests (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  group_order_ids text[] not null,
  payload jsonb not null,
  idempotency_key uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check
    (status in ('pending','claimed','submitting','completed','needs_review','cancelled')),
  claim_token uuid,
  worker_id text,
  gomship_order_id bigint,
  spx_waybill text,
  carrier_response jsonb,
  error_text text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  submitted_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gomship_extension_requests_order_id_not_blank check (length(trim(order_id)) > 0)
);
create index if not exists gomship_extension_queue_pending_idx
  on public.gomship_extension_requests(status, created_at);
create unique index if not exists gomship_extension_queue_one_active_order
  on public.gomship_extension_requests(order_id)
  where status in ('pending','claimed','submitting','completed','needs_review');

alter table public.gomship_extension_requests enable row level security;
revoke all on public.gomship_extension_requests from public, anon;
grant select on public.gomship_extension_requests to authenticated;

create or replace function public.gomship_extension_operator()
returns boolean language sql stable security invoker set search_path=public
as $$
 select auth.uid() is not null and auth.role()='authenticated'
   and lower(coalesce(auth.jwt()->>'email',''))='pumalifestore@gmail.com';
$$;
revoke all on function public.gomship_extension_operator() from public, anon;
grant execute on function public.gomship_extension_operator() to authenticated;

drop policy if exists gomship_extension_operator_read on public.gomship_extension_requests;
create policy gomship_extension_operator_read on public.gomship_extension_requests
  for select to authenticated using (public.gomship_extension_operator());

create or replace function public.enqueue_gomship_extension_request(
  p_order_id text, p_payload jsonb, p_group_order_ids text[] default '{}'::text[]
) returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  root public.pancake_orders%rowtype;
  actual text[];
  provided text[];
  prior public.gomship_extension_requests%rowtype;
  new_id uuid;
begin
  if not public.gomship_extension_operator() then raise exception 'GomShip queue: forbidden'; end if;
  if nullif(trim(p_order_id),'') is null or p_payload is null or
     jsonb_typeof(p_payload)<>'object' or p_payload->>'order_id' is distinct from p_order_id then
    raise exception 'Yêu cầu tạo vận đơn không hợp lệ';
  end if;
  perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
  select * into root from public.pancake_orders where id=p_order_id for update;
  if not found then raise exception 'Không tìm thấy đơn Pumalife'; end if;
  if root.shipping_group_root_id is not null and root.shipping_group_root_id<>root.id then
    raise exception 'Phải gửi yêu cầu từ đơn gốc của nhóm';
  end if;
  select array_agg(o.id order by o.id) into actual
    from public.pancake_orders o
    where (root.shipping_group_id is null and o.id=p_order_id)
       or (root.shipping_group_id is not null and o.shipping_group_id=root.shipping_group_id);
  select array_agg(x order by x) into provided
    from unnest(coalesce(nullif(p_group_order_ids,'{}'::text[]),array[p_order_id])) x;
  if actual is distinct from provided then raise exception 'Danh sách đơn gộp đã thay đổi'; end if;
  perform 1 from public.pancake_orders where id=any(actual) order by id for update;
  if exists(select 1 from public.pancake_orders where id=any(actual) and
    (nullif(trim(jt_waybill_id),'') is not null or shipment_claim_token is not null or
       (public.shipment_is_closed(status::text) and lower(trim(status::text)) not in ('6','đã hủy','đã huỷ'))))
    then raise exception 'Đơn/nhóm đã có vận đơn hoặc đang tạo vận đơn'; end if;
  if exists(select 1 from public.gomship_shipments
    where order_id=p_order_id)
    then raise exception 'Có vận đơn GomShip trước đó cần đối chiếu trước khi tạo'; end if;
  select * into prior from public.gomship_extension_requests
    where order_id=p_order_id and status in
    ('pending','claimed','submitting','completed','needs_review')
    order by created_at desc limit 1 for update;
  if found then
    return jsonb_build_object('id',prior.id,'status',prior.status,'duplicate',true);
  end if;
  insert into public.gomship_extension_requests(order_id,group_order_ids,payload)
    values(p_order_id,actual,p_payload) returning id into new_id;
  return jsonb_build_object('id',new_id,'status','pending','duplicate',false);
end; $$;

create or replace function public.claim_gomship_extension_request(p_worker_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item public.gomship_extension_requests%rowtype;
  root public.pancake_orders%rowtype;
  actual text[];
  new_claim uuid:=gen_random_uuid();
begin
  if not public.gomship_extension_operator() then raise exception 'GomShip queue: forbidden'; end if;
  if length(trim(coalesce(p_worker_id,''))) not between 8 and 128 then
    raise exception 'Worker ID không hợp lệ'; end if;
  -- Serialize membership changes with Pumalife's group-shipment functions.
  perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
  select * into item from public.gomship_extension_requests
    where status='pending' order by created_at asc limit 1 for update skip locked;
  if not found then return null; end if;
  select * into root from public.pancake_orders where id=item.order_id for update;
  if not found then raise exception 'Đơn không còn tồn tại'; end if;
  select array_agg(id order by id) into actual from public.pancake_orders
    where (root.shipping_group_id is null and id=item.order_id)
       or (root.shipping_group_id is not null and shipping_group_id=root.shipping_group_id);
  perform 1 from public.pancake_orders where id=any(actual) order by id for update;
  if actual is distinct from item.group_order_ids or
     (root.shipping_group_root_id is not null and root.shipping_group_root_id<>root.id)
     then raise exception 'Nhóm thay đổi: cần kiểm tra hàng đợi'; end if;
  if exists(select 1 from public.pancake_orders where id=any(actual)
      and (nullif(trim(jt_waybill_id),'') is not null or shipment_claim_token is not null))
     then raise exception 'Đơn/nhóm đang có vận đơn hoặc đã bị khóa'; end if;
  if exists(select 1 from public.gomship_shipments
      where order_id=item.order_id)
     then raise exception 'Có vận đơn trước đó, không gửi lặp'; end if;
  update public.pancake_orders set shipment_claim_token=new_claim,shipment_claimed_at=now()
    where id=any(actual);
  update public.gomship_extension_requests set
    status='claimed',claim_token=new_claim,worker_id=p_worker_id,
    claimed_at=now(),updated_at=now() where id=item.id;
  return jsonb_build_object('id',item.id,'order_id',item.order_id,
    'group_order_ids',item.group_order_ids,'payload',item.payload,
    'idempotency_key',item.idempotency_key,'claim_token',new_claim);
end; $$;

create or replace function public.release_gomship_extension_claim(
  p_request_id uuid,p_claim_token uuid,p_reason text default 'Chưa gửi API'
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.gomship_extension_requests%rowtype;
begin
 if not public.gomship_extension_operator() then raise exception 'Forbidden'; end if;
 select * into strict item from public.gomship_extension_requests
   where id=p_request_id and claim_token=p_claim_token and status='claimed' for update;
 update public.pancake_orders set shipment_claim_token=null,shipment_claimed_at=null
   where id=any(item.group_order_ids) and shipment_claim_token=p_claim_token;
 update public.gomship_extension_requests set status='pending',claim_token=null,
   claimed_at=null,worker_id=null,error_text=left(p_reason,500),updated_at=now()
   where id=item.id;
end; $$;

create or replace function public.start_gomship_extension_submission(
  p_request_id uuid,p_claim_token uuid
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.gomship_extension_operator() then raise exception 'Forbidden'; end if;
 update public.gomship_extension_requests set status='submitting',
    submitted_at=now(),updated_at=now()
    where id=p_request_id and claim_token=p_claim_token and status='claimed';
 if not found then raise exception 'Yêu cầu đã được xử lý hoặc claim không hợp lệ'; end if;
end; $$;

create or replace function public.review_gomship_extension_request(
  p_request_id uuid,p_claim_token uuid,p_reason text,p_carrier_response jsonb default null
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.gomship_extension_operator() then raise exception 'Forbidden'; end if;
 update public.gomship_extension_requests
    set status='needs_review', error_text=left(coalesce(p_reason,'Unknown'),1000),
      carrier_response=p_carrier_response,updated_at=now()
    where id=p_request_id and claim_token=p_claim_token and status='submitting';
 if not found then raise exception 'Không thể cập nhật trạng thái cần kiểm tra'; end if;
 -- Intentionally leave all shipment_claim_token values locked.
 -- A timeout may have created a real shipment; NEVER automatically retry POST.
end; $$;

create or replace function public.complete_gomship_extension_request(
  p_request_id uuid,p_claim_token uuid,p_gomship_order_id bigint,
  p_spx_waybill text,p_carrier_response jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item public.gomship_extension_requests%rowtype;
  root public.pancake_orders%rowtype;
  changed integer;
  template jsonb;
  total integer;
  cod numeric;
begin
 if not public.gomship_extension_operator() then raise exception 'Forbidden'; end if;
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 select * into strict item from public.gomship_extension_requests
   where id=p_request_id and claim_token=p_claim_token and status='submitting' for update;
 if p_gomship_order_id is null or p_gomship_order_id<=0 or
   p_spx_waybill is null or p_spx_waybill !~ '^SPXVN[A-Z0-9]+
     raise exception 'Mã GomShip hoặc SPX không hợp lệ: cần đối chiếu thủ công'; end if;
 select * into strict root from public.pancake_orders where id=item.order_id for update;
 perform 1 from public.pancake_orders where id=any(item.group_order_ids) order by id for update;
 select count(*) into total from public.pancake_orders where id=any(item.group_order_ids);
 if total<>cardinality(item.group_order_ids) or exists(
    select 1 from public.pancake_orders
    where id=any(item.group_order_ids) and
      (shipment_claim_token is distinct from p_claim_token or nullif(trim(jt_waybill_id),'') is not null))
   then raise exception 'Nhóm đơn thay đổi, không thể lưu tự động'; end if;
 if exists(select 1 from public.gomship_shipments where order_id=item.order_id)
   then raise exception 'Đã tồn tại bản ghi vận đơn GomShip, cần đối chiếu trước'; end if;
 cod=coalesce((item.payload->>'cod')::numeric,0);
 select to_jsonb(root)||jsonb_build_object('warehouse_id',item.payload->>'warehouse_id','status','9')
   into template;
 perform set_config('app.shipment_sync','off',true);
 update public.pancake_orders
   set jt_waybill_id=p_spx_waybill,order_spx='',
       status=(jsonb_populate_record(null::public.pancake_orders,template)).status,
       warehouse_id=(jsonb_populate_record(null::public.pancake_orders,template)).warehouse_id,
       shipment_cod=cod,shipment_claim_token=null,shipment_claimed_at=null
   where id=any(item.group_order_ids) and shipment_claim_token=p_claim_token;
 get diagnostics changed=row_count;
 if changed<>total then raise exception 'Không đồng bộ đủ đơn thành viên'; end if;
 perform set_config('app.shipment_sync','on',true);
 insert into public.gomship_shipments
   (order_id,idempotency_key,status,request,response,gomship_order_id,spx_waybill,created_at)
 values(item.order_id,item.idempotency_key::text,'created',
   item.payload,p_carrier_response,p_gomship_order_id,p_spx_waybill,now());
 update public.gomship_extension_requests
    set status='completed',spx_waybill=p_spx_waybill,
       gomship_order_id=p_gomship_order_id,carrier_response=p_carrier_response,
       finished_at=now(),updated_at=now()
    where id=item.id;
 return jsonb_build_object('id',item.id,'order_id',item.order_id,
    'count',total,'spx_waybill',p_spx_waybill,'gomship_order_id',p_gomship_order_id);
end; $$;

-- No public writes; use only authorized authenticated RPCs.
revoke all on function public.enqueue_gomship_extension_request(text,jsonb,text[]) from public, anon;
revoke all on function public.claim_gomship_extension_request(text) from public, anon;
revoke all on function public.release_gomship_extension_claim(uuid,uuid,text) from public, anon;
revoke all on function public.start_gomship_extension_submission(uuid,uuid) from public, anon;
revoke all on function public.review_gomship_extension_request(uuid,uuid,text,jsonb) from public, anon;
revoke all on function public.complete_gomship_extension_request(uuid,uuid,bigint,text,jsonb) from public, anon;
grant execute on function public.enqueue_gomship_extension_request(text,jsonb,text[]) to authenticated;
grant execute on function public.claim_gomship_extension_request(text) to authenticated;
grant execute on function public.release_gomship_extension_claim(uuid,uuid,text) to authenticated;
grant execute on function public.start_gomship_extension_submission(uuid,uuid) to authenticated;
grant execute on function public.review_gomship_extension_request(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.complete_gomship_extension_request(uuid,uuid,bigint,text,jsonb) to authenticated;
 or length(p_spx_waybill)>80 then
     raise exception 'Mã GomShip hoặc SPX không hợp lệ: cần đối chiếu thủ công'; end if;
 select * into strict root from public.pancake_orders where id=item.order_id for update;
 perform 1 from public.pancake_orders where id=any(item.group_order_ids) order by id for update;
 select count(*) into total from public.pancake_orders where id=any(item.group_order_ids);
 if total<>cardinality(item.group_order_ids) or exists(
    select 1 from public.pancake_orders
    where id=any(item.group_order_ids) and
      (shipment_claim_token is distinct from p_claim_token or nullif(trim(jt_waybill_id),'') is not null))
   then raise exception 'Nhóm đơn thay đổi, không thể lưu tự động'; end if;
 if exists(select 1 from public.gomship_shipments where order_id=item.order_id)
   then raise exception 'Đã tồn tại bản ghi vận đơn GomShip, cần đối chiếu trước'; end if;
 cod=coalesce((item.payload->>'cod')::numeric,0);
 select to_jsonb(root)||jsonb_build_object('warehouse_id',item.payload->>'warehouse_id','status','9')
   into template;
 perform set_config('app.shipment_sync','off',true);
 update public.pancake_orders
   set jt_waybill_id=p_spx_waybill,order_spx='',
       status=(jsonb_populate_record(null::public.pancake_orders,template)).status,
       warehouse_id=(jsonb_populate_record(null::public.pancake_orders,template)).warehouse_id,
       shipment_cod=cod,shipment_claim_token=null,shipment_claimed_at=null
   where id=any(item.group_order_ids) and shipment_claim_token=p_claim_token;
 get diagnostics changed=row_count;
 if changed<>total then raise exception 'Không đồng bộ đủ đơn thành viên'; end if;
 perform set_config('app.shipment_sync','on',true);
 insert into public.gomship_shipments
   (order_id,idempotency_key,status,request,response,gomship_order_id,spx_waybill,created_at)
 values(item.order_id,item.idempotency_key::text,'created',
   item.payload,p_carrier_response,p_gomship_order_id,p_spx_waybill,now());
 update public.gomship_extension_requests
    set status='completed',spx_waybill=p_spx_waybill,
       gomship_order_id=p_gomship_order_id,carrier_response=p_carrier_response,
       finished_at=now(),updated_at=now()
    where id=item.id;
 return jsonb_build_object('id',item.id,'order_id',item.order_id,
    'count',total,'spx_waybill',p_spx_waybill,'gomship_order_id',p_gomship_order_id);
end; $$;

-- No public writes; use only authorized authenticated RPCs.
revoke all on function public.enqueue_gomship_extension_request(text,jsonb,text[]) from public, anon;
revoke all on function public.claim_gomship_extension_request(text) from public, anon;
revoke all on function public.release_gomship_extension_claim(uuid,uuid,text) from public, anon;
revoke all on function public.start_gomship_extension_submission(uuid,uuid) from public, anon;
revoke all on function public.review_gomship_extension_request(uuid,uuid,text,jsonb) from public, anon;
revoke all on function public.complete_gomship_extension_request(uuid,uuid,bigint,text,jsonb) from public, anon;
grant execute on function public.enqueue_gomship_extension_request(text,jsonb,text[]) to authenticated;
grant execute on function public.claim_gomship_extension_request(text) to authenticated;
grant execute on function public.release_gomship_extension_claim(uuid,uuid,text) to authenticated;
grant execute on function public.start_gomship_extension_submission(uuid,uuid) to authenticated;
grant execute on function public.review_gomship_extension_request(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.complete_gomship_extension_request(uuid,uuid,bigint,text,jsonb) to authenticated;

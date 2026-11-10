-- Run once in project nwyxvnehuiyenjuxihro. Keeps original orders/items/payments.
begin;
alter table public.pancake_orders add column if not exists shipping_group_id uuid;
alter table public.pancake_orders add column if not exists shipping_group_root_id text;
alter table public.pancake_orders add column if not exists shipment_cod numeric;
alter table public.pancake_orders add column if not exists shipment_claim_token uuid;
alter table public.pancake_orders add column if not exists shipment_claimed_at timestamptz;
create index if not exists pancake_orders_shipping_group_idx on public.pancake_orders(shipping_group_id);

create or replace function public.shipment_phone(value text) returns text
language sql immutable set search_path = public as $$
 select case when digits like '84%' and length(digits)=11 then '0'||substr(digits,3) else digits end
 from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') as digits) p;
$$;

create or replace function public.shipment_is_closed(value text) returns boolean
language sql immutable set search_path = public as $$
 select lower(trim(coalesce(value,''))) in
 ('2','3','6','7','10','16','24','đang giao','đang giao hàng','hoàn thành','đã hủy','đã xóa','đã lấy hàng','đang vận chuyển','đã giao hàng');
$$;

create or replace function public.shipment_merge_candidates(p_order_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare s public.pancake_orders%rowtype; result jsonb;
begin
 select * into strict s from public.pancake_orders where id=p_order_id;
 if public.shipment_phone(s.bill_phone_number)='' then
   raise exception 'Cần nhập số điện thoại người nhận trước khi gộp giao hàng';
 end if;
 select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into result from (
   select o.* from public.pancake_orders o
   where o.id<>s.id and public.shipment_phone(o.bill_phone_number)=public.shipment_phone(s.bill_phone_number)
     and not public.shipment_is_closed(o.status::text)
     and (s.shipping_group_id is null or o.shipping_group_id is distinct from s.shipping_group_id)
     and (o.shipping_group_root_id is null or o.shipping_group_root_id=o.id)
   order by (nullif(trim(o.jt_waybill_id),'') is not null) desc, o.inserted_at desc limit 100
 ) t;
 return result;
end;
$$;

create or replace function public.merge_order_shipments(p_source_id text,p_target_id text) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare s public.pancake_orders%rowtype; t public.pancake_orders%rowtype;
 ids text[]; gid uuid; root_id text; code text; carrier_sn text; codes integer; count_orders integer;
begin
 -- Serialize changes to group membership while constructing the affected set.
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 if p_source_id=p_target_id then raise exception 'Không thể gộp một đơn với chính nó'; end if;
 select * into strict s from public.pancake_orders where id=p_source_id for update;
 select * into strict t from public.pancake_orders where id=p_target_id for update;
 if nullif(trim(s.jt_waybill_id),'') is not null then raise exception 'Đơn nguồn đã có mã vận đơn, hãy tải lại danh sách'; end if;
 if public.shipment_phone(s.bill_phone_number)='' or public.shipment_phone(s.bill_phone_number)<>public.shipment_phone(t.bill_phone_number) then
   raise exception 'Chỉ gộp các đơn có cùng số điện thoại người nhận';
 end if;
 select array_agg(o.id) into ids from public.pancake_orders o where o.id in(s.id,t.id)
   or (s.shipping_group_id is not null and o.shipping_group_id=s.shipping_group_id)
   or (t.shipping_group_id is not null and o.shipping_group_id=t.shipping_group_id)
   or (nullif(trim(t.jt_waybill_id),'') is not null and o.jt_waybill_id=t.jt_waybill_id);
 perform 1 from public.pancake_orders where id=any(ids) order by id for update;
 if exists(select 1 from public.pancake_orders where id=any(ids) and
    (public.shipment_is_closed(status::text) or public.shipment_phone(bill_phone_number)<>public.shipment_phone(t.bill_phone_number))) then
   raise exception 'Nhóm có đơn đã lấy/giao/hủy hoặc khác người nhận, không thể gộp';
 end if;
 if exists(select 1 from public.pancake_orders where id=any(ids) and shipment_claim_token is not null) then
   raise exception 'Nhóm đang tạo vận đơn hoặc đang chờ lưu mã vận đơn. Không gộp thêm lúc này';
 end if;
 select count(distinct nullif(trim(jt_waybill_id),'')),max(nullif(trim(jt_waybill_id),'')) into codes,code
   from public.pancake_orders where id=any(ids);
 if codes>1 then raise exception 'Không thể gộp hai mã vận đơn khác nhau'; end if;
 gid=coalesce(t.shipping_group_id,s.shipping_group_id,gen_random_uuid());
 root_id=coalesce(t.shipping_group_root_id,t.id);
 select * into strict t from public.pancake_orders where id=root_id;
 carrier_sn=t.order_spx;
 perform set_config('app.shipment_sync','off',true);
 update public.pancake_orders set shipping_group_id=gid,shipping_group_root_id=root_id where id=any(ids);
 if code is not null then
   update public.pancake_orders set jt_waybill_id=code,order_spx=carrier_sn,
     warehouse_id=t.warehouse_id,status=t.status,jt_status_code=t.jt_status_code,jt_status_name=t.jt_status_name,
     shipment_cod=coalesce(t.shipment_cod,t.cod::numeric,0)
     where id=any(ids);
 end if;
 perform set_config('app.shipment_sync','on',true);
 count_orders=cardinality(ids);
 return jsonb_build_object('shipping_group_id',gid,'root_id',root_id,'order_ids',ids,'count',count_orders,'waybill',code);
end;
$$;

-- Lock a group before the one SPX request. No automatic timeout: an unfinished
-- request may already have created a real shipment and must be reconciled first.
create or replace function public.claim_grouped_shipment(
  p_order_id text,
  p_expected_ids text[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  g uuid;
  actual text[];
  token uuid := gen_random_uuid();
  blocked_orders text;
begin
  perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));

  select shipping_group_id into strict g
  from public.pancake_orders
  where id = p_order_id for update;

  perform 1
  from public.pancake_orders
  where (g is not null and shipping_group_id = g)
     or (g is null and id = p_order_id)
  order by id for update;

  select array_agg(id order by id) into actual
  from public.pancake_orders
  where (g is not null and shipping_group_id = g)
     or (g is null and id = p_order_id);

  if actual is distinct from
    (select array_agg(x order by x) from unnest(p_expected_ids) x)
  then
    raise exception 'Thành viên nhóm đã thay đổi, hãy mở lại cửa sổ tạo giao hàng';
  end if;

  -- Recorded-shipment check: ONLY jt_waybill_id.
  select string_agg(id, ', ' order by id) into blocked_orders
  from public.pancake_orders
  where ((g is not null and shipping_group_id = g)
      or (g is null and id = p_order_id))
    and nullif(btrim(jt_waybill_id), '') is not null;

  if blocked_orders is not null then
    raise exception 'Các đơn % đã có jt_waybill_id. Không tạo vận đơn khác', blocked_orders;
  end if;

  -- A lock is NOT proof of a created waybill; it prevents concurrent API POSTs
  -- and can remain after an ambiguous response. Never discard it blindly.
  select string_agg(id, ', ' order by id) into blocked_orders
  from public.pancake_orders
  where ((g is not null and shipping_group_id = g)
      or (g is null and id = p_order_id))
    and shipment_claim_token is not null;

  if blocked_orders is not null then
    raise exception 'Các đơn % chưa xác nhận kết quả tạo vận đơn (shipment_claim_token còn tồn tại). Kiểm tra GomShip/SPX trước khi nhả khóa, không gửi API lần nữa', blocked_orders;
  end if;

  -- Eligibility is distinct from whether a waybill is recorded.
  if exists (
    select 1 from public.pancake_orders
    where ((g is not null and shipping_group_id = g)
       or (g is null and id = p_order_id))
      and public.shipment_is_closed(status::text)
      and lower(trim(coalesce(status::text,''))) not in
        ('6','đã hủy','đã huỷ')
  ) then
    raise exception 'Đơn/nhóm đã lấy, giao hoặc xóa. Kiểm tra trạng thái trước khi tạo vận đơn mới';
  end if;

  update public.pancake_orders
  set shipment_claim_token = token, shipment_claimed_at = now()
  where (g is not null and shipping_group_id = g)
     or (g is null and id = p_order_id);

  return token;
end;
$$;

create or replace function public.finish_grouped_shipment(p_order_id text,p_token uuid,p_waybill text,p_order_sn text,p_warehouse_id text,p_cod numeric) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare g uuid; row_data jsonb; updated integer; expected_count integer;
begin
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 select shipping_group_id into strict g from public.pancake_orders where id=p_order_id and shipment_claim_token=p_token for update;
 if nullif(trim(p_waybill),'') is null then raise exception 'Mã vận đơn không hợp lệ'; end if;
 -- All members must still be reserved by the same claimant and have no waybill.
 -- A partially updated group is never considered finalized.
 select count(*) into expected_count from public.pancake_orders o
   where (g is not null and o.shipping_group_id=g) or (g is null and o.id=p_order_id);
 if expected_count<1 then raise exception 'Nhóm giao hàng không tồn tại'; end if;
 if exists(select 1 from public.pancake_orders o
   where ((g is not null and o.shipping_group_id=g) or (g is null and o.id=p_order_id))
     and (o.shipment_claim_token is distinct from p_token
          or nullif(trim(o.jt_waybill_id),'') is not null)) then
   raise exception 'Nhóm đã thay đổi hoặc một đơn không còn được khóa; cần đối chiếu thủ công';
 end if;
 -- jsonb_populate_record preserves the installation's existing warehouse/status types.
 select to_jsonb(o) into row_data from public.pancake_orders o where id=p_order_id;
 row_data=row_data||jsonb_build_object('warehouse_id',p_warehouse_id,'status','9');
 perform set_config('app.shipment_sync','off',true);
 update public.pancake_orders o set jt_waybill_id=p_waybill,order_spx=p_order_sn,
   warehouse_id=(jsonb_populate_record(null::public.pancake_orders,row_data)).warehouse_id,
   status=(jsonb_populate_record(null::public.pancake_orders,row_data)).status,
   shipment_cod=p_cod,shipment_claim_token=null,shipment_claimed_at=null
   where ((g is not null and o.shipping_group_id=g) or (g is null and o.id=p_order_id)) and o.shipment_claim_token=p_token;
 get diagnostics updated=row_count;
 if updated<>expected_count then
   raise exception 'Số đơn cập nhật (%) khác số thành viên nhóm (%); hủy toàn bộ giao dịch', updated, expected_count;
 end if;
 perform set_config('app.shipment_sync','on',true);
 return jsonb_build_object('count',updated,'waybill',p_waybill);
end;
$$;

create or replace function public.release_grouped_shipment(p_order_id text,p_token uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
 update public.pancake_orders set shipment_claim_token=null,shipment_claimed_at=null
 where (id=p_order_id or shipping_group_id=(select shipping_group_id from public.pancake_orders where id=p_order_id))
   and shipment_claim_token=p_token;
end;
$$;

create or replace function public.sync_grouped_shipment() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
 if pg_trigger_depth()>1 or new.shipping_group_id is null or current_setting('app.shipment_sync',true)='off' then return new; end if;
 if nullif(trim(new.jt_waybill_id),'') is null and nullif(trim(old.jt_waybill_id),'') is null then return new; end if;
 if (new.jt_waybill_id,new.order_spx,new.jt_status_code,new.jt_status_name,new.status,new.shipment_cod)
    is not distinct from (old.jt_waybill_id,old.order_spx,old.jt_status_code,old.jt_status_name,old.status,old.shipment_cod) then return new; end if;
 if exists(select 1 from public.pancake_orders where shipping_group_id=new.shipping_group_id and id<>new.id
   and nullif(trim(jt_waybill_id),'') is not null and nullif(trim(new.jt_waybill_id),'') is not null and jt_waybill_id<>new.jt_waybill_id) then
   raise exception 'Nhóm đã có mã vận đơn khác';
 end if;
 update public.pancake_orders set jt_waybill_id=new.jt_waybill_id,order_spx=new.order_spx,
   jt_status_code=new.jt_status_code,jt_status_name=new.jt_status_name,warehouse_id=new.warehouse_id,
   status=new.status,shipment_cod=new.shipment_cod
   where shipping_group_id=new.shipping_group_id and id<>new.id;
 return new;
end;
$$;
drop trigger if exists pancake_orders_sync_shipment on public.pancake_orders;
create trigger pancake_orders_sync_shipment after update of jt_waybill_id,order_spx,jt_status_code,jt_status_name,status,shipment_cod
 on public.pancake_orders for each row execute function public.sync_grouped_shipment();

revoke all on function public.merge_order_shipments(text,text),public.shipment_merge_candidates(text),
 public.claim_grouped_shipment(text,text[]),public.finish_grouped_shipment(text,uuid,text,text,text,numeric),
 public.release_grouped_shipment(text,uuid) from public;
grant execute on function public.merge_order_shipments(text,text),public.shipment_merge_candidates(text),
 public.claim_grouped_shipment(text,text[]),public.finish_grouped_shipment(text,uuid,text,text,text,numeric),
 public.release_grouped_shipment(text,uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
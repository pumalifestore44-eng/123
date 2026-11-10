-- Optional one-function migration for groups blocked with empty jt_waybill_id.
-- Does NOT auto-remove claims. A claim may represent an API request that
-- already reached SPX/GomShip despite the waybill not being saved yet.
--
-- The ONLY proof that a waybill is recorded on a Pumalife order is
-- NULLIF(BTRIM(jt_waybill_id), '') IS NOT NULL.
-- shipment_claim_token is a separate in-flight concurrency lock.
begin;

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

commit;

-- Run the following SELECT separately to diagnose group 16685/16766.
-- This is READ ONLY and does not release or mutate claims:
-- select id, shipping_group_id, shipping_group_root_id,
--        jt_waybill_id, shipment_claim_token, shipment_claimed_at, status
-- from public.pancake_orders
-- where id in ('local_16685','local_16766')
--    or shipping_group_id in (
--      select shipping_group_id from public.pancake_orders
--      where id in ('local_16685','local_16766')
--        and shipping_group_id is not null
--    )
-- order by id;

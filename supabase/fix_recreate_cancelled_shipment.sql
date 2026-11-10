-- Run on nwyxvnehuiyenjuxihro to allow recreation after a confirmed cancellation.
begin;
create or replace function public.claim_grouped_shipment(p_order_id text,p_expected_ids text[]) returns uuid
language plpgsql security invoker set search_path = public as $$
declare g uuid; actual text[]; token uuid=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 select shipping_group_id into strict g from public.pancake_orders where id=p_order_id for update;
 perform 1 from public.pancake_orders where (g is not null and shipping_group_id=g) or (g is null and id=p_order_id) order by id for update;
 select array_agg(id order by id) into actual from public.pancake_orders
   where (g is not null and shipping_group_id=g) or (g is null and id=p_order_id);
 if actual is distinct from (select array_agg(x order by x) from unnest(p_expected_ids) x) then
   raise exception 'Thành viên nhóm đã thay đổi, hãy mở lại cửa sổ tạo giao hàng';
 end if;
 if exists(select 1 from public.pancake_orders where ((g is not null and shipping_group_id=g) or (g is null and id=p_order_id))
   and nullif(trim(jt_waybill_id),'') is not null) then
   raise exception 'Đơn/nhóm vẫn có mã vận đơn. Hãy tải lại và kiểm tra việc hủy trước khi tạo mã mới';
 end if;
 if exists(select 1 from public.pancake_orders where ((g is not null and shipping_group_id=g) or (g is null and id=p_order_id))
   and shipment_claim_token is not null) then
   raise exception 'Đơn/nhóm đang tạo vận đơn hoặc chờ xác minh kết quả SPX. Không gửi SPX lần nữa';
 end if;
 -- Cancellation clears the old waybill and leaves sales status 6. It may be
 -- explicitly submitted again; delivered/deleted/in-transit orders stay blocked.
 if exists(select 1 from public.pancake_orders where ((g is not null and shipping_group_id=g) or (g is null and id=p_order_id))
   and public.shipment_is_closed(status::text)
   and lower(trim(coalesce(status::text,''))) not in ('6','đã hủy','đã huỷ')) then
   raise exception 'Đơn/nhóm đã lấy/giao hàng hoặc đã xóa. Không thể tạo vận đơn mới';
 end if;
 update public.pancake_orders set shipment_claim_token=token,shipment_claimed_at=now()
 where (g is not null and shipping_group_id=g) or (g is null and id=p_order_id);
 return token;
end;
$$;

revoke all on function public.claim_grouped_shipment(text,text[]) from public;
grant execute on function public.claim_grouped_shipment(text,text[]) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;


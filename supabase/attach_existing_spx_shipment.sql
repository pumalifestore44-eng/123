-- Run after enable_grouped_shipments.sql and fix_recreate_cancelled_shipment.sql.
begin;
create or replace function public.attach_existing_spx_shipment(p_order_id text,p_expected_ids text[],p_waybill text,p_order_sn text,p_cod numeric) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare token uuid; warehouse text; code text=upper(trim(p_waybill)); sn text=nullif(upper(trim(p_order_sn)),''); result jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 if code is null or code !~ '^SPXVN[A-Z0-9]{6,30}$' then raise exception 'Mã vận đơn SPX không hợp lệ'; end if;
 if sn is not null and sn !~ '^VN[A-Z0-9]{6,40}$' then raise exception 'Order SN không hợp lệ'; end if;
 if p_cod is null or p_cod<0 or p_cod<>trunc(p_cod) or p_cod>9007199254740991 then raise exception 'COD không hợp lệ'; end if;
 if exists(select 1 from public.pancake_orders where jt_waybill_id=code and not(id=any(p_expected_ids))) then
   raise exception 'Mã này đã liên kết với đơn khác. Hãy dùng Gộp giao hàng để liên kết cùng kiện';
 end if;
 token=public.claim_grouped_shipment(p_order_id,p_expected_ids);
 select warehouse_id::text into strict warehouse from public.pancake_orders where id=p_order_id;
 result=public.finish_grouped_shipment(p_order_id,token,code,sn,warehouse,p_cod);
 return result;
end;
$$;
revoke all on function public.attach_existing_spx_shipment(text,text[],text,text,numeric) from public;
grant execute on function public.attach_existing_spx_shipment(text,text[],text,text,numeric) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Run once on nwyxvnehuiyenjuxihro, after enable_grouped_shipments.sql.
begin;
create or replace function public.prepare_shipment_print_count() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 if new.jt_waybill_id is distinct from old.jt_waybill_id then
   select coalesce(max(bill_print_count),0) into new.bill_print_count
   from public.pancake_orders where id<>new.id and jt_waybill_id=new.jt_waybill_id
     and nullif(trim(new.jt_waybill_id),'') is not null;
 end if;
 return new;
end;
$$;
create or replace function public.sync_shipment_print_count() returns trigger
language plpgsql security invoker set search_path=public as $$
declare shared_count integer;
begin
 if pg_trigger_depth()>1 or nullif(trim(new.jt_waybill_id),'') is null then return new; end if;
 select greatest(coalesce(max(bill_print_count),0),coalesce(new.bill_print_count,0)) into shared_count
 from public.pancake_orders where jt_waybill_id=new.jt_waybill_id;
 update public.pancake_orders set bill_print_count=shared_count
 where jt_waybill_id=new.jt_waybill_id and bill_print_count is distinct from shared_count;
 return new;
end;
$$;
drop trigger if exists pancake_orders_prepare_print_count on public.pancake_orders;
create trigger pancake_orders_prepare_print_count before update of jt_waybill_id
 on public.pancake_orders for each row execute function public.prepare_shipment_print_count();
drop trigger if exists pancake_orders_sync_print_count on public.pancake_orders;
create trigger pancake_orders_sync_print_count after update of jt_waybill_id,bill_print_count
 on public.pancake_orders for each row execute function public.sync_shipment_print_count();

create or replace function public.mark_shipment_printed(p_order_id text,p_waybill text,p_expected_count integer) returns integer
language plpgsql security invoker set search_path=public as $$
declare actual integer; code text;
begin
 perform pg_advisory_xact_lock(hashtext('pumalife-shipment-membership'));
 select jt_waybill_id into strict code from public.pancake_orders where id=p_order_id for update;
 if nullif(trim(code),'') is null or code is distinct from p_waybill then
   raise exception 'Mã vận đơn đã thay đổi. Hãy mở lại bill trước khi in';
 end if;
 perform 1 from public.pancake_orders where jt_waybill_id=code order by id for update;
 select coalesce(max(bill_print_count),0) into actual from public.pancake_orders where jt_waybill_id=code;
 if actual is distinct from p_expected_count then
   raise exception 'Vận đơn đã được in ở đơn hoặc cửa sổ khác. Hãy tải lại danh sách để tránh in trùng';
 end if;
 update public.pancake_orders set bill_print_count=actual+1 where jt_waybill_id=code;
 return actual+1;
end;
$$;
revoke all on function public.mark_shipment_printed(text,text,integer) from public;
grant execute on function public.mark_shipment_printed(text,text,integer) to anon,authenticated,service_role;

-- Repair older groups where only one sales order was marked as printed.
update public.pancake_orders o set bill_print_count=s.printed
from (select jt_waybill_id,max(coalesce(bill_print_count,0)) as printed
 from public.pancake_orders where nullif(trim(jt_waybill_id),'') is not null group by jt_waybill_id) s
where o.jt_waybill_id=s.jt_waybill_id and o.bill_print_count is distinct from s.printed;
notify pgrst,'reload schema';
commit;

-- Supabase SQL: add J&T tracking status fields to pancake_orders

alter table public.pancake_orders
    add column if not exists jt_waybill_id text;

alter table public.pancake_orders
    add column if not exists jt_status_code integer;

alter table public.pancake_orders
    add column if not exists jt_status_name text;

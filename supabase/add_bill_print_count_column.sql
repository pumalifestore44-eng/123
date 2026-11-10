-- Supabase SQL: add print_count tracking column to pancake_orders

alter table public.pancake_orders
    add column if not exists bill_print_count integer default 0;

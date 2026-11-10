-- Supabase SQL: add auto-sync configuration columns to jt_config

alter table public.jt_config
    add column if not exists auto_sync_enabled boolean default false;

alter table public.jt_config
    add column if not exists auto_sync_interval integer default 15;

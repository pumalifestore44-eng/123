-- Chạy trong SQL Editor của Supabase mà ứng dụng đang sử dụng.
create table if not exists public.spx_tracking (
    spx_tn text primary key check (spx_tn ~ '^SPXVN[A-Z0-9]{6,30}$'),
    source text not null default 'manual' check (source in ('manual', 'qr')),
    note text not null default '',
    is_picked_up boolean not null default false,
    tracking_code_group_name text,
    tracking_code_subgroup_name text,
    latest_event text,
    picked_up_at timestamptz,
    last_checked_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint spx_tracking_pickup_time check (is_picked_up = (picked_up_at is not null))
);

create index if not exists spx_tracking_pickup_created_idx
    on public.spx_tracking (is_picked_up, created_at desc);

create or replace function public.spx_tracking_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
    -- Đã lấy hàng là mốc một chiều, không mất khi SPX đổi trạng thái tiếp theo.
    if old.is_picked_up then
        new.is_picked_up := true;
        new.picked_up_at := old.picked_up_at;
    end if;
    new.updated_at := now();
    return new;
end;
$$;
drop trigger if exists spx_tracking_updated_at on public.spx_tracking;
create trigger spx_tracking_updated_at before update on public.spx_tracking
    for each row execute function public.spx_tracking_before_update();

-- Ứng dụng hiện dùng Supabase anon key, giống các bảng quản lý hiện có.
-- Chính sách này cho phép các client dùng key đó đọc/thêm/cập nhật bảng này.
alter table public.spx_tracking enable row level security;
grant select, insert, update, delete on public.spx_tracking to anon, authenticated;
drop policy if exists spx_tracking_read on public.spx_tracking;
create policy spx_tracking_read on public.spx_tracking for select to anon, authenticated using (true);
drop policy if exists spx_tracking_insert on public.spx_tracking;
create policy spx_tracking_insert on public.spx_tracking for insert to anon, authenticated with check (true);
drop policy if exists spx_tracking_update on public.spx_tracking;
create policy spx_tracking_update on public.spx_tracking for update to anon, authenticated using (true) with check (true);
drop policy if exists spx_tracking_delete on public.spx_tracking;
create policy spx_tracking_delete on public.spx_tracking for delete to anon, authenticated using (true);
notify pgrst, 'reload schema';

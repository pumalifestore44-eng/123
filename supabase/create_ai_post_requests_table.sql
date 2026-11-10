-- Dedicated publishing-request queue. Run on nwyxvnehuiyenjuxihro.
begin;
create table if not exists public.ai_post_requests (
    id uuid primary key default gen_random_uuid(),
    client_request_id uuid not null unique,
    conversation_id uuid not null,
    request_text text not null check (char_length(trim(request_text)) between 1 and 12000),
    status text not null default 'pending' check (status in ('pending','processing','completed','failed','cancelled')),
    response_text text,
    error_text text,
    source text not null default 'smax-chat-manager',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);
create index if not exists ai_post_requests_status_created_idx on public.ai_post_requests(status,created_at);
create index if not exists ai_post_requests_conversation_created_idx on public.ai_post_requests(conversation_id,created_at desc);
create or replace function public.set_ai_post_requests_updated_at() returns trigger
language plpgsql set search_path=public as $$
begin new.updated_at=now();return new;end;
$$;
drop trigger if exists trg_ai_post_requests_updated_at on public.ai_post_requests;
create trigger trg_ai_post_requests_updated_at before update on public.ai_post_requests
for each row execute function public.set_ai_post_requests_updated_at();
alter table public.ai_post_requests enable row level security;
grant usage on schema public to anon,authenticated,service_role;
grant select,insert,update,delete on public.ai_post_requests to anon,authenticated,service_role;
drop policy if exists ai_post_requests_app_access on public.ai_post_requests;
create policy ai_post_requests_app_access on public.ai_post_requests for all to anon,authenticated using(true) with check(true);
comment on table public.ai_post_requests is 'Dedicated post request queue; pending means queued, not published.';
comment on column public.ai_post_requests.request_text is 'Publishing instructions, including supplied image URLs. No request_post dependency.';
notify pgrst,'reload schema';
commit;

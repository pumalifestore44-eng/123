-- AI Agent request queue for smax-chat-manager
-- Public Data API access by design: all rows/operations are allowed.

create extension if not exists pgcrypto;

create table if not exists public.ai_agent_requests (
    id uuid primary key default gen_random_uuid(),
    client_request_id uuid not null unique,
    conversation_id uuid not null,
    request_text text not null check (char_length(trim(request_text)) between 1 and 12000),
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    response_text text,
    error_text text,
    source text not null default 'smax-chat-manager',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now()
);


create index if not exists ai_agent_requests_status_created_idx
    on public.ai_agent_requests (status, created_at);

create index if not exists ai_agent_requests_conversation_created_idx
    on public.ai_agent_requests (conversation_id, created_at desc);

create or replace function public.set_ai_agent_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_ai_agent_requests_updated_at on public.ai_agent_requests;
create trigger trg_ai_agent_requests_updated_at
before update on public.ai_agent_requests
for each row
execute function public.set_ai_agent_requests_updated_at();

-- Keep RLS enabled, but remove every old policy and replace it with one PUBLIC ALL policy.
alter table public.ai_agent_requests enable row level security;

do $$
declare
    p record;
begin
    for p in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = 'ai_agent_requests'
    loop
        execute format(
            'drop policy if exists %I on public.ai_agent_requests',
            p.policyname
        );
    end loop;
end
$$;

-- Restore full Data API privileges. PUBLIC also covers anon/authenticated roles.
grant usage on schema public to public, anon, authenticated;
grant all privileges on table public.ai_agent_requests to public, anon, authenticated;

create policy "ALL"
on public.ai_agent_requests
as permissive
for all
to public
using (true)
with check (true);

comment on table public.ai_agent_requests is
'Public AI Agent request queue used by Smax Chat Manager. RLS policy ALL permits all operations for PUBLIC.';

comment on column public.ai_agent_requests.status is
'pending -> processing -> completed/failed/cancelled.';

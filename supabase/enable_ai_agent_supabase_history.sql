-- RESET ai_agent_requests TO PUBLIC ALL
-- Run this once in Supabase SQL Editor on the existing database.

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

grant usage on schema public to public, anon, authenticated;
grant all privileges on table public.ai_agent_requests to public, anon, authenticated;

create policy "ALL"
on public.ai_agent_requests
as permissive
for all
to public
using (true)
with check (true);

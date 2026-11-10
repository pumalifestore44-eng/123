-- Supabase SQL for chatbot_keyword_rules table

create table if not exists public.chatbot_keyword_rules (
    rule_id text primary key,
    enabled boolean not null default true,
    type text not null default 'incoming',
    keyword text not null,
    message text not null,
    send_method text not null default 'api_smax',
    inserted_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

alter table public.chatbot_keyword_rules enable row level security;

create policy "Allow public access" on public.chatbot_keyword_rules
    for all
    using (true)
    with check (true);

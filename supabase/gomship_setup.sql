-- Execute in the Supabase project where gomship-create-order is deployed.
-- Server-side only; no public table policies.
create table if not exists public.gomship_auth (
  id integer primary key,
  refresh_token text not null,
  device_id text not null,
  access_token text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);
create table if not exists public.gomship_shipments (
  order_id text primary key,
  idempotency_key text not null unique,
  status text not null default 'created',
  response jsonb not null default '{}'::jsonb,
  request jsonb,
  created_at timestamptz default now()
);
alter table public.gomship_shipments
  add column if not exists status text not null default 'created';
alter table public.gomship_shipments
  add column if not exists request jsonb;
alter table public.gomship_auth enable row level security;
alter table public.gomship_shipments enable row level security;
-- Label access: do not expose this table via anon RLS policies.
alter table public.gomship_shipments
  add column if not exists gomship_order_id bigint;
alter table public.gomship_shipments
  add column if not exists spx_waybill text;
alter table public.gomship_shipments
  add column if not exists label_token_hash text;
create unique index if not exists gomship_shipments_gomship_order_id_unique
  on public.gomship_shipments (gomship_order_id)
  where gomship_order_id is not null;

-- GomShip cancellation audit: keep carrier response and mark cancellation only
-- after GomShip confirms DELETE /orders/{numeric ID}.
alter table public.gomship_shipments
  add column if not exists cancel_response jsonb;
alter table public.gomship_shipments
  add column if not exists cancelled_at timestamptz;

 
-- Re-create a GomShip shipment only after the previous attempt was fully
-- cancelled and the Pumalife waybill was cleared. Preserve the old attempt.
create table if not exists public.gomship_shipment_history (
  attempt_id uuid primary key default gen_random_uuid(),
  order_id text not null,
  idempotency_key text not null unique,
  status text not null,
  gomship_order_id bigint,
  spx_waybill text,
  request jsonb,
  response jsonb,
  cancel_response jsonb,
  cancelled_at timestamptz,
  created_at timestamptz,
  archived_at timestamptz not null default now()
);
create index if not exists gomship_shipment_history_order_id_idx
  on public.gomship_shipment_history(order_id, archived_at desc);
alter table public.gomship_shipment_history enable row level security;

-- Called by the Edge Function with its service role, NEVER by the browser.
-- A single transaction reserves the next attempt and archives the cancelled
-- attempt. Concurrent calls cannot reserve two shipments for one sales order.
create or replace function public.reserve_gomship_shipment(
  p_order_id text,
  p_idempotency_key text,
  p_request jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.gomship_shipments%rowtype;
  v_waybill text;
  v_recreated boolean := false;
begin
  if p_order_id is null or length(p_order_id) = 0 or
     p_idempotency_key is null or length(p_idempotency_key) = 0 or
     p_request is null then
    return jsonb_build_object('reserved', false, 'reason', 'invalid_request');
  end if;

  select * into v_previous
    from public.gomship_shipments
    where order_id = p_order_id
    for update;

  select jt_waybill_id into v_waybill
    from public.pancake_orders
    where id = p_order_id
    for update;
  if not found then
    return jsonb_build_object('reserved', false, 'reason', 'order_not_found');
  end if;
  if nullif(btrim(coalesce(v_waybill, '')), '') is not null then
    return jsonb_build_object('reserved', false, 'reason', 'order_already_has_waybill');
  end if;

  if v_previous.order_id is null then
    insert into public.gomship_shipments (
      order_id, idempotency_key, status, request, response, created_at
    ) values (
      p_order_id, p_idempotency_key, 'creating', p_request, '{}'::jsonb, now()
    ) on conflict (order_id) do nothing;

    if not found then
      return jsonb_build_object('reserved', false, 'reason', 'concurrent_request');
    end if;
    return jsonb_build_object('reserved', true, 'recreated', false);
  end if;

  if v_previous.status <> 'cancelled' then
    return jsonb_build_object('reserved', false, 'reason', 'previous_' || coalesce(v_previous.status, 'unknown'));
  end if;

  insert into public.gomship_shipment_history (
    order_id, idempotency_key, status, gomship_order_id, spx_waybill,
    request, response, cancel_response, cancelled_at, created_at
  ) values (
    v_previous.order_id, v_previous.idempotency_key, v_previous.status,
    v_previous.gomship_order_id, v_previous.spx_waybill, v_previous.request,
    v_previous.response, v_previous.cancel_response, v_previous.cancelled_at,
    v_previous.created_at
  );

  update public.gomship_shipments set
    idempotency_key = p_idempotency_key,
    status = 'creating',
    request = p_request,
    response = '{}'::jsonb,
    gomship_order_id = null,
    spx_waybill = null,
    label_token_hash = null,
    cancel_response = null,
    cancelled_at = null,
    created_at = now()
  where order_id = p_order_id and status = 'cancelled';

  if not found then
    raise exception 'Shipment status changed while reserving new attempt';
  end if;
  return jsonb_build_object('reserved', true, 'recreated', true);
end;
$$;

revoke all on function public.reserve_gomship_shipment(text, text, jsonb) from public;
revoke all on function public.reserve_gomship_shipment(text, text, jsonb) from anon;
revoke all on function public.reserve_gomship_shipment(text, text, jsonb) from authenticated;
grant execute on function public.reserve_gomship_shipment(text, text, jsonb) to service_role;

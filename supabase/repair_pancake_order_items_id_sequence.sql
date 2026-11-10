-- PUMALIFE / Primary Supabase
-- FIX 23505: repair the ID sequence used by public.pancake_order_items
-- Execute ONCE in Supabase Dashboard -> SQL Editor as the project owner.
-- This changes only the sequence's next ID; does not delete or rewrite any order.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.pancake_order_items IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  seq_name text;
  max_id bigint;
  seq_last bigint;
  restart_id bigint;
BEGIN
  SELECT pg_get_serial_sequence('public.pancake_order_items','id') INTO seq_name;
  IF seq_name IS NULL THEN
    RAISE EXCEPTION 'pancake_order_items.id has no owned ID sequence. Stop and inspect its default.';
  END IF;
  SELECT COALESCE(MAX(id)::bigint,0) INTO max_id
  FROM public.pancake_order_items;
  EXECUTE format('SELECT last_value FROM %s',seq_name) INTO seq_last;
  restart_id := GREATEST(max_id+1,COALESCE(seq_last,0)+1,1);
  -- ALTER SEQUENCE RESTART is transactional and invalidates old sequence caches.
  -- Safer than setval if there are pooled database connections.
  EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s',seq_name,restart_id);
  RAISE NOTICE 'pancake_order_items: previous max ID=%, sequence last=%, restart next ID=%',
    max_id,seq_last,restart_id;
END $$;
COMMIT;

-- Optional read-only check after running (does not consume any new ID):
-- SELECT MAX(id) FROM public.pancake_order_items;
-- SELECT pg_get_serial_sequence('public.pancake_order_items','id');

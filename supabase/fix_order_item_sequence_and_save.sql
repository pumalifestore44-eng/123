-- OPTIONAL: Install a transactional, row-preserving order save function.
-- First run repair_pancake_order_items_id_sequence.sql independently.
-- This script does not repair the sequence; a function installation failure
-- must not cause uncertainty about whether the sequence was repaired.
BEGIN;

CREATE OR REPLACE FUNCTION public.pumalife_save_order_edits(
  p_order_id text,
  p_order_patch jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $body$
DECLARE
  v_order_id public.pancake_orders.id%TYPE;
  v_item jsonb;
  v_row public.pancake_order_items%ROWTYPE;
  v_patch public.pancake_orders%ROWTYPE;
  v_item_id bigint;
  v_ids bigint[] := ARRAY[]::bigint[];
  v_result jsonb := '[]'::jsonb;
  v_count bigint;
BEGIN
  IF p_order_id IS NULL OR p_order_id = '' OR
     p_order_patch IS NULL OR jsonb_typeof(p_order_patch) <> 'object' OR
     p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid order edit payload';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Too many order items in one save';
  END IF;
  -- Row lock prevents two RPCs from interleaving modifications to one order.
  SELECT id INTO v_order_id
  FROM public.pancake_orders
  WHERE id::text = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or cannot be edited'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'Invalid product item payload';
    END IF;
    SELECT * INTO v_row FROM jsonb_populate_record(
      NULL::public.pancake_order_items, v_item
    );
    v_item_id := v_row.id::bigint;
    IF v_row.quantity IS NULL OR v_row.quantity < 1 OR
       v_row.retail_price IS NULL OR v_row.retail_price < 0 THEN
      RAISE EXCEPTION 'Product price or quantity invalid';
    END IF;
    IF v_item_id IS NOT NULL THEN
      IF v_item_id = ANY(v_ids) THEN
        RAISE EXCEPTION 'Duplicate item id in order edit payload';
      END IF;
      UPDATE public.pancake_order_items
      SET product_id = v_row.product_id,
          variation_id = v_row.variation_id,
          product_name = v_row.product_name,
          retail_price = v_row.retail_price,
          quantity = v_row.quantity,
          discount_each_product = v_row.discount_each_product,
          item_note = v_row.item_note,
          variation_info = COALESCE(public.pancake_order_items.variation_info, '{}'::jsonb) ||
                           COALESCE(v_row.variation_info, '{}'::jsonb)
      WHERE id = v_item_id AND order_id = v_order_id;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count <> 1 THEN
        RAISE EXCEPTION 'Order item id % was removed or belongs to another order', v_item_id;
      END IF;
    ELSE
      INSERT INTO public.pancake_order_items
        (order_id, product_id, variation_id, product_name, retail_price, quantity,
         discount_each_product, item_note, variation_info)
      VALUES
        (v_order_id, v_row.product_id, v_row.variation_id, v_row.product_name,
         v_row.retail_price, v_row.quantity, v_row.discount_each_product,
         v_row.item_note, COALESCE(v_row.variation_info, '{}'::jsonb))
      RETURNING id INTO v_item_id;
    END IF;
    v_ids := array_append(v_ids, v_item_id);
    v_result := v_result || to_jsonb(v_item_id);
  END LOOP;

  -- Removed lines are deleted only after every retained/new row succeeded.
  DELETE FROM public.pancake_order_items
  WHERE order_id = v_order_id AND NOT (id = ANY(v_ids));

  SELECT * INTO v_patch FROM jsonb_populate_record(
    NULL::public.pancake_orders, p_order_patch
  );
  UPDATE public.pancake_orders
  SET bill_full_name = v_patch.bill_full_name,
      bill_phone_number = v_patch.bill_phone_number,
      shipping_fee = v_patch.shipping_fee,
      surcharge = v_patch.surcharge,
      prepaid = v_patch.prepaid,
      total_price = v_patch.total_price,
      cod = v_patch.cod,
      note = v_patch.note,
      shipping_address = v_patch.shipping_address,
      updated_at = now()
  WHERE id = v_order_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Could not update order'; END IF;

  RETURN jsonb_build_object('order_id', v_order_id::text, 'item_ids', v_result);
END
$body$;

REVOKE ALL ON FUNCTION public.pumalife_save_order_edits(text,jsonb,jsonb) FROM PUBLIC;
-- SECURITY INVOKER retains existing table grants/RLS. No service-role bypass.
GRANT EXECUTE ON FUNCTION public.pumalife_save_order_edits(text,jsonb,jsonb)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Optional read-only verification after Run:
-- SELECT max(id) AS max_item_id FROM public.pancake_order_items;
-- SELECT pg_get_serial_sequence('public.pancake_order_items','id') AS id_sequence;
-- Do NOT SELECT nextval() merely to inspect: it advances the sequence.

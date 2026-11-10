-- Run on project nwyxvnehuiyenjuxihro in SQL Editor.
-- Diagnostics only: does not create/drop tables or change grants/RLS.
select current_database() as database_name, current_user as checked_by;

select n.nspname as schema_name, c.relname as table_name,
       has_schema_privilege('anon', n.oid, 'USAGE') as anon_schema_usage,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read,
       has_table_privilege('anon', c.oid, 'INSERT') as anon_can_insert,
       has_table_privilege('anon', c.oid, 'UPDATE') as anon_can_update,
       has_table_privilege('anon', c.oid, 'DELETE') as anon_can_delete,
       c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p','v','m')
  and c.relname in ('pancake_orders','pancake_order_items','pancake_products',
                   'pancake_variations','pancake_customers','smax_tokens',
                   'spx_tracking','warehouses','chatbot_images','jt_config')
order by n.nspname, c.relname;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where tablename in ('pancake_orders','pancake_products','smax_tokens','spx_tracking','warehouses')
order by schemaname, tablename, policyname;

select rolname, rolconfig from pg_roles where rolname = 'authenticator';
-- Refresh the REST schema cache after checking tables/grants.
notify pgrst, 'reload schema';

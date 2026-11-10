-- Allow the existing app roles to delete entries from the tracking list only.
begin;
grant delete on public.spx_tracking to anon, authenticated;
drop policy if exists spx_tracking_delete on public.spx_tracking;
create policy spx_tracking_delete on public.spx_tracking for delete to anon, authenticated using (true);
notify pgrst,'reload schema';
commit;

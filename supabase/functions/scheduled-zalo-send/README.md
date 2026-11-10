# Scheduled Zalo Send Edge Function

This Supabase Edge Function scans the `posts` table and sends pending Zalo posts when:

- `platforms = 'zalo'`
- `status = 'pending'`
- `scheduled_at <= now`

It then updates status to:

- `processing` before sending
- `completed` after success
- `pending` again on failure

## Required environment variables

In Supabase Project > Settings > Edge Functions > Secrets:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SMAX_BIZ_ID=tuant2lqd
SMAX_TOKEN=<your-smx-token>
ZALO_PAGE_PID=zlw266741166578791076
ZALO_THREAD_IDS=zlw3481453659339661895,zlw2283526825999855015
```

## Local test

```bash
supabase functions serve scheduled-zalo-send --no-verify-jwt
```

Then call:

```bash
curl http://localhost:54321/functions/v1/scheduled-zalo-send
```

## Deploy

```bash
supabase functions deploy scheduled-zalo-send
```

## Cron setup

In Supabase dashboard:

- Database > Cron
- Add a cron job every 1 minute

Example:

```sql
select cron.schedule(
  'scheduled-zalo-send',
  '* * * * *',
  $BODY$
  select net.http_post(
    'https://<project-ref>.supabase.co/functions/v1/scheduled-zalo-send',
    '{}',
    'POST',
    'application/json',
    '{}'
  );
  $BODY$
);
```

Note: if the project is not configured to allow `net.http_post`, you can trigger the function through a scheduled external system instead.

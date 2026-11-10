# Scheduled Zalo Sender

This extension polls the Supabase `posts` table and sends pending Zalo posts when:

- `status = pending`
- `platforms = zalo`
- `scheduled_at <= now`

It then updates the row status as:

- `processing` while sending
- `completed` after success

## Environment

Set these environment variables before running:

```bash
export SUPABASE_URL=https://edhkxrsgbwszfiwfoqnx.supabase.co
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaGt4cnNnYndzemZpd2ZvcW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTc5MDYsImV4cCI6MjA4Mzk5MzkwNn0.mL7Q7UipdD1Ir49kjWQyjXF0-t4sBaBvMhThor9Tiyg
export SMAX_TOKEN=YOUR_SMAX_TOKEN
export SMAX_BIZ_ID=tuant2lqd
export ZALO_PAGE_PID=zlw266741166578791076
export ZALO_THREAD_IDS=zlw3481453659339661895,zlw2283526825999855015
export POLL_INTERVAL_MS=5000
```

## Run

```bash
node index.js
```

## Notes

- Only rows with `platforms = zalo` are processed.
- Rows with `status = pending` and past `scheduled_at` are sent.
- If sending fails, status is reset back to `pending` so retries can happen.

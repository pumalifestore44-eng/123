# Keyword Chatbot Extension

Simple Node.js poller with a local settings UI for managing keywords, SMAX options, and reply templates.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the settings UI:
   ```bash
   npm run settings
   ```
3. Open `http://localhost:3001` in your browser.
4. Adjust the bot settings and save.
5. Start the bot:
   ```bash
   npm run bot
   ```

## Available scripts

- `npm run settings` — launches a local settings UI on port 3001.
- `npm run bot` — starts the chatbot worker that polls SMAX and sends replies.
- `npm start` — legacy entry for `index.js`; kept for compatibility.

## Configuration

Settings are stored in `config.json`.

- `mode`: `smax` or `generic`
- `keywords`: keyword list
- `responseTemplate`: reply message
- `pollIntervalMs`: polling interval
- `messagesApiUrl`, `sendApiUrl`, `authHeader`: generic API mode
- `smaxBizId`, `smaxPageIds`, `smaxToken`: SMAX mode
- `supabaseUrl`, `supabaseKey`, `useSupabaseToken`: Supabase token fetch

## Notes

- `state.json` stores reply dedup state.
- For SMAX mode, use `useSupabaseToken` to read `smax_tokens` from Supabase.
- Keep your Supabase service key secure.

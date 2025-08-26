# WhatsApp → Camunda Webhook Start Relay (Render)

Small relay that:
- Verifies Meta Webhook (GET hub.challenge)
- Validates WhatsApp Cloud API signatures (X-Hub-Signature-256)
- Normalizes message payload
- Forwards to Camunda Webhook Start Event using **Basic auth**

## Environment Variables

- `WA_VERIFY_TOKEN`        – any strong string you choose (must match in Meta UI)
- `WA_APP_SECRET`          – from Meta App → Settings → Basic
- `CAMUNDA_WEBHOOK_URL`    – URL you get from the Webhook Start Event
- `CAMUNDA_BASIC_USER`     – username configured on the Start Event (default: `webhook`)
- `CAMUNDA_BASIC_PASS`     – password configured on the Start Event
- `LOG_LEVEL`              – `info` (default) or `debug`

## Deploy on Render

1. Push this repo to GitHub.
2. On Render: **New → Web Service → Build from GitHub**.
3. Select repo. Build: `npm install`, Start: `npm start`.
4. Set the env vars above (keep secrets hidden).
5. Deploy. Note the public URL, e.g. `https://wa-camunda-relay.onrender.com`.

## Wire up Meta (Cloud API)

1. In **Meta for Developers → My Apps → WhatsApp → Configuration**:
   - **Callback URL**: `https://<your-render-url>/wa/webhook`
   - **Verify token**: the same `WA_VERIFY_TOKEN` value
   - Click **Verify & Save**
2. Click **Manage** under Webhook fields → subscribe to `messages`.

## Configure Camunda

- Webhook Start Event → **Authorization: Basic**
  - Username: `webhook` (or your choice)
  - Password: (the same as `CAMUNDA_BASIC_PASS`)
- **Body mapping**: map entire payload (or map fields) — the relay sends:
  ```json
  { "phone": "+2772...", "text": "READY", "waMessageId": "...", "timestamp": "..." }

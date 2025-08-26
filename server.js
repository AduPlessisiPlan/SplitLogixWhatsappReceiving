// WhatsApp → Camunda relay (Basic auth to Camunda Webhook Start)
// - GET /wa/webhook : Meta verification (hub.challenge)
// - POST /wa/webhook: Verify X-Hub-Signature-256, normalize payload, forward to Camunda

import express from "express";
import crypto from "crypto";

// ===== ENV =====
const PORT = process.env.PORT || 3000;

// Meta (Developer App → Settings → Basic)
const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN || "ThisIsATest";
const WA_APP_SECRET   = process.env.WA_APP_SECRET; // REQUIRED

// Camunda Webhook Start Event
const CAMUNDA_WEBHOOK_URL  = process.env.CAMUNDA_WEBHOOK_URL || "https://bru-2.connectors.camunda.io/f4af082f-f82a-47f7-9355-33bd5ec19903/inbound/3167632d-0216-4b4f-af17-0c5ceda83400";  // REQUIRED
const CAMUNDA_BASIC_USER   = process.env.CAMUNDA_BASIC_USER || "webhook";
const CAMUNDA_BASIC_PASS   = process.env.CAMUNDA_BASIC_PASS || "test123";   // REQUIRED

// Optional: minimal console logging
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();

if (!WA_APP_SECRET || !CAMUNDA_WEBHOOK_URL || !CAMUNDA_BASIC_PASS) {
  console.error("Missing required env vars. Please set WA_APP_SECRET, CAMUNDA_WEBHOOK_URL, CAMUNDA_BASIC_PASS.");
  process.exit(1);
}

const app = express();
app.use(express.json({ type: "*/*" })); // Meta sends application/json

// ---- utils
const log = {
  info: (...a) => LOG_LEVEL !== "silent" && console.log(...a),
  debug: (...a) => (LOG_LEVEL === "debug") && console.log(...a),
  warn: (...a) => console.warn(...a),
  error: (...a) => console.error(...a)
};

function verifyMetaSignature(req) {
  const sig = req.headers["x-hub-signature-256"];
  if (!sig || !WA_APP_SECRET) return false;
  const body = JSON.stringify(req.body);
  const expected = "sha256=" + crypto.createHmac("sha256", WA_APP_SECRET).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    console.log('WEBHOOK VERIFIED');
  } catch {
    return false;
  }
}

// Normalize the WhatsApp payload into a small shape for Camunda
function extractInbound(body) {
  const change = body?.entry?.[0]?.changes?.[0];
  const msg = change?.value?.messages?.[0];
  if (!msg) return null; // could be a status update (delivery/read)

  // Phone normally lacks '+'
  const phone = msg.from?.startsWith("+") ? msg.from : `+${msg.from}`;

  let text = "";
  switch (msg.type) {
    case "text":
      text = msg.text?.body ?? "";
      break;
    case "button":
      text = msg.button?.text ?? msg.button?.payload ?? "";
      break;
    case "interactive":
      text =
        msg.interactive?.button_reply?.title ??
        msg.interactive?.button_reply?.id ??
        msg.interactive?.list_reply?.title ??
        msg.interactive?.list_reply?.id ?? "";
      break;
    default:
      text = `[${msg.type} received]`;
  }

  return {
    phone,
    text,
    waMessageId: msg.id,
    timestamp: msg.timestamp,
    // If you want the raw WhatsApp message too, uncomment:
    // raw: msg
  };
}

// ---- routes

// 1) Meta verification (when you click "Verify & Save" in WhatsApp Configuration)
app.get("/wa/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WA_VERIFY_TOKEN) {
    log.info("Meta webhook verified.");
    console.log('Meta webhook verified.');
    return res.status(200).send(challenge);
  }
  log.warn("Meta webhook verification failed.");
  return res.sendStatus(403);
});

// 2) Inbound delivery
app.post("/wa/webhook", async (req, res) => {
  if (!verifyMetaSignature(req)) {
    log.warn("Invalid or missing X-Hub-Signature-256");
    return res.sendStatus(401);
  }

  // Always ACK fast (<10s); do work async
  res.sendStatus(200);

  const inbound = extractInbound(req.body);
  if (!inbound) {
    log.debug("Non-message event received (likely status).");
    return;
  }

  try {
    const basic = Buffer.from(`${CAMUNDA_BASIC_USER}:${CAMUNDA_BASIC_PASS}`).toString("base64");
    const r = await fetch(CAMUNDA_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Basic ${basic}`
      },
      body: JSON.stringify(inbound)
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      log.error("Forward to Camunda failed:", r.status, t);
    } else {
      log.info("Forwarded to Camunda:", inbound.phone, inbound.text);
      console.log('Forwarded to Camunda:', inbound.phone, inbound.text);
    }
  } catch (e) {
    log.error("Error forwarding to Camunda:", e);
  }
});

// 3) Health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.listen(PORT, () => log.info(`WA→Camunda relay listening on :${PORT}`));

// NetFixLab Cloudflare Worker
//
// Serves the static site from ./public (handled by Cloudflare before this code
// runs) and handles one API route:
//
//   POST /api/dodo-webhook   Dodo Payments webhook. Verifies the signature,
//                            records the purchase and unlocks the course.
//
// Secrets (Cloudflare dashboard > netfix-lab > Settings > Variables and Secrets):
//   DODO_WEBHOOK_SECRET   signing secret of the Dodo webhook endpoint (whsec_...)
//   SUPABASE_SECRET_KEY   Supabase secret key (sb_secret_...) - never put it in the website
// Plain variables (wrangler.jsonc):
//   SUPABASE_URL, COURSE_PRODUCT_ID

const TOLERANCE_SECONDS = 5 * 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/dodo-webhook") {
      if (request.method !== "POST") return text("Method not allowed", 405);
      try {
        return await handleDodoWebhook(request, env);
      } catch (err) {
        console.error("webhook error", err && err.stack || err);
        return text("Server error", 500); // Dodo retries on 5xx
      }
    }
    if (url.pathname.startsWith("/api/")) return text("Not found", 404);
    // Anything else that is not a file in ./public
    return env.ASSETS.fetch(new Request(new URL("/", url), request));
  },
};

async function handleDodoWebhook(request, env) {
  if (!env.DODO_WEBHOOK_SECRET || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_URL) {
    console.error("missing configuration: DODO_WEBHOOK_SECRET, SUPABASE_SECRET_KEY or SUPABASE_URL");
    return text("Not configured", 500);
  }

  const raw = await request.text();
  const ok = await verifySignature(env.DODO_WEBHOOK_SECRET, request.headers, raw);
  if (!ok) return text("Invalid signature", 401);

  let event;
  try { event = JSON.parse(raw); } catch { return text("Bad JSON", 400); }
  const type = event.type || "";
  const d = event.data || {};
  console.log("dodo event", type, d.payment_id || "", d.refund_id || "");

  if (type === "payment.succeeded") {
    const items = Array.isArray(d.product_cart) ? d.product_cart : [];
    if (env.COURSE_PRODUCT_ID && items.length && !items.some(i => i.product_id === env.COURSE_PRODUCT_ID)) {
      return json({ ignored: "other product" });
    }
    const userId = await resolveUser(env, d);
    if (!userId) {
      console.error("payment without a matching account", d.payment_id, d.customer && d.customer.email);
    }
    await db(env, "purchases?on_conflict=dodo_payment_id", "POST", {
      user_id: userId,
      dodo_payment_id: String(d.payment_id),
      amount_cents: Number(d.total_amount) || 0,
      currency: String(d.currency || "USD"),
      status: "succeeded",
    }, "resolution=merge-duplicates,return=minimal");
    if (userId) {
      await db(env, `profiles?id=eq.${userId}`, "PATCH",
        { unlocked: true, unlocked_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        "return=minimal");
    }
    return json({ received: true, unlocked: !!userId });
  }

  if (type === "refund.succeeded" && d.payment_id) {
    const rows = await db(env, `purchases?dodo_payment_id=eq.${encodeURIComponent(d.payment_id)}`, "PATCH",
      { status: "refunded" }, "return=representation");
    const userId = rows && rows[0] && rows[0].user_id;
    if (userId) {
      // lock again only if the learner has no other successful purchase
      const others = await db(env, `purchases?user_id=eq.${userId}&status=eq.succeeded&select=id`, "GET");
      if (!others || !others.length) {
        await db(env, `profiles?id=eq.${userId}`, "PATCH",
          { unlocked: false, unlocked_at: null, updated_at: new Date().toISOString() }, "return=minimal");
      }
    }
    return json({ received: true });
  }

  return json({ received: true, ignored: type });
}

// The site passes the account ID as metadata_user_id on the payment link.
// Fall back to the checkout email if it is missing.
async function resolveUser(env, d) {
  const meta = d.metadata || {};
  const id = meta.user_id || meta.metadata_user_id;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const rows = await db(env, `profiles?id=eq.${id}&select=id`, "GET");
    if (rows && rows.length) return id;
  }
  const email = d.customer && d.customer.email;
  if (email) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/user_id_for_email`, {
      method: "POST",
      headers: sbHeaders(env),
      body: JSON.stringify({ p_email: email }),
    });
    if (r.ok) {
      const v = await r.json();
      if (typeof v === "string" && v) return v;
    }
  }
  return null;
}

function sbHeaders(env, prefer) {
  const h = { apikey: env.SUPABASE_SECRET_KEY, "Content-Type": "application/json" };
  if (!String(env.SUPABASE_SECRET_KEY).startsWith("sb_")) h.Authorization = `Bearer ${env.SUPABASE_SECRET_KEY}`;
  if (prefer) h.Prefer = prefer;
  return h;
}

async function db(env, path, method, body, prefer) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(env, prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]} failed: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Standard Webhooks signature check (what Dodo Payments uses).
async function verifySignature(secret, headers, body) {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > TOLERANCE_SECONDS) return false;

  const keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = bytesToBase64(new Uint8Array(mac));

  return sigs.split(" ").some(part => {
    const [ver, sig] = part.split(",");
    return ver === "v1" && sig && timingSafeEqual(sig, expected);
  });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
const text = (t, status = 200) => new Response(t, { status, headers: { "content-type": "text/plain" } });
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

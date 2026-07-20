/**
 * TVio Cloudflare Worker — two jobs:
 *
 *  1. /tmdb/*        TMDB proxy, so the API key never ships in the client bundle.
 *  2. /pair/redeem   Device pairing: turns a short code shown on the desktop
 *                    into a Firebase custom token, so a phone can sign into the
 *                    same account by scanning a QR. Only a trusted server can
 *                    authorise that, which is why it lives here.
 *
 * Deploy (free tier):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file as the Worker code and Deploy.
 *   3. Settings → Variables and Secrets → add Secrets:
 *        TMDB_KEY         your TMDB v3 API key (or v4 Read Access Token)
 *      …and, for QR sign-in, from a Firebase service account JSON
 *      (Firebase console → Project settings → Service accounts → Generate key):
 *        FB_PROJECT_ID    e.g. tvio-8e063
 *        FB_CLIENT_EMAIL  firebase-adminsdk-xxxxx@tvio-8e063.iam.gserviceaccount.com
 *        FB_PRIVATE_KEY   the full "-----BEGIN PRIVATE KEY-----…" value
 *   4. Set the repo secret VITE_TMDB_PROXY = https://<worker>.workers.dev/tmdb
 */

const TMDB = "https://api.themoviedb.org/3";

/** Bump when you change this file, so /pair/health shows what's live. */
const WORKER_VERSION = "2026-07-19.2";

/**
 * Browser origins allowed to use this Worker.
 * ⬇️  ADD YOUR CUSTOM DOMAIN HERE when you buy one, e.g. "https://tvio.app".
 */
const ALLOWED_ORIGINS = [
  "https://0mattsmith.github.io", // GitHub Pages (TVio Lite)
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "https://localhost", // Capacitor Android
  "capacitor://localhost", // Capacitor iOS
  "tauri://localhost", // Tauri (macOS / Linux)
  "http://tauri.localhost", // Tauri (Windows)
];

function corsHeaders(origin) {
  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "accept,content-type",
    vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// --- Service-account JWT helpers (WebCrypto) ---------------------------------

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem) {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function signJwt(payload, key) {
  const enc = new TextEncoder();
  const head = b64url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

/** OAuth access token for the Firestore REST API. */
async function firestoreToken(env, key) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    {
      iss: env.FB_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    key
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Could not authenticate with Firestore");
  return data.access_token;
}

/** Firebase custom token — what the phone exchanges for a real session. */
async function mintCustomToken(env, key, uid) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      iss: env.FB_CLIENT_EMAIL,
      sub: env.FB_CLIENT_EMAIL,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3600,
      uid,
    },
    key
  );
}

// --- /pair/redeem ------------------------------------------------------------

async function redeemPairing(request, env, cors) {
  if (!env.FB_PROJECT_ID || !env.FB_CLIENT_EMAIL || !env.FB_PRIVATE_KEY) {
    return json({ error: "QR sign-in isn't configured on this server." }, 501, cors);
  }

  let code = "";
  try {
    code = String((await request.json()).code || "").trim().toUpperCase();
  } catch {
    return json({ error: "Bad request", code: "PAIR_BAD_JSON" }, 400, cors);
  }
  // Codes are 8 chars from an unambiguous alphabet; reject anything else early.
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    return json({ error: "That code doesn't look right.", code: "PAIR_MALFORMED" }, 400, cors);
  }

  // Distinguish "your code is wrong" from "this server was never finished being
  // set up" — they look identical to the user otherwise.
  for (const name of ["FB_PROJECT_ID", "FB_CLIENT_EMAIL", "FB_PRIVATE_KEY"]) {
    if (!env[name]) {
      return json(
        { error: `QR sign-in isn't configured on the server (${name} is missing).`, code: "PAIR_NO_SECRETS" },
        503,
        cors
      );
    }
  }

  const key = await importKey(env.FB_PRIVATE_KEY);
  const token = await firestoreToken(env, key);
  const base = `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents/pairings/${code}`;
  const auth = { authorization: `Bearer ${token}` };

  const docRes = await fetch(base, { headers: auth });
  if (!docRes.ok) {
    return json({ error: "That code has expired or doesn't exist.", code: "PAIR_NOT_FOUND" }, 404, cors);
  }

  const doc = await docRes.json();
  const f = doc.fields || {};
  const ownerUid = f.ownerUid?.stringValue;
  const expiresAt = Number(f.expiresAt?.integerValue ?? f.expiresAt?.doubleValue ?? 0);
  const redeemed = f.redeemed?.booleanValue === true;

  if (!ownerUid) return json({ error: "That code is invalid.", code: "PAIR_INVALID" }, 400, cors);
  if (redeemed) return json({ error: "That code has already been used.", code: "PAIR_USED" }, 409, cors);
  if (!expiresAt || Date.now() > expiresAt) {
    return json({ error: "That code has expired.", code: "PAIR_EXPIRED" }, 410, cors);
  }

  // Single-use: mark it before handing out a token.
  await fetch(`${base}?updateMask.fieldPaths=redeemed&updateMask.fieldPaths=redeemedAt`, {
    method: "PATCH",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      fields: { redeemed: { booleanValue: true }, redeemedAt: { integerValue: String(Date.now()) } },
    }),
  });

  return json({ token: await mintCustomToken(env, key, ownerUid) }, 200, cors);
}

// --- Device pairing: TV shows a code, a signed-in phone approves -------------
//
// The inverse of /pair/redeem. A freshly installed TV has no account at all, so
// it can't create the pairing document itself — it asks us to, shows the code as
// a QR, and polls. A phone that IS signed in scans it and approves, proving who
// it is with a Firebase ID token. Only after that does a session token exist.

const DEVICE_TTL_MS = 5 * 60_000; // longer than the desktop flow — remotes are slow
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function deviceDocUrl(env, code) {
  return `https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents/devicePairings/${code}`;
}

function pairSecretsMissing(env) {
  return ["FB_PROJECT_ID", "FB_CLIENT_EMAIL", "FB_PRIVATE_KEY"].find((n) => !env[n]);
}

function readCode(body) {
  return String(body?.code || "").trim().toUpperCase();
}

async function readDeviceDoc(env, token, code) {
  const res = await fetch(deviceDocUrl(env, code), { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const f = (await res.json()).fields || {};
  return {
    approved: f.approved?.booleanValue === true,
    claimed: f.claimed?.booleanValue === true,
    ownerUid: f.ownerUid?.stringValue || "",
    expiresAt: Number(f.expiresAt?.integerValue ?? 0),
  };
}

/** TV: ask for a fresh code to display. Unauthenticated — nothing to prove yet. */
async function startDevicePairing(env, cors) {
  const missing = pairSecretsMissing(env);
  if (missing) {
    return json({ error: `Server not configured (${missing} is missing).`, code: "PAIR_NO_SECRETS" }, 503, cors);
  }

  const key = await importKey(env.FB_PRIVATE_KEY);
  const token = await firestoreToken(env, key);
  const code = newCode();
  const expiresAt = Date.now() + DEVICE_TTL_MS;

  const res = await fetch(deviceDocUrl(env, code), {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        createdAt: { integerValue: String(Date.now()) },
        expiresAt: { integerValue: String(expiresAt) },
        approved: { booleanValue: false },
        claimed: { booleanValue: false },
      },
    }),
  });
  if (!res.ok) return json({ error: "Couldn't create a sign-in code.", code: "PAIR_START_FAILED" }, 502, cors);

  return json({ code, expiresAt }, 200, cors);
}

/** Phone (already signed in): approve a code shown on a TV. */
async function approveDevicePairing(request, env, cors) {
  const missing = pairSecretsMissing(env);
  if (missing) {
    return json({ error: `Server not configured (${missing} is missing).`, code: "PAIR_NO_SECRETS" }, 503, cors);
  }
  if (!env.FB_API_KEY) {
    return json({ error: "Server not configured (FB_API_KEY is missing).", code: "PAIR_NO_API_KEY" }, 503, cors);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request", code: "PAIR_BAD_JSON" }, 400, cors);
  }
  const code = readCode(body);
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    return json({ error: "That code doesn't look right.", code: "PAIR_MALFORMED" }, 400, cors);
  }

  // Prove the phone is who it says it is. The web API key is public by design,
  // so keeping it here adds no new secret worth protecting.
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FB_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: String(body.idToken || "") }),
  });
  const uid = (await lookup.json().catch(() => ({})))?.users?.[0]?.localId;
  if (!lookup.ok || !uid) {
    return json({ error: "Your phone's session has expired — sign in again.", code: "PAIR_BAD_TOKEN" }, 401, cors);
  }

  const key = await importKey(env.FB_PRIVATE_KEY);
  const token = await firestoreToken(env, key);
  const doc = await readDeviceDoc(env, token, code);
  if (!doc) return json({ error: "That code has expired or doesn't exist.", code: "PAIR_NOT_FOUND" }, 404, cors);
  if (doc.claimed) return json({ error: "That code has already been used.", code: "PAIR_USED" }, 409, cors);
  if (!doc.expiresAt || Date.now() > doc.expiresAt) {
    return json({ error: "That code has expired — get a new one on the TV.", code: "PAIR_EXPIRED" }, 410, cors);
  }

  const mask = "updateMask.fieldPaths=approved&updateMask.fieldPaths=ownerUid&updateMask.fieldPaths=approvedAt";
  const res = await fetch(`${deviceDocUrl(env, code)}?${mask}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      fields: {
        approved: { booleanValue: true },
        ownerUid: { stringValue: uid },
        approvedAt: { integerValue: String(Date.now()) },
      },
    }),
  });
  if (!res.ok) return json({ error: "Couldn't approve that code.", code: "PAIR_APPROVE_FAILED" }, 502, cors);

  return json({ ok: true }, 200, cors);
}

/** TV: poll until approved, then take the session. Single use. */
async function claimDevicePairing(request, env, cors) {
  const missing = pairSecretsMissing(env);
  if (missing) {
    return json({ error: `Server not configured (${missing} is missing).`, code: "PAIR_NO_SECRETS" }, 503, cors);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request", code: "PAIR_BAD_JSON" }, 400, cors);
  }
  const code = readCode(body);
  if (!/^[A-Z2-9]{8}$/.test(code)) {
    return json({ error: "That code doesn't look right.", code: "PAIR_MALFORMED" }, 400, cors);
  }

  const key = await importKey(env.FB_PRIVATE_KEY);
  const token = await firestoreToken(env, key);
  const doc = await readDeviceDoc(env, token, code);
  if (!doc) return json({ error: "That code has expired or doesn't exist.", code: "PAIR_NOT_FOUND" }, 404, cors);
  if (doc.claimed) return json({ error: "That code has already been used.", code: "PAIR_USED" }, 409, cors);
  if (!doc.expiresAt || Date.now() > doc.expiresAt) {
    return json({ error: "That code has expired.", code: "PAIR_EXPIRED" }, 410, cors);
  }

  // Not an error: the TV sits here polling until somebody scans it.
  if (!doc.approved || !doc.ownerUid) return json({ status: "pending" }, 200, cors);

  await fetch(`${deviceDocUrl(env, code)}?updateMask.fieldPaths=claimed&updateMask.fieldPaths=claimedAt`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      fields: { claimed: { booleanValue: true }, claimedAt: { integerValue: String(Date.now()) } },
    }),
  });

  return json({ status: "approved", token: await mintCustomToken(env, key, doc.ownerUid) }, 200, cors);
}

// --- TMDB proxy --------------------------------------------------------------

async function proxyTmdb(request, env, cors, url) {
  const path = url.pathname.replace(/^\/tmdb/, "") || "/";
  const target = new URL(TMDB + path);
  url.searchParams.forEach((v, k) => {
    if (k !== "api_key") target.searchParams.set(k, v); // never trust a client-supplied key
  });

  // Accept either credential: v3 API Key (?api_key=) or v4 Read Access Token (Bearer).
  const key = env.TMDB_KEY || "";
  const isReadToken = key.startsWith("eyJ");
  if (!isReadToken) target.searchParams.set("api_key", key);

  const res = await fetch(target.toString(), {
    headers: { accept: "application/json", ...(isReadToken ? { authorization: `Bearer ${key}` } : {}) },
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      ...cors,
      "content-type": "application/json",
      "cache-control": res.ok ? "public, max-age=600" : "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Browser requests from un-listed sites are refused. Requests with no Origin
    // (curl, address bar, some native shells) pass — CORS can't police those.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }

    // Diagnostics: confirms which build of this Worker is deployed and whether
    // the pairing secrets exist. Booleans only — never the values themselves.
    // Open it in a browser when QR sign-in misbehaves.
    if (url.pathname === "/pair/health") {
      return json(
        {
          ok: true,
          worker: WORKER_VERSION,
          pairing: {
            projectId: Boolean(env.FB_PROJECT_ID),
            clientEmail: Boolean(env.FB_CLIENT_EMAIL),
            privateKey: Boolean(env.FB_PRIVATE_KEY),
            apiKey: Boolean(env.FB_API_KEY), // only needed for TV sign-in
          },
          tmdbKey: Boolean(env.TMDB_KEY),
        },
        200,
        cors
      );
    }

    // TV sign-in: the TV starts a code, a signed-in phone approves it, the TV
    // claims the session. Each wrapped so an exception can't become a bare 500.
    const devicePairRoutes = {
      "/pair/start": () => startDevicePairing(env, cors),
      "/pair/approve": () => approveDevicePairing(request, env, cors),
      "/pair/claim": () => claimDevicePairing(request, env, cors),
    };
    if (devicePairRoutes[url.pathname]) {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed", code: "PAIR_METHOD" }, 405, cors);
      }
      try {
        return await devicePairRoutes[url.pathname]();
      } catch (e) {
        return json({ error: `Device pairing failed: ${e?.message || e}`, code: "PAIR_EXCEPTION" }, 500, cors);
      }
    }

    if (url.pathname === "/pair/redeem") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed", code: "PAIR_METHOD" }, 405, cors);
      }
      try {
        return await redeemPairing(request, env, cors);
      } catch (e) {
        // Never swallow the reason. The message is ours, not user input, and
        // "something went wrong" has cost real debugging time.
        return json(
          { error: `Sign-in failed: ${e?.message || e}`, code: "PAIR_EXCEPTION" },
          500,
          cors
        );
      }
    }

    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, cors);
    return proxyTmdb(request, env, cors, url);
  },
};

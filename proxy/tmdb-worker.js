/**
 * TVio TMDB proxy — a tiny Cloudflare Worker that holds the TMDB API key
 * server-side so it never ships in the client bundle. Users then need zero
 * configuration: the app "just works" out of the box.
 *
 * Deploy (free tier):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file as the Worker code and Deploy.
 *   3. Settings → Variables and Secrets → add a Secret:
 *        TMDB_KEY = <your TMDB v3 API Key, or v4 Read Access Token>
 *   4. Copy the Worker URL and set it as the repo secret:
 *        VITE_TMDB_PROXY = https://<worker>.workers.dev/tmdb
 *
 * The app calls e.g. /tmdb/movie/popular?page=1 and the Worker forwards it to
 * https://api.themoviedb.org/3/movie/popular?page=1 with the credential added.
 */

const TMDB = "https://api.themoviedb.org/3";

/**
 * Browser origins allowed to use this proxy. Anything else is refused, so the
 * endpoint can't be casually used as a free TMDB proxy by other sites.
 *
 * ⬇️  ADD YOUR CUSTOM DOMAIN HERE when you buy one, e.g.:
 *       "https://tvio.app",
 *       "https://www.tvio.app",
 */
const ALLOWED_ORIGINS = [
  "https://0mattsmith.github.io", // GitHub Pages (TVio Lite)

  // Local development
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",

  // Native app shells (so the Windows / Android builds keep working)
  "https://localhost", // Capacitor Android (androidScheme: "https")
  "capacitor://localhost", // Capacitor iOS
  "tauri://localhost", // Tauri (macOS / Linux)
  "http://tauri.localhost", // Tauri (Windows)
];

function corsHeaders(origin) {
  const headers = {
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "accept,content-type",
    vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    // A browser request from an un-listed site is refused. Requests with no
    // Origin (curl, address bar, some native shells) are allowed through —
    // CORS can't police those anyway, and this is a public read-only API.
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    const incoming = new URL(request.url);
    // Strip the /tmdb prefix; everything after it is the TMDB path.
    const path = incoming.pathname.replace(/^\/tmdb/, "") || "/";

    const target = new URL(TMDB + path);
    incoming.searchParams.forEach((v, k) => {
      if (k !== "api_key") target.searchParams.set(k, v); // never trust a client-supplied key
    });

    // Accept either credential: the v3 API Key (?api_key=) or the v4 Read
    // Access Token (a JWT sent as a Bearer header).
    const key = env.TMDB_KEY || "";
    const isReadToken = key.startsWith("eyJ");
    if (!isReadToken) target.searchParams.set("api_key", key);

    const res = await fetch(target.toString(), {
      headers: {
        accept: "application/json",
        ...(isReadToken ? { authorization: `Bearer ${key}` } : {}),
      },
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        ...cors,
        "content-type": "application/json",
        // Cache successful metadata briefly at the edge to stay well inside limits.
        "cache-control": res.ok ? "public, max-age=600" : "no-store",
      },
    });
  },
};

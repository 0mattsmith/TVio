/**
 * TVio TMDB proxy — a tiny Cloudflare Worker that holds the TMDB API key
 * server-side so it never ships in the client bundle. Users then need zero
 * configuration: the app "just works" out of the box.
 *
 * Deploy (free tier):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
 *   2. Paste this file as the Worker code and Deploy.
 *   3. Settings → Variables → add a secret:  TMDB_KEY = <your TMDB v3 key>
 *   4. Copy the Worker URL and set it as the repo secret:
 *        VITE_TMDB_PROXY = https://<worker>.workers.dev/tmdb
 *
 * The app calls e.g. /tmdb/movie/popular?page=1 and the Worker forwards it to
 * https://api.themoviedb.org/3/movie/popular?page=1&api_key=<secret>.
 */

const TMDB = "https://api.themoviedb.org/3";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "accept,content-type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });

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
        ...CORS,
        "content-type": "application/json",
        // Cache successful metadata briefly at the edge to stay well inside limits.
        "cache-control": res.ok ? "public, max-age=600" : "no-store",
      },
    });
  },
};

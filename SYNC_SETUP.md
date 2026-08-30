# Sync setup (Firebase + Simkl)

TVio can sync your watchlist, favourites, watched history and progress two ways.
Both are optional and independent.

## 1. Firebase (same-account, cross-device — recommended)

This is the seamless "sign in anywhere and your lists follow you" sync, using the
Firebase account you already sign in with. It also powers the cross-device
"Added to your watchlist" notification on the TV.

**One-time setup in the Firebase console:**

1. Open your project → **Build → Firestore Database → Create database** (Production mode, any region).
2. Go to the **Rules** tab and paste this, then **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Each user can read/write only their own document.
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

3. Make sure the build has the Firebase env vars set (see `.env.example`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID`). These must be present **at build time** (locally in
   `.env.local`, and in your GitHub Actions secrets for the released builds).

That's it — sign in on each device with the same account and everything syncs.
If the env vars aren't set, TVio runs in local-only mode (no cross-device sync),
which is why a watchlist added on one device won't appear on another.

## 2. Simkl (optional — a free Trakt alternative, cross-app)

Connect a Simkl account to sync your watchlist / watched history with any other
Simkl-connected app, and to use Simkl's recommendations on your Home screen.

**One-time setup:**

1. Create an app at <https://simkl.com/settings/developer/> (free). Set the
   redirect URL to `https://simkl.com/pin` (for the TV PIN sign-in).
2. Copy the **client id** into the build env as `VITE_SIMKL_CLIENT_ID`
   (`.env.local` locally, and a GitHub Actions secret for releases).
3. In TVio: **Settings → Simkl → Connect**. On the TV you'll get a short code —
   enter it at `simkl.com/pin` on your phone, and TVio finishes automatically.

Use **Sync now** any time to push/pull, or just add things as usual. Note: free
for personal use (Simkl requires apps under $150/mo revenue to just credit Simkl,
which we do via the connect flow).

# Firebase setup — Matchpoint

This branch (`production`) wires the app to Firebase **Anonymous Authentication**
and Cloud Firestore. The user only sees the nickname splash; the app silently
calls `signInAnonymously()` in the background so every visitor gets a real
Firebase UID that Firestore security rules can authorize.

The web Firebase config is inlined in `matchpoint-app.html` because this build
has no Vite/bundler step yet; the web config is **not** a secret. Real
protection comes from the Firestore security rules + Auth.

Existing project (do **not** create a new one):

- Project number: `295644227588`
- Project ID: `matchpoint-e7abe`
- Web app appId: `1:295644227588:web:dfcba0e06ff646e2b26d51`
- Netlify site: `https://matchpointforsports.netlify.app`

## One-time Firebase Console steps (~3 minutes)

Do these once in <https://console.firebase.google.com/project/matchpoint-e7abe>.

### 1. Enable Anonymous sign-in

**Authentication → Sign-in method → Anonymous → Enable → Save**.

That's it for auth. No phone numbers, no SMS, no reCAPTCHA setup.

### 2. Add authorized domains

**Authentication → Settings → Authorized domains** — make sure these are present:

- `localhost`
- `matchpoint-e7abe.firebaseapp.com`
- `matchpointforsports.netlify.app` ← add this one

### 3. Create Firestore database

**Firestore Database → Create database → Start in production mode → Region: closest to you (e.g. `asia-east1` for HK/CN, `us-central1` for default).**

### 4. Deploy Firestore security rules

Copy the contents of `firestore.rules` (in this repo) into:

**Firestore Database → Rules → paste → Publish**

The ruleset:

- `pools/{poolId}/users/{uid}` — anyone signed in can read (so matching can browse the pool); only the owner can write their own profile doc.
- `pools/{poolId}/chats/{chatId}` — any signed-in user can read/write. (School-demo scope. Chat docs don't carry a `writerUid` field so per-doc ownership would need a schema change. Tighten before any real production use.)
- Everything else: denied.

## How the auth flow works in the app

1. `matchpoint-app.html` loads → detects `FIREBASE_ENABLED = true` → loads Auth + Firestore SDKs from CDN.
2. App state defaults to `screen: 'splash'` (the existing nickname screen).
3. `auth.onAuthStateChanged` listener attaches:
   - If a user is already signed in (returning visitor on the same browser, Firebase persists anon sessions in IndexedDB), it pulls their Firestore profile and routes to splash or main.
   - If no user, it silently calls `auth.signInAnonymously()`. The listener re-fires with the freshly-issued anon user.
4. The user sees the nickname splash and never knows auth happened. They type a nickname, hit "开始填写", and walk through the sports onboarding.
5. When onboarding completes, `saveProfile()` writes `{uid, nickname, sports, timePref, updatedAt}` to `pools/matchpoint_class_01/users/{uid}` in Firestore. The `{merge: true}` flag preserves any existing fields.
6. From then on, anyone who registers on any device shows up in everyone's pool — that's the cross-device sharing the production branch exists to provide.

## Netlify deploy

The repo is plain HTML — Netlify just serves the static files. No build step needed. Push to the `production` branch and configure Netlify to deploy from it (or merge to `main` and deploy from `main` once you're happy with the PR).

If you later move to Vite (recommended for a real product), wire the config via env vars:

In `.env.local` and in **Netlify → Site settings → Environment variables**:

```
VITE_FIREBASE_API_KEY=AIzaSyBtXA1nU24ojwGZ4BW5BaaGAqw3QW3QDUU
VITE_FIREBASE_AUTH_DOMAIN=matchpoint-e7abe.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=matchpoint-e7abe
VITE_FIREBASE_STORAGE_BUCKET=matchpoint-e7abe.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=295644227588
VITE_FIREBASE_APP_ID=1:295644227588:web:dfcba0e06ff646e2b26d51
VITE_FIREBASE_MEASUREMENT_ID=G-8ZLPSWRWDG
```

Then replace the inline `FIREBASE_CONFIG` block in `matchpoint-app.html` with:

```js
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
```

For the current static build, the inline config is what runs. The values are identical, so no separate env wiring is needed for the demo.

## Troubleshooting at the demo

- **Toast: "Firebase 匿名登录未启用..."** — Anonymous provider isn't on. Fix step 1 above.
- **`auth/admin-restricted-operation`** in console — same root cause as above.
- **Splash shows but writing the profile silently fails** — open the Firestore Console and check the `pools/matchpoint_class_01/users` collection. If it's empty, the rules are likely too strict; redeploy `firestore.rules`. If the doc is there but other devices don't see it, the read side of the rules might be wrong.
- **Pool stays at 0 people after multiple users register** — open the Firestore Console; if docs are there, the issue is on the client-side read path.

## What was removed vs the earlier phone-auth design

Earlier this branch had a phone-number + SMS-verification screen. That has been ripped out in favor of anonymous auth because:

- The user explicitly chose "nickname only, no login step."
- No SMS quota / billing concerns during the live presentation.
- No reCAPTCHA setup or authorized-domain pain.
- Anonymous auth still yields a real Firebase UID, so Firestore security rules still work cleanly.

If you ever want real identities back (phone number, email, Google sign-in, etc.), the cleanest path is to keep anonymous auth as the entry and use `linkWithCredential()` to upgrade an anon user into a real account once they want to claim their data.

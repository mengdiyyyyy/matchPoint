# Firebase setup — Matchpoint

This branch (`production`) wires the app to Firebase Authentication (Phone) and
Cloud Firestore. The web Firebase config is inlined in `matchpoint-app.html`
because this build has no Vite/bundler step yet; the web config is **not** a
secret. Real protection comes from the Auth + Firestore rules.

Existing project (do **not** create a new one):

- Project number: `295644227588`
- Project ID: `matchpoint-e7abe`
- Web app appId: `1:295644227588:web:dfcba0e06ff646e2b26d51`
- Netlify site: `https://matchpointforsports.netlify.app`

## One-time Firebase Console steps

These cannot be done from code — you must click them in
<https://console.firebase.google.com/project/matchpoint-e7abe>.

### 1. Enable Phone sign-in

1. **Authentication → Sign-in method → Phone → Enable → Save**.
2. **Authentication → Settings → Authorized domains** — make sure these are present:
   - `localhost`
   - `matchpoint-e7abe.firebaseapp.com`
   - `matchpointforsports.netlify.app` ← add this one
3. **Authentication → Settings → SMS region policy** — Allow at least `US` and `CN`
   (or whatever region your demo phones live in). Leaving "Allow all regions" is
   fine for a school demo.

### 2. Add test phone numbers (recommended for the demo)

Real SMS is slow, billed, and rate-limited. For the presentation, register
fake phone numbers that bypass real SMS:

**Authentication → Sign-in method → Phone → Phone numbers for testing**

| Phone number | Code |
|---|---|
| `+1 650-555-0100` | `123456` |
| `+1 650-555-0101` | `654321` |
| `+86 138 0013 8001` | `111111` |
| `+86 138 0013 8002` | `222222` |

These work on `localhost` and on the deployed Netlify URL. They don't send
real SMS. Use them during the live presentation.

### 3. Deploy Firestore security rules

Copy `firestore.rules` (in this repo) into:

**Firestore Database → Rules → paste → Publish**

The included ruleset:
- `pools/{poolId}/users/{uid}` — anyone signed in can read; only the owner can write their own profile doc.
- `pools/{poolId}/chats/{chatId}` — any signed-in user can read/write. (School-demo scope. Tighten before real production by adding a `writerUid` field to chat docs and matching `request.auth.uid`.)
- Everything else: denied.

### 4. Create Firestore database (if not already done)

**Firestore Database → Create database → Start in production mode → Region: closest to you.**

The first time you hit the rules will overwrite the default rules.

## Netlify deploy

The repo is plain HTML — Netlify just serves the static files. No build step needed.

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
  measurementId: import.meta.env.VITE_FIREBASE_MESSAGING_ID,
};
```

For the current static build, the inline config is what runs. The values are
identical, so no separate env wiring is needed for the demo.

## How the auth flow works in the app

1. `matchpoint-app.html` loads → detects `FIREBASE_ENABLED = true` → loads Auth + Firestore SDKs from CDN.
2. App state defaults to `screen: 'phone-login'`.
3. `auth.onAuthStateChanged` listener attaches. If a user is already signed in (returning visitor), it routes straight to the splash/main screen and pulls their Firestore profile.
4. New users see the phone-login screen:
   - Enter phone (with country code, e.g. `+86 13800138000` or one of the test numbers).
   - Invisible reCAPTCHA fires.
   - `auth.signInWithPhoneNumber(...)` sends an SMS (or in test mode, skips it).
   - User enters the 6-digit code.
   - `confirmationResult.confirm(code)` returns a Firebase user.
5. On success, the app immediately writes a minimal `{uid, phoneNumber, createdAt}` doc into `pools/matchpoint_class_01/users/{uid}` and routes to the splash/nickname screen.
6. Nickname + sport answers from onboarding are merged into the same Firestore doc.

## Troubleshooting at the demo

- **"auth/invalid-app-credential"** when sending code: usually means `localhost`
  or the deploy domain isn't on the authorized-domains list. Fix step 1.2 above.
- **"auth/captcha-check-failed"**: the invisible reCAPTCHA failed. Refresh the
  page and try again. If it persists, check that your domain is authorized.
- **"auth/quota-exceeded"** or **"auth/too-many-requests"**: real SMS quota is
  rate-limited per IP. Use the test phone numbers instead.
- **Pool stays at 0 people after multiple users register**: open the Firestore
  Console and check `pools/matchpoint_class_01/users` — if the docs are there,
  the issue is on the client read side. If they're missing, check the rules.

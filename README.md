# Sarasavi Match the Author

React, TypeScript, Vite, Tailwind CSS, Firebase Firestore, Firebase Authentication, and `avatar64`.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. Create a Cloud Firestore database.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Create the administrator account under **Authentication → Users**.
5. Copy `.env.example` to `.env.local` and enter the Web app configuration values.
6. Deploy `firestore.rules` and `firestore.indexes.json` using the Firebase CLI, or copy the rules into the Firebase console.

```powershell
Copy-Item .env.example .env.local
npx firebase-tools login
npx firebase-tools use YOUR_PROJECT_ID
npx firebase-tools deploy --only firestore
```

The public game can read book and game configuration documents. Only a signed-in Firebase user can change them.

## Images

Firebase Cloud Storage is intentionally not used. Every uploaded image is converted in the browser to optimized WebP Base64 using `avatar64`, then stored in its Firestore document.

Firestore has a 1 MiB document limit. The app resizes images, applies WebP compression, validates the decoded size, and keeps each document under 900 KiB. Large photos should still be resized before upload if optimization cannot make them small enough.

## Run locally

```powershell
corepack pnpm install
corepack pnpm dev
```

Open:

- Game: `http://localhost:8443/`
- Admin: `http://localhost:8443/admin`

## Production build

```powershell
corepack pnpm build
corepack pnpm preview
```

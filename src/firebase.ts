import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseVariables = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingFirebaseVariables.length === 0;
export const firebaseConfigurationError = isFirebaseConfigured
  ? null
  : `Missing Firebase environment variables: ${missingFirebaseVariables.join(", ")}`;

let firestore: Firestore | null = null;
let firebaseAuth: Auth | null = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firestore = getFirestore(app);
  firebaseAuth = getAuth(app);
}

export { firebaseAuth, firestore };

export function requireFirestore(): Firestore {
  if (!firestore) {
    throw new Error(firebaseConfigurationError ?? "Firebase is not configured.");
  }
  return firestore;
}

export function requireFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error(firebaseConfigurationError ?? "Firebase Authentication is not configured.");
  }
  return firebaseAuth;
}

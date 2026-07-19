import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Config comes from env (see .env.example). Firebase is optional: if the keys
// aren't set, the app runs in local/demo auth mode.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | undefined;
let authRef: Auth | undefined;
let dbRef: Firestore | undefined;

if (firebaseEnabled) {
  app = initializeApp(config as Record<string, string>);
  authRef = getAuth(app);
  dbRef = getFirestore(app);
}

export const auth = authRef;
export const db = dbRef;

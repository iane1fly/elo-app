import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const requiredFirebaseEnv = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const cleanFirebaseEnv = (value: string | undefined) =>
  value?.trim().replace(/^['\"]|['\"]$/g, '') || undefined;

// Read each Vite variable directly so the bundler can replace the values in the client build.
const firebaseConfig = {
  apiKey: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  messagingSenderId: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_APP_ID),
  storageBucket: cleanFirebaseEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
};

const missingFirebaseEnv = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missingFirebaseEnv.length > 0) {
  throw new Error(`Firebase configuration is incomplete. Missing: ${missingFirebaseEnv.join(', ')}`);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [uid, mode = 'on'] = process.argv.slice(2);
if (!uid || !['on', 'off'].includes(mode)) {
  console.error('Usage: npm run admin:claim -- <firebase-auth-uid> [on|off]');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) to the Firebase project ID.');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const user = await auth.getUser(uid);
const claims = { ...(user.customClaims || {}) };
if (mode === 'on') claims.admin = true;
else delete claims.admin;

await auth.setCustomUserClaims(uid, claims);
if (mode === 'off') await auth.revokeRefreshTokens(uid);
console.log(`Admin claim ${mode === 'on' ? 'enabled' : 'removed'} for ${uid}. The member must sign out and sign in again for the change to appear.`);

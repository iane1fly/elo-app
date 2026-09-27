import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const applyChanges = process.argv.includes('--apply');
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) to the Firebase project ID.');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const approved = await db.collection('accessRequests').where('status', '==', 'approved').get();
let migrated = 0;
let skipped = 0;
let batch = db.batch();
let pendingWrites = 0;

for (const memberDoc of approved.docs) {
  const member = memberDoc.data();
  const publicRef = db.collection('profiles').doc(memberDoc.id);
  const existing = await publicRef.get();
  if (existing.exists) {
    skipped += 1;
    continue;
  }
  const profile = {
    uid: memberDoc.id,
    name: member.name || '',
    role: member.role || '',
    company: member.company || '',
    location: member.location || '',
    pitch: member.pitch || '',
    lookingFor: member.lookingFor || '',
    avatarUrl: member.avatarUrl || '',
    coverUrl: member.coverUrl || '',
    linkedinUrl: member.linkedinUrl || '',
    visibleInNetwork: member.visibleInNetwork !== false,
    acceptsMeetings: member.acceptsMeetings !== false,
    status: 'approved',
    createdAt: member.createdAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  migrated += 1;
  if (applyChanges) {
    batch.set(publicRef, profile);
    pendingWrites += 1;
    if (pendingWrites === 400) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }
}

if (applyChanges && pendingWrites > 0) await batch.commit();
console.log(`${applyChanges ? 'Migration complete' : 'Dry run'}: ${migrated} public profiles ${applyChanges ? 'created' : 'would be created'}, ${skipped} existing profiles left unchanged.`);
if (!applyChanges) console.log('Review the counts, then rerun with --apply to write public profile documents.');

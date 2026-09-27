import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { profileFromLegacy } from './profile-migration.mjs';

export { profileFromLegacy };

export async function runBackfill() {
  const applyChanges = process.argv.includes('--apply');
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('Set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) to the Firebase project ID.');
    process.exitCode = 1;
    return;
  }

  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore(app);
  const approved = await db.collection('accessRequests').where('status', '==', 'approved').get();
  let publicProfilesPrepared = 0;
  let accountRecordsPrepared = 0;
  let batch = db.batch();
  let pendingWrites = 0;

  for (const memberDoc of approved.docs) {
    const member = memberDoc.data();
    const publicRef = db.collection('profiles').doc(memberDoc.id);
    const existing = await publicRef.get();
    const profile = profileFromLegacy(memberDoc.id, member, existing.data() || {});
    const { uid: _uid, status: _status, ...normalizedAccountFields } = profile;

    publicProfilesPrepared += 1;
    accountRecordsPrepared += 1;
    if (!applyChanges) continue;

    batch.update(memberDoc.ref, normalizedAccountFields);
    batch.set(publicRef, {
      ...profile,
      createdAt: existing.data()?.createdAt || member.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    pendingWrites += 2;

    if (pendingWrites >= 400) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (applyChanges && pendingWrites > 0) await batch.commit();
  console.log(`${applyChanges ? 'Migration complete' : 'Dry run'}: ${publicProfilesPrepared} approved profiles ${applyChanges ? 'normalized' : 'would be normalized'}; ${accountRecordsPrepared} private account records ${applyChanges ? 'updated' : 'would be updated'}.`);
  if (!applyChanges) console.log('This dry run made no changes. Review the counts and selected project, then rerun with --apply to normalize records and create safe public profiles.');
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entryPoint === import.meta.url) await runBackfill();

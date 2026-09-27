import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { readFile } from 'node:fs/promises';

let testEnv: RulesTestEnvironment;

const baseProfile = (uid: string, name: string) => ({
  uid,
  email: `${uid}@elo.test`,
  name,
  role: 'Founder',
  company: 'Elo Labs',
  location: 'Lisboa',
  pitch: `${name} profile`,
  lookingFor: 'Founders',
  avatarUrl: '',
  coverUrl: '',
  linkedinUrl: '',
  visibleInNetwork: true,
  acceptsMeetings: true,
  status: 'approved',
  createdAt: new Date(),
});

async function seedApprovedMember(uid: string, name: string, visibleInNetwork = true) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const privateProfile = {
      ...baseProfile(uid, name),
      visibleInNetwork,
    };
    const { email: _privateEmail, ...publicProfile } = privateProfile;
    await setDoc(doc(db, 'accessRequests', uid), privateProfile);
    await setDoc(doc(db, 'profiles', uid), {
      ...publicProfile,
      visibleInNetwork,
      status: 'approved',
    });
  });
}

describe('Firestore rules', () => {
  beforeAll(async () => {
    const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-elo-phase-1',
      firestore: { rules },
    });
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('allows a member to submit their own pending application but not self-approve', async () => {
    const db = testEnv.authenticatedContext('new-member', { email: 'new-member@elo.test' }).firestore();
    const application = { ...baseProfile('new-member', 'New Member'), status: 'pending' };
    await assertSucceeds(setDoc(doc(db, 'accessRequests/new-member'), application));
    await assertFails(updateDoc(doc(db, 'accessRequests/new-member'), { status: 'approved' }));
  });

  it('allows a custom-claim administrator to approve and publish a member atomically', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accessRequests/applicant'), {
        ...baseProfile('applicant', 'Applicant'), status: 'pending',
      });
    });
    const adminDb = testEnv.authenticatedContext('staff', { admin: true }).firestore();
    const { email: _privateEmail, ...publicProfile } = baseProfile('applicant', 'Applicant');
    const batch = writeBatch(adminDb);
    batch.update(doc(adminDb, 'accessRequests/applicant'), { status: 'approved' });
    batch.set(doc(adminDb, 'profiles/applicant'), { ...publicProfile, status: 'approved', updatedAt: new Date() });
    await assertSucceeds(batch.commit());
  });

  it('lets approved members discover only profiles explicitly marked visible', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob', true);
    await seedApprovedMember('private', 'Private', false);
    const db = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const visibleQuery = query(
      collection(db, 'profiles'),
      where('status', '==', 'approved'),
      where('visibleInNetwork', '==', true),
    );
    const result = await assertSucceeds(getDocs(visibleQuery));
    expect(result.docs.map((item) => item.id).sort()).toEqual(['alice', 'bob']);
    await assertFails(getDocs(query(collection(db, 'profiles'), where('status', '==', 'approved'))));
    await assertFails(getDoc(doc(db, 'accessRequests/bob')));
  });

  it('requires public-profile edits to match the private profile written in the same batch', async () => {
    await seedApprovedMember('alice', 'Alice');
    const db = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, 'accessRequests/alice'), { name: 'Alice Updated' });
    batch.set(doc(db, 'profiles/alice'), { name: 'Alice Updated', updatedAt: new Date() }, { merge: true });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(db, 'profiles/alice'), { name: 'Forged Public Name' }));
  });

  it('allows a request and its notification atomically, then allows only the recipient to accept', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob');
    const aliceDb = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    await assertSucceeds(getDoc(doc(aliceDb, 'connections/alice_bob')));
    const batch = writeBatch(aliceDb);
    batch.set(doc(aliceDb, 'connections/alice_bob'), {
      memberUids: ['alice', 'bob'],
      memberNames: { alice: 'Alice', bob: 'Bob' },
      requesterUid: 'alice',
      recipientUid: 'bob',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    batch.set(doc(aliceDb, 'notifications/request-1'), {
      recipientUid: 'bob',
      actorUid: 'alice',
      actorName: 'Alice',
      connectionId: 'alice_bob',
      type: 'connection_request',
      read: false,
      createdAt: new Date(),
    });
    await assertSucceeds(batch.commit());

    const bobDb = testEnv.authenticatedContext('bob', { email: 'bob@elo.test' }).firestore();
    await assertSucceeds(getDoc(doc(bobDb, 'conversations/alice_bob')));
    const acceptBatch = writeBatch(bobDb);
    acceptBatch.update(doc(bobDb, 'connections/alice_bob'), { status: 'accepted', updatedAt: new Date() });
    acceptBatch.set(doc(bobDb, 'conversations/alice_bob'), {
      memberUids: ['alice', 'bob'],
      memberNames: { alice: 'Alice', bob: 'Bob' },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: '',
      lastMessageAt: null,
      lastMessageId: null,
    });
    acceptBatch.set(doc(bobDb, 'notifications/accepted-1'), {
      recipientUid: 'alice',
      actorUid: 'bob',
      actorName: 'Bob',
      connectionId: 'alice_bob',
      type: 'connection_accepted',
      read: false,
      createdAt: new Date(),
    });
    await assertSucceeds(acceptBatch.commit());

    const messageBatch = writeBatch(bobDb);
    messageBatch.set(doc(bobDb, 'conversations/alice_bob/messages/message-1'), {
      senderUid: 'bob', senderName: 'Bob', text: 'Hello Alice', createdAt: new Date(),
    });
    messageBatch.update(doc(bobDb, 'conversations/alice_bob'), {
      lastMessage: 'Hello Alice', lastMessageId: 'message-1', lastMessageAt: new Date(), updatedAt: new Date(),
    });
    await assertSucceeds(messageBatch.commit());

    const strangerDb = testEnv.authenticatedContext('stranger', { email: 'stranger@elo.test' }).firestore();
    await assertFails(getDoc(doc(strangerDb, 'connections/alice_bob')));
    await assertFails(getDoc(doc(strangerDb, 'conversations/alice_bob')));

    await assertSucceeds(updateDoc(doc(bobDb, 'connections/alice_bob'), { status: 'cancelled', updatedAt: new Date() }));
    const blockedMessageBatch = writeBatch(bobDb);
    blockedMessageBatch.set(doc(bobDb, 'conversations/alice_bob/messages/message-2'), {
      senderUid: 'bob', senderName: 'Bob', text: 'Should be blocked', createdAt: new Date(),
    });
    blockedMessageBatch.update(doc(bobDb, 'conversations/alice_bob'), {
      lastMessage: 'Should be blocked', lastMessageId: 'message-2', lastMessageAt: new Date(), updatedAt: new Date(),
    });
    await assertFails(blockedMessageBatch.commit());
  });

  it('rejects a forged connection request and a notification without the matching connection transition', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob');
    const bobDb = testEnv.authenticatedContext('bob', { email: 'bob@elo.test' }).firestore();
    await assertFails(setDoc(doc(bobDb, 'connections/alice_bob'), {
      memberUids: ['alice', 'bob'], memberNames: { alice: 'Alice', bob: 'Bob' }, requesterUid: 'alice', recipientUid: 'bob',
      status: 'pending', createdAt: new Date(), updatedAt: new Date(),
    }));
    await assertFails(setDoc(doc(bobDb, 'notifications/fake'), {
      recipientUid: 'alice', actorUid: 'bob', actorName: 'Bob', connectionId: 'missing',
      type: 'connection_accepted', read: false, createdAt: new Date(),
    }));
  });

  it('allows a meeting request and its notification only as one approved-member write', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob');
    const aliceDb = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const batch = writeBatch(aliceDb);
    batch.set(doc(aliceDb, 'meetings/meeting-1'), {
      requesterUid: 'alice', requesterName: 'Alice', targetUid: 'bob', targetName: 'Bob',
      message: 'Would love to discuss founders’ growth.', proposedDateTime: '2026-10-01T10:00',
      status: 'pending', createdAt: new Date(),
    });
    batch.set(doc(aliceDb, 'notifications/meeting-1'), {
      recipientUid: 'bob', actorUid: 'alice', actorName: 'Alice', meetingId: 'meeting-1',
      type: 'meeting_request', read: false, createdAt: new Date(),
    });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(aliceDb, 'meetings/meeting-1'), { status: 'accepted' }));
    const bobDb = testEnv.authenticatedContext('bob', { email: 'bob@elo.test' }).firestore();
    await assertSucceeds(updateDoc(doc(bobDb, 'meetings/meeting-1'), { status: 'accepted' }));
  });

  it('permits a member to react/comment as themselves but not edit another member’s post', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'posts/post-1'), {
        authorUid: 'alice', authorName: 'Alice', authorRole: 'Founder', content: 'Hello',
        likes: [], comments: [], createdAt: new Date(),
      });
    });
    const bobDb = testEnv.authenticatedContext('bob', { email: 'bob@elo.test' }).firestore();
    const post = doc(bobDb, 'posts/post-1');
    await assertSucceeds(updateDoc(post, { likes: arrayUnion('bob') }));
    await assertSucceeds(updateDoc(post, { comments: arrayUnion({
      id: 'comment-1', authorUid: 'bob', authorName: 'Bob', text: 'Helpful!', timestamp: '14:00',
    }) }));
    await assertFails(updateDoc(post, { content: 'Modified by Bob' }));
  });

  it('restricts profile-media uploads to their owner and reads to approved members', async () => {
    await seedApprovedMember('alice', 'Alice');
    await seedApprovedMember('bob', 'Bob');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accessRequests/pending'), {
        ...baseProfile('pending', 'Pending Member'), status: 'pending',
      });
    });

    const bucket = 'gs://demo-elo-phase-1.appspot.com';
    const aliceStorage = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).storage(bucket);
    const bobStorage = testEnv.authenticatedContext('bob', { email: 'bob@elo.test' }).storage(bucket);
    const pendingStorage = testEnv.authenticatedContext('pending', { email: 'pending@elo.test' }).storage(bucket);
    const objectPath = 'members/alice/profile/avatar.jpg';
    const image = 'data:image/jpeg;base64,AA==';

    await assertSucceeds(aliceStorage.ref(objectPath).putString(image, 'data_url'));
    await assertSucceeds(bobStorage.ref(objectPath).getDownloadURL());
    await assertFails(bobStorage.ref(objectPath).putString(image, 'data_url'));
    await assertFails(pendingStorage.ref(objectPath).getDownloadURL());
  });
});

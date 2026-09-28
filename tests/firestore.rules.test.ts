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

  it('lets a signed-in newcomer activate their account with an atomic private/public profile batch', async () => {
    const db = testEnv.authenticatedContext('new-member', { email: 'new-member@elo.test' }).firestore();
    const application = { ...baseProfile('new-member', 'New Member'), username: 'new.member' };
    const { email: _privateEmail, ...publicProfile } = application;

    await assertFails(setDoc(doc(db, 'accessRequests/unpaired'), baseProfile('unpaired', 'Unpaired')));

    const batch = writeBatch(db);
    batch.set(doc(db, 'accessRequests/new-member'), application);
    batch.set(doc(db, 'profiles/new-member'), publicProfile);
    batch.set(doc(db, 'usernames/new.member'), { username: 'new.member' });
    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(db, 'profiles/new-member'))).data()?.status).toBe('approved');
    expect((await getDoc(doc(db, 'profiles/new-member'))).data()?.username).toBe('new.member');
    await assertFails(updateDoc(doc(db, 'accessRequests/new-member'), { status: 'rejected' }));

    const duplicateDb = testEnv.authenticatedContext('duplicate-member', { email: 'duplicate@elo.test' }).firestore();
    const duplicateProfile = { ...baseProfile('duplicate-member', 'Duplicate Member'), username: 'new.member' };
    const { email: _duplicateEmail, ...duplicatePublicProfile } = duplicateProfile;
    const duplicateBatch = writeBatch(duplicateDb);
    duplicateBatch.set(doc(duplicateDb, 'accessRequests/duplicate-member'), duplicateProfile);
    duplicateBatch.set(doc(duplicateDb, 'profiles/duplicate-member'), duplicatePublicProfile);
    duplicateBatch.set(doc(duplicateDb, 'usernames/new.member'), { username: 'new.member' });
    await assertFails(duplicateBatch.commit());

    const publicLookup = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(publicLookup, 'usernames/new.member')));
    await assertFails(getDocs(collection(publicLookup, 'usernames')));
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

  it('allows compact local JPEG images in profiles and posts, but rejects invalid or oversized images', async () => {
    await seedApprovedMember('alice', 'Alice');
    const db = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const localImage = 'data:image/jpeg;base64,aGVsbG8=';
    const profileBatch = writeBatch(db);
    profileBatch.update(doc(db, 'accessRequests/alice'), { avatarUrl: localImage });
    profileBatch.set(doc(db, 'profiles/alice'), { avatarUrl: localImage }, { merge: true });
    await assertSucceeds(profileBatch.commit());

    const post = {
      authorUid: 'alice', authorName: 'Alice', authorRole: 'Founder', content: 'Local image',
      imageUrl: localImage, likes: [], comments: [], timestamp: new Date().toISOString(), createdAt: new Date(),
    };
    await assertSucceeds(setDoc(doc(db, 'posts/local-image'), post));

    const invalidBatch = writeBatch(db);
    const invalidImage = 'data:image/svg+xml;base64,PHN2Zz4=';
    invalidBatch.update(doc(db, 'accessRequests/alice'), { avatarUrl: invalidImage });
    invalidBatch.set(doc(db, 'profiles/alice'), { avatarUrl: invalidImage }, { merge: true });
    await assertFails(invalidBatch.commit());

    const oversizedBatch = writeBatch(db);
    const oversizedImage = `data:image/jpeg;base64,${'A'.repeat(110000)}`;
    oversizedBatch.update(doc(db, 'accessRequests/alice'), { avatarUrl: oversizedImage });
    oversizedBatch.set(doc(db, 'profiles/alice'), { avatarUrl: oversizedImage }, { merge: true });
    await assertFails(oversizedBatch.commit());
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

  it('allows safe HTTPS and bounded local JPEG profile images but rejects unsupported data URLs', async () => {
    await seedApprovedMember('alice', 'Alice');
    const db = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const privateRef = doc(db, 'accessRequests/alice');
    const publicRef = doc(db, 'profiles/alice');

    const unsafeBatch = writeBatch(db);
    unsafeBatch.update(privateRef, { avatarUrl: 'data:image/png;base64,AAA' });
    unsafeBatch.set(publicRef, { avatarUrl: 'data:image/png;base64,AAA' }, { merge: true });
    await assertFails(unsafeBatch.commit());

    const safeBatch = writeBatch(db);
    safeBatch.update(privateRef, { avatarUrl: 'https://images.example/alice.jpg' });
    safeBatch.set(publicRef, { avatarUrl: 'https://images.example/alice.jpg' }, { merge: true });
    await assertSucceeds(safeBatch.commit());

    const localJpegBatch = writeBatch(db);
    const localJpeg = 'data:image/jpeg;base64,AA==';
    localJpegBatch.update(privateRef, { avatarUrl: localJpeg });
    localJpegBatch.set(publicRef, { avatarUrl: localJpeg }, { merge: true });
    await assertSucceeds(localJpegBatch.commit());
  });

  it('requires HTTPS or a bounded local JPEG when a member adds an image to a post', async () => {
    await seedApprovedMember('alice', 'Alice');
    const db = testEnv.authenticatedContext('alice', { email: 'alice@elo.test' }).firestore();
    const postData = {
      authorUid: 'alice', authorName: 'Alice', authorRole: 'Founder', content: 'Hello',
      likes: [], comments: [], createdAt: new Date(),
    };

    await assertFails(setDoc(doc(db, 'posts/http-image'), {
      ...postData, imageUrl: 'http://images.example/photo.jpg',
    }));
    await assertFails(setDoc(doc(db, 'posts/unsupported-data-image'), {
      ...postData, imageUrl: 'data:image/png;base64,AA==',
    }));
    await assertSucceeds(setDoc(doc(db, 'posts/local-jpeg'), {
      ...postData, imageUrl: 'data:image/jpeg;base64,AA==',
    }));
    await assertSucceeds(setDoc(doc(db, 'posts/https-image'), {
      ...postData, imageUrl: 'https://images.example/photo.jpg',
    }));
  });
});

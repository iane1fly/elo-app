# Elo — Phase 1 professional network

Elo is a React, TypeScript, Vite and Firebase professional-network prototype. Phase 1 replaces local-only follows with persistent connection requests, scopes the member directory to approved/public profiles, adds real activity notifications, and implements direct messages that require an accepted connection. It is **not yet a full LinkedIn replacement**: jobs, company pages, group/community tools, email delivery, and production hosting are not included in this phase.

## Phase 1 functionality

- Email/password, Google and GitHub sign-in (each provider must be enabled in Firebase Authentication).
- Application and approval flow, with administrator access controlled by a Firebase custom claim—not a client-side hard-coded UID.
- Separate private `accessRequests/{uid}` records from safe, searchable public `profiles/{uid}` records. Profile visibility and meeting acceptance are persisted.
- Persistent, deterministic connection requests; recipients can accept or ignore, senders can cancel, and either member can end an accepted connection.
- A live inbox and direct conversations created on acceptance. Firestore rules check the accepted connection for every message write; ending a connection leaves the history readable but disables new sends.
- In-app notifications for connection requests, connection acceptance, and meeting requests; read state is persisted.
- Feed posts with owner edit/delete controls, likes, and comments. Uploaded post/profile images go to Firebase Storage; only their download URLs are saved in Firestore.
- Firestore and Storage rules deny unauthenticated/unapproved access and enforce member ownership and admin-only approval/event creation.
- Emulator-based tests for the main Firestore access-control paths.

## Local setup

1. Create/select a Firebase project and enable **Email/Password**, **Google**, and **GitHub** in Authentication. Complete the OAuth provider setup in Firebase.
2. Create a Firestore database in production mode and initialize Firebase Storage/bucket for the project.
3. Copy `.env.example` to `.env.local` and fill in the web-app configuration values from Firebase Project Settings. The Firebase web config identifies the project; access is enforced by the deployed rules.
4. Install and validate:

   ```bash
   npm install
   npm run check
   npm run test:rules
   npm run build
   ```

5. Deploy the database rules/indexes and Storage rules to the intended project:

   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project YOUR_FIREBASE_PROJECT_ID
   ```

   Review the target project carefully before deployment. This repository intentionally contains no production project ID, service-account key, or live Firebase credentials.

## First administrator and existing members

Administrator powers are granted by the Auth custom claim `admin: true`. They are not granted by an email address or by client-side code. Use a trusted Admin SDK credential with only the needed Firebase Authentication privileges; **never commit a service-account JSON file**.

```bash
export FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/to/service-account.json
npm run admin:claim -- FIREBASE_AUTH_UID on
```

The administrator should sign out and sign in again so the refreshed ID token contains the claim. To remove the privilege, run the same command with `off`.

Existing approved members need public profile mirrors to appear in the searchable directory. The migration defaults to a dry run and omits email/private application data:

```bash
npm run admin:backfill-profiles
npm run admin:backfill-profiles -- --apply
```

Run the write mode only after reviewing the dry-run counts and confirming the selected Firebase project. Existing public profile documents are left unchanged. New approvals create a public profile and update the private application atomically.

## Operational notes and current limits

- A live Firebase deployment was **not** made as part of this code change; this sandbox has no Firebase project credentials. Rules and indexes are ready to deploy after you configure the correct project and review the commands above.
- The rules suite currently covers application escalation, private/public profile access, request/accept notifications, forged requests, and post reactions/comments. It does not replace a full end-to-end QA pass against your actual Firebase project.
- Conversation history is currently limited to the latest 100 messages in the active chat; older-message pagination, unread/read receipts, attachments, blocking/reporting, and push notifications are later-phase work.
- Notification preferences are currently stored in this browser via local storage. Email notifications are not enabled. Production-grade cross-device preferences and notification delivery require a later backend step.
- Account deletion removes the auth user and the member's profile/application records, but cleanup of their historic posts, connection records, and Storage objects should be completed with a trusted backend workflow before broad production launch.
- Configure Firebase App Check, OAuth domains, hosting environment variables, monitoring, and backups before public launch.

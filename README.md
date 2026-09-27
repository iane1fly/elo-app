# Elo — Phase 1 professional network

Elo is a React, TypeScript, Vite and Firebase professional-network app. Phase 1 adds persistent connection requests, an approved-member directory, notifications, and direct messages limited to accepted connections. It is a solid early professional network, not a complete LinkedIn replacement: jobs, company pages, groups, email/push notifications, reporting/blocking, and production-grade account cleanup remain future work.

## What works in this phase

- Email/password, Google and GitHub sign-in.
- Member applications and approval, with admin access controlled by a Firebase custom claim rather than a client-side ID.
- Private account/application records kept separate from public directory profiles.
- Searchable public member profiles, persistent connection requests, accept/cancel/disconnect actions, and an in-app inbox.
- Direct-message writes are authorized only while a connection is accepted.
- In-app connection and meeting-request notifications.
- Feed posts, editing/deleting your own posts, likes, and comments.
- Profile and post images are supplied as **public HTTPS image links**. File uploads are intentionally disabled so Elo does not require a paid Firebase Storage plan.
- Firestore security rules and emulator tests for core access-control paths.

## Local setup and checks

1. In Firebase Authentication, enable Email/Password, Google, and GitHub. Complete each provider’s OAuth configuration.
2. Create a Firestore database. Firebase Storage is not needed for this free-plan version.
3. Copy `.env.example` to `.env.local` and add the web app’s Firebase configuration from Project Settings.
4. Install, test, and build:

   ```bash
   npm install
   npm run check
   npm run test:rules
   npm run build
   ```

## Existing members and production setup

The current Firebase project has older private profile records. The migration script defaults to a **dry run**. It reports counts only, then—only with `--apply`—adds normalized profile fields to existing approved private records and creates sanitized public profiles. It does not log member data; public documents contain only an explicit allowlist and never include email, subscription, or founder/admin flags.

```bash
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:backfill-profiles
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:backfill-profiles -- --apply
```

Admin operations use Application Default Credentials or another trusted Admin SDK credential. Never commit a service-account key.

The Firestore rules and indexes are deployed separately from the Vercel app:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

Review and confirm the selected Firebase project and production rules before applying them. The new rules protect private applications, gate feed/network data to approved members, require atomic connection/notification changes, and restrict messages to accepted connections.

Administrator powers use the Auth custom claim `admin: true`. The repository includes a one-time utility, but granting the claim changes account permissions and should be done only after confirming the exact account:

```bash
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:claim -- FIREBASE_AUTH_UID on
```

The administrator must sign out and back in for the new claim to appear. Use `off` to remove the claim.

## Known limits

- Conversation history currently loads the latest 100 messages; pagination, read receipts, attachments, moderation/blocking, and push/email delivery are not implemented.
- Notification preferences are stored in the current browser, not synchronized across devices.
- Account deletion does not yet clean up historical posts, connection records, or images hosted by third-party links.
- Configure authorized OAuth domains, Firebase App Check, monitoring, and backups before broad public launch.

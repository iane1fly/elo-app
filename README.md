# Elo — professional network

Elo is a React, TypeScript, Vite, and Firebase professional-network app. It includes a member directory, connection requests, notifications, direct messages restricted to accepted connections, and a feed. It is an early professional-network product, not a complete LinkedIn replacement: jobs, company pages, groups, email/push notifications, reporting/blocking, and production-grade account cleanup remain future work.

## What works

- Email/password, Google, and GitHub sign-in.
- **Self-service registration:** a new signed-in member completes a short profile and is activated immediately. New members do not wait for manual administrator approval.
- Older accounts still marked pending or rejected remain in the administrator workflow; this change does not silently promote those accounts.
- Private account records are kept separate from public directory profiles.
- Searchable public profiles, persistent connection requests, accept/cancel/disconnect actions, and an in-app inbox.
- Direct-message writes are authorized only while a connection is accepted.
- In-app connection and meeting-request notifications.
- Feed posts, editing/deleting your own posts, likes, and comments.
- Profile and post images can be selected from the device as JPG, PNG, or WebP. The browser reduces them to compact JPEGs before saving them inside Firestore; no Firebase Storage bucket or new paid service is required.
- Firestore security rules and emulator tests cover account creation, profile privacy, connection and messaging permissions, and image-size limits.

## Local setup and checks

1. In Firebase Authentication, enable Email/Password, Google, and GitHub. Complete each provider’s OAuth configuration.
2. Create a Firestore database. Firebase Storage is not used by this free-plan implementation.
3. Copy `.env.example` to `.env.local` and add the web app’s Firebase configuration from Project Settings.
4. Install, test, and build:

   ```bash
   npm install
   npm run check
   npm run test:rules
   npm run build
   ```

## Existing members and production setup

The profile migration script defaults to a **dry run**. It reports counts only, then—only with `--apply`—adds normalized profile fields to existing approved private records and creates sanitized public profiles. It does not log member data; public documents contain only an explicit allowlist and never include email, subscription, or founder/admin flags.

```bash
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:backfill-profiles
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:backfill-profiles -- --apply
```

Admin operations use Application Default Credentials or another trusted Admin SDK credential. Never commit a service-account key.

**Production note:** Vercel deployment and Firebase security-rule deployment are separate. New account registration will not work on production until the Firestore rules from this code version are deployed to the intended Firebase project. Confirm the Firebase project before running:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

The rules deliberately allow any authenticated user to create their own active account and matching public profile in one atomic operation; only an administrator can later change another member’s access. Existing members’ profiles and connection/message rules remain protected.

Administrator powers use the Auth custom claim `admin: true`. Granting the claim changes account permissions and should be done only after confirming the exact account:

```bash
FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID npm run admin:claim -- FIREBASE_AUTH_UID on
```

The administrator must sign out and back in for the new claim to appear. Use `off` to remove the claim.

## Known limits

- Images are compressed on the device and embedded in Firestore records to avoid a paid Storage dependency. This is suitable for a small early community, but image-heavy feeds/directories create larger reads and documents; a growing network should move images to object storage or a dedicated image service.
- Conversation history currently loads the latest 100 messages; pagination, read receipts, attachments, moderation/blocking, and push/email delivery are not implemented.
- Notification preferences are stored in the current browser, not synchronized across devices.
- Account deletion does not yet clean up historical posts or connection records.
- Configure authorized OAuth domains, Firebase App Check, monitoring, backups, and abuse controls before a broad public launch.

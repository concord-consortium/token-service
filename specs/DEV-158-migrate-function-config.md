# Migrate token-service Firebase Functions from Cloud Runtime Config

**Jira**: https://concord-consortium.atlassian.net/browse/DEV-158

**Status**: **Closed**

## Overview

The token-service is currently undeployable: Node 14 is blocked by Google Cloud Functions, and the `functions.config()` API will be fully blocked after March 31, 2026. This migration replaces `functions.config()` with parameterized configuration (`defineSecret`/`defineString`), upgrades the runtime to Node 22, and brings the entire dependency stack (firebase-functions v4, firebase-admin v12, AWS SDK v3, TypeScript 5, ESLint, Jest 29) to current supported versions — restoring deployability with no API changes.

## Requirements

- **R1**: Replace all `functions.config()` calls with Firebase v4 parameterized configuration (`defineSecret`/`defineString`).
  - `functions.config().firebase` → `admin.initializeApp()` (no argument needed in v4)
  - `admin.public_key` → `defineSecret("ADMIN_PUBLIC_KEY")`
  - `aws.key` → `defineSecret("AWS_KEY")`
  - `aws.secret` → `defineSecret("AWS_SECRET")`
  - `aws.rolearn` → `defineSecret("AWS_ROLE_ARN")`
  - `aws.duration` → `defineString("AWS_DURATION")`

- **R2**: Bind secrets to the `webApiV1` function export using the 1st-gen pattern: `functions.runWith({ secrets: [...] }).https.onRequest(app)`. (This service remains 1st-gen; migration to 2nd-gen is out of scope.)

- **R3**: Upgrade Node runtime from 14 to 22 (in `functions/package.json` engines field). Node 22 is the maximum supported version for 1st-gen Cloud Functions.

- **R4**: Upgrade `firebase-functions` from 3.13.1 to ^4.9.0 and `firebase-admin` from ^9.8.0 to ^12.7.0.

- **R5**: Migrate `aws-sdk` v2 to `@aws-sdk/client-sts` v3 in `functions/src/models/aws-utils.ts`. Delete the old mock at `functions/src/__mocks__/aws-sdk.ts` and create a new mock at `functions/src/__mocks__/@aws-sdk/client-sts.ts`.

- **R6**: Replace `tslint` with `eslint` (tslint is deprecated).

- **R7**: Upgrade TypeScript from ^3.8.3 to ^5.7.0.

- **R8**: Upgrade test tooling: `jest` ^29.7.0, `firebase-functions-test` ^3.4.0, `@firebase/rules-unit-testing` ^2.0.7 (with `firebase` ^9.23.0 as peer dep), `ts-jest` ^29.2.0.

- **R9**: Upgrade `firebase-tools` from ^9.11.0 to ^13.29.0 for v4 functions support.

- **R10**: All existing tests must pass after migration (same test coverage, same behavior).

- **R11**: No API behavior changes — all endpoints must return identical responses for identical inputs.

- **R11a**: Implement the entire migration as a single commit.

- **R12**: Provide local development support: secrets read from `functions/.secret.local`, non-secret config from `functions/.env`. These files replace `.runtimeconfig.json` and must be gitignored.

- **R13**: Provide a deployment checklist for exporting existing Runtime Config values and setting new secrets in Google Cloud Secret Manager for each Firebase project (staging, production). Notes: (1) `ADMIN_PUBLIC_KEY` is a multiline RSA PEM key requiring special handling. (2) Verify `secretmanager.secretAccessor` IAM role.

- **R14**: Update test setup to work with the new config mechanism (replace `firebaseFunctionsEnv.mockConfig()` with `process.env` mocking).

- **R15**: Delete `.travis.yml`, `s3_deploy.sh`, and `s3_website.yml` — CI/CD via Travis is no longer used.

- **R16**: Update `README.md` — rewrite Configuration and Development Setup sections for the new config mechanism.

- **R17**: Secret values (via `defineSecret`) must only be accessed within the request handler, not at module scope. Preserve the existing `getValidatedConfig()` per-request pattern.

## Technical Notes

### Critical: firebase-functions/v1 Import

Import must be `firebase-functions/v1`, not `firebase-functions`. In firebase-functions v4+, the default export switched to v2 (2nd-gen) as of September 2024. Importing from `firebase-functions` would cause `webApiV1` to deploy as a 2nd-gen function — a breaking architectural change.

### Config Interface Preserved

The `Config` interface (in `resource-types.ts`) is imported by 7 files and threaded through the entire credential generation chain. Keeping the interface unchanged and only changing how `getValidatedConfig()` populates it was the lowest-risk approach.

### Rollback

There is no rollback path. The current code cannot be redeployed because Node 14 is already blocked by Google Cloud Functions. Staging validation is mandatory before production deployment.

### ADMIN_PUBLIC_KEY Multiline Handling

The current code stores the RSA public key with literal `\n` escape sequences and converts at runtime. When migrating to Secret Manager, the actual PEM key with real newlines can be stored directly. The deployment checklist documents how to set and verify the multiline secret correctly.

### @firebase/rules-unit-testing v1 → v2

v1 has a peer dep on `firebase-admin ^9` which is incompatible with firebase-admin v12, so v2 is required. v2 peer-depends on the `firebase` client SDK (added as a dev dependency). The codebase only uses one function: `clearFirestoreData({ projectId })`, which becomes `testEnv.clearFirestore()` in v2.

### Implementation Discoveries

These issues were found during implementation and not in the original spec:
- `firebase-admin@^12.8.0` does not exist — use `^12.7.0`
- `supertest(webApiV1)` type incompatibility: firebase-functions v4's `HttpsFunction` type is not assignable to supertest's `App` type. Fixed by casting: `const app = webApiV1 as any;`
- `declare global { namespace Express { ... } }` needs `eslint-disable @typescript-eslint/no-namespace` wrapping

## Out of Scope

- New features or API changes.
- Client library (`client/`) changes — it has no dependency on server config.
- Example app (`example-app/`) changes — note: example-app also uses `aws-sdk` v2 (S3, Athena) but is a separate concern.
- IoT resource implementation (already marked as TODO/placeholder).
- Firestore rules or index changes.
- Upgrading `jsonwebtoken` or `express` — leave as-is, minimize scope; upgrade in a separate ticket if needed.
- Migration to 2nd-gen Cloud Functions.

## Deployment Checklist

### Pre-deployment: Export existing config

For each Firebase project (staging, default/production):

1. `firebase use <project-alias>`
2. `firebase functions:config:get > .runtimeconfig.json`
3. Note the values for `admin.public_key`, `aws.key`, `aws.secret`, `aws.rolearn`, `aws.duration`

### Pre-deployment: Set new secrets

For each Firebase project:

1. `firebase use <project-alias>`
2. Set each secret:
   - `firebase functions:secrets:set ADMIN_PUBLIC_KEY < path/to/public-key.pem`
   - `firebase functions:secrets:set AWS_KEY` (paste value when prompted)
   - `firebase functions:secrets:set AWS_SECRET` (paste value when prompted)
   - `firebase functions:secrets:set AWS_ROLE_ARN` (paste value when prompted)
3. Verify `ADMIN_PUBLIC_KEY` preserved its PEM newlines: `firebase functions:secrets:access ADMIN_PUBLIC_KEY` — should show a proper multi-line PEM block, not a single line.
4. Verify the Cloud Functions service account has `secretmanager.secretAccessor` role (Firebase typically grants this automatically)

### Pre-deployment: Set non-secret config

The `functions/.env.<projectId>` files are already committed to the repo:
- `functions/.env.token-service-staging` — staging
- `functions/.env.token-service-62822` — production

These are read by the Firebase CLI during deployment. Verify the `AWS_DURATION` value is correct for each project.

### Deploy to staging

1. `firebase use staging`
2. `firebase deploy --only functions`
3. Verify: hit `/api/v1/test?env=dev` — should return `{"status":"success","result":"test OK"}`
4. Verify: hit an authenticated endpoint to confirm secrets are accessible
5. Check Cloud Functions logs for any secret access errors

### Deploy to production

1. `firebase use default`
2. `firebase deploy --only functions`
3. Repeat verification steps from staging

### Post-deployment cleanup

1. Delete `.runtimeconfig.json` — it contains all secrets in plaintext and was only needed to read existing values during migration.

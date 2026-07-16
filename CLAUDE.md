# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Firebase-hosted service that lets browser apps obtain temporary AWS credentials (S3 folders, Athena workgroups) on behalf of users. Users authenticate with a Firebase JWT from the Concord portal, or with a resource-specific `readWriteToken`.

## Repository layout — three independent npm packages, no root package.json

- `functions/` — the actual service: a 1st-gen Firebase Cloud Function (`webApiV1`, Node 22) exposing an Express REST API at `/api/v1` (documented in `docs/api.md`).
- `client/` — the published `@concord-consortium/token-service` npm client library (single file: `client/src/client.ts`).
- `example-app/` — React demo app; depends on `client` via relative path (`"../client"`).

Run `npm i` separately in each directory you work in. There are no root-level scripts.

## Commands

All service development happens in `functions/`:

```bash
cd functions
npm run build              # tsc
npm run lint               # eslint src --ext .ts
npm start                  # build + firebase emulators (needs key.json, .env, .secret.local — see README)
npm run deploy:staging     # firebase deploy --project staging
npm run deploy             # firebase deploy --project default (production)
```

Testing (Jest, requires the Firestore emulator on port 8999):

```bash
npm run test:with-emulator                              # starts emulator, runs all tests, shuts down
# For iterating, start the emulator once in a separate terminal:
npm run firestore-emulator
npm test                                                # all tests
npm test -- src/helpers.test.ts                         # single test file
npm run test:watch
```

Client: `cd client && npm run build` (tsc, outputs to `lib/`). The example app consumes the *built* client — rebuild the client (or `npm run client:build` from `example-app/`) to pick up client changes; `cd example-app && npm start` runs the demo via webpack-dev-server.

## Architecture

### Cross-package type sharing (important)

`client/src/client.ts` imports directly from `../../functions/src/resource-types` and `../../functions/src/common-helpers`, and re-exports the types. Consequences:

- `resource-types.ts` and `common-helpers.ts` are client-facing: they must not import server-only dependencies (firebase-admin, AWS SDK, etc.). `firestore-types.ts` is the server-only counterpart.
- API-shape changes in `functions/` flow into the published client package; the client build compiles those functions files too (hence `main: lib/client/src/client.js`).

### Multi-environment via Firestore collection prefixes

Every API request requires an `env` query parameter (e.g. `staging`, `production`). It selects Firestore collections by name prefix: `{env}:resources` and `{env}:resourceSettings`. One Firebase project hosts multiple logical environments; there are also two Firebase projects (`.firebaserc`): `default` = production (`token-service-62822`), `staging` = `token-service-staging`.

### Request flow

`functions/src/index.ts` (Express routes, auth, config) → `resource-manager.ts` (Firestore CRUD, access-rule construction) → `models/*-resource-object.ts` (per-type behavior). For credentials: `createAWSKeys` → resource's `createKeys()` builds a scoped-down IAM policy → `models/aws-utils.ts` calls STS `AssumeRole`.

### Resource type class hierarchy

`BaseResourceObject` (`models/base-resource-object.ts`) defines permission checks (`isOwner`, `canUpdate`, `canCreateKeys`, ...) and `apiResult()`. Subclasses `S3ResourceObject`, `AthenaResourceObject`, `IotResourceObject` override `canCreateKeys`/`createKeys`/`apiResult`. To add a resource type, you must touch: the `resourceTypeObjects` map in `resource-manager.ts`, the type unions in `resource-types.ts` and `firestore-types.ts`, and a new model class.

A resource's behavior is configured by a matching `resourceSettings` document (per env, per `type`+`tool`), created manually in Firestore by admins — settings gate which `accessRuleType`s are allowed and hold AWS details (bucket, folder, region, account).

### Auth

Two credential kinds, distinguished by the `ReadWriteTokenPrefix` string prefix (`AuthClaims = JWTClaims | { readWriteToken }`):

- **Portal JWT** — RS256-verified against the `ADMIN_PUBLIC_KEY` secret; claims carry `user_id`/`platform_user_id`/`platform_id` (+ optional `class_hash` context). The literal token `"test"` bypasses verification with fixed test claims.
- **readWriteToken** — legacy, per-resource anonymous access; can read access rules and create keys, deliberately cannot update or delete resources.

GET/POST resource routes accept anonymous requests (a malformed token is a 403, not anonymous fallback); PATCH, DELETE, and `/credentials` require auth.

### Configuration

Firebase parameterized config (`defineSecret`/`defineString` in `index.ts`); secrets are bound to `webApiV1` via `runWith({ secrets })`. Secrets: `ADMIN_PUBLIC_KEY`, `AWS_KEY`, `AWS_SECRET`, `AWS_ROLE_ARN` (locally in `functions/.secret.local`). Env var: `AWS_DURATION` (locally in `functions/.env`, deployed via `.env.<projectId>`). See README for full setup including `key.json` admin credentials.

### Tests

Tests live next to source (`*.test.ts`) and run against the real Firestore emulator (`FIRESTORE_EMULATOR_HOST=localhost:8999`), not mocks. AWS STS is mocked via `functions/src/__mocks__/@aws-sdk/client-sts.ts`; JWT test keys are in `functions/src/test-utils/`.

# `authenticated` Access Rule Type Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let any user with a valid portal JWT obtain temporary AWS credentials for an S3-folder resource that carries an `authenticated` access rule.

**Architecture:** Add a fourth `AccessRuleType` (`"authenticated"`) to the existing per-resource access-rule system. `createResource` accepts it (JWT required, auto-adds an owner rule, gated by `allowedAccessRuleTypes` in `resourceSettings`), and `S3ResourceObject.canCreateKeys` grants credentials to any verified JWT when the rule is present. Update/delete/read-accessRules stay owner-only; Athena/IoT are unchanged. Design doc: `docs/plans/2026-07-15-authenticated-access-rule-design.md`.

**Tech Stack:** TypeScript, Firebase Cloud Functions (1st gen), Firestore, Jest + ts-jest, Firestore emulator, supertest.

---

## Context for the implementer

- Work happens in `functions/` unless stated otherwise. Branch: `authenticated-access-rule` (already created).
- **Test setup:** `index.test.ts` needs the Firestore emulator. Start it once in a separate terminal and leave it running:
  ```bash
  cd functions && npm run firestore-emulator
  ```
  Then run tests from `functions/` with `npm test -- <path>` (the script sets `FIRESTORE_EMULATOR_HOST=localhost:8999`). The model unit tests (`src/models/*.test.ts`) don't touch Firestore but use the same command.
- ts-jest runs with `diagnostics: false`, so a missing method fails at runtime ("... is not a function"), not at compile time.
- `resource-types.ts` is imported by the published client (`client/src/client.ts`) — it must not gain server-only imports.
- There is no `resource-manager.test.ts`; `createResource` behavior is tested through the `POST api/v1/resources` section of `src/index.test.ts`.

---

### Task 1: Add the `AuthenticatedAccessRule` type

**Files:**
- Modify: `functions/src/resource-types.ts:66-90`

**Step 1: Edit the type definitions**

In `functions/src/resource-types.ts`, change the `AccessRuleType` union and `AccessRule` union, and add the new interface after `ContextAccessRule`:

```ts
export type AccessRuleType = "user" | "readWriteToken" | "context" | "authenticated";
```

```ts
export type AccessRule = UserAccessRule | ReadWriteTokenAccessRule | ContextAccessRule | AuthenticatedAccessRule;
```

```ts
// Grants access to any user presenting a valid portal JWT, regardless of platform or user id.
// Credentials only — update/delete/read-accessRules still require an owner rule.
export interface AuthenticatedAccessRule {
  type: "authenticated";
}
```

**Step 2: Verify it compiles**

Run: `cd functions && npm run build`
Expected: exits 0, no errors.

**Step 3: Commit**

```bash
git add functions/src/resource-types.ts
git commit -m "feat: add authenticated access rule type definition"
```

---

### Task 2: `BaseResourceObject.hasAuthenticatedRule()`

**Files:**
- Modify: `functions/src/models/base-resource-object.ts` (add method after `isContextMember`, ~line 100)
- Test: `functions/src/models/base-resource-object.test.ts`

**Step 1: Write the failing tests**

In `base-resource-object.test.ts`, add a fixture next to the other rule fixtures (after `validReadWriteTokenRules`, ~line 101):

```ts
const authenticatedAccessRules: AccessRule[] = [
  {
    type: "authenticated"
  }
];
```

Add a describe block after the `#isContextMember` block (~line 205):

```ts
    describe("#hasAuthenticatedRule", () => {
      it("should fail when no authenticated rule is present", () => {
        expect(createBaseResource(validOwnerAccessRules).hasAuthenticatedRule()).toEqual(false);
        expect(createBaseResource([]).hasAuthenticatedRule()).toEqual(false);
      });
      it("should succeed when an authenticated rule is present", () => {
        expect(createBaseResource(authenticatedAccessRules).hasAuthenticatedRule()).toEqual(true);
      });
    });
```

**Step 2: Run the test to verify it fails**

Run: `cd functions && npm test -- src/models/base-resource-object.test.ts`
Expected: FAIL — `hasAuthenticatedRule is not a function`.

**Step 3: Write the minimal implementation**

In `base-resource-object.ts`, add after `isContextMember` (line 100):

```ts
  hasAuthenticatedRule(): boolean {
    // Grants access to any user with a valid portal JWT. The JWT itself is verified before
    // JWTClaims are constructed, so no claim matching is needed here.
    return !!this.accessRules.find((accessRule) => accessRule.type === "authenticated");
  }
```

**Step 4: Run the test to verify it passes**

Run: `cd functions && npm test -- src/models/base-resource-object.test.ts`
Expected: PASS (all tests in file).

**Step 5: Commit**

```bash
git add functions/src/models/base-resource-object.ts functions/src/models/base-resource-object.test.ts
git commit -m "feat: add hasAuthenticatedRule helper to BaseResourceObject"
```

---

### Task 3: S3 `canCreateKeys` honors the rule (JWT only)

**Files:**
- Modify: `functions/src/models/s3-resource-object.ts:43-50`
- Test: `functions/src/models/s3-resource-object.test.ts`

**Step 1: Write the failing tests**

In `s3-resource-object.test.ts`, add a fixture after `validReadWriteTokenRules` (~line 38):

```ts
const authenticatedAccessRules: AccessRule[] = [
  {
    type: "authenticated"
  }
];
```

Add after the test `"should allow keys to be created with owner claims or readWriteToken"` (~line 149):

```ts
    it("should allow keys to be created with any valid JWT claims when authenticated rule is present", () => {
      // invalidClaims are valid JWT claims that simply don't match any user/context rule.
      expect(createS3Resource(authenticatedAccessRules).canCreateKeys(invalidClaims)).toEqual(true);
      expect(createS3Resource(authenticatedAccessRules).canCreateKeys(validClaims)).toEqual(true);
    });

    it("should not allow keys to be created via readWriteToken when only authenticated rule is present", () => {
      // The authenticated rule requires a JWT; a readWriteToken auth must still match a readWriteToken rule.
      expect(createS3Resource(authenticatedAccessRules).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(false);
    });
```

**Step 2: Run the test to verify it fails**

Run: `cd functions && npm test -- src/models/s3-resource-object.test.ts`
Expected: FAIL — the first new test gets `false` where `true` is expected. (The second new test already passes; that's fine, it's a guard.)

**Step 3: Write the minimal implementation**

In `s3-resource-object.ts`, change the JWT branch of `canCreateKeys` (line 48) to:

```ts
      return this.isOwner(claims) || this.isMember(claims) || this.isContextMember(claims) || this.hasAccessToTargetUserData(claims) || this.hasAuthenticatedRule();
```

Do NOT touch the `readWriteToken` branch, `canUpdate`, `canDelete`, or `canReadAccessRules`.

**Step 4: Run the test to verify it passes**

Run: `cd functions && npm test -- src/models/s3-resource-object.test.ts`
Expected: PASS (all tests in file).

**Step 5: Commit**

```bash
git add functions/src/models/s3-resource-object.ts functions/src/models/s3-resource-object.test.ts
git commit -m "feat: grant S3 credentials to any valid JWT when authenticated rule present"
```

---

### Task 4: Regression test — Athena ignores the rule

No implementation change; this test pins the "S3 only" decision and is expected to pass immediately.

**Files:**
- Test: `functions/src/models/athena-resource-object.test.ts`

**Step 1: Write the test**

Add a fixture after `validReadWriteTokenRules` (~line 38):

```ts
const authenticatedAccessRules: AccessRule[] = [
  {
    type: "authenticated"
  }
];
```

Add after `"should allow keys to be created with owner claims"` (~line 96):

```ts
    it("should not allow keys to be created with only an authenticated rule (S3-only feature)", () => {
      expect(createAthenaResource(authenticatedAccessRules).canCreateKeys(validClaims)).toEqual(false);
    });
```

**Step 2: Run the test to verify it passes**

Run: `cd functions && npm test -- src/models/athena-resource-object.test.ts`
Expected: PASS. If it FAILS, stop — Athena's `canCreateKeys` is picking up the rule and the design has been violated.

**Step 3: Commit**

```bash
git add functions/src/models/athena-resource-object.test.ts
git commit -m "test: pin authenticated rule as S3-only (no effect on Athena)"
```

---

### Task 5: `createResource` accepts `accessRuleType: "authenticated"`

**Files:**
- Modify: `functions/src/resource-manager.ts:107-155` (rule construction in `createResource`)
- Test: `functions/src/index.test.ts` (inside `describe("POST api/v1/resources", ...)`)

**Step 1: Write the failing tests**

In `index.test.ts`, add `AuthenticatedAccessRule` to the existing import from `./resource-types` (line 9).

Add inside the `POST api/v1/resources` describe block, after the `"automatically adds 'user' access role type..."` test (~line 790):

```ts
    it("automatically adds 'user' access rule and requires JWT when 'authenticated' access rule is used", async () => {
      const settings = await createS3Settings({
        allowedAccessRuleTypes: ["user", "readWriteToken", "context", "authenticated"]
      });
      const createQuery: CreateQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc",
        accessRuleType: "authenticated"
      };
      const response = await supertest(app)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(createQuery)
        .expect(201);

      const json = checkResponse(response);
      expect(json.result.accessRules.length).toEqual(2);
      expect(json.result.accessRules[0]).toEqual({ type: "user", role: "owner", userId: user.userId, platformId: user.platformId } as UserAccessRule);
      expect(json.result.accessRules[1]).toEqual({ type: "authenticated" } as AuthenticatedAccessRule);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("returns an error when creating authenticated resource without authentication", async () => {
      const settings = await createS3Settings({
        allowedAccessRuleTypes: ["user", "readWriteToken", "context", "authenticated"]
      });
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(app)
        .post("/api/v1/resources")
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, { accessRuleType: "authenticated" }) as CreateQuery)
        .expect(400);
      const json = checkResponse(response, "error");
      expect(json.error).toContain("JWT claims missing");
    });

    it("returns an error when 'authenticated' is not in allowedAccessRuleTypes", async () => {
      // Default s3Settings fixture does NOT include "authenticated".
      const settings = await createS3Settings();
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(app)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, { accessRuleType: "authenticated" }) as CreateQuery)
        .expect(400);
      const json = checkResponse(response, "error");
      expect(json.error).toEqual(`"authenticated" access rule type is not allowed by test-tool settings!`);

      expect(await getResourcesCount()).toEqual(0);
    });
```

**Step 2: Run the tests to verify they fail**

Run (emulator must be running): `cd functions && npm test -- src/index.test.ts`
Expected: the first new test FAILS (400 `Unknown access rule type: authenticated` instead of 201). The other two may already pass (the allowlist check and claims check run before the unknown-type rejection) — the first test is the driver.

**Step 3: Write the minimal implementation**

In `functions/src/resource-manager.ts`:

1. Add `AuthenticatedAccessRule` to the import from `./resource-types` (lines 7-11).

2. Extend the auto-expansion (lines 108-112) so `"authenticated"` also keeps an owner rule:

```ts
        // query.accessRuleType is a string or array of strings
        const queryAccessRules: AccessRuleType[] =
          // if accessRuleType is equal to context or authenticated, automatically add "user", so the owner
          // of the resource always has access to it.
          query.accessRuleType === "context" ? [ "user", "context" ] :
          query.accessRuleType === "authenticated" ? [ "user", "authenticated" ] :
          (typeof query.accessRuleType === "string" ? [ query.accessRuleType ] : query.accessRuleType);
```

3. Add a branch in the rule-construction loop, after the `"readWriteToken"` branch (~line 150), before the final `else`:

```ts
          else if (accessRule === "authenticated") {
            if (!claims) {
              reject("JWT claims missing!");
              return;
            }
            accessRules.push({type: "authenticated"} as AuthenticatedAccessRule);
          }
```

**Step 4: Run the tests to verify they pass**

Run: `cd functions && npm test -- src/index.test.ts`
Expected: PASS (all tests in file).

**Step 5: Commit**

```bash
git add functions/src/resource-manager.ts functions/src/index.test.ts
git commit -m "feat: support authenticated access rule type in createResource"
```

---

### Task 6: End-to-end credentials test

Integration test through the HTTP API; expected to pass with no new implementation (Tasks 3+5 did the work).

**Files:**
- Test: `functions/src/index.test.ts` (inside `describe("POST api/v1/resources/:id/credentials", ...)`)

**Step 1: Write the test**

Add after `"returns credentials when user is a class/context member (JWT)"` (~line 1118):

```ts
    it("returns credentials for any valid JWT when resource has an authenticated rule", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [
          { type: "user", role: "owner", platformId: user.platformId, userId: "another-user-id" } as UserAccessRule,
          { type: "authenticated" } as AuthenticatedAccessRule
        ]
      });
      const response = await supertest(app)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);
      const json = checkResponse(response);
      expect(json.result).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken,
        expiration: fakeAwsCredentials.Expiration
      });
    });

    it("does not allow update or delete for non-owners even with an authenticated rule", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [
          { type: "user", role: "owner", platformId: user.platformId, userId: "another-user-id" } as UserAccessRule,
          { type: "authenticated" } as AuthenticatedAccessRule
        ]
      });
      await supertest(app)
        .patch("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .send({ description: "new description" })
        .query({ env: "dev" })
        .expect(400);
      await supertest(app)
        .delete("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(400);
      expect(await getResourcesCount()).toEqual(1);
    });
```

**Step 2: Run the tests to verify they pass**

Run: `cd functions && npm test -- src/index.test.ts`
Expected: PASS. If the credentials test fails, re-check Task 3; if the update/delete test fails, `canUpdate`/`canDelete` were touched by mistake.

**Step 3: Commit**

```bash
git add functions/src/index.test.ts
git commit -m "test: end-to-end coverage for authenticated access rule"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/api.md` (accessRuleType parameter description under `POST /api/v1/resources`)
- Modify: `README.md` (S3ResourceTool admin section, ~line 56)

**Step 1: Update docs/api.md**

Under `POST /api/v1/resources`, change the `accessRuleType` bullet to:

```markdown
- `accessRuleType` - user, context, readWriteToken or authenticated (string or array of strings). `context` and `authenticated` automatically add a `user` owner rule. `authenticated` grants credential access to any user with a valid portal JWT and must be enabled in the tool's `allowedAccessRuleTypes` settings; it applies to s3Folder resources only.
```

**Step 2: Update README.md**

In the "Creating new S3ResourceTools" example, update the comment on `allowedAccessRuleTypes`:

```javascript
  allowedAccessRuleTypes: ["user", "context"], // optionally "readWriteToken" or "authenticated" (any valid portal JWT can get credentials), check AccessRuleType type for all allowed values
```

**Step 3: Commit**

```bash
git add docs/api.md README.md
git commit -m "docs: document authenticated access rule type"
```

---

### Task 8: Client version bump and build check

The client re-exports `resource-types.ts`, so it picks up the new type automatically — verify it compiles and bump the version.

**Files:**
- Modify: `client/package.json:3` (`"version": "2.1.0"` → `"version": "2.2.0"`)

**Step 1: Bump the version**

In `client/package.json` change `"version": "2.1.0"` to `"version": "2.2.0"`.

**Step 2: Verify the client builds**

Run: `cd client && npm i && npm run build`
Expected: exits 0; `lib/` contains updated `.d.ts` files including `AuthenticatedAccessRule`.
Verify: `grep -r "AuthenticatedAccessRule" lib/ | head -3` shows matches.

**Step 3: Commit**

```bash
git add client/package.json
git commit -m "chore: bump client to 2.2.0 for authenticated access rule type"
```

(Publishing to npm — `npm publish` from `client/` — happens after merge, not in this plan.)

---

### Task 9: Full verification

**Step 1: Lint**

Run: `cd functions && npm run lint`
Expected: exits 0.

**Step 2: Build**

Run: `cd functions && npm run build`
Expected: exits 0.

**Step 3: Full test suite with a fresh emulator**

Stop any dev emulator, then:

Run: `cd functions && npm run test:with-emulator`
Expected: all test suites pass, 0 failures.

**Step 4: Fix anything that failed, re-run, and commit fixes**

Only then is the branch ready for review/PR.

---

## Out of scope (deliberate)

- Publishing the client to npm (post-merge step).
- Adding `"authenticated"` to any real environment's `resourceSettings` (manual admin/ops step, per environment).
- Honoring the rule in Athena/IoT `canCreateKeys`.

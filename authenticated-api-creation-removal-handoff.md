# Remove API creation of `authenticated` resources — Handoff

## Request

On the `authenticated-access-rule` branch, remove the ability to create or add an
`authenticated` access rule **through the REST API** (`POST /resources` and
`PATCH /resources/:id`). An `authenticated` rule should only ever be placed on a
resource by an admin editing the Firestore document directly (the same way tools and
`resourceSettings` are managed today).

The **credential-granting** side stays exactly as-is — a resource that carries an
`authenticated` rule still grants temporary S3 credentials to any valid portal JWT.

## Why

- We only want a small number of deliberately-provisioned shared folders to be
  world-writable. Those are created by an admin who picks the Firestore document id so
  it maps to a known S3 path (`{folder}/{id}/`). There is no use case for a non-admin
  minting an `authenticated` resource via the API.
- Credential-granting does **not** consult `allowedAccessRuleTypes` — see
  `hasAuthenticatedRule()` in
  [functions/src/models/base-resource-object.ts:102](functions/src/models/base-resource-object.ts#L102).
  It only checks the resource doc's `accessRules`. So the admin/Firestore-console
  workflow already works end-to-end **without** any allowlist entry, and the API
  create/PATCH allowlist gating is the *only* thing that lets ordinary users create
  these resources. Removing that gating closes the hole and deletes now-dead code.
- Net effect: this is a simplification. After the change, the only way an
  `authenticated` rule exists on a resource is a direct Firestore write.

## Code changes

### 1. `createResource` — reject `authenticated`

File: [functions/src/resource-manager.ts](functions/src/resource-manager.ts)

- Remove the `authenticated` auto-expansion branch at
  [line 111](functions/src/resource-manager.ts#L111)
  (`query.accessRuleType === "authenticated" ? [ "user", "authenticated" ]`).
- Remove the `else if (accessRule === "authenticated")` branch at
  [lines 151-157](functions/src/resource-manager.ts#L151-L157).
- Add an explicit rejection so **both** the string form (`accessRuleType:
  "authenticated"`) and the array form (`["authenticated"]`, `["user","authenticated"]`)
  are rejected with a clear message, regardless of whether the tool allowlists it and
  regardless of auth state. Suggested message:
  `"authenticated" access rules cannot be created via the API; add them directly in Firestore`.
  (Rejecting before the allowlist loop is cleanest — otherwise an allowlisted
  `authenticated` would fall through to the generic `"Unknown access rule type"` error.)

### 2. `updateResource` — reject PATCH that adds `authenticated`

File: [functions/src/resource-manager.ts](functions/src/resource-manager.ts)

- Replace the allowlist-gated block at
  [lines 201-212](functions/src/resource-manager.ts#L201-L212) with an **unconditional**
  rejection: if the incoming `accessRules` array contains a `type: "authenticated"`
  rule, reject with the same message as above. The tool-settings lookup
  (`getResourceSettings` / `allowedAccessRuleTypes` check) added for this can be deleted.

### 3. Leave the credential path untouched

Do **not** change:
- `AuthenticatedAccessRule` / `AccessRuleType` in
  [functions/src/resource-types.ts](functions/src/resource-types.ts) — resources still
  carry the rule; the client re-export stays.
- `hasAuthenticatedRule()` in
  [base-resource-object.ts:102](functions/src/models/base-resource-object.ts#L102).
- `canCreateKeys` in
  [s3-resource-object.ts:42](functions/src/models/s3-resource-object.ts#L42).

## Tests

All create/PATCH `authenticated` tests are end-to-end in
[functions/src/index.test.ts](functions/src/index.test.ts). Update these:

**POST create — flip from success/allowlist to always-rejected:**
- `index.test.ts:812` "automatically adds 'user' access rule and requires JWT when
  'authenticated' access rule is used" → now expect a 400 rejection.
- `index.test.ts:857` "returns an error when 'authenticated' is not in
  allowedAccessRuleTypes" → keep as a rejection but update the expected error message
  (rejection no longer depends on the allowlist).
- `index.test.ts:838` and `index.test.ts:878` (anonymous / array form) → still
  rejections; update messages to the new one. Consider collapsing the create cases into
  one or two tests: "string form rejected" and "array form rejected", each asserting the
  new message and that no resource is written.

**PATCH — flip from allowlist-gated to always-rejected:**
- `index.test.ts:1143`, `index.test.ts:1163`, `index.test.ts:1185` → all three become
  "PATCH adding an authenticated rule is always rejected". The
  `1163` "allows adding … when tool settings allow it" case in particular must change
  from success to rejection.

**Keep unchanged (credential + permission side — these seed the rule directly into the
resource doc, so they don't depend on the create path):**
- `index.test.ts:1288` "returns credentials for any valid JWT when resource has an
  authenticated rule".
- `index.test.ts:1310` "does not allow update or delete for non-owners even with an
  authenticated rule".
- `functions/src/models/s3-resource-object.test.ts`,
  `functions/src/models/base-resource-object.test.ts`,
  `functions/src/models/athena-resource-object.test.ts`.

Run: `npm run test:with-emulator` (or start `npm run firestore-emulator` and
`npm test`) from `functions/`.

## Docs

- [docs/api.md](docs/api.md): in the `POST /api/v1/resources` section
  ([line 32](docs/api.md#L32)) drop `authenticated` from the list of `accessRuleType`
  values and remove the sentence describing it as an API-creatable value. In the
  `PATCH` section, replace the note at
  [docs/api.md:45](docs/api.md#L45) with one stating that `authenticated` rules cannot
  be set via the API and are added directly to the resource document by an admin. The
  `POST /credentials` note ([line 53](docs/api.md#L53)) stays.
- README admin section: remove/adjust the guidance that presents `"authenticated"` as
  an `allowedAccessRuleTypes` value to enable — it no longer gates anything. Document
  instead that an admin adds a `{ "type": "authenticated" }` entry to the resource
  document's `accessRules` (choosing the doc id to match the desired
  `{folder}/{id}/` S3 path). **Explicitly call out that `authenticated` is special:**
  unlike `user`/`context`/`readWriteToken` — where adding the type to
  `allowedAccessRuleTypes` is what enables API creation of resources with that rule —
  `authenticated` is never created through the API, so it does not belong in
  `allowedAccessRuleTypes` and listing it there has no effect.
- [docs/plans/2026-07-15-authenticated-access-rule-design.md](docs/plans/2026-07-15-authenticated-access-rule-design.md):
  add a short note recording this decision (API creation removed; rule is
  admin/Firestore-only; `allowedAccessRuleTypes` gating for `authenticated` dropped).

## Notes / decisions

- **`allowedAccessRuleTypes` and `authenticated` (decided):** we explicitly reject any
  attempt to create a resource carrying an `authenticated` rule (via `POST` or `PATCH`),
  but we do **not** add any handling for listing `"authenticated"` in a tool's
  `allowedAccessRuleTypes`. That settings field is admin-managed config edited directly
  in Firestore, not user-submitted through the API, so there is no attack surface to
  defend — adding validation there would be dead complexity. Listing `"authenticated"`
  is simply an inert no-op; do not reject, strip, or warn on it in code.
- **This is a documentation-only asymmetry to call out:** for every *other* access rule
  type (`user`, `context`, `readWriteToken`), adding it to `allowedAccessRuleTypes` is
  what enables creating resources with that rule via the API — so admins reasonably
  expect the same of `authenticated`. `authenticated` is special: it is **not** created
  through the API at all, so `allowedAccessRuleTypes` has no effect on it. The README /
  docs must make this explicit so an admin doesn't add `"authenticated"` to
  `allowedAccessRuleTypes` expecting it to do something. State plainly: an
  `authenticated` rule is added directly to a resource document's `accessRules` by an
  admin, and does not belong in `allowedAccessRuleTypes`.
- **Client version:** the type surface doesn't change (the `AuthenticatedAccessRule`
  type stays exported), so the 2.2.0 bump already on the branch is still fine; no
  further bump needed for this change.

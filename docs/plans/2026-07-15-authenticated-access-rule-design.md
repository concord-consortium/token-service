# Design: `authenticated` access rule type

**Date**: 2026-07-15
**Status**: Approved

## Goal

Allow any user with a valid portal JWT to obtain temporary AWS credentials (S3 read/write) for a resource, without a per-user, per-context, or token-based access rule naming them.

## Decisions

- **Scope**: any JWT that verifies against `ADMIN_PUBLIC_KEY`, regardless of issuing portal (`platform_id` is not checked).
- **Permissions granted**: credentials only. Update, delete, and reading `accessRules` remain owner-only.
- **Resource types**: honored by S3 folders only. Athena and IoT `canCreateKeys` are unchanged.
- **Approach**: a new `AccessRuleType` (`"authenticated"`), rejected alternatives:
  - Settings-level flag on `resourceSettings` — all-or-nothing per tool, splits authorization logic across two places.
  - Shared `readWriteToken` — a bearer secret, does not actually require a portal JWT.

## Data model

In `functions/src/resource-types.ts`:

```ts
export type AccessRuleType = "user" | "readWriteToken" | "context" | "authenticated";

export interface AuthenticatedAccessRule {
  type: "authenticated";   // no other fields — any valid portal JWT qualifies
}

export type AccessRule = UserAccessRule | ReadWriteTokenAccessRule | ContextAccessRule | AuthenticatedAccessRule;
```

No Firestore schema or index changes — `accessRules` is already a free-form array on resource docs.

## Resource creation (`functions/src/resource-manager.ts`)

Add an `"authenticated"` branch to `createResource`'s rule-construction loop, mirroring `"context"`:

- Requires JWT claims; anonymous creation is rejected (`"JWT claims missing!"`), so an open resource always has an accountable creator.
- `accessRuleType: "authenticated"` auto-expands to `["user", "authenticated"]`, so the creator keeps an owner rule and retains update/delete control.
- Gated by the existing `settings.allowedAccessRuleTypes` check; tools that do not allowlist `"authenticated"` reject it with the existing error.

Owners of existing resources can add the rule via `PATCH /api/v1/resources/:id`; `updateResource` already applies an owner-supplied `accessRules` array verbatim.

## Permission checks

- `functions/src/models/base-resource-object.ts`: new helper `hasAuthenticatedRule(): boolean` — true if `accessRules` contains a `type: "authenticated"` rule.
- `functions/src/models/s3-resource-object.ts` `canCreateKeys`, JWT branch only:

  ```ts
  return this.isOwner(claims) || this.isMember(claims) || this.isContextMember(claims)
      || this.hasAccessToTargetUserData(claims) || this.hasAuthenticatedRule();
  ```

  Reaching this branch already proves the JWT verified against `ADMIN_PUBLIC_KEY`; the rule needs no claim matching.
- Unchanged: `canUpdate`, `canDelete`, `canReadAccessRules` (owner-only), the `readWriteToken` branch of `canCreateKeys`, and Athena/IoT `canCreateKeys`.

## API, client, docs

- No new endpoints; no request/response shape changes.
- Client picks up the new types via its re-export of `resource-types.ts`. Bump `@concord-consortium/token-service` to 2.2.0 and republish after merge.
- Update `docs/api.md` (accessRuleType values) and the README admin section (`"authenticated"` as an `allowedAccessRuleTypes` value).

## Testing (TDD, against the Firestore emulator)

- `resource-manager.test`: create with `"authenticated"` stores owner + authenticated rules; anonymous create rejected; rejected when not in `allowedAccessRuleTypes`.
- `s3-resource-object.test`: non-owner JWT gets keys when rule present; denied when absent; readWriteToken claims do not qualify via this rule; `canUpdate`/`canDelete` still denied for non-owners.
- `athena-resource-object.test`: rule has no effect on Athena.
- `index.test`: end-to-end `POST /credentials` with the `"test"` JWT against a resource carrying the rule.

## Rollout / ops

Per environment, an admin adds `"authenticated"` to `allowedAccessRuleTypes` in the target tool's `resourceSettings` doc; the feature is inert until then. Every credential grant is still scoped to the single resource's folder (`{folder}/{id}/`), but any portal user can write there — enable only for tools where shared write is intended.

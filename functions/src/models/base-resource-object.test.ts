import { BaseResourceObject } from "./base-resource-object";
import { AccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix } from "../resource-types";
import { FireStoreResourceSettings, JWTClaims } from "../firestore-types";

const config = {
  admin: {
    public_key: "test-public-key"
  },
  aws: {
    key: "test-aws-key",
    secret: "test-aws-secret",
    rolearn: "test-rolearn",
    duration: 3600
  }
};

const validOwnerAccessRules: AccessRule[] = [
  {
    type: "user",
    role: "owner",
    platformId: "test-platform-id",
    userId: "test-user-id"
  }
];
const invalidOwnerAccessRules: AccessRule[] = [
  {
    type: "user",
    role: "owner",
    platformId: "invalid-test-platform-id",
    userId: "invalid-test-user-id"
  }
];

const validMemberAccessRules: AccessRule[] = [
  {
    type: "user",
    role: "member",
    platformId: "test-platform-id",
    userId: "test-user-id"
  }
];
const invalidMemberAccessRules: AccessRule[] = [
  {
    type: "user",
    role: "member",
    platformId: "invalid-test-platform-id",
    userId: "invalid-test-user-id"
  }
];

const validContextAccessRules: AccessRule[] = [
  // User access rule is not necessary, but the context rule pretty much never exists on its own
  {
    type: "user",
    role: "owner",
    platformId: "test-platform-id",
    userId: "another-user-id"
  },
  {
    type: "context",
    platformId: "test-platform-id",
    contextId: "test-context-id"
  }
];
const invalidContextAccessRules: AccessRule[] = [
  // User access rule is not necessary, but the context rule pretty much never exists on its own
  {
    type: "user",
    role: "owner",
    platformId: "test-platform-id",
    userId: "another-user-id"
  },
  {
    type: "context",
    platformId: "invalid-test-platform-id",
    contextId: "invalid-test-context-id"
  }
];

const invalidReadWriteTokenRules: ReadWriteTokenAccessRule[] = [
  {
    type: "readWriteToken",
    readWriteToken: "invalid-prefix:test-token-1"
  },
  {
    type: "readWriteToken",
    readWriteToken: "invalid-prefix:test-token-2"
  }
];
const validReadWriteToken1 = ReadWriteTokenPrefix + "test-token-1";
const validReadWriteToken2 = ReadWriteTokenPrefix + "test-token-2";
const validReadWriteTokenRules: ReadWriteTokenAccessRule[] = [
  {
    type: "readWriteToken",
    readWriteToken: validReadWriteToken1
  },
  {
    type: "readWriteToken",
    readWriteToken: validReadWriteToken2
  }
];

const invalidClaims: JWTClaims = {
  platform_id: "invalid-test-platform-id",
  platform_user_id: "invalid-1",
  user_id: "invalid-test-user-id",
  class_hash: "invalid-test-context-id"
};
const validClaims: JWTClaims = {
  platform_id: "test-platform-id",
  platform_user_id: "1",
  user_id: "test-user-id",
  class_hash: "test-context-id"
};
const validClaimsWithTargetUserId: JWTClaims = {
  platform_id: "test-platform-id",
  platform_user_id: "researcher-1",
  user_id: "researcher-1",
  target_user_id: "test-user-id",
  class_hash: "test-context-id"
};

const createBaseResource = (accessRules: AccessRule[] = []) => {
  return new BaseResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "glossary",
    accessRules
  });
};

describe("Resource", () => {
  describe("BaseResourceObject", () => {
    describe("apiResult", () => {
      it("should return an apiResult without access rules when auth claims are not provided", () => {
        expect(createBaseResource().apiResult(undefined)).toEqual({
          id: "test",
          name: "test",
          description: "test",
          type: "s3Folder",
          tool: "glossary"
        });
      });
      it("should return an apiResult with access rules when auth claims are provided and valid", () => {
        expect(createBaseResource(validOwnerAccessRules).apiResult(validClaims)).toEqual({
          id: "test",
          name: "test",
          description: "test",
          type: "s3Folder",
          tool: "glossary",
          accessRules: validOwnerAccessRules
        });
      });
    });

    it("should not allow keys to be created", () => {
      expect(createBaseResource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should not create keys", async () => {
      await expect(createBaseResource().createKeys(config, {} as FireStoreResourceSettings)).rejects.toEqual("Implement createKeys in subclass");
    });

    describe("#hasUserRole", () => {
      it("should fail with invalid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).hasUserRole(invalidClaims, "owner")).toEqual(false);
      });
      it("should fail with invalid access rules", () => {
        expect(createBaseResource(invalidOwnerAccessRules).hasUserRole(validClaims, "owner")).toEqual(false);
      });
      it("should succeed with valid rules and claims", () => {
        expect(createBaseResource(validOwnerAccessRules).hasUserRole(validClaims, "owner")).toEqual(true);
      });
    });

    describe("#isOwner", () => {
      it("should fail with invalid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).isOwner(invalidClaims)).toEqual(false);
        expect(createBaseResource(invalidOwnerAccessRules).isOwner(validClaims)).toEqual(false);
      });
      it("should succeed with valid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).isOwner(validClaims)).toEqual(true);
      });
    });

    describe("#isMember", () => {
      it("should fail with invalid claims", () => {
        expect(createBaseResource(validMemberAccessRules).isMember(invalidClaims)).toEqual(false);
        expect(createBaseResource(invalidMemberAccessRules).isMember(validClaims)).toEqual(false);
      });
      it("should succeed with valid claims", () => {
        expect(createBaseResource(validMemberAccessRules).isMember(validClaims)).toEqual(true);
      });
    });

    describe("#isContextMember", () => {
      it("should fail if context access rule doesn't match claims", () => {
        expect(createBaseResource(invalidContextAccessRules).isContextMember(validClaims)).toEqual(false);
        expect(createBaseResource(validContextAccessRules).isContextMember(invalidClaims)).toEqual(false);
      });
      it("should succeed when context access rule matches claims", () => {
        expect(createBaseResource(validContextAccessRules).isContextMember(validClaims)).toEqual(true);
      });
    });

    describe("#hasAccessToTargetUserData", () => {
      it("should fail if owner access rule doesn't match claims with target_user_id", () => {
        expect(createBaseResource(invalidOwnerAccessRules).hasAccessToTargetUserData(validClaimsWithTargetUserId)).toEqual(false);
      });
      it("should succeed when owner access rule matches claims with target_user_id", () => {
        expect(createBaseResource(validOwnerAccessRules).hasAccessToTargetUserData(validClaimsWithTargetUserId)).toEqual(true);
      });
    });

    describe("#isReadWriteTokenValid", () => {
      it("should fail if tokens don't use ReadWriteTokenPrefix", () => {
        expect(createBaseResource(invalidReadWriteTokenRules).isReadWriteTokenValid(validReadWriteToken1)).toEqual(false);
        expect(createBaseResource(invalidReadWriteTokenRules).isReadWriteTokenValid(validReadWriteToken2)).toEqual(false);
      });
      it("should fail with token that don't match values in access rules", () => {
        expect(createBaseResource(validReadWriteTokenRules).isReadWriteTokenValid("invalid-token")).toEqual(false);
      });
      it("should succeed with valid token", () => {
        expect(createBaseResource(validReadWriteTokenRules).isReadWriteTokenValid(validReadWriteToken1)).toEqual(true);
        expect(createBaseResource(validReadWriteTokenRules).isReadWriteTokenValid(validReadWriteToken2)).toEqual(true);
      });
    });
  });
});

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
    s3credentials: {
      rolearn: "test-rolearn",
      duration: 3600
    }
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
  user_id: "invalid-test-user-id"
};
const validClaims: JWTClaims = {
  platform_id: "test-platform-id",
  platform_user_id: "1",
  user_id: "test-user-id"
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
      });
      it("should succeed with valid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).isOwner(validClaims)).toEqual(true);
      });
    });

    describe("#isOwnerOrMember", () => {
      it("should fail with invalid owner access rules and valid claims", () => {
        expect(createBaseResource(invalidOwnerAccessRules).isOwnerOrMember(validClaims)).toEqual(false);
      });
      it("should fail with valid owner access rules and invalid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).isOwnerOrMember(invalidClaims)).toEqual(false);
      });
      it("should succeed with valid member access rules and valid claims", () => {
        expect(createBaseResource(validOwnerAccessRules).isOwnerOrMember(validClaims)).toEqual(true);
      });

      it("should fail with invalid owner access rules and valid claims", () => {
        expect(createBaseResource(invalidMemberAccessRules).isOwnerOrMember(validClaims)).toEqual(false);
      });
      it("should fail with valid owner access rules and invalid claims", () => {
        expect(createBaseResource(validMemberAccessRules).isOwnerOrMember(invalidClaims)).toEqual(false);
      });
      it("should succeed with valid member access rules and valid claims", () => {
        expect(createBaseResource(validMemberAccessRules).isOwnerOrMember(validClaims)).toEqual(true);
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

    // TODO: add tests for static Firestore member functions
  });
});

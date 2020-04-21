import { BaseResourceObject, S3ResourceObject, IotResourceObject } from "./base-resource-object";
import { AccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix } from "./resource-types";
import { FireStoreResourceSettings, FireStoreS3ResourceSettings, JWTClaims } from "./firestore-types";
import { fakeAwsCredentials } from "./__mocks__/aws-sdk";

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

const createS3Resource = (accessRules: AccessRule[] = []) => {
  return new S3ResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "glossary",
    accessRules
  });
};

const createS3VortexConfig = (accessRules: AccessRule[] = []) => {
  return new S3ResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "vortex",
    accessRules
  });
};

const createIotResource = (accessRules: AccessRule[] = []) => {
  return new IotResourceObject("test", {
    name: "test",
    description: "test",
    type: "iotOrganization",
    tool: "dataFlow",
    accessRules,
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

  describe("S3ResourceObject", () => {
    describe("apiResult", () => {
      it("should return default public path based on bucket when settings don't include domain", () => {
        expect(createS3Resource().apiResult(
          undefined,
          {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreResourceSettings)
        ).toEqual({
          id: "test",
          name: "test",
          description: "test",
          type: "s3Folder",
          tool: "glossary",
          bucket: "test-bucket",
          folder: "test-folder",
          region: "test-region",
          publicPath: "test-folder/test/",
          publicUrl: "https://test-bucket.s3.amazonaws.com/test-folder/test/"
        });
      });

      it("should return custom public path based on bucket when settings include domain", () => {
        expect(createS3Resource().apiResult(
          undefined,
          {bucket: "test-bucket", folder: "test-folder", region: "test-region", domain: "https://cloudfront.domain.com"} as FireStoreResourceSettings)
        ).toEqual({
          id: "test",
          name: "test",
          description: "test",
          type: "s3Folder",
          tool: "glossary",
          bucket: "test-bucket",
          folder: "test-folder",
          region: "test-region",
          publicPath: "test-folder/test/",
          publicUrl: "https://cloudfront.domain.com/test-folder/test/"
        });
      });
    });

    it("should be capable of creating vortex configurations", () => {
      expect(createS3VortexConfig().apiResult(
        undefined,
        {bucket: "test-vortex-bucket", folder: "test-vortex-folder", region: "test-vortex-region",} as FireStoreResourceSettings)
      ).toEqual({
        bucket: "test-vortex-bucket",
        description: "test",
        folder: "test-vortex-folder",
        id: "test",
        name: "test",
        publicPath: "test-vortex-folder/test/",
        publicUrl: "https://test-vortex-bucket.s3.amazonaws.com/test-vortex-folder/test/",
        region: "test-vortex-region",
        tool: "vortex",
        type: "s3Folder"
      })
    });
    it("should not allow keys to be created without access rules", () => {
      expect(createS3Resource([]).canCreateKeys(validClaims)).toEqual(false);
      expect(createS3Resource([]).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(false);
    });

    it("should not allow keys to be created without valid claims or readWriteToken", () => {
      expect(createS3Resource(validOwnerAccessRules).canCreateKeys(invalidClaims)).toEqual(false);
      expect(createS3Resource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: "invalid-token" })).toEqual(false);
    });

    it("should allow keys to be created with owner claims or readWriteToken", () => {
      expect(createS3Resource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(true);
      expect(createS3Resource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(true);
    });

    it("should create keys", async () => {
      const keys = await createS3Resource().createKeys(config, {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreS3ResourceSettings);
      expect(keys).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        bucket: "test-bucket",
        expiration: fakeAwsCredentials.Expiration,
        keyPrefix: "test-folder/test/",
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken
      });
    });
  });

  describe("IotResourceObject", () => {
    it("should return an apiResult", () => {
      expect(createIotResource().apiResult(undefined)).toEqual({
        id: "test",
        name: "test",
        description: "test",
        type: "iotOrganization",
        tool: "dataFlow"
      });
    });

    it("should not allow keys to be created without access rules", () => {
      expect(createIotResource([]).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should not allow keys to be created without valid claims or readWriteToken", () => {
      expect(createIotResource(validOwnerAccessRules).canCreateKeys(invalidClaims)).toEqual(false);
      expect(createIotResource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: "invalid-token" })).toEqual(false);
    });

    it("should allow keys to be created with owner claims", () => {
      // TODO: change toEqual to true after implementing IotResourceObject#canCreateKeys
      expect(createIotResource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(false);
      expect(createIotResource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(false);
    });

    it("should create keys", async () => {
      // TODO: change after implemeting otResourceObject#createKeys
      await expect(createIotResource().createKeys(config)).rejects.toEqual("TODO: implement create keys");
    });
  });
});

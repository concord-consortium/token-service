import { S3ResourceObject, IotResourceObject, BaseResourceObject } from "./resource";
import { AccessRule } from "./resource-types";
import { JWTClaims } from "./firestore-types";
import { STS, AWSError } from "aws-sdk";

const expiration = new Date();
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

STS.prototype.assumeRole = jest.fn((params, callback?) => {
  if (callback) {
    callback(null as unknown as AWSError, {
      Credentials: {
        AccessKeyId: "test-key-id",
        Expiration: expiration,
        SecretAccessKey: "test-secret-access-key",
        SessionToken: "test-session-token",
      }
    })
  }
}) as any;

const createBaseResource = (accessRules: AccessRule[] = []) => {
  return new BaseResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "glossary",
    accessRules,
    bucket: "test-bucket",
    folder: "test-folder",
    region: "test-region"
  });
};

const createS3Resource = (accessRules: AccessRule[] = []) => {
  return new S3ResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "glossary",
    accessRules,
    bucket: "test-bucket",
    folder: "test-folder",
    region: "test-region"
  });
};

const createS3VortexConfig = (accessRules: AccessRule[] = []) => {
  return new S3ResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool: "vortex",
    accessRules,
    bucket: "test-vortex-bucket",
    folder: "test-vortex-folder",
    region: "test-vortex-region"
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
    it("should return an apiResult", () => {
      expect(createBaseResource().apiResult()).toEqual({
        id: "test",
        name: "test",
        description: "test",
        type: "s3Folder",
        tool: "glossary",
        accessRules: []
      });
    });

    it("should not allow keys to be created", () => {
      expect(createBaseResource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should not create keys", async () => {
      await expect(createBaseResource().createKeys(config)).rejects.toEqual("Implement createKeys in subclass");
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

    // TODO: add tests for static Firestore member functions
  });

  describe("S3ResourceObject", () => {
    it("should return an apiResult", () => {
      expect(createS3Resource().apiResult()).toEqual({
        id: "test",
        name: "test",
        description: "test",
        type: "s3Folder",
        tool: "glossary",
        accessRules: [],
        bucket: "test-bucket",
        folder: "test-folder",
        region: "test-region"
      });
    });

    it("should be capable of creating vortex configurations", () => {
      expect(createS3VortexConfig().apiResult()).toEqual({
        accessRules: [],
        bucket: "test-vortex-bucket",
        description: "test",
        folder: "test-vortex-folder",
        id: "test",
        name: "test",
        region: "test-vortex-region",
        tool: "vortex",
        type: "s3Folder"
      })
    })

    it("should not allow keys to be created without access rules", () => {
      expect(createS3Resource([]).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should not allow keys to be created without valid claims", () => {
      expect(createS3Resource(validOwnerAccessRules).canCreateKeys(invalidClaims)).toEqual(false);
    });

    it("should allow keys to be created with owner claims", () => {
      expect(createS3Resource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(true);
    });

    it("should create keys", async () => {
      const keys = await createS3Resource().createKeys(config);
      expect(STS.prototype.assumeRole).toBeCalledTimes(1);
      expect(keys).toEqual({
        accessKeyId: "test-key-id",
        bucket: "test-bucket",
        expiration,
        keyPrefix: "test-folder/test/",
        secretAccessKey: "test-secret-access-key",
        sessionToken: "test-session-token"
      });
    });
  });

  describe("IotResourceObject", () => {
    it("should return an apiResult", () => {
      expect(createIotResource().apiResult()).toEqual({
        id: "test",
        name: "test",
        description: "test",
        type: "iotOrganization",
        tool: "dataFlow",
        accessRules: []
      });
    });

    it("should not allow keys to be created without access rules", () => {
      expect(createIotResource([]).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should not allow keys to be created without valid claims", () => {
      expect(createIotResource(validOwnerAccessRules).canCreateKeys(invalidClaims)).toEqual(false);
    });

    it("should allow keys to be created with owner claims", () => {
      // TODO: change toEqual to true after implementing IotResourceObject#canCreateKeys
      expect(createIotResource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(false);
    });

    it("should create keys", async () => {
      // TODO: change after implemeting otResourceObject#createKeys
      await expect(createIotResource().createKeys(config)).rejects.toEqual("TODO: implement create keys");
    });
  });

});
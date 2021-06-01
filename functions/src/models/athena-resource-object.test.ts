import { AthenaResourceObject } from "./athena-resource-object";
import { AccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix } from "../resource-types";
import { FireStoreAthenaWorkgroupSettings, JWTClaims, FireStoreResourceSettings } from "../firestore-types";
import { fakeAwsCredentials, mockAssumeRole } from "../__mocks__/aws-sdk";
// This should be mocked version
// import { mockAssumeRole } from "aws-sdk";

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

const createAthenaResource = (accessRules: AccessRule[] = [], tool: string = "athena-reports") => {
  return new AthenaResourceObject("id1234", {
    name: "test",
    description: "test",
    type: "athenaWorkgroup",
    tool,
    accessRules
  });
};

describe("Resource", () => {
  describe("AthenaResourceObject", () => {
    describe("apiResult", () => {
      it("should return the region in addition to the other standard properties", () => {
        expect(createAthenaResource().apiResult(
          undefined,
          {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreResourceSettings)
        ).toEqual({
          id: "id1234",
          name: "test",
          description: "test",
          type: "athenaWorkgroup",
          tool: "athena-reports",
          region: "test-region",
          workgroupName: "test-id1234"
        });
      });
    });

    it("should not allow keys to be created without access rules", () => {
      expect(createAthenaResource([]).canCreateKeys(validClaims)).toEqual(false);
      expect(createAthenaResource([]).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(false);
    });

    it("should not allow keys to be created without valid claims or readWriteToken", () => {
      expect(createAthenaResource(validOwnerAccessRules).canCreateKeys(invalidClaims)).toEqual(false);
      expect(createAthenaResource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: "invalid-token" })).toEqual(false);
    });

    it("should not allow keys to be created with valid readWriteToken", () => {
      expect(createAthenaResource(validReadWriteTokenRules).canCreateKeys({ readWriteToken: validReadWriteToken1 })).toEqual(false);
    });

    it("should allow keys to be created with owner claims", () => {
      expect(createAthenaResource(validOwnerAccessRules).canCreateKeys(validClaims)).toEqual(true);
    });

    it("should create keys", async () => {
      const keys = await createAthenaResource().createKeys(config, {bucket: "test-bucket", folder: "test-folder", region: "test-region", account: "12345"} as FireStoreAthenaWorkgroupSettings);
      expect(keys).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        expiration: fakeAwsCredentials.Expiration,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken
      });
    });
    it("should create keys when tool name is long", async () => {
      // long tool names trigger a different code path which hashes the a string to bring it under a
      // a STS limit
      const resource = createAthenaResource([], "really-long-tool-name-no-I-mean-realy-really-long-tool-name");
      const keys = await resource.createKeys(config, {bucket: "test-bucket", folder: "test-folder", region: "test-region", account: "12345"} as FireStoreAthenaWorkgroupSettings);
      expect(keys).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        expiration: fakeAwsCredentials.Expiration,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken
      });
    });
    it("should handle errors when creating keys", async () => {
      // assumeRole = jest.fn((params, callback) => callback(null, { Credentials: fakeAwsCredentials }))
      expect.assertions(1);
      const mockError = {error: "something failed"};
      mockAssumeRole.mockImplementation((params, callback) => callback(mockError));
      await expect(createAthenaResource().createKeys(config,
        {bucket: "test-bucket", folder: "test-folder", region: "test-region", account: "12345"} as FireStoreAthenaWorkgroupSettings))
        .rejects.toEqual(mockError);
    });
    it("should handle no credentials when creating keys", async () => {
      // assumeRole = jest.fn((params, callback) => callback(null, { Credentials: fakeAwsCredentials }))
      expect.assertions(1);
      mockAssumeRole.mockImplementation((params, callback) => callback(undefined, {}));
      await expect(createAthenaResource().createKeys(config,
        {bucket: "test-bucket", folder: "test-folder", region: "test-region", account: "12345"} as FireStoreAthenaWorkgroupSettings))
        .rejects.toMatch(/credentials/);
    });

  });
});

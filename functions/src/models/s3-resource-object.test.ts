import { S3ResourceObject } from "./s3-resource-object";
import { AccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix } from "../resource-types";
import { FireStoreResourceSettings, FireStoreS3ResourceSettings, JWTClaims } from "../firestore-types";
import { fakeAwsCredentials, mockSend, AssumeRoleCommand } from "../__mocks__/@aws-sdk/client-sts";

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

const createS3Resource = (accessRules: AccessRule[] = [], tool: string = "glossary") => {
  return new S3ResourceObject("test", {
    name: "test",
    description: "test",
    type: "s3Folder",
    tool,
    accessRules
  });
};

describe("Resource", () => {
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

      it("should return custom public path based on bucket when settings include domain and domainIncludesFolder=true", () => {
        expect(createS3Resource().apiResult(
          undefined,
          {bucket: "test-bucket", folder: "test-folder", region: "test-region", domain: "https://cloudfront.domain.with-folder.com", domainIncludesFolder: true} as FireStoreResourceSettings)
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
          publicUrl: "https://cloudfront.domain.with-folder.com/test/"
        });
      });
    });

    it("should be capable of creating vortex configurations", () => {
      expect(createS3Resource([], "vortex").apiResult(
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
        expiration: fakeAwsCredentials.Expiration,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken
      });
    });
    it("should create keys when tool name is long", async () => {
      // long tool names trigger a different code path which hashes the a string to bring it under a
      // a STS limit
      const resource = createS3Resource([], "really-long-tool-name-no-I-mean-realy-really-long-tool-name");
      const keys = await resource.createKeys(config, {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreS3ResourceSettings);
      expect(keys).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        expiration: fakeAwsCredentials.Expiration,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken
      });
    });
    it("should pass correct credentials and parameters to STS", async () => {
      mockSend.mockClear();
      const settings = {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreS3ResourceSettings;
      const resource = createS3Resource([], "glossary");
      await resource.createKeys(config, settings);

      // Verify STSClient was constructed with correct credentials and region
      const stsClient = mockSend.mock.instances[0];
      expect((stsClient as any).config).toEqual({
        region: "test-region",
        credentials: {
          accessKeyId: "test-aws-key",
          secretAccessKey: "test-aws-secret"
        }
      });

      // Verify AssumeRoleCommand was called with correct parameters
      const command = mockSend.mock.calls[0][0] as AssumeRoleCommand;
      expect(command.input).toEqual({
        DurationSeconds: 3600,
        Policy: expect.stringContaining("test-bucket"),
        RoleArn: "test-rolearn",
        RoleSessionName: "token-service-s3Folder-glossary-test"
      });
    });

    it("should handle errors when creating keys", async () => {
      expect.assertions(1);
      const mockError = {error: "something failed"};
      mockSend.mockRejectedValueOnce(mockError);
      await expect(createS3Resource().createKeys(config,
        {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreS3ResourceSettings))
        .rejects.toEqual(mockError);
    });
    it("should handle no credentials when creating keys", async () => {
      expect.assertions(1);
      mockSend.mockResolvedValueOnce({});
      await expect(createS3Resource().createKeys(config,
        {bucket: "test-bucket", folder: "test-folder", region: "test-region"} as FireStoreS3ResourceSettings))
        .rejects.toThrow(/credentials/);
    });

  });
});

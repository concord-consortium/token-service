import { IotResourceObject } from "./iot-resource-object";
import { AccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix } from "../resource-types";
import { JWTClaims } from "../firestore-types";

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

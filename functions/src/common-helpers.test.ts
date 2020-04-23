import { getRWTokenFromAccessRules } from "./common-helpers";
import { AccessRule, S3Resource } from "./resource-types";

describe("getRWTokenFromAccessRules", () => {
  it("parses access rules and extracts read write token", () => {
    expect(getRWTokenFromAccessRules({
      accessRules: [
        {type: "user", role: "owner", userId: "123", platformId: "test"}
      ] as AccessRule[]
    } as S3Resource)).toEqual(undefined);

    expect(getRWTokenFromAccessRules({
      accessRules: [
        {type: "readWriteToken", readWriteToken: "read-write-token"}
      ] as AccessRule[]
    } as S3Resource)).toEqual("read-write-token");

    expect(getRWTokenFromAccessRules({
      accessRules: [
        {type: "user", role: "owner", userId: "123", platformId: "test"},
        {type: "readWriteToken", readWriteToken: "read-write-token"}
      ] as AccessRule[]
    } as S3Resource)).toEqual("read-write-token");
  });
});

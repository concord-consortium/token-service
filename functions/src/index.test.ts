// @firebase/testing module is used to interact with the emulator that runs locally.
// It's mostly described in the context of Firestore rules testing: https://firebase.google.com/docs/rules/unit-tests
import * as firebaseTesting from "@firebase/testing";
import * as firebaseFunctionsTest from "firebase-functions-test";
// This is necessary automatically setup config for test environment.
// If you want to connect to real Firestore, configuration can be provided here.
// Otherwise, emulator is needed. Emulator is set using env variable: FIRESTORE_EMULATOR_HOST
// (check package.json scripts).
const projectId = "test-project";
const firebaseFunctionsEnv = firebaseFunctionsTest({ projectId });
// Require ./index AFTER calling firebaseFunctionsTest.
// firebaseFunctionsTest mocks firebase.config() that is used in the ./index module.
import { webApiV1, db } from "./index";

import * as supertest from "supertest";
import { FireStoreS3Resource, FireStoreS3ResourceSettings } from "./firestore-types";
import { ReadWriteTokenPrefix } from "./resource-types";

const checkResponse = (response: any) => {
  const json = JSON.parse(response.text);
  expect(json.status).toEqual("success");
  return json;
}

const defS3Settings: FireStoreS3ResourceSettings = {
  type: "s3Folder",
  tool: "test-tool",
  bucket: "test-bucket",
  region: "test-region",
  folder: "test-folder",
  allowedAccessRuleTypes: ["user", "context", "readWriteToken"]
};
const readWriteToken = ReadWriteTokenPrefix + "123xyz";

const createS3Settings = async (customSettings?: FireStoreS3ResourceSettings) => {
  const finalSettings = Object.assign({}, defS3Settings, customSettings);
  await db.collection("dev:resourceSettings").doc("settings-id-1").set(finalSettings);
  return finalSettings;
};
const createS3Resource = async (customSettings?: FireStoreS3Resource) => {
  const resource: FireStoreS3Resource = {
    type: defS3Settings.type,
    tool: defS3Settings.tool,
    description: "test-description",
    accessRules: [
      {type: "user", role: "owner", platformId: "test", userId: "test-user"},
      {type: "readWriteToken", readWriteToken}
    ],
    name: "test.txt"
  };
  const ref = await db.collection("dev:resources").add(Object.assign(resource, customSettings));
  return Object.assign({ id: ref.id }, resource);
};

describe("token-service app", () => {
  afterAll(async () => {
    await firebaseFunctionsEnv.cleanup();
  });
  beforeEach(async () => {
    await firebaseTesting.clearFirestoreData({ projectId });
  });

  it("GET api/v1/test", async () => {
    const response = await supertest(webApiV1)
      .get("/api/v1/test")
      .query({ env: "dev" })
      .expect(200);
    const json = checkResponse(response);
    expect(json.result).toEqual("test OK");
  });

  it("POST api/v1/test", async () => {
    const testEntries = await db.collection("test").get();
    // Ensure that we're dealing with EMPTY firestore db.
    expect(testEntries.size).toEqual(0);
    const content = { content: "TEST CONTENT" + Date.now() };
    const response = await supertest(webApiV1)
      .post("/api/v1/test")
      .query({ env: "dev" })
      .send(content)
      .expect(200);
    const json = checkResponse(response);
    expect(json.result).toEqual("test write OK");
    const doc = await db.collection("test").doc("test-doc").get();
    expect(doc.data()).toEqual(content);
  });

  describe("GET api/v1/resource", () => {
    it("returns resource without accessRules when run anonymously", async () => {
      const settings = await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual({
        id: resource.id,
        name: resource.name,
        description: resource.description,
        publicPath: `test-folder/${resource.id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${resource.id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type
        // no access rules
      });
    });

    it("returns resource with accessRules when user is authenticated (readWriteToken)", async () => {
      const settings = await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual({
        id: resource.id,
        name: resource.name,
        description: resource.description,
        publicPath: `test-folder/${resource.id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${resource.id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type,
        accessRules: resource.accessRules // !!!
      });
    });
  });
});

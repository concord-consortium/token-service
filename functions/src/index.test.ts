// @firebase/rules-unit-testing module is used to interact with the emulator that runs locally.
// It's mostly described in the context of Firestore rules testing: https://firebase.google.com/docs/rules/unit-tests
import * as firebaseTesting from "@firebase/rules-unit-testing";
import * as firebaseFunctionsTest from "firebase-functions-test";
import * as fs from "fs";
import * as jwt from "jsonwebtoken";
import * as supertest from "supertest";
import { FireStoreS3Resource, FireStoreS3ResourceSettings, FireStoreIotOrganizationResource } from "./firestore-types";
import { CreateQuery, ReadWriteTokenPrefix, UpdateQuery, UserAccessRule, AccessRuleType, ContextAccessRule } from "./resource-types";
import { S3ResourceObject } from "./models/s3-resource-object";
import { fakeAwsCredentials } from "./__mocks__/aws-sdk";
// This is necessary automatically setup config for test environment.
// If you want to connect to real Firestore, configuration can be provided here.
// Otherwise, emulator is needed. Emulator is set using env variable: FIRESTORE_EMULATOR_HOST
// (check package.json scripts).
const projectId = "test-project";
const firebaseFunctionsEnv = firebaseFunctionsTest({ projectId });
// These keys have been generated only for test needs.
const testPrivKey = fs.readFileSync("./src/test-utils/test-private.pem").toString();
const testPublicKey = fs.readFileSync("./src/test-utils/test-public.pem").toString();
firebaseFunctionsEnv.mockConfig({
  admin: {
    public_key: testPublicKey
  },
  aws: {
    duration: "3600",
    rolearn: "test-role",
    secret: "aws-secret",
    key: "aws-key"
  }
});
// Require ./index AFTER calling firebaseFunctionsTest and mocking config.
// firebase.config() is used in the ./index module, so it needs to be mocked first.
import { webApiV1, db } from "./index";

const checkResponse = (response: any, expectedStatus: string = "success") => {
  const json = JSON.parse(response.text);
  expect(json.status).toEqual(expectedStatus);
  return json;
}

const expectedResourceObject = (
  { resource, settings, includeAccessRules }:
  { resource: FireStoreS3Resource & {id: string} | CreateQuery & {id: string} | FireStoreIotOrganizationResource & {id: string},
    settings: FireStoreS3ResourceSettings, includeAccessRules: boolean }
) => ({
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
  // accessRules is defined only if request comes from authenticated and authorized user.
  accessRules: includeAccessRules ? resource.accessRules : undefined
});

const getResourcesCount = async () => (await db.collection("dev:resources").get()).size;

const getFirstResource = async () => (await db.collection("dev:resources").get()).docs[0].data();

const s3Settings: FireStoreS3ResourceSettings = {
  type: "s3Folder",
  tool: "test-tool",
  bucket: "test-bucket",
  region: "test-region",
  folder: "test-folder",
  allowedAccessRuleTypes: ["user", "readWriteToken", "context"]
};

const readWriteToken = ReadWriteTokenPrefix + "123xyz";

const user = {userId: "test-user", platformId: "test", contextId: "test-class"};

const s3Resource: FireStoreS3Resource = {
  type: s3Settings.type,
  tool: s3Settings.tool,
  description: "test-description",
  accessRules: [
    {type: "user", role: "owner", platformId: user.platformId, userId: user.userId},
    {type: "readWriteToken", readWriteToken}
  ],
  name: "test.txt"
};

const jwtClaims = {
  user_id: user.userId,
  platform_user_id: user.userId,
  platform_id: user.platformId,
  class_hash: user.contextId
};

const jwtToken = jwt.sign({ claims: jwtClaims }, testPrivKey, { algorithm: "RS256" });

// Parial is used here so we make invalid settings
const createFullS3Settings = async (settings: Partial<FireStoreS3ResourceSettings>) => {
  await db.collection("dev:resourceSettings").doc("settings-id-1").set(settings);
  // pretend the full settings are returned even if a partial was passed in
  return settings as FireStoreS3ResourceSettings;
};
const createS3Settings = async (customSettings?: Partial<FireStoreS3ResourceSettings>) => {
  const finalSettings = Object.assign({}, s3Settings, customSettings);
  return createFullS3Settings(finalSettings);
};
const createS3Resource = async (customSettings?: Partial<FireStoreS3Resource>) => {
  const finalSettings = Object.assign({}, s3Resource, customSettings);
  const ref = await db.collection("dev:resources").add(finalSettings);
  return Object.assign({ id: ref.id }, finalSettings);
};
const iotResource: FireStoreIotOrganizationResource = {
  name: "test",
  description: "test",
  type: "iotOrganization",
  tool: "dataFlow",
  accessRules: [
    {type: "user", role: "owner", platformId: user.platformId, userId: user.userId},
  ]
}
const createIotResource = async () => {
  const ref = await db.collection("dev:resources").add(iotResource);
  return Object.assign({ id: ref.id }, iotResource);
};

afterAll(async () => {
  await firebaseFunctionsEnv.cleanup();
});
beforeEach(async () => {
  await firebaseTesting.clearFirestoreData({ projectId });
});

describe("token-service app", () => {
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

  describe("General JWT validation", () => {
    test("API returns 403 when JWT is malformed", async () => {
      await createS3Settings();
      const resource =await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", "Bearer malformed-JWT-token")
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("jwt malformed");
    });

    test("API returns 403 when JWT is missing claims", async () => {
      await createS3Settings();
      const resource =await createS3Resource();

      let token = jwt.sign({ noClaims: true }, testPrivKey, { algorithm: "RS256" });
      let response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${token}`)
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("Invalid token");

      const incompleteClaims = Object.assign({}, jwtClaims);
      delete incompleteClaims.user_id;
      token = jwt.sign({ claims: incompleteClaims }, testPrivKey, { algorithm: "RS256" });
      response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${token}`)
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("Missing user_id");
    });
  });

  describe("GET api/v1/resources/:id", () => {
    it("returns resource without sensitive data when run anonymously", async () => {
      const settings = await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual(expectedResourceObject({ resource, settings, includeAccessRules: false }));
    });

    it("returns resource with sensitive data when user is authenticated (readWriteToken)", async () => {
      const settings = await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual(expectedResourceObject({ resource, settings, includeAccessRules: true }));
    });

    it("returns resource with sensitive data when user is authenticated (JWT)", async () => {
      const settings = await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual(expectedResourceObject({ resource, settings, includeAccessRules: true }));
    });

    it("returns error when there are no settings for the resource", async () => {
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(404);

      const json = checkResponse(response, "error");
      expect(json.error).toEqual("No resource settings for s3Folder type with test-tool tool");
    });

    it("returns error when a resource with that id doesn't exist", async () => {
      const response = await supertest(webApiV1)
        .get("/api/v1/resources/1234")
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(404);

      const json = checkResponse(response, "error");
      expect(json.error).toEqual("Resource 1234 not found!");
    });
  });

  describe("GET api/v1/resources", () => {
    it("returns all resources without sensitive data when run anonymously", async () => {
      const settings = await createS3Settings();
      const resources = [ await createS3Resource(), await createS3Resource(), await createS3Resource() ];
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      const result = json.result;
      expect(result.length).toEqual(resources.length);
      // Note that order of resources is not defined in response and usually it's random. That's why this function
      // seems more complicated than it could be.
      resources.forEach(refDoc => {
        const testDocIdx = result.findIndex((doc: any) => doc.id === refDoc.id);
        const testDoc = result[testDocIdx];
        expect(testDoc).not.toBeUndefined();
        expect(testDoc).toEqual(expectedResourceObject({ resource: refDoc, settings, includeAccessRules: false }));
        result.splice(testDocIdx, 1);
      });
    });

    it("returns all resources with sensitive data when user is authenticated and has access to given resource (JWT)", async () => {
      const settings = await createS3Settings();
      const resource1 = await createS3Resource();
      const resource2 = await createS3Resource({ accessRules: [] }); // no access for anyone
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      // Note that order of resources is not defined in response and usually it's random.
      const res1Resp = json.result.find((d: S3ResourceObject) => d.id === resource1.id);
      const res2Resp = json.result.find((d: S3ResourceObject) => d.id === resource2.id);
      expect(res1Resp).toEqual(expectedResourceObject({ resource: resource1, settings, includeAccessRules: true }));
      expect(res2Resp).toEqual(expectedResourceObject({ resource: resource2, settings, includeAccessRules: false }));
    });

    it("returns user's own resources with when amOwner param is provided", async () => {
      const settings = await createS3Settings();
      const resource1 = await createS3Resource();
      await createS3Resource({ accessRules: [] }); // no owner
      // Ensure that we're dealing with EMPTY firestore db.
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev", amOwner: "true" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result.length).toEqual(1);
      expect(json.result[0]).toEqual(expectedResourceObject({ resource: resource1, settings, includeAccessRules: true }));
    });

    it("returns resources with a matching name", async () => {
      const settings = await createS3Settings();
      await createS3Resource();
      const resource2 = await createS3Resource({name: "unique-name"});
      // Ensure that we're dealing with EMPTY firestore db.
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev", name: "unique-name" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result.length).toEqual(1);
      expect(json.result[0]).toEqual(expectedResourceObject({ resource: resource2, settings, includeAccessRules: true }));
    });

    it("returns resources with a matching type", async () => {
      const settings = await createS3Settings();
      const resource1 = await createS3Resource();
      await createIotResource();
      // Ensure that we're dealing with EMPTY firestore db.
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev", type: "s3Folder" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result.length).toEqual(1);
      expect(json.result[0]).toEqual(expectedResourceObject({ resource: resource1, settings, includeAccessRules: true }));
    });

    it("returns resources with a matching tool", async () => {
      await createS3Settings();
      const settings = await createS3Settings({tool: "different-tool"});
      await createS3Resource();
      const resource2 = await createS3Resource({tool: "different-tool"});
      // Ensure that we're dealing with EMPTY firestore db.
      const response = await supertest(webApiV1)
        .get("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev", tool: "different-tool" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result.length).toEqual(1);
      expect(json.result[0]).toEqual(expectedResourceObject({ resource: resource2, settings, includeAccessRules: true }));
    });

  });

  describe("POST api/v1/resources", () => {
    it("returns error if user is not authenticated and access rule type is different from readWriteToken", async () => {
      const settings = await createS3Settings();
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      await supertest(webApiV1)
        .post("/api/v1/resources")
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, { accessRuleType: "user" }) as CreateQuery)
        .expect(400);
      await supertest(webApiV1)
        .post("/api/v1/resources")
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, { accessRuleType: "unknownAccessRuleType" }) as CreateQuery)
        .expect(400);
      await supertest(webApiV1)
        .post("/api/v1/resources")
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, { accessRuleType: "readWriteToken" }) as CreateQuery)
        .expect(201);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("creates a new resource with readWriteToken if access rule type is specified as readWriteToken", async () => {
      const settings = await createS3Settings();
      const createQuery: CreateQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc",
        accessRuleType: "readWriteToken"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .query({ env: "dev" })
        .send(createQuery)
        .expect(201);

      const json = checkResponse(response);
      const id = json.result.id;
      expect(id).toEqual(expect.any(String));
      expect(json.result).toEqual(expect.objectContaining({
        id,
        name: createQuery.name,
        description: createQuery.description,
        publicPath: `test-folder/${id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type
      }));
      expect(json.result.accessRules.length).toEqual(1);
      expect(json.result.accessRules[0].type).toEqual("readWriteToken");
      expect(json.result.accessRules[0].readWriteToken).toContain(ReadWriteTokenPrefix);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("creates a new resource with 'user' access role type if user is authenticated (JWT)", async () => {
      const settings = await createS3Settings();
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "user"}) as CreateQuery)
        .expect(201);

      const json = checkResponse(response);
      const id = json.result.id;
      expect(id).toEqual(expect.any(String));
      expect(json.result).toEqual(expect.objectContaining({
        id,
        name: createQuery.name,
        description: createQuery.description,
        publicPath: `test-folder/${id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type
      }));
      expect(json.result.accessRules.length).toEqual(1);
      expect(json.result.accessRules[0]).toEqual({ type: "user", role: "owner", userId: user.userId, platformId: user.platformId } as UserAccessRule);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("creates a new resource with 'user' and 'context` access role type if user is authenticated (JWT)", async () => {
      const settings = await createS3Settings();
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: ["user", "context"]}) as CreateQuery)
        .expect(201);

      const json = checkResponse(response);
      const id = json.result.id;
      expect(id).toEqual(expect.any(String));
      expect(json.result).toEqual(expect.objectContaining({
        id,
        name: createQuery.name,
        description: createQuery.description,
        publicPath: `test-folder/${id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type
      }));
      expect(json.result.accessRules.length).toEqual(2);
      expect(json.result.accessRules[0]).toEqual({ type: "user", role: "owner", userId: user.userId, platformId: user.platformId } as UserAccessRule);
      expect(json.result.accessRules[1]).toEqual({ type: "context", platformId: user.platformId, contextId: user.contextId } as ContextAccessRule);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("automatically adds 'user' access role type if user is authenticated and specified only 'context' access rule (JWT)", async () => {
      const settings = await createS3Settings();
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "context"}) as CreateQuery)
        .expect(201);

      const json = checkResponse(response);
      const id = json.result.id;
      expect(id).toEqual(expect.any(String));
      expect(json.result).toEqual(expect.objectContaining({
        id,
        name: createQuery.name,
        description: createQuery.description,
        publicPath: `test-folder/${id}/`,
        publicUrl: `https://test-bucket.s3.amazonaws.com/test-folder/${id}/`,
        bucket: settings.bucket,
        folder: settings.folder,
        region: settings.region,
        tool: settings.tool,
        type: settings.type
      }));
      expect(json.result.accessRules.length).toEqual(2);
      expect(json.result.accessRules[0]).toEqual({ type: "user", role: "owner", userId: user.userId, platformId: user.platformId } as UserAccessRule);
      expect(json.result.accessRules[1]).toEqual({ type: "context", platformId: user.platformId, contextId: user.contextId } as ContextAccessRule);

      expect(await getResourcesCount()).toEqual(1);
    });

    it("returns an error if the resource is missing fields.", async () => {
      const settings = await createS3Settings();

      // query without description
      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "user"}) as CreateQuery)
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toEqual("One or more missing resource fields!");
    });

    it("returns an error if the tool settings don't include allowAccessRuleTypes", async () => {
      const invalidSettings = {...s3Settings};
      delete invalidSettings.allowedAccessRuleTypes;
      const settings = await createFullS3Settings(invalidSettings);

      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "user"}) as CreateQuery)
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toMatch(/.*configuration is missing allowedAccessRuleTypes list!/);
    });

    it("returns an error if the tool settings have an unknown rule type, and create tries to use it", async () => {
      const settings = await createS3Settings({allowedAccessRuleTypes:["blah" as AccessRuleType]});

      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "blah"}) as CreateQuery)
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toMatch(/Unknown access rule type:.*/);
    });

    it("returns an error if the tool settings have an unknown resource type, and create tries to use it", async () => {
      const settings = await createS3Settings({type: "blah" as any});

      const createQuery = {
        type: settings.type,
        tool: settings.tool,
        name: "test.txt",
        description: "desc"
      };
      const response = await supertest(webApiV1)
        .post("/api/v1/resources")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .send(Object.assign({}, createQuery, {accessRuleType: "user"}) as CreateQuery)
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toMatch(/Unknown resource type:.*/);
    });
  });

  describe("PATCH api/v1/resources/:id", () => {
    it("fails if user is not authenticated", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const updateQuery: UpdateQuery = { description: "new description" };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/" + resource.id)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("Missing token in headers, query or cookie");
      expect(await getFirstResource()).not.toEqual(expect.objectContaining(updateQuery));
    });

    it("fails if user is trying to use readWriteToken (so user can't revoke access to the shared document for other rwtoken owners)", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const updateQuery: UpdateQuery = { description: "new description" };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${readWriteToken}`)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission");
      expect(await getFirstResource()).not.toEqual(expect.objectContaining(updateQuery));
    });

    it("fails if user is only a member", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "user", role: "member", userId: user.userId, platformId: user.platformId } as UserAccessRule]
      });
      const updateQuery: UpdateQuery = { description: "new description" };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission");
      expect(await getFirstResource()).not.toEqual(expect.objectContaining(updateQuery));
    });

    it("fails if user is only a class/context member", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "context", contextId: user.contextId, platformId: user.platformId } as ContextAccessRule]
      });
      const updateQuery: UpdateQuery = { description: "new description" };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission");
      expect(await getFirstResource()).not.toEqual(expect.objectContaining(updateQuery));
    });

    it("updates resource if user is an owner", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const updateQuery: UpdateQuery = {
        description: "new description",
        name: "new name.txt",
        accessRules: [
          {type: "user", role: "owner", platformId: user.platformId, userId: user.userId},
          {type: "user", role: "member", platformId: user.platformId, userId: "another-user"}
        ]
      };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(200);

      const json = checkResponse(response);
      expect(json.result).toEqual(expect.objectContaining(updateQuery));
      expect(await getFirstResource()).toEqual(expect.objectContaining(updateQuery));
    });

    it("returns error when a resource with that id doesn't exist", async () => {
      const updateQuery: UpdateQuery = { description: "new description" };
      const response = await supertest(webApiV1)
        .patch("/api/v1/resources/1234")
        .set("Authorization", `Bearer ${jwtToken}`)
        .send(updateQuery)
        .query({ env: "dev" })
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toEqual("Resource 1234 not found!");
    });

  });

  describe("POST api/v1/resources/:id/credentials", () => {
    it("fails if user is not authenticated", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("Missing token in headers, query or cookie");
    });

    it("returns credentials when user is an owner (JWT)", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);
      const json = checkResponse(response);
      expect(json.result).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken,
        expiration: fakeAwsCredentials.Expiration
      });
    });

    it("returns credentials when user is a member (JWT)", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "user", role: "member", userId: user.userId, platformId: user.platformId } as UserAccessRule]
      });
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);
      const json = checkResponse(response);
      expect(json.result).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken,
        expiration: fakeAwsCredentials.Expiration
      });
    });

    it("returns credentials when user is a class/context member (JWT)", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "context", contextId: user.contextId, platformId: user.platformId } as ContextAccessRule]
      });
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);
      const json = checkResponse(response);
      expect(json.result).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken,
        expiration: fakeAwsCredentials.Expiration
      });
    });

    it("returns an error when user is not owner or member (JWT)", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: []
      });
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(400);
      const json = checkResponse(response, "error");
      expect(json.error).toMatch(/You do not have permission to create AWS keys for resource .*!/);
    });

    it("returns credentials when user has readWriteToken", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .post("/api/v1/resources/" + resource.id + "/credentials")
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(200);
      const json = checkResponse(response);
      expect(json.result).toEqual({
        accessKeyId: fakeAwsCredentials.AccessKeyId,
        secretAccessKey: fakeAwsCredentials.SecretAccessKey,
        sessionToken: fakeAwsCredentials.SessionToken,
        expiration: fakeAwsCredentials.Expiration
      });
    });
  });

  describe("DELETE api/v1/resources/:id", () => {
    it("fails if user is not authenticated", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/" + resource.id)
        .query({ env: "dev" })
        .expect(403);
      expect(response.text).toContain("Missing token in headers, query or cookie");
      expect(await getResourcesCount()).toEqual(1);
    });

    it("fails if user is trying to use readWriteToken (so user can't delete the shared document)", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${readWriteToken}`)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission to delete resource");
      expect(await getResourcesCount()).toEqual(1);
    });

    it("fails if user is only a member", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "user", role: "member", userId: user.userId, platformId: user.platformId } as UserAccessRule]
      });
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission to delete resource");
      expect(await getResourcesCount()).toEqual(1);
    });

    it("fails if user is only a class/context member", async () => {
      await createS3Settings();
      const resource = await createS3Resource({
        accessRules: [{ type: "context", contextId: user.contextId, platformId: user.platformId } as ContextAccessRule]
      });
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(400);
      expect(response.text).toContain("You do not have permission to delete resource");
      expect(await getResourcesCount()).toEqual(1);
    });

    it("deletes resource if user is an owner", async () => {
      await createS3Settings();
      const resource = await createS3Resource();
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/" + resource.id)
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(200);
      checkResponse(response);
      expect(await getResourcesCount()).toEqual(0);
    });

    it("returns error when a resource with that id doesn't exist", async () => {
      const response = await supertest(webApiV1)
        .delete("/api/v1/resources/1234")
        .set("Authorization", `Bearer ${jwtToken}`)
        .query({ env: "dev" })
        .expect(400);

      const json = checkResponse(response, "error");
      expect(json.error).toEqual("Resource 1234 not found!");
    });
  });
});

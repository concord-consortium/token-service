// @firebase/testing module is used to interact with the emulator that runs locally.
// It's mostly described in the context of Firestore rules testing: https://firebase.google.com/docs/rules/unit-tests
const firebaseTesting = require("@firebase/testing");
const functions = require("firebase-functions-test");
const supertest = require("supertest");
// This is necessary automatically setup config for test environment.
// If you want to connect to real Firestore, configuration can be provided here.
// Otherwise, emulator is needed. Emulator is set using env variable: FIRESTORE_EMULATOR_HOST
// (check package.json scripts).
const projectId = "test-project";
const firebaseFunctionsEnv = functions({ projectId });
// Require functions AFTER calling functions.
const { webApiV1, db } = require("./index");

const checkResponse = (response: any) => {
  const json = JSON.parse(response.text);
  expect(json.status).toEqual("success");
  return json;
}

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
});

import { makeCachedSettingsGetter } from "./helpers";
import { BaseResourceObject } from "./base-resource-object";
import { FireStoreResourceSettings } from "./firestore-types";

describe("makeCachedSettingsGetter", () => {
  const testDb = {} as FirebaseFirestore.Firestore;
  const testSettings = { domain: "https://test.com" } as FireStoreResourceSettings;
  beforeEach(() => {
    BaseResourceObject.GetResourceSettings = jest.fn(() => Promise.resolve(testSettings));
  });

  it("provides catching and ensures db isn't hit multiple times for the same combination of resource type and tool", async () => {
    const getSettings = makeCachedSettingsGetter(testDb, "test");
    const settings = await getSettings("s3Folder", "test-app");
    expect(settings).toEqual(testSettings);
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("s3Folder", "test-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("s3Folder", "test-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("iotOrganization", "test-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(2);
    await getSettings("iotOrganization", "test-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(2);
    await getSettings("s3Folder", "another-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(3);
    await getSettings("s3Folder", "another-app");
    expect(BaseResourceObject.GetResourceSettings).toHaveBeenCalledTimes(3);
  });
});

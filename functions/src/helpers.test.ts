jest.mock("./resource-manager");

import { makeCachedSettingsGetter } from "./helpers";
import * as manager from "./resource-manager";
import { FireStoreResourceSettings } from "./firestore-types";

describe("makeCachedSettingsGetter", () => {
  const testDb = {} as FirebaseFirestore.Firestore;
  const testSettings = { domain: "https://test.com" } as FireStoreResourceSettings;
  beforeEach(() => {
    (manager.getResourceSettings as jest.Mock).mockReturnValue(Promise.resolve(testSettings));
  });

  it("provides catching and ensures db isn't hit multiple times for the same combination of resource type and tool", async () => {
    const getSettings = makeCachedSettingsGetter(testDb, "test");
    const settings = await getSettings("s3Folder", "test-app");
    expect(settings).toEqual(testSettings);
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("s3Folder", "test-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("s3Folder", "test-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(1);
    await getSettings("iotOrganization", "test-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(2);
    await getSettings("iotOrganization", "test-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(2);
    await getSettings("s3Folder", "another-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(3);
    await getSettings("s3Folder", "another-app");
    expect(manager.getResourceSettings).toHaveBeenCalledTimes(3);
  });
});

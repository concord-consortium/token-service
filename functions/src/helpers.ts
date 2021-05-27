import { ResourceType } from "./resource-types";
import { FireStoreResourceSettings } from "./firestore-types";
import * as manager from "./resource-manager";

export const makeCachedSettingsGetter = (fsDb: FirebaseFirestore.Firestore, env: string) => {
  const settingsCache: {[key: string]: FireStoreResourceSettings} = {};
  return (type: ResourceType, tool: string) => {
    return new Promise<FireStoreResourceSettings>((resolve, reject) => {
      const key = type + tool;
      if (!settingsCache[key]) {
        // empty cache
        manager.getResourceSettings(fsDb, env, type, tool)
          .then(settings => {
            // cache settings and resolve promise
            settingsCache[key] = settings;
            resolve(settings)
          })
          .catch(reject);
      } else {
        resolve(settingsCache[key]);
      }
    });
  };
};

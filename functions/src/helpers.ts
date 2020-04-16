import { BaseResource, ReadWriteTokenAccessRule, ResourceType } from "./resource-types";
import { FireStoreResourceSettings } from "./firestore-types";
import { BaseResourceObject } from "./base-resource-object";

export const getRWTokenFromAccessRules = (resource: BaseResource): string | undefined => {
  if (!resource.accessRules) {
    return undefined;
  }
  const readWriteTokenRules = resource.accessRules.filter(r => r.type === "readWriteToken");
  if (readWriteTokenRules.length > 0) {
    // There's no reason to have more than one readWriteToken rules (so in fact multiple read write tokens).
    // But even if that happens, it's enough to get any of them to have access to the resource.
    return (readWriteTokenRules[0] as ReadWriteTokenAccessRule).readWriteToken;
  }
  return undefined;
};

export const makeCachedSettingsGetter = (fsDb: FirebaseFirestore.Firestore, env: string) => {
  const settingsCache: {[key: string]: FireStoreResourceSettings} = {};
  return (type: ResourceType, tool: string) => {
    return new Promise<FireStoreResourceSettings>((resolve, reject) => {
      const key = type + tool;
      if (!settingsCache[key]) {
        // empty cache
        BaseResourceObject.GetResourceSettings(fsDb, env, type, tool)
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

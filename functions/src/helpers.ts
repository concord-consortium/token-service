import { BaseResource, ReadWriteTokenAccessRule } from "./resource-types";

export const getReadWriteToken = (resource: BaseResource): string | undefined => {
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

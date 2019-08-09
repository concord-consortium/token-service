export type FireStoreResourceType = "s3Folder" | "iotOrganization";
export type FireStoreResourceTool = "glossary" | "rubric" | "dataFlow";
export type FireStoreAccessRuleType = "user" | "context";
export type FireStoreAccessRuleRole = "owner" | "member";

export type FireStoreAccessRule = FireStoreUserAccessRule | FireStoreContextAccessRule;

export interface FireStoreUserAccessRule {
  type: "user";
  role: FireStoreAccessRuleRole;
  platformId: string;
  userId: string;
}

export interface FireStoreContextAccessRule {
  type: "context";
  role: FireStoreAccessRuleRole;
  platformId: string;
  contextId: string;
}

export interface FireStoreResource {
  name: string;
  description: string;
  type: FireStoreResourceType;
  tool: FireStoreResourceTool;
  url: string;
  accessRules: FireStoreAccessRule[]
}

export interface JWTClaims {
  userId: string;
  platformId: string;
  contextId?: string;
}

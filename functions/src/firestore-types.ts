export type FireStoreResourceType = "s3Folder" | "iotOrganization";
export type FireStoreResourceTool = FireStoreS3ResourceTool | FireStoreIotOrganizationResourceTool;
export type FireStoreS3ResourceTool = "glossary" | "rubric";
export type FireStoreIotOrganizationResourceTool = "dataFlow";
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

export type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource;

export interface FireStoreBaseResource {
  name: string;
  description: string;
  accessRules: FireStoreAccessRule[]
}

export interface FireStoreS3Resource extends FireStoreBaseResource {
  type: "s3Folder";
  tool: FireStoreS3ResourceTool;
  bucket: string;
  folder: string;
}

export interface FireStoreIotOrganizationResource extends FireStoreBaseResource {
  type: "iotOrganization";
  tool: FireStoreIotOrganizationResourceTool;
}

export interface JWTClaims {
  userId: string;
  platformId: string;
  contextId?: string;
}

export type FireStoreResourceSettings = FireStoreS3ResourceSettings;

export interface FireStoreS3ResourceSettings {
  type: "s3Folder";
  tool: FireStoreResourceTool;
  bucket: string;
  folder: string;
}
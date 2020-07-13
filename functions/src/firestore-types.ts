import { AccessRuleType, ResourceType, AccessRule } from "./resource-types";

export type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource;

export interface FirestoreBaseResource {
  name: string;
  description: string;
  type: ResourceType;
  tool: string;
  accessRules: AccessRule[]
}

export interface FireStoreS3Resource extends FirestoreBaseResource {
  type: "s3Folder"
}
export interface FireStoreIotOrganizationResource extends FirestoreBaseResource {
  type: "iotOrganization"
}

export type FireStoreResourceSettings = FireStoreS3ResourceSettings | FirestoreIotOrganizationSettings;

export interface ResourceSettings {
  type: ResourceType;
  tool: string;
  allowedAccessRuleTypes: AccessRuleType[];
}

export interface FireStoreS3ResourceSettings extends ResourceSettings {
  type: "s3Folder";
  bucket: string;
  folder: string;
  region: string;
  // Optional domain, usually pointing to cloudfront distribution. It affects publicUrl of the resource.
  domain?: string;
  // Domain can point to the S3 bucket root or it can include folder path. For example:
  // 1. https://models-resources.concord.org -> https://models-resources.s3.amazonaws.com
  // 2. https://cfm-shared.concord.org -> https://models-resources.s3.amazonaws.com/cfm-shared
  // 1. domain would require this option undefined or equal to false, while 2. requires it set to true.
  domainIncludesFolder?: boolean;
}

export interface FirestoreIotOrganizationSettings extends ResourceSettings {
  type: "iotOrganization";
}

export interface JWTClaims {
  platform_user_id: string;
  platform_id: string | number;
  user_id: string | number;
  context_id?: string;
}

export interface ReadWriteTokenClaims {
  readWriteToken: string;
}

export type AuthClaims = JWTClaims | ReadWriteTokenClaims;

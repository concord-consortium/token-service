import { AccessRuleType, ResourceType, AccessRule } from "./resource-types";

export type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource | FireStoreAthenaWorkgroupResource;

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
export interface FireStoreAthenaWorkgroupResource extends FirestoreBaseResource {
  type: "athenaWorkgroup"
}

export type FireStoreResourceSettings = FireStoreS3ResourceSettings | FireStoreIotOrganizationSettings | FireStoreAthenaWorkgroupSettings;

interface FireStoreBaseResourceSettings {
  type: ResourceType;
  tool: string;
  allowedAccessRuleTypes: AccessRuleType[];
}

export interface FireStoreS3ResourceSettings extends FireStoreBaseResourceSettings {
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

export interface FireStoreIotOrganizationSettings extends FireStoreBaseResourceSettings {
  type: "iotOrganization";
}

export interface FireStoreAthenaWorkgroupSettings extends FireStoreBaseResourceSettings {
  type: "athenaWorkgroup";
  // Settings to restrict the s3 access to download the workgroup's files
  bucket: string;
  folder: string;
  region: string;
  // id of the aws account used in athena workgroup arn
  account: string;
}

export interface JWTClaims {
  platform_user_id: string;
  platform_id: string | number;
  user_id: string | number;
  // class_hash is a Portal's name of context id
  class_hash?: string;
  // Usually only researchers will have this claim. It gives them an access to data of user specified by target_user_id.
  target_user_id?: string | number;
}

export interface ReadWriteTokenClaims {
  readWriteToken: string;
}

export type AuthClaims = JWTClaims | ReadWriteTokenClaims;

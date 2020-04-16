import { S3Resource, IotResource, AccessRuleType, ResourceType } from "./resource-types";

export type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource;

// S3Resource is client-facing interface. Some of the fields are marked as optional (e.g. accessRules) as user
// might not have access to them. Firestore version represents data stored in Firestore, so getters/derived values
// are omitted and all the fields are marked as present/required.
export interface FireStoreS3Resource extends Required<Omit<S3Resource, "id" | "publicPath" | "publicUrl">> {
  type: "s3Folder"
}
export interface FireStoreIotOrganizationResource extends Required<Omit<IotResource, "id">> {
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

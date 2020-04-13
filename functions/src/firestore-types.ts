import { S3Resource, IotResource } from "./resource-types";

export type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource;

export interface FireStoreS3Resource extends Omit<S3Resource, "id"> {
  type: "s3Folder"
}
export interface FireStoreIotOrganizationResource extends Omit<IotResource, "id"> {
  type: "iotOrganization"
}

export type FireStoreResourceSettings = FireStoreS3ResourceSettings;

export interface FireStoreS3ResourceSettings {
  type: "s3Folder";
  tool: string;
  bucket: string;
  folder: string;
  region: string;
}

export interface JWTClaims {
  platform_user_id: string;
  platform_id: string | number;
  user_id: string | number;
  context_id?: string;
}


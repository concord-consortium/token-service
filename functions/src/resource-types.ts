import { FirestoreBaseResource } from "./firestore-types";

export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface Config {
  admin: {
    public_key: string;
  }
  aws: {
    key: string;
    secret: string;
    // FIXME: These settings are used not just for S3 but also Athena
    s3credentials: {
      rolearn: string;
      duration: number;
    }
  }
}

export type Resource = S3Resource | IotResource;

// Client-facing interfaces. Extend data stored in FireStore with helper values that can be calculated dynamically.
export interface BaseResource extends Omit<FirestoreBaseResource, "accessRules"> {
  id: string;
  // Optional, as client will see it only if it's authorized.
  accessRules?: AccessRule[]
}

export interface S3Resource extends BaseResource {
  bucket: string;
  folder: string;
  region: string;
  publicPath: string;
  publicUrl: string;
}

// tslint:disable-next-line:no-empty-interface
export interface IotResource extends BaseResource {
}

export interface AthenaResource extends BaseResource {
  region: string;
  workgroupName: string;
}

export interface FindAllQuery {
  name?: string;
  type?: ResourceType;
  tool?: string;
  amOwner?: 'true' | 'false';
}

// mark all resource fields as optional so we get type checking
export type ResourceQuery = Omit<Resource, "id">;

export interface CreateQuery extends ResourceQuery {
  accessRuleType: AccessRuleType;
}

export type UpdateQuery = Partial<Omit<ResourceQuery, 'type' | 'tool'>>;

export interface Credentials {
  accessKeyId: string;
  expiration: Date;
  secretAccessKey: string;
  sessionToken: string;
  // FIXME: S3 properties are included in the Credentials for S3Resources,
  //  this seems unnecessary since the Resource used to fetch the credentials also
  //  has the bucket, it doesn't have the keyPrefix, but we could add it.  This
  //  Credentials object is used for non S3 Resources too.
  bucket?: string;
  keyPrefix?: string;
}

export type ResourceType = "s3Folder" | "iotOrganization" | "athenaWorkgroup";
export type AccessRuleType = "user" | "readWriteToken";
export type AccessRuleRole = "owner" | "member";

export type AccessRule = UserAccessRule | ReadWriteTokenAccessRule;

export interface UserAccessRule {
  type: "user";
  role: AccessRuleRole;
  platformId: string;
  userId: string;
}

export interface ReadWriteTokenAccessRule {
  type: "readWriteToken";
  readWriteToken: string;
}

export const ReadWriteTokenPrefix = "read-write-token:";

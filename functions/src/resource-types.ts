export interface Config {
  admin: {
    public_key: string;
  }
  aws: {
    key: string;
    secret: string;
    s3credentials: {
      rolearn: string;
      duration: number;
    }
  }
};

export type Resource = S3Resource | IotResource;

export interface BaseResource {
  id: string;
  name: string;
  description: string;
  type: ResourceType;
  tool: string;
  accessRules: AccessRule[]
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

export interface FindAllQuery {
  name?: string;
  type?: ResourceType;
  tool?: string;
  amOwner?: 'true' | 'false';
}

// mark all resource fields as optional so we get type checking
export type ResourceQuery = Omit<Partial<Resource>, "id">;
export type S3ResourceQuery = Omit<Partial<S3Resource>, "id">;

export interface CreateQuery extends ResourceQuery {
  accessRuleType: AccessRuleType;
  accessRuleRole?: AccessRuleRole;
}

export type UpdateQuery = Omit<Omit<ResourceQuery, 'type'>, 'tool'>;

export interface Credentials {
  accessKeyId: string;
  expiration: Date;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  keyPrefix: string;
}

export type ResourceType = "s3Folder" | "iotOrganization";
export type AccessRuleType = "user" | "context" | "readWriteToken";
export type AccessRuleRole = "owner" | "member";

export type AccessRule = UserAccessRule | ContextAccessRule | ReadWriteTokenAccessRule;

export interface UserAccessRule {
  type: "user";
  role: AccessRuleRole;
  platformId: string;
  userId: string;
}

export interface ContextAccessRule {
  type: "context";
  role: AccessRuleRole;
  platformId: string;
  contextId: string;
}

export interface ReadWriteTokenAccessRule {
  type: "readWriteToken";
  readWriteToken: string;
}

export const ReadWriteTokenPrefix = "read-write-token:";

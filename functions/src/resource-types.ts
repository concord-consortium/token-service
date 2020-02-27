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
  tool: ResourceTool;
  accessRules: AccessRule[]
}

export interface S3Resource extends BaseResource {
  bucket: string;
  folder: string;
  region: string;
}

// tslint:disable-next-line:no-empty-interface
export interface IotResource extends BaseResource {
}

export interface FindAllQuery {
  name?: string;
  type?: ResourceType;
  tool?: ResourceTool;
  amOwner?: 'true' | 'false';
}

// mark all resource fields as optional so we get type checking
export type ResourceQuery = Omit<Partial<Resource>, "id">;
export type S3ResourceQuery = Omit<Partial<S3Resource>, "id">;

export interface CreateQuery extends ResourceQuery {
  accessRuleType: AccessRuleType;
  accessRuleRole: AccessRuleRole;
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
// For runtime checks from outside calls.
export enum S3ResourceTool {
  Glossary = "glossary",
  Rubric = "rubric",
  Vortex = "vortex"
};
export type ResourceType = "s3Folder" | "iotOrganization";
export type ResourceTool = S3ResourceTool | IotOrganizationResourceTool;
export type IotOrganizationResourceTool = "dataFlow";
export type AccessRuleType = "user" | "context";
export type AccessRuleRole = "owner" | "member";

export type AccessRule = UserAccessRule | ContextAccessRule;

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



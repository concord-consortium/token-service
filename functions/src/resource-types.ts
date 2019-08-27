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
export type S3ResourceQuery = Partial<S3Resource>;

export interface CreateQuery extends Omit<ResourceQuery, 'url'> {
  accessRuleType: AccessRuleType;
  accessRuleRole: AccessRuleRole;
}

export type UpdateQuery = Omit<Omit<ResourceQuery, 'type'>, 'tool'>;
export type S3UpdateQuery = Omit<Omit<S3ResourceQuery, 'type'>, 'tool'>;

export interface Credentials {
  accessKeyId: string;
  expiration: Date;
  secretAccessKey: string;
  sessionToken: string;
  bucket: string;
  keyPrefix: string;
}

export type ResourceType = "s3Folder" | "iotOrganization";
export type ResourceTool = S3ResourceTool | IotOrganizationResourceTool;
export type S3ResourceTool = "glossary" | "rubric";
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



export interface Config {
    admin: {
        public_key: string;
    };
    aws: {
        key: string;
        secret: string;
        s3credentials: {
            rolearn: string;
            duration: number;
        };
    };
}
export declare type Resource = S3Resource | IotResource;
export interface BaseResource {
    id: string;
    name: string;
    description: string;
    type: ResourceType;
    tool: ResourceTool;
    accessRules: AccessRule[];
}
export interface S3Resource extends BaseResource {
    bucket: string;
    folder: string;
    region: string;
}
export interface IotResource extends BaseResource {
}
export interface FindAllQuery {
    name?: string;
    type?: ResourceType;
    tool?: ResourceTool;
    amOwner?: 'true' | 'false';
}
export declare type ResourceQuery = Omit<Partial<Resource>, "id">;
export declare type S3ResourceQuery = Partial<S3Resource>;
export interface CreateQuery extends Omit<ResourceQuery, 'url'> {
    accessRuleType: AccessRuleType;
    accessRuleRole: AccessRuleRole;
}
export declare type UpdateQuery = Omit<Omit<ResourceQuery, 'type'>, 'tool'>;
export declare type S3UpdateQuery = Omit<Omit<S3ResourceQuery, 'type'>, 'tool'>;
export interface Credentials {
    accessKeyId: string;
    expiration: Date;
    secretAccessKey: string;
    sessionToken: string;
    bucket: string;
    keyPrefix: string;
}
export declare type ResourceType = "s3Folder" | "iotOrganization";
export declare type ResourceTool = S3ResourceTool | IotOrganizationResourceTool;
export declare type S3ResourceTool = "glossary" | "rubric";
export declare type IotOrganizationResourceTool = "dataFlow";
export declare type AccessRuleType = "user" | "context";
export declare type AccessRuleRole = "owner" | "member";
export declare type AccessRule = UserAccessRule | ContextAccessRule;
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

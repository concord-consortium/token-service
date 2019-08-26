export declare type FireStoreResourceType = "s3Folder" | "iotOrganization";
export declare type FireStoreResourceTool = FireStoreS3ResourceTool | FireStoreIotOrganizationResourceTool;
export declare type FireStoreS3ResourceTool = "glossary" | "rubric";
export declare type FireStoreIotOrganizationResourceTool = "dataFlow";
export declare type FireStoreAccessRuleType = "user" | "context";
export declare type FireStoreAccessRuleRole = "owner" | "member";
export declare type FireStoreAccessRule = FireStoreUserAccessRule | FireStoreContextAccessRule;
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
export declare type FireStoreResource = FireStoreS3Resource | FireStoreIotOrganizationResource;
export interface FireStoreBaseResource {
    name: string;
    description: string;
    accessRules: FireStoreAccessRule[];
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
export declare type FireStoreResourceSettings = FireStoreS3ResourceSettings;
export interface FireStoreS3ResourceSettings {
    type: "s3Folder";
    tool: FireStoreResourceTool;
    bucket: string;
    folder: string;
}

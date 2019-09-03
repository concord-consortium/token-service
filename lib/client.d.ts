import { Credentials, Resource, FindAllQuery, CreateQuery, UpdateQuery, S3Resource } from "./resource-types";
export interface TokenServiceClientOptions {
    jwt: string;
    serviceUrl?: string;
}
export declare class TokenServiceClient {
    readonly jwt: string;
    private serviceUrl;
    constructor(options: TokenServiceClientOptions);
    static readonly FirebaseAppName: string;
    listResources(options: FindAllQuery): Promise<Resource[]>;
    getResource(resourceId: string): Promise<Resource>;
    createResource(options: CreateQuery): Promise<Resource>;
    updateResource(resourceId: string, options: UpdateQuery): Promise<Resource>;
    getCredentials(resourceId: string): Promise<Credentials>;
    getPublicS3Path(resource: S3Resource, filename?: string): string;
    getPublicS3Url(resource: S3Resource, filename?: string): string;
    private url;
    private fetch;
}

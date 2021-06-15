import {Credentials, Resource, FindAllQuery, CreateQuery, UpdateQuery, S3Resource } from "../../functions/src/resource-types"
import { getRWTokenFromAccessRules } from "../../functions/src/common-helpers";
export * from "../../functions/src/resource-types";

export type EnvironmentName = "dev" | "staging" | "production"

export interface TokenServiceClientOptions {
  jwt?: string;
  env?: EnvironmentName;
  serviceUrl?: string;
}

// for use as a node library. `fetch` must be isomorphic with `window.fetch`: `node-fetch` can be used
export interface TokenServiceClientNodeOptions extends TokenServiceClientOptions {
  env: EnvironmentName;
  fetch: (input: RequestInfo, init?: RequestInit | undefined) => Promise<Response>;
}

const serviceUrls: {[k in EnvironmentName]: string} = {
  dev: "http://localhost:5000/api/v1/resources",
  staging: "https://token-service-staging.firebaseapp.com/api/v1/resources",
  production: "https://token-service-62822.firebaseapp.com/api/v1/resources"
};

const getEnv = (): EnvironmentName => {
  if (typeof window === "undefined") {
    throw new Error("env must be set in options when running as node library");
  }
  const {host} = window.location;
  if (host.match(/staging\./)) {
    return "staging";
  }
  if (host.match(/concord\.org/)) {
    return "production";
  }
  return "dev";
};

const getServiceUrlFromEnv = (env: EnvironmentName) => {
  return serviceUrls[env];
};

const getServiceUrlFromQueryString = () => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const query = window.location.search.substring(1);
  const vars = query.split('&');
  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) === "token-service-url") {
      const envOrUrl = decodeURIComponent(pair[1]);
      // allow both use of environment names and literal urls for the value
      return getServiceUrlFromEnv(envOrUrl as EnvironmentName) ||  envOrUrl;
    }
  }
  return undefined;
};

export class TokenServiceClient {
  public readonly jwt: string | undefined;
  public readonly env: EnvironmentName;
  public readonly serviceUrl: string;
  public readonly fetch: (input: RequestInfo, init?: RequestInit | undefined) => Promise<Response>;

  constructor (options: TokenServiceClientOptions | TokenServiceClientNodeOptions) {
    const {jwt, serviceUrl} = options;
    this.jwt = jwt;
    this.env = options.env || getEnv();
    this.serviceUrl = getServiceUrlFromQueryString() || serviceUrl || getServiceUrlFromEnv(this.env) || serviceUrls.production;
    this.fetch = ("fetch" in options) ? options.fetch : fetch;
    if (!this.fetch) {
      throw new Error("fetch not found in options or window object");
    }
  }

  static get FirebaseAppName() {
    return "token-service";
  }

  listResources(options: FindAllQuery) {
    return new Promise<Resource[]>((resolve, reject) => {
      return this.fetchFromServiceUrl("GET", this.url("/", options))
        .then(resolve)
        .catch(reject)
    })
  }

  getResource(resourceId: string) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetchFromServiceUrl("GET", this.url(`/${resourceId}`))
        .then(resolve)
        .catch(reject)
    })
  }

  createResource(options: CreateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetchFromServiceUrl("POST", this.url("/"), { body: options })
        .then(resolve)
        .catch(reject)
    })
  }

  updateResource(resourceId: string, options: UpdateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetchFromServiceUrl("PATCH", this.url(`/${resourceId}`), { body: options })
        .then(resolve)
        .catch(reject)
    })
  }

  // TODO: NB: This only deletes firestore record of the resource …
  deleteResource(resourceId: string) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetchFromServiceUrl("DELETE", this.url(`/${resourceId}`))
        .then(resolve)
        .catch(reject)
    })
  }

  getCredentials(resourceId: string, readWriteToken?: string) {
    return new Promise<Credentials>((resolve, reject) => {
      return this.fetchFromServiceUrl("POST", this.url(`/${resourceId}/credentials`), { readWriteToken })
        .then(resolve)
        .catch(reject)
    })
  }

  getReadWriteToken(resource: Resource): string | undefined {
    return getRWTokenFromAccessRules(resource);
  }

  getPublicS3Path(resource: S3Resource, filename: string = "") {
    const { publicPath } = resource;
    return `${publicPath}${filename}`;
  }

  getPublicS3Url(resource: S3Resource, filename: string = "") {
    const { publicUrl } = resource;
    return `${publicUrl}${filename}`;
  }

  private url(root: string, query: any = {}) {
    query.env = this.env;
    const keyValues = Object.keys(query)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
      .join('&');
    return `${root}?${keyValues}`;
  }

  private fetchFromServiceUrl(method: string, path: string, options?: { body?: any, readWriteToken?: string }) {
    return new Promise<any>((resolve, reject) => {
      const url = `${this.serviceUrl}${path}`;
      const requestOptions: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json"
        }
      };
      const authToken = options?.readWriteToken || this.jwt;
      if (authToken) {
        (requestOptions.headers as any)["Authorization"] = `Bearer ${authToken}`;
      }
      if (options?.body) {
        requestOptions.body = JSON.stringify(options.body);
      }
      return this.fetch(url, requestOptions)
        .then((resp) => resp.json())
        .then((json) => {
          if (json.status === "success") {
            resolve(json.result)
          }
          else {
            reject(json.error || json)
          }
        })
        .catch(reject)
    })
  }
}

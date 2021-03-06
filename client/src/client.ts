import {Credentials, Resource, FindAllQuery, CreateQuery, UpdateQuery, S3Resource } from "../../functions/src/resource-types"
import { getRWTokenFromAccessRules } from "../../functions/src/common-helpers";
export * from "../../functions/src/resource-types";

type EnvironmentName = "dev" | "staging" | "production"

export interface TokenServiceClientOptions {
  jwt?: string;
  env?: EnvironmentName;
  serviceUrl?: string;
}

const serviceUrls: {[k in EnvironmentName]: string} = {
  dev: "http://localhost:5000/api/v1/resources",
  staging: "https://token-service-staging.firebaseapp.com/api/v1/resources",
  production: "https://token-service-62822.firebaseapp.com/api/v1/resources"
};

const getEnv = (): EnvironmentName => {
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

  constructor (options: TokenServiceClientOptions) {
    const {jwt, serviceUrl} = options;
    this.jwt = jwt;
    this.env = options.env || getEnv();
    this.serviceUrl = getServiceUrlFromQueryString() || serviceUrl || getServiceUrlFromEnv(this.env) || serviceUrls.production;
  }

  static get FirebaseAppName() {
    return "token-service";
  }

  listResources(options: FindAllQuery) {
    return new Promise<Resource[]>((resolve, reject) => {
      return this.fetch("GET", this.url("/", options))
        .then(resolve)
        .catch(reject)
    })
  }

  getResource(resourceId: string) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetch("GET", this.url(`/${resourceId}`))
        .then(resolve)
        .catch(reject)
    })
  }

  createResource(options: CreateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetch("POST", this.url("/"), { body: options })
        .then(resolve)
        .catch(reject)
    })
  }

  updateResource(resourceId: string, options: UpdateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetch("PATCH", this.url(`/${resourceId}`), { body: options })
        .then(resolve)
        .catch(reject)
    })
  }

  // TODO: NB: This only deletes firestore record of the resource …
  deleteResource(resourceId: string) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetch("DELETE", this.url(`/${resourceId}`))
        .then(resolve)
        .catch(reject)
    })
  }

  getCredentials(resourceId: string, readWriteToken?: string) {
    return new Promise<Credentials>((resolve, reject) => {
      return this.fetch("POST", this.url(`/${resourceId}/credentials`), { readWriteToken })
        .then(resolve)
        .catch(reject)
    })
  }

  getReadWriteToken(resource: S3Resource): string | undefined {
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

  private fetch(method: string, path: string, options?: { body?: any, readWriteToken?: string }) {
    return new Promise<any>((resolve, reject) => {
      const url = `${this.serviceUrl}${path}`;
      const requestOptions: RequestInit = {
        method,
        headers: new Headers({
          "Content-Type": "application/json"
        })
      };
      const authToken = options?.readWriteToken || this.jwt;
      if (authToken) {
        (requestOptions.headers as Headers).set("Authorization", `Bearer ${authToken}`);
      }
      if (options?.body) {
        requestOptions.body = JSON.stringify(options.body);
      }
      return fetch(url, requestOptions)
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

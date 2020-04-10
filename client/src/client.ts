import {Credentials, Resource, FindAllQuery, CreateQuery, UpdateQuery, S3Resource} from "../../functions/src/resource-types"
export * from "../../functions/src/resource-types";

type EnvironmentName = "dev" | "staging" | "production"

export interface TokenServiceClientOptions {
  jwt: string;
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
}

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
}

export class TokenServiceClient {
  public readonly jwt: string;
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
      return this.fetch("POST", this.url("/"), options)
        .then(resolve)
        .catch(reject)
    })
  }

  updateResource(resourceId: string, options: UpdateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      return this.fetch("PATCH", this.url(`/${resourceId}`), options)
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

  getCredentials(resourceId: string) {
    return new Promise<Credentials>((resolve, reject) => {
      return this.fetch("POST", this.url(`/${resourceId}/credentials`))
        .then(resolve)
        .catch(reject)
    })
  }

  getPublicS3Path(resource: S3Resource, filename: string = "") {
    const { id, folder} = resource;
    return `${folder}/${id}/${filename}`;
  }

  getPublicS3Url(resource: S3Resource, filename: string = "") {
    const { bucket } = resource;
    const path = this.getPublicS3Path(resource, filename);
    if (bucket === "models-resources") {
      // use cloudfront for models resources
      return `https://models-resources.concord.org/${path}`;
    }
    return `https://${bucket}.s3.amazonaws.com/${path}`;
  }

  private url(root: string, query: any = {}) {
    query.env = this.env;
    const keyValues = Object.keys(query)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
      .join('&');
    return `${root}?${keyValues}`;
  }

  private fetch(method: string, path: string, body?: any) {
    return new Promise<any>((resolve, reject) => {
      const url = `${this.serviceUrl}${path}`;
      const options: RequestInit = {
        method,
        headers: new Headers({
          "Authorization": `Bearer ${this.jwt}`,
          "Content-Type": "application/json"
        })
      };
      if (body) {
        options.body = JSON.stringify(body);
      }
      return fetch(url, options)
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

import {Credentials, Resource, FindAllQuery, CreateQuery, UpdateQuery, S3Resource} from "./resource-types"
export * from "./resource-types";

const DEV_SERVICE_URL = "http://localhost:5000/api/v1/resources";
const PRODUCTION_SERVICE_URL = "https://token-service-62822.firebaseapp.com/api/v1/resources";

enum Env {DEV = "dev", STAGING = "staging", PRODUCTION = "production"}
const getEnv = (): Env => {
  const {host} = window.location;
  if (host.match(/staging\./)) {
    return Env.STAGING;
  }
  if (host.match(/concord\.org/)) {
    return Env.PRODUCTION;
  }
  return Env.DEV;
}
const env = getEnv();

const getServiceUrl = () => {
  const query = window.location.search.substring(1);
  const vars = query.split('&');
  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) === "token-service-url") {
      const url = decodeURIComponent(pair[1]);
      if (url === "dev") {
        return DEV_SERVICE_URL;
      }
      if (url === "prod") {
        return PRODUCTION_SERVICE_URL;
      }
      return url;
    }
  }
  return undefined;
}

export interface TokenServiceClientOptions {
  jwt: string;
  serviceUrl?: string;
}

export class TokenServiceClient {
  public readonly jwt: string;
  private serviceUrl: string;

  constructor (options: TokenServiceClientOptions) {
    const {jwt, serviceUrl} = options;
    this.jwt = jwt;
    this.serviceUrl = serviceUrl || getServiceUrl() || PRODUCTION_SERVICE_URL;
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
    query.env = env;
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


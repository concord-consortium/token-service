"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const serviceUrls = {
    dev: "http://localhost:5000/api/v1/resources",
    staging: "https://token-service-staging.firebaseapp.com/api/v1/resources",
    production: "https://token-service-62822.firebaseapp.com/api/v1/resources"
};
const getEnv = () => {
    const { host } = window.location;
    if (host.match(/staging\./)) {
        return "staging";
    }
    if (host.match(/concord\.org/)) {
        return "production";
    }
    return "dev";
};
const getServiceUrlFromEnv = (env) => {
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
            return getServiceUrlFromEnv(envOrUrl) || envOrUrl;
        }
    }
    return undefined;
};
class TokenServiceClient {
    constructor(options) {
        const { jwt, serviceUrl } = options;
        this.jwt = jwt;
        this.env = options.env || getEnv();
        this.serviceUrl = getServiceUrlFromQueryString() || serviceUrl || getServiceUrlFromEnv(this.env) || serviceUrls.production;
    }
    static get FirebaseAppName() {
        return "token-service";
    }
    listResources(options) {
        return new Promise((resolve, reject) => {
            return this.fetch("GET", this.url("/", options))
                .then(resolve)
                .catch(reject);
        });
    }
    getResource(resourceId) {
        return new Promise((resolve, reject) => {
            return this.fetch("GET", this.url(`/${resourceId}`))
                .then(resolve)
                .catch(reject);
        });
    }
    createResource(options) {
        return new Promise((resolve, reject) => {
            return this.fetch("POST", this.url("/"), options)
                .then(resolve)
                .catch(reject);
        });
    }
    updateResource(resourceId, options) {
        return new Promise((resolve, reject) => {
            return this.fetch("PATCH", this.url(`/${resourceId}`), options)
                .then(resolve)
                .catch(reject);
        });
    }
    getCredentials(resourceId) {
        return new Promise((resolve, reject) => {
            return this.fetch("POST", this.url(`/${resourceId}/credentials`))
                .then(resolve)
                .catch(reject);
        });
    }
    getPublicS3Path(resource, filename = "") {
        const { id, folder } = resource;
        return `${folder}/${id}/${filename}`;
    }
    getPublicS3Url(resource, filename = "") {
        const { bucket } = resource;
        const path = this.getPublicS3Path(resource, filename);
        if (bucket === "models-resources") {
            // use cloudfront for models resources
            return `https://models-resources.concord.org/${path}`;
        }
        return `https://${bucket}.s3.amazonaws.com/${path}`;
    }
    url(root, query = {}) {
        query.env = this.env;
        const keyValues = Object.keys(query)
            .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
            .join('&');
        return `${root}?${keyValues}`;
    }
    fetch(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = `${this.serviceUrl}${path}`;
            const options = {
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
                    resolve(json.result);
                }
                else {
                    reject(json.error || json);
                }
            })
                .catch(reject);
        });
    }
}
exports.TokenServiceClient = TokenServiceClient;
//# sourceMappingURL=client.js.map
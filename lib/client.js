"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DEV_SERVICE_URL = "http://localhost:5000/api/v1/resources";
const STAGING_SERVICE_URL = "?";
const PRODUCTION_SERVICE_URL = "?";
var Env;
(function (Env) {
    Env["DEV"] = "dev";
    Env["STAGING"] = "staging";
    Env["PRODUCTION"] = "production";
})(Env || (Env = {}));
const getEnv = () => {
    const { host } = window.location;
    if (host.match(/localhost|app\./)) {
        return Env.DEV;
    }
    if (host.match(/staging\./)) {
        return Env.STAGING;
    }
    return Env.PRODUCTION;
};
const env = getEnv();
class TokenServiceClient {
    constructor(options) {
        const { jwt, serviceUrl } = options;
        this.jwt = jwt;
        this.serviceUrl = serviceUrl || (env === Env.DEV ? DEV_SERVICE_URL : (env === Env.STAGING ? STAGING_SERVICE_URL : PRODUCTION_SERVICE_URL));
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
        query.env = env;
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
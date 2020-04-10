import ClientOAuth2 from "client-oauth2";
import { TokenServiceClient, S3Resource, S3ResourceTool } from "@concord-consortium/token-service";
import * as AWS from "aws-sdk";

// This file provides simple recipes showing how to use TokenServiceClient and how to get other necessary
// prerequisites (auth in Portal, firebase JWT).

const PORTAL_AUTH_PATH = "/auth/oauth_authorize";

const getURLParam = (name: string) => {
  const url = (self || window).location.href;
  name = name.replace(/[[]]/g, "\\$&");
  const regex = new RegExp(`[#?&]${name}(=([^&#]*)|&|#|$)`);
  const results = regex.exec(url);
  if (!results) return null;
  return decodeURIComponent(results[2].replace(/\+/g, " "));
};

export const authorizeInPortal = (portalUrl: string, oauthClientName: string) => {
  const portalAuth = new ClientOAuth2({
    clientId: oauthClientName,
    redirectUri: window.location.origin + window.location.pathname + window.location.search,
    authorizationUri: `${portalUrl}${PORTAL_AUTH_PATH}`
  });
  // Redirect
  window.location.href = portalAuth.token.getUri();
};

export const readPortalAccessToken = (): string => {
  // No error handling to keep the code minimal.
  return getURLParam("access_token") || "";
};

export const getFirebaseJwt = (portalUrl: string, portalAccessToken: string, firebaseAppName: string): Promise<string> => {
  const authHeader = { Authorization: `Bearer ${portalAccessToken}` };
  const firebaseTokenGettingUrl = `${portalUrl}/api/v1/jwt/firebase?firebase_app=${firebaseAppName}`;
  return fetch(firebaseTokenGettingUrl, { headers: authHeader })
    .then(response => response.json())
    .then(json => json.token)
};

export const uploadFileUsingFirebaseJWT = async (fileContent: string, firebaseJwt: string, tokenServiceEnv: "dev" | "staging") => {
  const client = new TokenServiceClient({ jwt: firebaseJwt, env: tokenServiceEnv });
  const filename = "test.txt";
  const resource: S3Resource = await client.createResource({
    tool: S3ResourceTool.ExampleApp,
    type: "s3Folder",
    name: filename,
    description: "test file",
    accessRuleRole: "owner",
    accessRuleType: "user",
    accessRules: []
  }) as S3Resource;
  console.log("new resource:", resource);

  const credentials = await client.getCredentials(resource.id);
  console.log("credentials:", credentials);

  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new AWS.S3({ region, accessKeyId, secretAccessKey, sessionToken });
  const publicPath = client.getPublicS3Path(resource, filename);

  const result = await s3.upload({
    Bucket: bucket,
    Key: publicPath,
    Body: fileContent,
    ContentType: "text/html",
    ContentEncoding: "UTF-8",
    CacheControl: "no-cache"
  }).promise();
  console.log(result);

  return client.getPublicS3Url(resource, filename);
};

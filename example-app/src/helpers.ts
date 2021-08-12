import ClientOAuth2 from "client-oauth2";
import { TokenServiceClient,
  EnvironmentName, ResourceType, Resource, Credentials } from "@concord-consortium/token-service";

// This is specific to this app. example-app-private uses a private S3 bucket that doesn't allow public access.
export type SupportedTool = "example-app" | "example-app-private";

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

interface ICreateResource {
  tool: SupportedTool;
  resourceType: ResourceType;
  resourceName: string;
  resourceDescription: string;
  firebaseJwt?: string;
  tokenServiceEnv: EnvironmentName;
}
export const createResource = async ({ tool, resourceType, resourceName, resourceDescription,
  firebaseJwt, tokenServiceEnv }: ICreateResource): Promise<Resource> => {
  // This function optionally accepts firebaseJWT. There are three things that depend on authentication method:
  // - TokenServiceClient constructor arguments. If user should be authenticated during every call to the API, provide `jwt` param.
  // - createResource call. If user is not authenticated, "readWriteToken" accessRule type must be used. Token Service will generate and return readWriteToken.
  const anonymous = !firebaseJwt;

  // The client will be anonymous if firebaseJwt undefined
  const client = new TokenServiceClient({ env: tokenServiceEnv, jwt: firebaseJwt })
  return client.createResource({
    tool,
    type: resourceType,
    name: resourceName,
    description: resourceDescription,
    accessRuleType: anonymous ? "readWriteToken" : "user"
  })
}

interface IDeleteResource {
  resource: Resource;
  firebaseJwt: string;
  tokenServiceEnv: EnvironmentName;
}
export const deleteResource = async ({resource, firebaseJwt,
  tokenServiceEnv}: IDeleteResource) => {

  const client = new TokenServiceClient({ env: tokenServiceEnv, jwt: firebaseJwt });

  return client.deleteResource(resource.id);
}

interface IGetCredentials {
  resource: Resource;
  firebaseJwt?: string;
  tokenServiceEnv: EnvironmentName;
}
export const getCredentials = async ({resource, firebaseJwt,
  tokenServiceEnv}: IGetCredentials): Promise<Credentials> => {

  // The jwt will be ignored if there is a readWriteToken on the resource
  const client = new TokenServiceClient({ env: tokenServiceEnv, jwt: firebaseJwt })
  const readWriteToken = client.getReadWriteToken(resource) || "";

  return readWriteToken ? await client.getCredentials(resource.id, readWriteToken) :  await client.getCredentials(resource.id);
}

export const listResources = async (tool: SupportedTool, firebaseJwt: string, amOwner: boolean,
  tokenServiceEnv: EnvironmentName, resourceType: ResourceType) => {
  const client = new TokenServiceClient({ jwt: firebaseJwt, env: tokenServiceEnv });
  return client.listResources({
    tool,
    type: resourceType,
    amOwner: amOwner ? "true" : "false"
  });
};

export const logAllResources = async (tool: SupportedTool, firebaseJwt: string,
  tokenServiceEnv: EnvironmentName, resourceType: ResourceType = "s3Folder") => {
  const resources = await listResources(tool, firebaseJwt, false, tokenServiceEnv, resourceType);
  console.log(resources);
};

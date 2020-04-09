# Token Service

Provides a CRUD api to create resources and an api endpoint to generate AWS credentials from those resources.

## Client

A client is published in the @concord-consortium/token-service package that handles talking to the server.  Written in TypeScript, it emits type definitions so that it can be imported with types in another TypeScript package.

The client constructor has the following options defined in `functions/client.ts`:

```
type EnvironmentName = "dev" | "staging" | "production"

export interface TokenServiceClientOptions {
  jwt: string;
  env?: EnvironmentName;
  serviceUrl?: string;
}
```

The `jwt` option is required and the serviceUrl and env options are optional.  If the `env` option is not supplied it is determined via the window location.  If the `serviceUrl` option is not supplied it falls back to using the service url defined for the `env` and if that is not found defaults to the production service.  The serviceUrl option can be overridden via the `token-service-url` query parameter.

## API

All api endpoints require the request to use `Content-Type: application/json` and a portal generated Firebase JWT.  The JWT can be provided by any of the following three methods:

- As a bearer token using the `Authorization: Bearer <token>` format
- As query string parameter named `token`
- As a cookie named `token`

### `GET /api/v1/resources`

Optional query string parameters:

- `name` - name of the resource
- `type` - type of the resource, currently s3Folder or iotOrganization
- `tool` - tool based on type of the resource, currently glossary, rubric or dataFlow
- `amOwner` - if `true` then only resources owned by the user are returned

returns a 200 status code when successful with JSON array of resources.  Any errors are returned with a 400 status code.

### `GET /api/v1/resources/:id`

Returns a 200 status code with a single resource specified by the id.  Any errors are returned with a 404 status code.

### `POST /api/v1/resources`

Required POST body parameters:

- `name` - name of the resource
- `description` - description of the resource
- `type` - type of the resource, currently s3Folder or iotOrganization
- `tool` - tool based on type of the resource, currently glossary, rubric or dataFlow
- `accessRuleType` - user or context
- `accessRuleRole` - owner or member

Returns a 201 status code with a single resource that was created.  Any errors are returned with a 400 status code.

### `PATCH /api/v1/resources/:id`

Optional PATCH body parameters:

- `name` - name of the resource
- `description` - description of the resource
- `accessRules` - an array of access rules
- `bucket` - if the resource type is `s3Folder` then this updates the bucket
- `folder` -if the resource type is `s3Folder` then this updates the folder

Returns a 200 status code with a single resource that was updated.  Any errors are returned with a 400 status code.

### `POST /api/v1/resources/:id/credentials`

No parameters.

Returns a 200 status code with the temporary aws credentials.  Any errors are returned with a 400 status code.


## Creating new S3ResourceTools

To Create a new S3 Resource tool, add the tool name to the `S3ResourceTool` in
`resource-types.ts`. You will also need to create a resourceSettings document
in FireStore for each environment you work in, eg: `staging:resourceSettings`
The entry should look like this:

```javascript

  bucket: "token-service-files",
  folder: "vortex",     // good idea to match `tool` below.
  region: "us-east-1",
  tool: "vortex",       // Use your tool's name as defined in resource-types.ts
  type: "s3Folder"

```

## Development Setup

### Local Firebase function development

#### Basic Firebase setup (done once)

1. Install [Firebase CLI](https://firebase.google.com/docs/cli#mac-linux-npm): `npm i -g firebase-tools`  
2. Run `firebase login`
3. Run `firebase use staging` to use https://console.firebase.google.com/project/token-service-staging Firebase project (to use production version: `firebase use default`).
4. Run `firebase functions:config:get > functions/.runtimeconfig.json` to copy down the runtime environment
5. Set up admin credentials:
  - Open https://console.firebase.google.com/project/token-service-staging/settings/serviceaccounts/adminsdk
  - Click "Generate New Private Key" and download JSON file
  - Change its name to `key.json` and copy it to `functions/key.json` - it will be automatically exported in ENV variable in `npm serve` script (check `functions/package.json`)
  - .gitignore lists `key.json` - never commit or share this file


#### Firebase Functions and Client setup

1. `cd functions` 
2. Run `npm i` to load all the dependencies
3. Run `npm start` to start all servers

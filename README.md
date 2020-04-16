# Token Service

Provides a CRUD api to create resources and an api endpoint to generate AWS credentials from those resources.

## Client (`client` subdirectory)

A client is published in the @concord-consortium/token-service package that handles talking to the server.  Written in TypeScript, it emits type definitions so that it can be imported with types in another TypeScript package.

The client constructor has the following options defined in `client/src/client.ts`:

```
type EnvironmentName = "dev" | "staging" | "production"

export interface TokenServiceClientOptions {
  jwt: string;
  env?: EnvironmentName;
  serviceUrl?: string;
}
```

The `jwt` option is required and the serviceUrl and env options are optional.  If the `env` option is not supplied it is determined via the window location.  If the `serviceUrl` option is not supplied it falls back to using the service url defined for the `env` and if that is not found defaults to the production service.  The serviceUrl option can be overridden via the `token-service-url` query parameter.

## Example App (`example-app` subdirectory)

http://token-service.concord.org/example-app/index.html

This app is designed to show the simplest possible way to use Token Service (TokenServiceClient) and it's meant to be
used by developers to work on the new Token Service features or to provide recipes how to use its API.
Note that errors are not handled, so in the real applications, you should consider adding that. It's not done here
on purpose to keep the code smaller and less opinionated.

## API (`functions` subdirectory)

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

To Create a new S3 Resource tool, create a resourceSettings document
in FireStore for each environment you work in, eg: `staging:resourceSettings`
The entry should look like this:

```javascript
  bucket: "token-service-files",
  folder: "example-app",   // good idea to match `tool` below.
  region: "us-east-1",
  tool: "example-app",
  type: "s3Folder",
  allowedAccessRuleTypes: ["user", "context"] // optionally "readWriteToken", check AccessRuleType type for all allowed values
```

## Development Setup

### TokenServiceClient

1. `cd client` (all the commands below should be executed in `client/` dir)
2. Run `npm i`
3. Run `npm run build`

It will create `lib/` dir with client JS files.

### Example App

This app is using TokenServiceClient. It is linked in the example-app/package.json using relative path `../client`. 
It lets you develop the client and the example app together. But it means that the client needs to be built first 
(follow steps described in Development Setup > TokenServiceClient).
Also, TokenServiceClient needs to be rebuilt each time there are some changes that you would like to use in the example 
app. Its build process can also be run directly from example-app dir using `npm run client:build`.

To start local server with example app:

1. `cd functions` (all the commands below should be executed in `example-app/` dir)
2. Install dependencies: `npm i`
3. Start local server: `npm start`

### Firebase functions

#### Basic Firebase setup (done once)

1. `cd functions` (all the commands below should be executed in `functions/` dir)
1. Run `npx firebase login`
2. Run `npx firebase use staging` to use https://console.firebase.google.com/project/token-service-staging Firebase project (to use production version: `firebase use default`).
3. Run `npx firebase functions:config:get > .runtimeconfig.json` to copy down the runtime environment
4. Set up admin credentials:
  - Open https://console.firebase.google.com/project/token-service-staging/settings/serviceaccounts/adminsdk
  - Click "Generate New Private Key" and download JSON file
  - Change its name to `key.json` and copy it to `functions/key.json` - it will be automatically exported in ENV variable in `npm serve` script (check `functions/package.json`)
  - .gitignore lists `key.json` - never commit or share this file


#### Firebase Functions server

1. `cd functions` (all the commands below should be executed in `functions/` dir)
2. Run `npm i` to load all the dependencies
3. Run `npm start` to start all servers

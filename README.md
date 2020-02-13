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

## Development Setup

0. Install the firebase node module `npm i firebase`
1. Run `npm i` to load all the dependencies
2. Run `npx firebase functions:config:get > .runtimeconfig.json` ONCE to copy down the runtime environment and then CHANGE it to use the QA environment settings during development (noteably the aws.rolearn)
2. Run `npm start` to start all servers

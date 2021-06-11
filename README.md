# Token Service

The Token Service provides a way for browser based applications to get credentials to access cloud services. This is done by maintaining a database of tools and resources. The tools represent the browser based application. The resources represent the parts of the cloud services that a particular user or group should have access to.  A tool can request temporary credentials for a resource on behalf of a user.

Users are authenticated with the token service using a Firebase JWT which can be obtained from the Concord portal.

The Token Service is similar to some features provided by AWS Cognito. A key difference is that users can create new resources themselves in the token service. This allows them to create places in the cloud services to work or store files which only that user can access. This also means we need to be careful what features of the cloud services we expose so users cannot intentionally or unintentionally incur large costs, or abuse the services.

Currently the Token Service supports two types of resources:
- AWS S3 Folders
- AWS Athena Workgroups

## Client (`client` subdirectory)

A javascript client is published in the @concord-consortium/token-service package that handles talking to the token service.  Written in TypeScript, it emits type definitions so that it can be imported with types in another TypeScript package.

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

This app is designed to show how to use Token Service (TokenServiceClient) and it's meant to be used by developers to work on the new Token Service features or to provide recipes showing how to use its API.
Note that errors are not handled, so in the real applications, you should consider adding that. It's not done here on purpose to keep the code smaller and less opinionated.

## Service API (`functions` subdirectory)

This is the actual token service code. It implements a [REST API](docs/api.md) to interact with resources. If possible, your browser based app should use the client library above to work with the API instead of directly using the API.

## Administration

### Creating new S3ResourceTools

To Create a new S3 Resource tool, create a resourceSettings document
in FireStore for each environment you work in, eg: `staging:resourceSettings`
The entry should look like this:

```javascript
  bucket: "token-service-files",
  folder: "example-app",   // good idea to match `tool` below.
  region: "us-east-1",
  tool: "example-app",
  type: "s3Folder",
  allowedAccessRuleTypes: ["user", "context"], // optionally "readWriteToken", check AccessRuleType type for all allowed values
  domain: "https://cloudfront.domain.com", // optionally domain that will be used to construct public URL, usually a cloudfront domain
  domainIncludesFolder: true // optional, but it needs to be set when the domain points to S3 bucket folder, not just the root. It prevents token-service from appending folder to the path and URL again.
```

### Creating new AthenaWorkgroupTools

To Create a new Athena Workgroup Resource tool, create a resourceSettings document
in FireStore for each environment you work in, eg: `staging:resourceSettings`
The entry should look like this:

```javascript
  bucket: "token-service-files",
  folder: "example-app",
  region: "us-east-1",
  tool: "example-app",
  type: "athenaWorkgroup",
  allowedAccessRuleTypes: ["user"],
  // AWS account where Athena instance is located
  account: "123456"
```

### Configuration

The Service API is configured using a [Firebase environment](https://firebase.google.com/docs/functions/config-env). In JSON form the environment looks like this:

```
"aws": {
  "key": "<AWS api key>",
  "secret": "<AWS api secret key>",
  "rolearn": "<AWS Role ARN>",
  "duration": "3600"
},
"admin": {
  "public_key": "<public key to validate JWT tokens>"
}
```

- `aws.key` and `aws.secret` are the AWS API keys for an AWS IAM user.
- `aws.rolearn` is an ARN (AWS Resource Name) for an AWS IAM Role. This role must have a trust relationship with the AWS IAM user above. This role defines the permissions the token service has in AWS. The token service can only provide credentials to clients that grant permissions which are a subset of this Role's permissions.
- `aws.duration` is the time in seconds that the temporary credentials are valid
- `admin.public_key` is the public side of an asymmetric pair. The private side is stored in the portal and is used to sign the JWTs generated by the portal.

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

1. `cd example-app` (all the commands below should be executed in `example-app/` dir)
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

### Testing

1. `cd functions` (all the commands below should be executed in `functions/` dir)
2. `npm run test:with-emulator` starts Firestore emulator and run all the tests
3. Alternatively, you can start emulator first using: `npm run firestore-emulator` and then use
   `npm test` or `npm run test:watch`. This is better for development, as emulator doesn't have to start
   and shutdown each time.

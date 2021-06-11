## Service API

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

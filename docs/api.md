## Service API

All api endpoints require the request to use `Content-Type: application/json` and a portal generated Firebase JWT.  The JWT can be provided by any of the following three methods:

- As a bearer token using the `Authorization: Bearer <token>` format
- As query string parameter named `token`
- As a cookie named `token`

### `GET /api/v1/resources`

Optional query string parameters:

- `name` - name of the resource
- `type` - type of the resource, currently s3Folder, iotOrganization or athenaWorkgroup
- `tool` - tool based on type of the resource, e.g. glossary, rubric or dataFlow
- `amOwner` - if `true` then only resources owned by the user are returned

returns a 200 status code when successful with JSON array of resources.  Any errors are returned with a 400 status code.

### `GET /api/v1/resources/:id`

Returns a 200 status code with a single resource specified by the id.  Any errors are returned with a 404 status code.

### `POST /api/v1/resources`

Required POST body parameters:

- `name` - name of the resource
- `description` - description of the resource
- `type` - type of the resource, currently s3Folder, iotOrganization or athenaWorkgroup
- `tool` - tool based on type of the resource, e.g. glossary, rubric or dataFlow
- `accessRuleType` - user, context or readWriteToken (string or array of strings). The string form `context` automatically adds a `user` owner rule so the creator keeps control; array forms are applied verbatim (an array without `user` creates a resource that can never be updated or deleted). `authenticated` rules cannot be created via the API; they are added to a resource document directly in Firestore by an admin.
- `accessRuleRole` - owner or member

Returns a 201 status code with a single resource that was created.  Any errors are returned with a 400 status code.

### `PATCH /api/v1/resources/:id`

Optional PATCH body parameters:

- `name` - name of the resource
- `description` - description of the resource
- `accessRules` - an array of access rules

Note: an `accessRules` array containing an `authenticated` rule is always rejected — `authenticated` rules cannot be set via the API and are added to the resource document directly in Firestore by an admin.

Returns a 200 status code with a single resource that was updated.  Any errors are returned with a 400 status code.

### `POST /api/v1/resources/:id/credentials`

No parameters.

Credentials are granted according to the resource's access rules; a resource with an `authenticated` rule grants credentials to any user with a valid portal JWT.

Returns a 200 status code with the temporary aws credentials.  Any errors are returned with a 400 status code.

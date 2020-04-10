# Token Service Example App

This app is designed to show the simplest possible way to use Token Service (TokenServiceClient) and it's meant to be
used by developers to work on the new Token Service features or to provide recipes how to use its API.
Note that errors are not handled, so in the real applications, you should consider adding that. It's not done here
on purpose to keep the code smaller and less opinionated.

## Development Setup

### Build TokenServiceClient

TokenServiceClient is linked in the package.json using relative path `..`. It lets you develop both client and
example app together. But it means that it needs to be build first.

1. Go to the main token-service dir: `cd ..`
2. Install dependencies: `npm i`
3. Build client: `npm run client:build`

The last step should be repeated each time there are some changes to the client library that you would like to use 
in the example app. It can be run directly from this folder using `npm run client:build`.


### Example App

1. Install dependencies: `npm i`
2. Start local server: `npm start`

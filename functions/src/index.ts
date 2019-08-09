import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { Resource } from './resource';
import { JWTClaims } from './firestore-types';

// insert custom data and handlers in type declarations
declare global {
  namespace Express {
    interface Request {
      claims: JWTClaims;
    }
    interface Response {
      success: (data: any) => Response
      error: (code: number, error: any) => Response
    }
  }
}

admin.initializeApp(functions.config().firebase);
admin.firestore().settings({
  timestampsInSnapshots: true   // this removes a deprecation warning
})
const db = admin.firestore();

const apiV1 = express();
const main = express();

main.use('/api/v1', apiV1);

// create custom api response handlers
const customHandlers = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.success = (result: any) => {
    result.status = 'success';
    return res.status(200).json(result);
  }
  res.error = (code: number, error: any) => res.status(code).json({status: 'error', error: error.toString()});
  next();
};

const genericErrorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("genericErrorHandler");
  res.error(500, err);
};

main.use(customHandlers);
apiV1.use(customHandlers);
main.use(genericErrorHandler);
apiV1.use(genericErrorHandler);

main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));
main.use(cors());

// check authorization token
const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {

  const token = "SKIP!";

  /*
  let token: string | null = null;
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  */

  if (token) {
    /*
    admin
      .auth()
      .verifyIdToken(token)
      .then((decodedToken) => {
        req.claims = decodedToken.claims;
        next();
      })
      .catch(error => res.error(403, error))
    */

    req.claims = {
      userId: "testUserId",
      platformId: "testPlatformId",
      contextId: "testContextId"
    };
    next();
  }
  else {
    res.error(400, "Missing token in headers, query or cookie");
  }
};
main.use(checkAuth);
apiV1.use(checkAuth);

apiV1.get('/resources', (req, res) => {
  return Resource.FindAll(db, req.claims, req.query)
    .then(resources => resources.map(resource => resource.sanitizeApiResult(req.method)))
    .then(sanitizedResources => res.success(sanitizedResources))
    .catch(error => res.error(400, error))
})

apiV1.get('/resources/:id', (req, res) => {
  return Resource.Find(db, req.params.id)
    .then(resource => resource.sanitizeApiResult(req.method))
    .then(sanitizedResource => res.success(sanitizedResource))
    .catch(error => res.error(404, error))
})

apiV1.post('/resources', (req, res) => {
  return Resource.Create(db, req.claims, req.body)
    .then(resource => resource.sanitizeApiResult(req.method))
    .then(sanitizedResource => res.success(sanitizedResource))
    .catch(error => res.error(400, error))
})

apiV1.patch('/resources/:id', (req, res) => {
  return Resource.Update(db, req.claims, req.params.id, req.body)
    .then(resource => resource.sanitizeApiResult(req.method))
    .then(sanitizedResource => res.success(sanitizedResource))
    .catch(error => res.error(400, error))
})

apiV1.post('/resources/:id/aws-keys', (req, res) => {
  return Resource.CreateAWSKeys(db, req.claims, req.params.id)
    .then(awsTemporaryCredentials => res.success(awsTemporaryCredentials))
    .catch(error => res.error(400, error))
})

export const webApiV1 = functions.https.onRequest(main);


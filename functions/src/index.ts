import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { BaseResourceObject } from './resource';
import { Config } from './resource-types';
import { JWTClaims } from './firestore-types';

// insert custom data and handlers in type declarations
declare global {
  namespace Express {
    interface Request {
      claims: JWTClaims;
    }
    interface Response {
      success: (data: any, code?: number) => Response
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
  res.success = (result: any, code: number = 200) => {
    return res.status(code).json({
      status: "success",
      result
    });
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
apiV1.use(cors());

main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));
main.use(cors());

// check authorization token
const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {

  let token: string | null = null;
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    if (token !== "test") {
      res.error(400, "Invalid token!");
      return;
    }

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

const getValidatedConfig = () => {
  return new Promise<Config>((resolve, reject) => {
    const config = functions.config() as Config;
    if (!config.aws) {
      reject("Missing aws object in config!");
      return;
    }
    if (!config.aws.key) {
      reject("Missing aws.key in config!");
      return;
    }
    if (!config.aws.secret) {
      reject("Missing aws.secret in config!");
      return;
    }
    if (!config.aws.s3credentials) {
      reject("Missing aws.s3credentials object in config!");
      return;
    }
    if (!config.aws.s3credentials.rolearn) {
      reject("Missing aws.s3credentials.rolearn in config!");
      return;
    }
    if (!config.aws.s3credentials.duration) {
      reject("Missing aws.s3credentials.duration in config!");
      return;
    }
    // configs are stored as strings but we want duration as a number
    const duration = parseInt(config.aws.s3credentials.duration as unknown as string, 10);
    if (isNaN(duration)) {
      reject("aws.s3credentials.duration is not convertable to an integer!");
      return;
    }
    config.aws.s3credentials.duration = duration;
    resolve(config);
  })
}

apiV1.get('/resources', (req, res) => {
  return BaseResourceObject.FindAll(db, req.claims, req.query)
    .then(resources => resources.map((resource) => resource.apiResult()))
    .then(apiResults => res.success(apiResults))
    .catch(error => res.error(400, error))
})

apiV1.get('/resources/:id', (req, res) => {
  return BaseResourceObject.Find(db, req.params.id)
    .then(resource => res.success(resource.apiResult()))
    .catch(error => res.error(404, error))
})

apiV1.post('/resources', (req, res) => {
  return BaseResourceObject.Create(db, req.claims, req.body)
    .then(resource => res.success(resource.apiResult(), 201))
    .catch(error => res.error(400, error))
})

apiV1.patch('/resources/:id', (req, res) => {
  return BaseResourceObject.Update(db, req.claims, req.params.id, req.body)
    .then(resource => res.success(resource.apiResult()))
    .catch(error => res.error(400, error))
})

apiV1.post('/resources/:id/credentials', (req, res) => {
  return getValidatedConfig()
          .then((config) => BaseResourceObject.CreateAWSKeys(db, req.claims, req.params.id, config))
          .then(awsTemporaryCredentials => res.success(awsTemporaryCredentials))
          .catch(error => res.error(400, error))
})

export const webApiV1 = functions.https.onRequest(main);


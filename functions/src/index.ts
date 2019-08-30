import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { BaseResourceObject } from './resource';
import { Config } from './resource-types';
import { JWTClaims } from './firestore-types';
import { verify } from 'jsonwebtoken';

// insert custom data and handlers in type declarations
declare global {
  namespace Express {
    interface Request {
      claims: JWTClaims;
      env: string;
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

const app = express();

// create custom api response handlers
const customHandlers = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.success = (result: any, code: number = 200) => {
    return res.status(code).json({
      status: "success",
      result
    });
  }
  res.error = (code: number, error: any) => res.status(code).json({ status: 'error', error: error.toString() });
  next();
};

const genericErrorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.error(500, err);
};

const getValidatedConfig = () => {
  return new Promise<Config>((resolve, reject) => {
    const config = functions.config() as Config;
    if (!config.admin) {
      reject("Missing admin object in config!");
      return;
    }
    if (!config.admin.public_key) {
      reject("Missing admin.public_key in config!");
      return;
    }
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

// check authorization token
const checkAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {

  let token: string | undefined = undefined;
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  getValidatedConfig()
    .then((config) => {
      if (!token) {
        res.error(400, "Missing token in headers, query or cookie");
      }
      else if (token === "test") {
        req.claims = {
          user_id: "http://example.com/users/test",
          platform_user_id: "test",
          platform_id: "http://example.com",
          context_id: "testContextId"
        };
        next();
      }
      else {
        const public_key = config.admin.public_key.split("\\n").join("\n");
        verify(token, public_key, { algorithms: ["RS256"] }, (error, decoded: any) => {
          if (error) {
            res.error(403, error);
          }
          else {
            const claims = decoded.claims as JWTClaims;
            if (!claims.user_id) {
              res.error(403, "Missing user_id in JWT claims!");
            }
            if (!claims.platform_user_id) {
              res.error(403, "Missing platform_user_id in JWT claims!");
            }
            if (!claims.platform_id) {
              res.error(403, "Missing platform_id in JWT claims!");
            }
            // context_id is optional so don't test for it
            // TODO: context_id is still "class_hash" rigse jwt_controller.rb - should it be class_hash here?
            req.claims = claims;
            next();
          }
        })
      }
    })
    .catch(error => res.error(403, error))
};

app.use(customHandlers);
app.use(genericErrorHandler);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(checkAuth);

const checkEnv = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { env } = req.query;
  if (!env) {
    res.error(403, "Missing env query parameter!");
  }
  else {
    req.env = env;
    next();
  }
};
app.use(checkEnv);

app.get('/api/v1/resources', (req, res) => {
  return BaseResourceObject.FindAll(db, req.env, req.claims, req.query)
    .then(resources => resources.map((resource) => resource.apiResult()))
    .then(apiResults => res.success(apiResults))
    .catch(error => res.error(400, error))
})

app.get('/api/v1/resources/:id', (req, res) => {
  return BaseResourceObject.Find(db, req.env, req.params.id)
    .then(resource => res.success(resource.apiResult()))
    .catch(error => res.error(404, error))
})

app.post('/api/v1/resources', (req, res) => {
  return BaseResourceObject.Create(db, req.env, req.claims, req.body)
    .then(resource => res.success(resource.apiResult(), 201))
    .catch(error => res.error(400, error))
})

app.patch('/api/v1/resources/:id', (req, res) => {
  return BaseResourceObject.Update(db, req.env, req.claims, req.params.id, req.body)
    .then(resource => res.success(resource.apiResult()))
    .catch(error => res.error(400, error))
})

app.post('/api/v1/resources/:id/credentials', (req, res) => {
  return getValidatedConfig()
    .then((config) => BaseResourceObject.CreateAWSKeys(db, req.env, req.claims, req.params.id, config))
    .then(awsTemporaryCredentials => res.success(awsTemporaryCredentials))
    .catch(error => res.error(400, error))
})

export const webApiV1 = functions.https.onRequest(app);


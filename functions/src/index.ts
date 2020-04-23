import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { BaseResourceObject } from './base-resource-object';
import { getRWTokenFromAccessRules } from './common-helpers';
import { makeCachedSettingsGetter } from './helpers'
import { Config, ReadWriteTokenPrefix } from './resource-types';
import { AuthClaims, JWTClaims } from './firestore-types';
import { verify } from 'jsonwebtoken';

// insert custom data and handlers in type declarations
declare global {
  namespace Express {
    interface Request {
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
});
export const db = admin.firestore();

const app = express();

// create custom api response handlers
const customHandlers = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.success = (result: any, code: number = 200) => {
    return res.status(code).json({
      status: "success",
      result
    });
  };
  res.error = (code: number, error: any) => res.status(code).json({ status: 'error', error: error.toString() });
  next();
};

const genericErrorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.error(500, err);
};

const checkEnv = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { env } = req.query;
  if (!env) {
    res.error(403, "Missing env query parameter!");
  }
  else {
    req.env = env as string;
    next();
  }
};

const getValidatedConfig = () => {
  const config = functions.config() as Config;
  if (!config.admin) {
    throw new Error("Missing admin object in config!");
  }
  if (!config.admin.public_key) {
    throw new Error("Missing admin.public_key in config!");
  }
  if (!config.aws) {
    throw new Error("Missing aws object in config!");
  }
  if (!config.aws.key) {
    throw new Error("Missing aws.key in config!");
  }
  if (!config.aws.secret) {
    throw new Error("Missing aws.secret in config!");
  }
  if (!config.aws.s3credentials) {
    throw new Error("Missing aws.s3credentials object in config!");
  }
  if (!config.aws.s3credentials.rolearn) {
    throw new Error("Missing aws.s3credentials.rolearn in config!");
  }
  if (!config.aws.s3credentials.duration) {
    throw new Error("Missing aws.s3credentials.duration in config!");
  }
  // configs are stored as strings but we want duration as a number
  const duration = parseInt(config.aws.s3credentials.duration as unknown as string, 10);
  if (isNaN(duration)) {
    throw new Error("aws.s3credentials.duration is not convertable to an integer!");
  }
  config.aws.s3credentials.duration = duration;
  return config;
};

const getToken = (req: express.Request): string | undefined => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    return req.query.token as string;
  } else if (req.cookies && req.cookies.token) {
    return  req.cookies.token;
  }
  return undefined;
};

const getClaimsFromJWT = (token: string): JWTClaims => {
  if (token === "test") {
    return {
      user_id: "http://example.com/users/test",
      platform_user_id: "test",
      platform_id: "http://example.com",
      context_id: "testContextId"
    };
  }
  else {
    const config = getValidatedConfig();
    const publicKey = config.admin.public_key.split("\\n").join("\n");
    const decoded: any = verify(token, publicKey, { algorithms: ["RS256"] });
    if (typeof decoded !== "object" || decoded.claims === undefined) {
      throw new Error("Invalid token!");
    }
    const claims = decoded.claims as JWTClaims;
    if (!claims.user_id) {
      throw new Error("Missing user_id in JWT claims!");
    }
    if (!claims.platform_user_id) {
      throw new Error("Missing platform_user_id in JWT claims!");
    }
    if (!claims.platform_id) {
      throw new Error("Missing platform_id in JWT claims!");
    }
    // context_id is optional so don't test for it
    // TODO: context_id is still "class_hash" rigse jwt_controller.rb - should it be class_hash here?
    return claims;
  }
};

const authenticate = (req: express.Request): AuthClaims => {
  const token = getToken(req);
  if (!token) {
    throw new Error("Missing token in headers, query or cookie");
  } else if (token.startsWith(ReadWriteTokenPrefix)) {
    return { readWriteToken: token };
  } else {
    return getClaimsFromJWT(token);
  }
};

const optionallyAuthUsingJWT = (req: express.Request): JWTClaims | undefined => {
  const token = getToken(req);
  if (token) {
    // If token is present, check it and validate. Note that at this point exceptions might be thrown.
    // Do not fallback to anonymous path if token is malformed.
    return getClaimsFromJWT(token);
  } else {
    // If token is not present, it means that it's anonymous user.
    return undefined;
  }
}

const optionallyAuthenticate = (req: express.Request): AuthClaims | undefined => {
  const token = getToken(req);
  if (token) {
    // If token is present, check it and validate. Note that at this point exceptions might be thrown.
    // Do not fallback to anonymous path if token is malformed.
    return authenticate(req);
  } else {
    // If token is not present, it means that it's anonymous user.
    return undefined;
  }
}

app.use(customHandlers);
app.use(genericErrorHandler);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(checkEnv);

app.get('/api/v1/test', (req, res) => {
  res.success("test OK");
});

app.post('/api/v1/test', (req, res) => {
  db.collection("test").doc("test-doc").set(req.body)
    .then(() => res.success("test write OK"))
    .catch(error => res.error(400, error));
});

app.get('/api/v1/resources', (req, res) => {
  // Use caching here to avoid hitting Firestore db for every resource that is being returned.
  const getCachedSettings = makeCachedSettingsGetter(db, req.env);
  try {
    // Auth/claims are optional and necessary only if user wants to see more details or his own resources only.
    const claims = optionallyAuthUsingJWT(req);
    BaseResourceObject.FindAll(db, req.env, claims, req.query)
      .then(resources => Promise.all(resources.map(async resource => resource.apiResult(claims, await getCachedSettings(resource.type, resource.tool)))))
      .then(apiResults => res.success(apiResults))
      .catch(error => res.error(400, error));
  } catch (error) {
    // Auth token must have been malformed. In this case return 403 error, don't fallback to anonymous path.
    res.error(403, error);
  }
});

app.get('/api/v1/resources/:id', (req, res) => {
  try {
    const claims = optionallyAuthenticate(req);
    BaseResourceObject.Find(db, req.env, req.params.id)
      .then(async resource => res.success(resource.apiResult(claims, await BaseResourceObject.GetResourceSettings(db, req.env, resource.type, resource.tool))))
      .catch(error => res.error(404, error))
  } catch (error) {
    // Auth token must have been malformed. In this case return 403 error, don't fallback to anonymous path.
    res.error(403, error);
  }
});

app.post('/api/v1/resources', (req, res) => {
  try {
    const claims = optionallyAuthUsingJWT(req);
    BaseResourceObject.Create(db, req.env, claims, req.body)
      .then(async resource => {
        let authClaims: AuthClaims | undefined = claims;
        if (!authClaims) {
          // Generate auth claims if resource has been created anonymously to return readWriteToken to the owner.
          const readWriteToken = getRWTokenFromAccessRules(resource);
          authClaims = readWriteToken ? { readWriteToken } : undefined;
        }
        res.success(resource.apiResult(authClaims, await BaseResourceObject.GetResourceSettings(db, req.env, resource.type, resource.tool)), 201);
      })
      .catch(error => res.error(400, error));
  } catch (error) {
    // Auth token must have been malformed. In this case return 403 error, don't fallback to anonymous path.
    res.error(403, error);
  }
});

app.patch('/api/v1/resources/:id', (req, res) => {
  try {
    const claims = authenticate(req);
    BaseResourceObject.Update(db, req.env, claims, req.params.id, req.body)
      .then(async resource => res.success(resource.apiResult(claims, await BaseResourceObject.GetResourceSettings(db, req.env, resource.type, resource.tool))))
      .catch(error => res.error(400, error))
  } catch (error) {
    res.error(403, error);
  }
});

app.post('/api/v1/resources/:id/credentials', (req, res) => {
  try {
    const claims = authenticate(req);
    const config = getValidatedConfig();
    BaseResourceObject.CreateAWSKeys(db, req.env, claims, req.params.id, config)
      .then(awsTemporaryCredentials => res.success(awsTemporaryCredentials))
      .catch(error => res.error(400, error))
  } catch (error) {
    res.error(403, error);
  }
});

app.delete('/api/v1/resources/:id', (req, res) => {
  try {
    const claims = authenticate(req);
    BaseResourceObject
      .delete(db, req.env, claims, req.params.id, req.body)
      .then(deleteDate => res.success({ date: deleteDate }))
      .catch(error => res.error(400, error));
  } catch (error) {
    res.error(403, error);
  }
});

export const webApiV1 = functions.https.onRequest(app);

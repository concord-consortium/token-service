import { JWTClaims, FireStoreResource, FireStoreResourceSettings, FireStoreS3ResourceSettings, AuthClaims } from "./firestore-types";
import {
  ResourceType, AccessRule, AccessRuleRole, UserAccessRule,
  FindAllQuery, CreateQuery, UpdateQuery, Credentials, Config,
  BaseResource, IotResource, ReadWriteTokenAccessRule, ReadWriteTokenPrefix, S3Resource, WithOptional
} from "./resource-types";
import { STS } from "aws-sdk";
import * as crypto from "crypto";

const RESOURCE_COLLECTION_ID = 'resources';
const RESOURCE_SETTINGS_COLLECTION_ID = 'resourceSettings';

const getResourceCollection = (db: FirebaseFirestore.Firestore, env: string) => {
  return db.collection(`${env}:${RESOURCE_COLLECTION_ID}`);
};
const getResourceSettingsCollection = (db: FirebaseFirestore.Firestore, env: string) => {
  return db.collection(`${env}:${RESOURCE_SETTINGS_COLLECTION_ID}`);
};

export class BaseResourceObject implements BaseResource {
  id: string;
  name: string;
  description: string;
  type: ResourceType;
  tool: string;
  accessRules: AccessRule[];

  constructor (id: string, doc: FireStoreResource) {
    this.id = id;
    this.name = doc.name;
    this.description = doc.description;
    this.type = doc.type;
    this.tool = doc.tool;
    this.accessRules = doc.accessRules;
  }

  apiResult(claims: AuthClaims | undefined, settings?: FireStoreResourceSettings): WithOptional<BaseResource, "accessRules"> {
    // ? is not used for claims, so this argument is NOT optional.
    const { id, name, description, type, tool } = this;
    const result: WithOptional<BaseResource, "accessRules"> = { id, name, description, type, tool };
    if (claims && this.canReadAccessRules(claims)) {
      result.accessRules = this.accessRules;
    }
    return result;
  }

  canReadAccessRules(claims: AuthClaims): boolean {
    if ("readWriteToken" in claims) {
      // readWriteToken
      return this.isReadWriteTokenValid(claims.readWriteToken)
    } else {
      // JTW claims
      return this.isOwner(claims);
    }
  }

  canUpdate(claims: AuthClaims): boolean {
    if ("readWriteToken" in claims) {
      // readWriteToken is restricted on purpose. Owner could accidentally remove access for the resource for himself
      // and other owners (by modifying access rules). Or he could use incorrect read write token format.
      return false;
    } else {
      // JTW claims
      return this.isOwner(claims);
    }
  }

  canDelete(claims: AuthClaims): boolean {
    if ("readWriteToken" in claims) {
      // readWriteToken is restricted on purpose. Owner could accidentally remove shared resource for other owners.
      return false;
    } else {
      // JTW claims
      return this.isOwner(claims);
    }
  }

  canCreateKeys(claims: AuthClaims): boolean {
    // need to override in subclasses
    return false;
  }

  createKeys(config: Config, settings: FireStoreResourceSettings) {
    // need to override in subclasses
    return new Promise<Credentials>((resolve, reject) => {
      reject(`Implement createKeys in subclass`);
    })
  }

  hasUserRole(claims: JWTClaims, role: AccessRuleRole): boolean {
    return !!this.accessRules.find((accessRule) =>
      (accessRule.type === "user") && (accessRule.role === role) && (accessRule.userId === claims.user_id)  && (accessRule.platformId === claims.platform_id)
    );
  }

  isOwner(claims: JWTClaims): boolean {
    return this.hasUserRole(claims, "owner");
  }

  isOwnerOrMember(claims: JWTClaims): boolean {
    return this.hasUserRole(claims, "owner") || this.hasUserRole(claims, "member");
  }

  isReadWriteTokenValid(readWriteToken: string): boolean {
    if (!readWriteToken.startsWith(ReadWriteTokenPrefix)) {
      // This is necessary so read write token can be differentiated from JTW token.
      return false;
    }
    return !!this.accessRules.find(accessRule =>
      accessRule.type === "readWriteToken" && accessRule.readWriteToken === readWriteToken
    );
  }

  static GetResourceSettings(db: FirebaseFirestore.Firestore, env: string, type: ResourceType, tool: string) {
    return new Promise<FireStoreResourceSettings>((resolve, reject) => {
      return getResourceSettingsCollection(db, env).where("type", "==", type).where("tool", "==", tool).get()
        .then((querySnapshot) => {
          if (querySnapshot.empty) {
            reject(`No resource settings for ${type} type with ${tool} tool`)
          }
          else {
            resolve(querySnapshot.docs[0].data() as FireStoreResourceSettings)
          }
        })
        .catch(reject);
    });
  }

  static FromDocumentSnapshot(doc: FirebaseFirestore.DocumentSnapshot) {
    const data: FireStoreResource = doc.data() as FireStoreResource;
    switch (data.type) {
      case "s3Folder":
        // tslint:disable-next-line: no-use-before-declare
        return new S3ResourceObject(doc.id, data);

      case "iotOrganization":
        // tslint:disable-next-line: no-use-before-declare
        return new IotResourceObject(doc.id, data);
    }
  }

  static Find(db: FirebaseFirestore.Firestore, env: string, id: string) {
    return new Promise<ResourceObject>((resolve, reject) => {
      return getResourceCollection(db, env).doc(id).get()
              .then((docSnapshot) => {
                if (docSnapshot.exists) {
                  resolve(BaseResourceObject.FromDocumentSnapshot(docSnapshot));
                }
                else {
                  reject(`Resource ${id} not found!`);
                }
              })
              .catch(reject);
    });
  }

  static FindAll(db: FirebaseFirestore.Firestore, env: string, claims: JWTClaims | undefined, query: FindAllQuery) {
    return new Promise<ResourceObject[]>((resolve, reject) => {
      const {name, type, tool, amOwner} = query;
      const checkForOwner = amOwner === 'true';
      let fbQuery: FirebaseFirestore.Query = getResourceCollection(db, env);

      if (name) fbQuery = fbQuery.where("name", "==", name);
      if (type) fbQuery = fbQuery.where("type", "==", type);
      if (tool) fbQuery = fbQuery.where("tool", "==", tool);

      return fbQuery.get()
        .then((querySnapshot) => {
          const resources: ResourceObject[] = [];
          querySnapshot.forEach((docSnapshot) => {
            const resource = BaseResourceObject.FromDocumentSnapshot(docSnapshot);
            // console.log(claims, resource.accessRules, !!claims && resource.isOwner(claims));
            if (!checkForOwner || claims && resource.isOwner(claims)) {
              resources.push(resource);
            }
          });
          resolve(resources);
        })
        .catch(reject)
    });
  }

  static Create(db: FirebaseFirestore.Firestore, env: string, claims: JWTClaims | undefined, query: CreateQuery) {
    return new Promise<ResourceObject>((resolve, reject) => {
      const {name, description, type, tool, accessRuleType} = query;
      if (!name || !description || !type || !tool || !accessRuleType) {
        reject("One or more missing resource fields!");
        return;
      }
      return BaseResourceObject.GetResourceSettings(db, env, type, tool)
        .then((settings) => {
          let accessRules: AccessRule[] = [];
          if (!settings.allowedAccessRuleTypes) {
            reject(`${tool} configuration is missing allowedAccessRuleTypes list!`);
            return;
          }
          if (settings.allowedAccessRuleTypes.indexOf(accessRuleType) === -1) {
            reject(`"${accessRuleType}" access rule type is not allowed by ${tool} settings!`);
            return;
          }
          if (accessRuleType === "user") {
            if (!claims) {
              reject("JWT claims missing!");
              return;
            }
            const { user_id: userId, platform_id: platformId } = claims;
            accessRules = [{type: "user", role: "owner", userId, platformId}] as UserAccessRule[];
          }
          else if (accessRuleType === "readWriteToken") {
            // Generating new readWriteTokens is not recommended, they've been implemented to support documents imported
            // from the Document Store. ReadWriteTokenPrefix is necessary so auth methods can differentiate it from
            // regular JWT token. "token-service-generated:" is added just in case we want to easily find tokens/resources
            // generated by token-service itself or by Document Store migration.
            const readWriteToken = ReadWriteTokenPrefix + "token-service-generated:" + crypto.randomBytes(128).toString('hex');
            accessRules = [{type: "readWriteToken", readWriteToken}] as ReadWriteTokenAccessRule[];
          }
          else {
            reject(`Unknown access rule type: ${accessRuleType}`);
          }
          let newResource: FireStoreResource;
          switch (type) {
            case "s3Folder":
              newResource = {
                type: "s3Folder",
                tool,
                name,
                description,
                accessRules,
              };
              break;

            case "iotOrganization":
              newResource = {
                type: "iotOrganization",
                tool,
                name,
                description,
                accessRules
              };
              break;

            default:
              reject(`Unknown resource type: ${type}`);
              return;
          }

          return getResourceCollection(db, env).add(newResource)
            .then((docRef) => docRef.get())
            .then((docSnapshot) => BaseResourceObject.FromDocumentSnapshot(docSnapshot))
            .then(resolve)
            .catch(reject)
        })
        .catch(reject)
    });
  }

  static Update(db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, query: UpdateQuery) {
    return new Promise<ResourceObject>((resolve, reject) => {
      const docRef = getResourceCollection(db, env).doc(id);
      return docRef.get()
        .then((docSnapshot) => {
          if (docSnapshot.exists) {

            const resource = BaseResourceObject.FromDocumentSnapshot(docSnapshot);
            if (resource.canUpdate(claims)) {
              const {name, description, accessRules} = query;
              const update: UpdateQuery = {};
              if (name) update.name = name;
              if (description) update.description = description;
              if (accessRules) update.accessRules = accessRules;

              return docRef.update(update)
                      .then(() => docRef.get())
                      .then((updatedDocSnapshot) => BaseResourceObject.FromDocumentSnapshot(updatedDocSnapshot))
                      .then(resolve)
                      .catch(reject)
            }
            else {
              reject(`You do not have permission to update resource ${id}!`);
            }
          }
          else {
            reject(`Resource ${id} not found!`);
          }
          return;
        })
        .catch(reject)
    });
  }

  static delete(db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, query: UpdateQuery) {
    return new Promise<Date>((resolve, reject) => {
      const docRef = getResourceCollection(db, env).doc(id);
      docRef.get()
      .then( (docSnapshot) => {
        if (docSnapshot.exists) {
          const resource = BaseResourceObject.FromDocumentSnapshot(docSnapshot);
          if (resource.canDelete(claims)) {
              docRef.delete()
              .then(deleteResult => resolve(deleteResult.writeTime.toDate()))
              .catch(e => reject(`Firebase err on delete: ${e}`));
          }
          else {
            reject(`You do not have permission to delete resource ${id}!`);
          }
        }
        else {
          reject(`Resource ${id} not found!`);
        }
      })
      .catch(reject);
    });
  }

  static CreateAWSKeys(db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, config: Config) {
    return new Promise<Credentials>((resolve, reject) => {
      return BaseResourceObject.Find(db, env, id)
        .then(resource => {
          if (resource.canCreateKeys(claims)) {
            return BaseResourceObject.GetResourceSettings(db, env, resource.type, resource.tool)
              .then(settings =>
                resource.createKeys(config, settings)
                  .then(resolve)
                  .catch(reject)
              )
              .catch(reject);
          }
          else {
            reject(`You do not have permission to create AWS keys for resource ${id}!`);
            return;
          }
        })
        .catch(reject);
    });
  }
}

export class S3ResourceObject extends BaseResourceObject {
  getPublicPath(settings: FireStoreS3ResourceSettings) {
    const { id } = this;
    return `${settings.folder}/${id}/`;
  }

  getPublicUrl(settings: FireStoreS3ResourceSettings) {
    // Domain can point to the S3 bucket root or it can include folder path.
    if (settings.domain && settings.domainIncludesFolder) {
      const { id } = this;
      return `${settings.domain}/${id}/`;
    }
    if (settings.domain) {
      return `${settings.domain}/${this.getPublicPath(settings)}`;
    }
    return `https://${settings.bucket}.s3.amazonaws.com/${this.getPublicPath(settings)}`;
  }

  apiResult(claims: AuthClaims | undefined, settings: FireStoreResourceSettings): S3Resource {
    // Cast settings to desired type. We can't change argument type due to the way how the logic and typing is
    // organized in resource classes. TODO: refactor all that, base class is referencing its subclasses often,
    // causing circular dependencies and issues like this one.
    const s3settings = settings as FireStoreS3ResourceSettings;
    const result = super.apiResult(claims) as S3Resource;
    result.bucket = s3settings.bucket;
    result.folder = s3settings.folder;
    result.region = s3settings.region;
    result.publicPath = this.getPublicPath(s3settings);
    result.publicUrl = this.getPublicUrl(s3settings);
    return result;
  }

  canCreateKeys(claims: AuthClaims): boolean {
    if ("readWriteToken" in claims) {
      // readWriteToken
      return this.isReadWriteTokenValid(claims.readWriteToken);
    } else {
      // JTW claims
      return this.isOwnerOrMember(claims);
    }
  }

  createKeys(config: Config, settings: FireStoreResourceSettings) {
    // Cast settings to desired type. We can't change argument type due to the way how the logic and typing is
    // organized in resource classes. TODO: refactor all that, base class is referencing its subclasses often,
    // causing circular dependencies and issues like this one.
    const s3settings = settings as FireStoreS3ResourceSettings;
    return new Promise<Credentials>((resolve, reject) => {
      const { id } = this;
      const keyPrefix = `${s3settings.folder}/${id}/`

      const policy = JSON.stringify({
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "AllowBucketAccess",
            "Effect": "Allow",
            "Action": [
              "s3:ListBucket",
              "s3:ListBucketVersions"
            ],
            "Resource": [
              `arn:aws:s3:::${s3settings.bucket}`
            ]
          },
          {
            "Sid": "AllowAllS3ActionsInResourceFolder",
            "Action": [
              "s3:DeleteObject",
              "s3:DeleteObjectVersion",
              "s3:GetObject",
              "s3:GetObjectVersion",
              "s3:PutObject"
            ],
            "Effect": "Allow",
            "Resource": [
              `arn:aws:s3:::${s3settings.bucket}/${keyPrefix}*`
            ]
          }
        ]
      });

      // call assume role
      const sts = new STS({
        region: s3settings.region,
        endpoint: `https://sts.${s3settings.region}.amazonaws.com`,
        accessKeyId: config.aws.key,
        secretAccessKey: config.aws.secret
      });
      const params: STS.AssumeRoleRequest = {
        DurationSeconds: config.aws.s3credentials.duration,
        // ExternalId: // not needed
        Policy: policy,
        RoleArn: config.aws.s3credentials.rolearn,
        RoleSessionName: `token-service-${this.type}-${this.tool}-${this.id}`
      };
      sts.assumeRole(params, (err, data) => {
        if (err) {
          reject(err);
        }
        else if (!data.Credentials) {
          reject(`Missing credentials in AWS STS assume role response!`)
        }
        else {
          const {AccessKeyId, Expiration, SecretAccessKey, SessionToken} = data.Credentials;
          resolve({
            accessKeyId: AccessKeyId,
            expiration: Expiration,
            secretAccessKey: SecretAccessKey,
            sessionToken: SessionToken,
            bucket: s3settings.bucket,
            keyPrefix
          });
        }
      })
    });
  }
}

export class IotResourceObject extends BaseResourceObject {
  // TODO: add iot specific resource members

  apiResult(claims: AuthClaims | undefined) {
    const result = super.apiResult(claims) as IotResource;
    // TODO: add superclass members to return
    return result;
  }

  canCreateKeys(claims: AuthClaims): boolean {
    // TODO: figure out permissions
    return false;
  }

  createKeys(config: Config) {
    return new Promise<Credentials>((resolve, reject) => {
      reject("TODO: implement create keys");
    })
  }
}

export type ResourceObject = S3ResourceObject | IotResourceObject;

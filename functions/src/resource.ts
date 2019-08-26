import { JWTClaims, FireStoreResource, FireStoreS3Resource, FireStoreResourceSettings} from "./firestore-types";
import { ResourceType, ResourceTool, AccessRule, AccessRuleRole, ContextAccessRule, UserAccessRule,
         FindAllQuery, CreateQuery, UpdateQuery, S3UpdateQuery, S3ResourceQuery, Credentials, Config,
         BaseResource, IotResource} from "./resource-types";
import { STS } from "aws-sdk";

const RESOURCE_COLLECTION_ID = 'resources';
const RESOURCE_SETTINGS_COLLECTION_ID = 'resourceSettings';


export class BaseResourceObject implements BaseResource {
  id: string;
  name: string;
  description: string;
  type: ResourceType;
  tool: ResourceTool;
  accessRules: AccessRule[]

  constructor (id: string, doc: FireStoreResource) {
    this.id = id;
    this.name = doc.name;
    this.description = doc.description;
    this.type = doc.type;
    this.tool = doc.tool;
    this.accessRules = doc.accessRules;
  }

  apiResult(): BaseResource {
    const {id, name, description, type, tool, accessRules} = this;
    return {id, name, description, type, tool, accessRules};
  }

  hasUserRole(claims: JWTClaims, role: AccessRuleRole): boolean {
    return !!this.accessRules.find((accessRule) => {
      return (accessRule.type === "user") && (accessRule.role === role) && (accessRule.userId === claims.userId)  && (accessRule.platformId === claims.platformId);
    })
  }

  isOwner(claims: JWTClaims): boolean {
    return this.hasUserRole(claims, "owner");
  }

  static GetResourceSettings(db: FirebaseFirestore.Firestore, type: ResourceType, tool: ResourceTool) {
    return new Promise<FireStoreResourceSettings>((resolve, reject) => {
      return db.collection(RESOURCE_SETTINGS_COLLECTION_ID).where("type", "==", type).where("tool", "==", tool).get()
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

  static Find(db: FirebaseFirestore.Firestore, id: string) {
    return new Promise<ResourceObject>((resolve, reject) => {
      return db.collection(RESOURCE_COLLECTION_ID).doc(id).get()
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

  static FindAll(db: FirebaseFirestore.Firestore, claims: JWTClaims, query: FindAllQuery) {
    return new Promise<ResourceObject[]>((resolve, reject) => {
      const {name, type, tool, amOwner} = query;
      const checkForOwner = amOwner === 'true';
      const collectionRef = db.collection(RESOURCE_COLLECTION_ID);
      let whereQuery : FirebaseFirestore.Query | null = null;

      if (name) whereQuery = (whereQuery || collectionRef).where("name", "==", name);
      if (type) whereQuery = (whereQuery || collectionRef).where("type", "==", type);
      if (tool) whereQuery = (whereQuery || collectionRef).where("tool", "==", tool);

      return (whereQuery || collectionRef).get()
        .then((querySnapshot) => {
          const resources: ResourceObject[] = [];
          querySnapshot.forEach((docSnapshot) => {
            const resource = BaseResourceObject.FromDocumentSnapshot(docSnapshot);
            if (!checkForOwner || resource.isOwner(claims)) {
              resources.push(resource);
            }
          });
          resolve(resources);
        })
        .catch(reject)
    });
  }

  static Create(db: FirebaseFirestore.Firestore, claims: JWTClaims, query: CreateQuery) {
    return new Promise<ResourceObject>((resolve, reject) => {
      const {name, description, type, tool, accessRuleType, accessRuleRole} = query;
      if (!name || !description || !type || !tool || !accessRuleType || !accessRuleRole) {
        reject("One or more missing resource fields!");
        return;
      }
      else {
        const {userId, platformId, contextId} = claims;
        if ((accessRuleType === "context") && !contextId) {
          reject("Missing context_id claim in JWT!");
          return;
        }

        const accessRules = accessRuleType === "context"
          ? [{type: "context", role: accessRuleRole, contextId, platformId}] as ContextAccessRule[]
          : [{type: "user", role: accessRuleRole, userId, platformId}] as UserAccessRule[];

        return BaseResourceObject.GetResourceSettings(db, type, tool)
          .then((settings) => {
            let newResource: FireStoreResource;
            switch (type) {
              case "s3Folder":
                if (!((tool === "glossary") || (tool === "rubric"))) {
                  reject(`Unknown s3Folder tool: ${tool}`);
                  return;
                }
                const {bucket, folder, region} = settings;
                newResource = {
                  type: "s3Folder",
                  tool,
                  name,
                  description,
                  accessRules,
                  bucket,
                  folder,
                  region
                }
                break;

              case "iotOrganization":
                if (!(tool === "dataFlow")) {
                  reject(`Unknown iotOrganization tool: ${tool}`);
                  return;
                }
                newResource = {
                  type: "iotOrganization",
                  tool,
                  name,
                  description,
                  accessRules
                }
                break;

              default:
                reject(`Unknown resource type: ${type}`);
                return;
            }

            return db.collection(RESOURCE_COLLECTION_ID).add(newResource)
              .then((docRef) => docRef.get())
              .then((docSnapshot) => BaseResourceObject.FromDocumentSnapshot(docSnapshot))
              .then(resolve)
              .catch(reject)
          })
          .catch(reject)
      }
    });
  }

  static Update(db: FirebaseFirestore.Firestore, claims: JWTClaims, id: string, query: UpdateQuery) {
    return new Promise<ResourceObject>((resolve, reject) => {
      const docRef = db.collection(RESOURCE_COLLECTION_ID).doc(id);
      return docRef.get()
        .then((docSnapshot) => {
          if (docSnapshot.exists) {

            const resource = BaseResourceObject.FromDocumentSnapshot(docSnapshot);
            if (resource.isOwner(claims)) {
              const {name, description, accessRules} = query;
              const update: UpdateQuery = {};
              if (name) update.name = name;
              if (description) update.description = description;
              if (accessRules) update.accessRules = accessRules;

              if (resource.type === "s3Folder") {
                const s3Query: S3UpdateQuery = query as S3UpdateQuery;
                const s3Update: S3ResourceQuery = update as S3ResourceQuery;
                if (s3Query.bucket) s3Update.bucket = s3Query.bucket;
                if (s3Query.folder) s3Update.folder = s3Query.folder;
              }

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

  static CreateAWSKeys(db: FirebaseFirestore.Firestore, claims: JWTClaims, id: string, config: Config) {
    return new Promise<Credentials>((resolve, reject) => {
      return BaseResourceObject.Find(db, id)
        .then((resource) => {
          if (resource.canCreateKeys(claims)) {
            return resource.createKeys(config)
              .then(resolve)
              .catch(reject)
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
  bucket: string;
  folder: string;
  region: string;

  constructor (id: string, doc: FireStoreS3Resource) {
    super(id, doc);
    this.bucket = doc.bucket;
    this.folder = doc.folder;
    this.region = doc.region;
  }

  apiResult(): S3ResourceObject {
    const result = super.apiResult() as S3ResourceObject;
    result.bucket = this.bucket;
    result.folder = this.folder;
    result.region = this.region;
    return result;
  }

  canCreateKeys(claims: JWTClaims): boolean {
    return this.isOwner(claims);
  }

  createKeys(config: Config) {
    return new Promise<Credentials>((resolve, reject) => {
      const { bucket, folder, id } = this;
      const keyPrefix = `${folder}/${id}/`

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
                  `arn:aws:s3:::${bucket}`
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
                    `arn:aws:s3:::${bucket}/${keyPrefix}*`
                ]
            }
        ]
      });

      // call assume role
      const sts = new STS({accessKeyId: config.aws.key, secretAccessKey: config.aws.secret});
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
            bucket,
            keyPrefix
          });
        }
      })
    });
  }
}

export class IotResourceObject extends BaseResourceObject {
  // TODO: add iot specific resource members

  apiResult() {
    const result = super.apiResult() as IotResource;
    // TODO: add superclass members to return
    return result;
  }

  canCreateKeys(claims: JWTClaims): boolean {
    // TODO: figure out permissions
    return false;
  }

  createKeys() {
    return new Promise<Credentials>((resolve, reject) => {
      reject(`TODO: implement create keys`);
    })
  }
}

export type ResourceObject = S3ResourceObject | IotResourceObject;

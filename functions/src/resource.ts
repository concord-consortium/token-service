import { FireStoreResourceType, FireStoreResourceTool, JWTClaims, FireStoreResource,
         FireStoreAccessRule, FireStoreAccessRuleType, FireStoreAccessRuleRole,
         FireStoreContextAccessRule, FireStoreUserAccessRule, FireStoreBaseResource,
         FireStoreS3Resource, FireStoreResourceSettings } from "./firestore-types";

const RESOURCE_COLLECTION_ID = 'resources';
const RESOURCE_SETTINGS_COLLECTION_ID = 'resourceSettings';

interface FindAllQuery {
  name?: string;
  type?: FireStoreResourceType;
  tool?: FireStoreResourceTool;
  amOwner: 'true' | 'false';
}

// mark all resource fields as optional so we get type checking
type PartialFireStoreResource = Partial<FireStoreResource>;
type PartialS3FireStoreResource = Partial<FireStoreS3Resource>;

interface CreateQuery extends Omit<PartialFireStoreResource, 'url'> {
  accessRuleType: FireStoreAccessRuleType;
  accessRuleRole: FireStoreAccessRuleRole;
}

type UpdateQuery = Omit<Omit<PartialFireStoreResource, 'type'>, 'tool'>;
type S3UpdateQuery = Omit<Omit<PartialS3FireStoreResource, 'type'>, 'tool'>;

interface AWSTemporaryCredentials {
  AccessKeyId: string;
  Expiration: string;
  SecretAccessKey: string;
  SessionToken: string;
}

/*
interface AWSAssumeRoleResponse {
  AssumedRoleUser: {
    Arn: string;
    AssumedRoleId: string;
  },
  Credentials: AWSTemporaryCredentials;
  PackedPolicySize: number;
}
*/

export class Resource implements FireStoreBaseResource {
  id: string;
  name: string;
  description: string;
  type: FireStoreResourceType;
  tool: FireStoreResourceTool;
  accessRules: FireStoreAccessRule[]

  constructor (id: string, doc: FireStoreResource) {
    this.id = id;
    this.name = doc.name;
    this.description = doc.description;
    this.type = doc.type;
    this.tool = doc.tool;
    this.accessRules = doc.accessRules;
  }

  sanitizeApiResult(method: string): Resource {
    // nothing for now but placeholder if we don't want to expose some resource attributes
    return this;
  }

  hasUserRole(claims: JWTClaims, role: FireStoreAccessRuleRole): boolean {
    return !!this.accessRules.find((accessRule) => {
      return (accessRule.type === "user") && (accessRule.role === role) && (accessRule.userId === claims.userId)  && (accessRule.platformId === claims.platformId);
    })
  }

  isOwner(claims: JWTClaims): boolean {
    return this.hasUserRole(claims, "owner");
  }

  canCreateKeys(claims: JWTClaims): boolean {
    switch (this.type) {
      case "s3Folder":
        return this.isOwner(claims);

      case "iotOrganization":
        // TODO: figure out permissions
        break;
    }

    return false;
  }

  createKeys() {
    return new Promise<AWSTemporaryCredentials>((resolve, reject) => {
      reject("TODO: add S3 call: ");
    });
  }

  static GetResourceSettings(db: FirebaseFirestore.Firestore, type: FireStoreResourceType, tool: FireStoreResourceTool) {
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
        return new S3Resource(doc.id, data);

      case "iotOrganization":
        // tslint:disable-next-line: no-use-before-declare
        return new IotResource(doc.id, data);
    }
  }

  static Find(db: FirebaseFirestore.Firestore, id: string) {
    return new Promise<Resource>((resolve, reject) => {
      return db.collection(RESOURCE_COLLECTION_ID).doc(id).get()
              .then((docSnapshot) => {
                if (docSnapshot.exists) {
                  resolve(Resource.FromDocumentSnapshot(docSnapshot));
                }
                else {
                  reject(`Resource ${id} not found!`);
                }
              })
              .catch(reject);
    });
  }

  static FindAll(db: FirebaseFirestore.Firestore, claims: JWTClaims, query: FindAllQuery) {
    return new Promise<Resource[]>((resolve, reject) => {
      const {name, type, tool, amOwner} = query;
      const checkForOwner = amOwner === 'true';
      const collectionRef = db.collection(RESOURCE_COLLECTION_ID);
      let whereQuery : FirebaseFirestore.Query | null = null;

      if (name) whereQuery = (whereQuery || collectionRef).where("name", "==", name);
      if (type) whereQuery = (whereQuery || collectionRef).where("type", "==", type);
      if (tool) whereQuery = (whereQuery || collectionRef).where("tool", "==", tool);

      return (whereQuery || collectionRef).get()
        .then((querySnapshot) => {
          const resources: Resource[] = [];
          querySnapshot.forEach((docSnapshot) => {
            const resource = Resource.FromDocumentSnapshot(docSnapshot);
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
    return new Promise<Resource>((resolve, reject) => {
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
          ? [{type: "context", role: accessRuleRole, contextId, platformId}] as FireStoreContextAccessRule[]
          : [{type: "user", role: accessRuleRole, userId, platformId}] as FireStoreUserAccessRule[];

        return Resource.GetResourceSettings(db, type, tool)
          .then((settings) => {
            let newResource: FireStoreResource;
            switch (type) {
              case "s3Folder":
                if (!((tool === "glossary") || (tool === "rubric"))) {
                  reject(`Unknown s3Folder tool: ${tool}`);
                  return;
                }
                const {bucket, folder} = settings;
                newResource = {
                  type: "s3Folder",
                  tool,
                  name,
                  description,
                  accessRules,
                  bucket,
                  folder
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
              .then((docSnapshot) => Resource.FromDocumentSnapshot(docSnapshot))
              .then(resolve)
              .catch(reject)
          })
          .catch(reject)
      }
    });
  }

  static Update(db: FirebaseFirestore.Firestore, claims: JWTClaims, id: string, query: UpdateQuery) {
    return new Promise<Resource>((resolve, reject) => {
      const docRef = db.collection(RESOURCE_COLLECTION_ID).doc(id);
      return docRef.get()
        .then((docSnapshot) => {
          if (docSnapshot.exists) {

            const resource = Resource.FromDocumentSnapshot(docSnapshot);
            if (resource.isOwner(claims)) {
              const {name, description, accessRules} = query;
              const update: UpdateQuery = {};
              if (name) update.name = name;
              if (description) update.description = description;
              if (accessRules) update.accessRules = accessRules;

              if (resource.type === "s3Folder") {
                const s3Query: S3UpdateQuery = query as S3UpdateQuery;
                const s3Update: PartialS3FireStoreResource = update as PartialS3FireStoreResource;
                if (s3Query.bucket) s3Update.bucket = s3Query.bucket;
                if (s3Query.folder) s3Update.folder = s3Query.folder;
              }

              return docRef.update(update)
                      .then(() => docRef.get())
                      .then((updatedDocSnapshot) => Resource.FromDocumentSnapshot(updatedDocSnapshot))
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

  static CreateAWSKeys(db: FirebaseFirestore.Firestore, claims: JWTClaims, id: string) {
    return new Promise<AWSTemporaryCredentials>((resolve, reject) => {
      return Resource.Find(db, id)
        .then((resource) => {
          if (resource.canCreateKeys(claims)) {
            return resource.createKeys()
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

export class S3Resource extends Resource {
  bucket: string;
  folder: string;

  constructor (id: string, doc: FireStoreS3Resource) {
    super(id, doc);
    this.bucket = doc.bucket;
    this.folder = doc.folder;
  }
}

export class IotResource extends Resource {
  // TODO: add iot specific resource members
}

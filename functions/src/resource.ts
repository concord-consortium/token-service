import { FireStoreResourceType, FireStoreResourceTool, JWTClaims, FireStoreResource, FireStoreAccessRule, FireStoreAccessRuleType, FireStoreAccessRuleRole, FireStoreContextAccessRule, FireStoreUserAccessRule } from "./firestore-types";

const RESOURCE_COLLECTION_ID = 'resources';

interface FindAllQuery {
  name?: string;
  type?: FireStoreResourceType;
  tool?: FireStoreResourceTool;
  amOwner: 'true' | 'false';
}

// mark all resource fields as optional so we get type checking
type FireStoreResourceQuery = Partial<FireStoreResource>;

interface CreateQuery extends FireStoreResourceQuery {
  accessRuleType: FireStoreAccessRuleType;
  accessRuleRole: FireStoreAccessRuleRole;
}

type UpdateQuery = FireStoreResourceQuery;

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

export class Resource implements FireStoreResource {
  id: string;
  name: string;
  description: string;
  type: FireStoreResourceType;
  tool: FireStoreResourceTool;
  url: string;
  accessRules: FireStoreAccessRule[]

  constructor (id: string, doc: FireStoreResource) {
    this.id = id;
    this.name = doc.name;
    this.description = doc.description;
    this.type = doc.type;
    this.tool = doc.tool;
    this.url = doc.url;
    this.accessRules = doc.accessRules;
  }

  sanitizeApiResult(method: string): Resource {
    // if (method === "GET") {
    //   delete this.accessRules;
    // }
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

  static FromDocumentSnapshot(doc: FirebaseFirestore.DocumentSnapshot) {
    return new Resource(doc.id, doc.data() as FireStoreResource);
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
      const {name, description, type, tool, url, accessRuleType, accessRuleRole} = query;
      if (!name || !description || !type || !tool || !url || !accessRuleType || !accessRuleRole) {
        reject("One or more missing resource fields!");
        return;
      }
      else {
        const {userId, platformId, contextId} = claims;
        if ((accessRuleType === "context") && !contextId) {
          reject("Missing context_id claim in JWT!");
          return;
        }

        const accessRule = accessRuleType === "context"
          ? {type: "context", role: accessRuleRole, contextId, platformId} as FireStoreContextAccessRule
          : {type: "user", role: accessRuleRole, userId, platformId} as FireStoreUserAccessRule;

        const newResource: FireStoreResource = {
          name,
          description,
          type,
          tool,
          url,
          accessRules: [accessRule]
        }
        return db.collection(RESOURCE_COLLECTION_ID).add(newResource)
          .then((docRef) => docRef.get())
          .then((docSnapshot) => Resource.FromDocumentSnapshot(docSnapshot))
          .then(resolve)
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
              const {name, description, type, tool, url, accessRules} = query;
              const update: any = {};
              if (name) update.name = name;
              if (description) update.description = description;
              if (type) update.type = type;
              if (tool) update.tool = tool;
              if (url) update.url = url;
              if (url) update.accessRules = accessRules;

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
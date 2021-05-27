import {
  FireStoreResourceSettings, FireStoreResource, JWTClaims, AuthClaims
} from "./firestore-types";
import { S3ResourceObject } from "./models/s3-resource-object";
import { IotResourceObject } from "./models/iot-resource-object";
import {
  ResourceType,
  FindAllQuery, CreateQuery, UpdateQuery, Credentials, Config,
  AccessRule, UserAccessRule, ReadWriteTokenAccessRule, ReadWriteTokenPrefix
} from "./resource-types";
import * as crypto from "crypto";

export type ResourceObject = S3ResourceObject | IotResourceObject;

const RESOURCE_COLLECTION_ID = 'resources';
const RESOURCE_SETTINGS_COLLECTION_ID = 'resourceSettings';

const getResourceCollection = (db: FirebaseFirestore.Firestore, env: string) => {
  return db.collection(`${env}:${RESOURCE_COLLECTION_ID}`);
};
const getResourceSettingsCollection = (db: FirebaseFirestore.Firestore, env: string) => {
  return db.collection(`${env}:${RESOURCE_SETTINGS_COLLECTION_ID}`);
};

export const getResourceSettings = (db: FirebaseFirestore.Firestore, env: string, type: ResourceType, tool: string) => {
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

export const fromDocumentSnapshot = (doc: FirebaseFirestore.DocumentSnapshot) => {
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

export const findResource = (db: FirebaseFirestore.Firestore, env: string, id: string) => {
  return new Promise<ResourceObject>((resolve, reject) => {
    return getResourceCollection(db, env).doc(id).get()
            .then((docSnapshot) => {
              if (docSnapshot.exists) {
                resolve(fromDocumentSnapshot(docSnapshot));
              }
              else {
                reject(`Resource ${id} not found!`);
              }
            })
            .catch(reject);
  });
}

export const findAllResources = (db: FirebaseFirestore.Firestore, env: string, claims: JWTClaims | undefined, query: FindAllQuery) => {
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
          const resource = fromDocumentSnapshot(docSnapshot);
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

export const createResource = (db: FirebaseFirestore.Firestore, env: string, claims: JWTClaims | undefined, query: CreateQuery) => {
  return new Promise<ResourceObject>((resolve, reject) => {
    const {name, description, type, tool, accessRuleType} = query;
    if (!name || !description || !type || !tool || !accessRuleType) {
      reject("One or more missing resource fields!");
      return;
    }
    return getResourceSettings(db, env, type, tool)
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
          return;
        }

        // FIXME: centralize this list of types, it is also used in fromDocumentSnapshot
        if (type !== "s3Folder" && type !== "iotOrganization") {
          reject(`Unknown resource type: ${type}`);
          return;
        }
        const newResource: FireStoreResource = {
          type,
          tool,
          name,
          description,
          accessRules,
        };

        return getResourceCollection(db, env).add(newResource)
          .then((docRef) => docRef.get())
          .then((docSnapshot) => fromDocumentSnapshot(docSnapshot))
          .then(resolve)
          .catch(reject)
      })
      .catch(reject)
  });
};

export const updateResource = (db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, query: UpdateQuery) => {
  return new Promise<ResourceObject>((resolve, reject) => {
    const docRef = getResourceCollection(db, env).doc(id);
    return docRef.get()
      .then((docSnapshot) => {
        if (docSnapshot.exists) {

          const resource = fromDocumentSnapshot(docSnapshot);
          if (resource.canUpdate(claims)) {
            const {name, description, accessRules} = query;
            const update: UpdateQuery = {};
            if (name) update.name = name;
            if (description) update.description = description;
            if (accessRules) update.accessRules = accessRules;

            return docRef.update(update)
                    .then(() => docRef.get())
                    .then((updatedDocSnapshot) => fromDocumentSnapshot(updatedDocSnapshot))
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
};

export const deleteResource = (db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, query: UpdateQuery) => {
  return new Promise<Date>((resolve, reject) => {
    const docRef = getResourceCollection(db, env).doc(id);
    docRef.get()
    .then( (docSnapshot) => {
      if (docSnapshot.exists) {
        const resource = fromDocumentSnapshot(docSnapshot);
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
};

export const createAWSKeys = (db: FirebaseFirestore.Firestore, env: string, claims: AuthClaims, id: string, config: Config) => {
  return new Promise<Credentials>((resolve, reject) => {
    return findResource(db, env, id)
      .then(resource => {
        if (resource.canCreateKeys(claims)) {
          return getResourceSettings(db, env, resource.type, resource.tool)
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

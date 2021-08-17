import {
  JWTClaims, FireStoreResource, FireStoreResourceSettings,
  AuthClaims
} from "../firestore-types";
import {
  ResourceType, AccessRule, AccessRuleRole,
  Credentials, Config,
  BaseResource, ReadWriteTokenPrefix, WithOptional
} from "../resource-types";

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
    return this.hasUserRole(claims, "owner") || this.hasUserRole(claims, "member") || this.isContextMember(claims);
  }

  isContextMember(claims: JWTClaims): boolean {
    return !!this.accessRules.find((accessRule) =>
      // class_hash is a Portal name for context_id
      (accessRule.type === "context") && (accessRule.platformId === claims.platform_id)  && (accessRule.contextId === claims.class_hash)
    );
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
}

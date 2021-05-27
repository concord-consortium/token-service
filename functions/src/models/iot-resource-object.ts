import {
  AuthClaims
} from "../firestore-types";
import {BaseResourceObject} from "./base-resource-object";
import {
  Credentials, Config, IotResource
} from "../resource-types";

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

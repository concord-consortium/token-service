import {
  FireStoreResourceSettings,
  FireStoreAthenaWorkgroupSettings, AuthClaims
} from "../firestore-types";
import {BaseResourceObject} from "./base-resource-object";
import {
  Config, AthenaResource
} from "../resource-types";
import { assumeAWSRole } from "./aws-utils"

export class AthenaResourceObject extends BaseResourceObject {
  canCreateKeys(claims: AuthClaims): boolean {
    if ("readWriteToken" in claims) {
      // readWriteToken
      return false;
    } else {
      // JTW claims
      return this.isOwnerOrMember(claims);
    }
  }

  createKeys(config: Config, _settings: FireStoreResourceSettings) {
    // TODO: see if we can change the argument type instead of casting, this will force
    // either a cast or type guard before this method is called
    const settings = _settings as FireStoreAthenaWorkgroupSettings;
    const workgroupName = this.workgroupName();
    const keyPrefix = `${settings.folder}/${workgroupName}/`

    const policy = JSON.stringify({
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "AllowBucketAccess",
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket"
          ],
          "Resource": [
            `arn:aws:s3:::${settings.bucket}`
          ]
        },
        {
          "Sid": "AllowReadInWorkgroupFolder",
          "Action": [
            "s3:GetObject"
          ],
          "Effect": "Allow",
          "Resource": [
            `arn:aws:s3:::${settings.bucket}/${keyPrefix}*`
          ]
        },
        {
          "Sid": "AllowListExecutions",
          "Action": [
            "athena:ListQueryExecutions",
            "athena:GetQueryExecution"
          ],
          "Effect": "Allow",
          "Resource": [
            `arn:aws:athena:${settings.region}:${settings.account}:workgroup/${workgroupName}`
          ]
        }

      ]
    });

    return assumeAWSRole(policy, settings.region, `${this.type}-${this.tool}-${this.id}`, config);
  }

  apiResult(claims: AuthClaims | undefined, _settings: FireStoreResourceSettings): AthenaResource {
    // TODO: see if we can change the argument type instead of casting, this will force
    // either a cast or type guard before this method is called
    const settings = _settings as FireStoreAthenaWorkgroupSettings;
    const result = super.apiResult(claims) as AthenaResource;
    result.region = settings.region;
    result.workgroupName = this.workgroupName();
    return result;
  }

  workgroupName() {
    const { id, name } = this;
    return `${name}-${id}`
  }

}

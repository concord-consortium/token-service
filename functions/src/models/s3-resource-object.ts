import {
  FireStoreResourceSettings,
  FireStoreS3ResourceSettings, AuthClaims
} from "../firestore-types";
import {BaseResourceObject} from "./base-resource-object";
import {
  Config, S3Resource
} from "../resource-types";
import { assumeAWSRole } from "./aws-utils"

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
    // TODO: see if we can change the argument type instead of casting, this will force
    // either a cast or type guard before this method is called
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
      return this.isOwner(claims) || this.isMember(claims) || this.isContextMember(claims) || this.hasAccessToTargetUserData(claims);
    }
  }

  createKeys(config: Config, settings: FireStoreResourceSettings) {
    // TODO: see if we can change the argument type instead of casting, this will force
    // either a cast or type guard before this method is called
    const s3settings = settings as FireStoreS3ResourceSettings;
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

    return assumeAWSRole(policy, s3settings.region, `${this.type}-${this.tool}-${this.id}`, config);
  }
}

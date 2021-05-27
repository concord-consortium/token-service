import {
  FireStoreResourceSettings,
  FireStoreS3ResourceSettings, AuthClaims
} from "../firestore-types";
import {BaseResourceObject} from "./base-resource-object";
import {
  Credentials, Config, S3Resource
} from "../resource-types";
import { STS } from "aws-sdk";
import * as crypto from "crypto";

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
      let roleSessionName = `token-service-${this.type}-${this.tool}-${this.id}`;
      // Max length of this value is 64, see: https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
      // Preprocess roleSessionName when necessary.
      if (roleSessionName.length > 64) {
        // md5 hash has 32 characters.
        const md5Hash = crypto.createHash("md5").update(`${this.type}-${this.tool}-${this.id}`).digest("hex");
        roleSessionName = `token-service-${md5Hash}`;
      }
      const params: STS.AssumeRoleRequest = {
        DurationSeconds: config.aws.s3credentials.duration,
        // ExternalId: // not needed
        Policy: policy,
        RoleArn: config.aws.s3credentials.rolearn,
        RoleSessionName: roleSessionName
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

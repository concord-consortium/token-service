import * as crypto from "crypto";
import {
  Credentials, Config
} from "../resource-types";
import { STS } from "aws-sdk";

export const assumeAWSRole = (policy: string, region: string, sessionName: string, config: Config) => {
  return new Promise<Credentials>((resolve, reject) => {
    // call assume role
    const sts = new STS({
      region,
      endpoint: `https://sts.${region}.amazonaws.com`,
      accessKeyId: config.aws.key,
      secretAccessKey: config.aws.secret
    });
    let roleSessionName = `token-service-${sessionName}`;
    // Max length of this value is 64, see: https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
    // Preprocess roleSessionName when necessary.
    if (roleSessionName.length > 64) {
      // md5 hash has 32 characters.
      const md5Hash = crypto.createHash("md5").update(sessionName).digest("hex");
      roleSessionName = `token-service-${md5Hash}`;
    }
    const params: STS.AssumeRoleRequest = {
      // FIXME: the rolearn and duration should be moved to the top level aws part of the config
      //   they will be used for all AWS not just S3.
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
          sessionToken: SessionToken
        });
      }
    })
  });
}

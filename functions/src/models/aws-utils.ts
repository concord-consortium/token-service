import * as crypto from "crypto";
import {
  Credentials, Config
} from "../resource-types";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

export const assumeAWSRole = async (policy: string, region: string, sessionName: string, config: Config): Promise<Credentials> => {
  const client = new STSClient({
    region,
    credentials: {
      accessKeyId: config.aws.key,
      secretAccessKey: config.aws.secret
    }
  });

  let roleSessionName = `token-service-${sessionName}`;
  // Max length of this value is 64, see: https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
  // Preprocess roleSessionName when necessary.
  if (roleSessionName.length > 64) {
    // md5 hash has 32 characters.
    const md5Hash = crypto.createHash("md5").update(sessionName).digest("hex");
    roleSessionName = `token-service-${md5Hash}`;
  }

  const command = new AssumeRoleCommand({
    DurationSeconds: config.aws.duration,
    Policy: policy,
    RoleArn: config.aws.rolearn,
    RoleSessionName: roleSessionName
  });

  const data = await client.send(command);
  if (!data.Credentials) {
    throw new Error("Missing credentials in AWS STS assume role response!");
  }
  const { AccessKeyId, Expiration, SecretAccessKey, SessionToken } = data.Credentials;
  return {
    accessKeyId: AccessKeyId!,
    expiration: Expiration!,
    secretAccessKey: SecretAccessKey!,
    sessionToken: SessionToken!
  };
};

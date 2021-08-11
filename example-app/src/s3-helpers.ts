import { S3Resource, Credentials, TokenServiceClient } from "@concord-consortium/token-service";
import * as AWS from "aws-sdk";

export const SIGNED_URL_EXPIRES = 60; // seconds

export interface IUploadS3File {
  filename: string;
  fileContent: string;
  s3Resource: S3Resource;
  credentials: Credentials;
}
export const uploadS3File = async ({ filename, fileContent, s3Resource, credentials }: IUploadS3File) => {
  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = s3Resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new AWS.S3({ region, accessKeyId, secretAccessKey, sessionToken });

  // Need a dummy client to get the publicS3Path
  const client = new TokenServiceClient({});
  const publicPath = client.getPublicS3Path(s3Resource, filename);

  const result = await s3.upload({
    Bucket: bucket,
    Key: publicPath,
    Body: fileContent,
    ContentType: "text/html",
    ContentEncoding: "UTF-8",
    CacheControl: "no-cache"
  }).promise();
  console.log(result);

  return {
    publicUrl: client.getPublicS3Url(s3Resource, filename),
    signedUrl: s3.getSignedUrl("getObject", {
      Bucket: bucket,
      Key: publicPath,
      Expires: SIGNED_URL_EXPIRES
    })
  };
};

export interface IDeleteFileArgs {
  filename: string;
  s3Resource: S3Resource;
  credentials: Credentials;
}
export const deleteS3File = async ({ filename, s3Resource, credentials}: IDeleteFileArgs) => {
  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = s3Resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new AWS.S3({ region, accessKeyId, secretAccessKey, sessionToken });

  // Need a dummy client to get the publicS3Path
  const client = new TokenServiceClient({});
  const publicPath = client.getPublicS3Path(s3Resource, filename);

  await s3.deleteObject({
    Bucket: bucket,
    Key: publicPath
  }).promise();
};

export interface IListArgs {
  s3Resource: S3Resource;
  credentials: Credentials;
}
export interface IListResult {
  key: string;
  publicUrl: string;
  signedUrl: string;
}
export const listS3Files = async ({ s3Resource, credentials}: IListArgs): Promise<IListResult[]> => {
  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = s3Resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new AWS.S3({ region, accessKeyId, secretAccessKey, sessionToken });

  const result = await s3.listObjects({
    Bucket: bucket,
    Prefix: s3Resource.publicPath
  }).promise();

  // Need a dummy client to get the publicS3Path
  const client = new TokenServiceClient({});
  const S3KeyToFilename = (key: string) => key.split("/").pop();

  if (result.Contents) {
    return result.Contents.map(item => ({
      key: item.Key || "",
      publicUrl: client.getPublicS3Url(s3Resource, S3KeyToFilename(item.Key || "")),
      signedUrl: s3.getSignedUrl("getObject", {
        Bucket: bucket,
        Key: item.Key,
        Expires: SIGNED_URL_EXPIRES
      })
    }));
  } else {
    return [];
  }
}

import { S3Resource, Credentials, TokenServiceClient } from "@concord-consortium/token-service";
import * as AWS from "aws-sdk";

interface IUploadS3File {
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
    publicUrl: client.getPublicS3Url(s3Resource, filename)
  };
};

interface IDeleteFileArgs {
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

  const result = await s3.deleteObject({
    Bucket: bucket,
    Key: publicPath
  }).promise();
};

interface IListArgs {
  s3Resource: S3Resource;
  credentials: Credentials;
}
export const listS3Files = async ({ s3Resource, credentials}: IListArgs): Promise<string[]> => {
  // S3 configuration is based both on resource and credentials info.
  const { bucket, region } = s3Resource;
  const { accessKeyId, secretAccessKey, sessionToken } = credentials;
  const s3 = new AWS.S3({ region, accessKeyId, secretAccessKey, sessionToken });

  const result = await s3.listObjects({
    Bucket: bucket,
    Prefix: s3Resource.publicPath
  }).promise();

  if ( result.Contents ) {
    return result.Contents.map(item => item.Key || "");
  } else {
    return [];
  }
}

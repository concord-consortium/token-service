import React, { useState } from "react";
import * as helpers from "./helpers";
import { Section, useInput } from "./form";
import { S3Resource, EnvironmentName, ResourceType, Credentials } from "@concord-consortium/token-service";
import { uploadS3File, deleteS3File, listS3Files } from "./s3-helpers";

interface S3DemoProps {
  credentials?: Credentials;
  s3Resource?: S3Resource;
}

export const S3Demo : React.FunctionComponent<S3DemoProps> = props => {
  const [filename, filenameProps] = useInput("test.txt");
  const [fileContent, fileContentProps] = useInput("Hello world");
  const [filePublicUrl, setFilePublicUrl] = useState("");
  const [files, setFiles] = useState<string[] | undefined>();

  const {credentials, s3Resource} = props;

  const handleCreateOrUpdateS3File = async () => {
    if (!credentials || !s3Resource) return;
    const result = await uploadS3File({ filename, fileContent, s3Resource, credentials });
    setFilePublicUrl(result.publicUrl);
  };

  const handleDeleteS3File = async () => {
    if (!credentials || !s3Resource) return;
    await deleteS3File({ filename, s3Resource, credentials });
    alert("Done! Try to open the file again - you should see 404 Not Found.");
  };

  const handleListS3Files = async () => {
    if (!credentials || !s3Resource) return;
    const _files = await listS3Files({ s3Resource, credentials });
    setFiles(_files);
  };

  return <Section title="S3 API Demo" disabled={!credentials || !s3Resource}>
    <p>A S3Resource and Credentials are required</p>
    <Section title="Create or Update File">
      <p>Filename: <input {...filenameProps}/></p>
      <p><textarea {...fileContentProps}/></p>
      <p>
        <button onClick={handleCreateOrUpdateS3File}>Create or Update File</button>
      </p>
      { filePublicUrl && <a target="_blank" href={filePublicUrl}>{filePublicUrl}</a> }
    </Section>

    <Section title="Delete File">
      <p>Filename: <input {...filenameProps}/></p>
      <p>
        <button onClick={handleDeleteS3File}>Delete File</button>
      </p>
    </Section>

    <Section title="List Files">
      <p>
        <button onClick={handleListS3Files}>List Files</button>
      </p>
      { files ?
          <ul>
            { files.map(file =>
              <li key={file}>{file}</li>
            )}
          </ul>
        :
          <p>click button to load files</p>
      }
    </Section>
  </Section>;
}

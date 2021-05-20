import React, { ChangeEvent, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import * as helpers from "./helpers"
import {useLocalStorageInput} from "./form-helpers"

// Simple app handling configuration and using helpers.
const AppComponent = () => {
  const [rawTokenServiceEnv, tokenServiceEnvProps] = useLocalStorageInput("tokenServiceEnv",  "staging");
  const [portalUrl, portalUrlProps] = useLocalStorageInput("portalUrl", "https://learn.staging.concord.org");
  const [oauthClientName, oauthClientNameProps] = useLocalStorageInput("oauthClientName", "token-service-example-app");
  const [firebaseAppName, firebaseAppNameProps] = useLocalStorageInput("firebaseApp", "token-service");
  const [firebaseJwt, firebaseJwtProps, setFirebaseJwt] = useLocalStorageInput("firebaseJwt", "");
  const [filename, filenameProps] = useLocalStorageInput("filename", "test.txt");
  const [fileContent, fileContentProps] = useLocalStorageInput("fileContent", "Hello world");
  const [newFileContent, newFileContentProps] = useLocalStorageInput("newFileContent", "Updated file content");

  const [portalAccessToken, setPortalAccessToken] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [readWriteToken, setReadWriteToken] = useState("");
  const [filePublicUrl, setFilePublicUrl] = useState("");

  // TODO hacky
  const tokenServiceEnv: "dev" | "staging" = rawTokenServiceEnv as "dev" | "staging";

  useEffect(() => {
    setPortalAccessToken(helpers.readPortalAccessToken());
  }, []);

  const handleAuthorizeInPortal = () => {
    helpers.authorizeInPortal(portalUrl, oauthClientName);
  };

  const handleGetFirebaseJwt = () => {
    helpers.getFirebaseJwt(portalUrl, portalAccessToken, firebaseAppName).then(token => setFirebaseJwt(token));
  };

  const handleCreateFileUsingJWT = async () => {
    const result = await helpers.createFile({ filename, fileContent, firebaseJwt, tokenServiceEnv });
    setFilePublicUrl(result.publicUrl);
    setResourceId(result.resourceId);
    setReadWriteToken("");
  };

  const handleCreateFileAnonymously = async () => {
    const result = await helpers.createFile({ filename, fileContent, tokenServiceEnv });
    setFilePublicUrl(result.publicUrl);
    setResourceId(result.resourceId);
    setReadWriteToken(result.readWriteToken);
  };

  const handleUpdateFileUsingJWT = async () => {
    await helpers.updateFile({ filename, newFileContent, resourceId, firebaseJwt, tokenServiceEnv });
    alert("Done! Open the file again.");
  };

  const handleUpdateFileAnonymously = async () => {
    await helpers.updateFile({ filename, newFileContent, resourceId, readWriteToken, tokenServiceEnv });
    alert("Done! Open the file again.");
  };

  const handleDeleteFileUsingJWT = async () => {
    await helpers.deleteFile({ filename, resourceId, firebaseJwt, tokenServiceEnv });
    alert("Done! Try to open the file again - you should see 404 Not Found.");
  };

  const handleDeleteFileAnonymously = async () => {
    await helpers.deleteFile({ filename, resourceId, readWriteToken, tokenServiceEnv });
    alert("Done! Try to open the file again -  you should see 404 Not Found.");
  };

  const handleLogAllMyResources = () => {
    helpers.logAllResources(firebaseJwt, true, tokenServiceEnv);
  };

  const handleLogAllResources = () => {
    helpers.logAllResources(firebaseJwt, false, tokenServiceEnv);
  };

  return (
    <div>
      <div className="section">
        <h3>Token Service Configuration</h3>
        <p>Token Service Env: <input {...tokenServiceEnvProps}/></p>
        <p className="hint">
          "dev" or "staging". Note that "dev" requires running local server at localhost:5000, see: <a target="_blank" href="https://github.com/concord-consortium/token-service#development-setup">https://github.com/concord-consortium/token-service#development-setup</a><br/>
          If you use "staging", you should see a new entry in this collection each time you upload a file: <a target="_blank" href="https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources">https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources</a>
        </p>
      </div>

      <div className="section">
        <h3>Portal Configuration</h3>
        <p className="hint">
          Token Service requires FirebaseJWT that can be obtained from Portal. Provide Portal configuration, click
          "Authorize in Portal" (it will require a login at the Portal if your user is not currently logged in) and then
          click "Get FirebaseJWT". When FirebaseJWT is available, you can upload file to S3 using TokenServiceClient.
        </p>
        {
          !portalAccessToken &&
          <>
            <p>Portal URL: <input {...portalUrlProps}/></p>
            <p>Oauth Client Name: <input {...oauthClientNameProps}/></p>
            <p className="hint">
              It has to be configured in Portal → Admin → Auth Clients. Client must have "public" type and list
              redirect URI which is exactly matching URL of this site: {window.location.toString()}.
            </p>
            <p>
              <button onClick={handleAuthorizeInPortal}>Authorize in Portal</button>
            </p>
          </>
        }
        <p>Portal Access Token: {portalAccessToken && <input value={portalAccessToken} disabled={true}/> || "N/A"}</p>
        <p>Firebase App Name: <input {...firebaseAppNameProps}/></p>
        <p className="hint">
          It has to be configured in Portal → Admin → Firebase Apps
        </p>
        <p>
          <button onClick={handleGetFirebaseJwt}>Get FirebaseJWT</button>
        </p>
        <p>Firebase JWT: {firebaseJwt && <input {...firebaseJwtProps}/> || "N/A"}</p>
      </div>

      <div className="section">
        <h3>Create New File</h3>
        <p>Filename: <input {...filenameProps}/></p>
        <p><textarea {...fileContentProps}/></p>
        <p>
          <button onClick={handleCreateFileUsingJWT} disabled={!firebaseJwt}>Create using Firebase JWT (Portal auth necessary)</button>
        </p>
        <p>
          <button onClick={handleCreateFileAnonymously}>Create Anonymously (generates readWriteToken, Portal auth not necessary)</button>
        </p>
        { filePublicUrl && <a target="_blank" href={filePublicUrl}>{filePublicUrl}</a> }
        { resourceId && <p>Resource ID: {resourceId}</p> }
        { readWriteToken && <p>readWriteToken: {readWriteToken}</p> }
      </div>

      <div className={`section ${resourceId ? "" : "disabled"}`}>
        <h3>Update File</h3>
        <p><textarea {...newFileContentProps}/></p>
        <p>
          <button onClick={handleUpdateFileUsingJWT} disabled={!firebaseJwt || !!readWriteToken}>Update using Firebase JWT (File needs to be created using JWT)</button>
        </p>
        <p>
          <button onClick={handleUpdateFileAnonymously} disabled={!readWriteToken}>Update using readWriteToken</button>
        </p>
      </div>

      <div className={`section ${resourceId ? "" : "disabled"}`}>
        <h3>Delete File</h3>
        <p>
          <button onClick={handleDeleteFileUsingJWT} disabled={!firebaseJwt || !!readWriteToken}>Delete using Firebase JWT (File needs to be created using JWT)</button>
        </p>
        <p>
          <button onClick={handleDeleteFileAnonymously} disabled={!readWriteToken}>Delete using readWriteToken</button>
        </p>
      </div>

      <div className="section">
        <h3>Misc</h3>
        <p><button onClick={handleLogAllMyResources} disabled={!firebaseJwt}>Log All My Resources (Firebase JWT necessary)</button></p>
        <p><button onClick={handleLogAllResources}>Log All Resources</button></p>
      </div>
    </div>
  );
};

ReactDOM.render(
  <AppComponent/>,
  document.getElementById("app")
);

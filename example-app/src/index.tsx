import React, { ChangeEvent, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import * as helpers from "./helpers"

// Simple app handling configuration and using helpers.
const AppComponent = () => {
  const [tokenServiceEnv, setTokenServiceEnv] = useState(localStorage.getItem("tokenServiceEnv") || "staging");
  const [portalUrl, setPortalUrl] = useState(localStorage.getItem("portalUrl") || "https://learn.staging.concord.org");
  const [oauthClientName, setOauthClientName] = useState(localStorage.getItem("oauthClientName") || "token-service-example-app");
  const [firebaseAppName, setFirebaseAppName] = useState(localStorage.getItem("firebaseApp") || "token-service");
  const [portalAccessToken, setPortalAccessToken] = useState("");
  const [firebaseJwt, setFirebaseJwt] = useState("");
  const [fileContent, setFileContent] = useState("Lorem ipsum");
  const [filePublicUrl, setFilePublicUrl] = useState("");

  useEffect(() => {
    setPortalAccessToken(helpers.readPortalAccessToken());
  }, []);

  const changeText = (prop: string, event: ChangeEvent<HTMLInputElement>) => {
    if (prop === "portalUrl") {
      setPortalUrl(event.target.value);
    } else if (prop === "oauthClientName") {
      setOauthClientName(event.target.value);
    } else if (prop === "firebaseAppName") {
      setFirebaseAppName(event.target.value);
    } else if (prop === "fileContent") {
      setFileContent(event.target.value);
    } else if (prop === "tokenServiceEnv") {
      setTokenServiceEnv(event.target.value);
    } else if (prop === "firebaseJwt") {
      setFirebaseJwt(event.target.value);
    }
    localStorage.setItem(prop, event.target.value);
  };

  const handleAuthorizeInPortal = () => {
    helpers.authorizeInPortal(portalUrl, oauthClientName);
  };

  const handleGetFirebaseJwt = () => {
    helpers.getFirebaseJwt(portalUrl, portalAccessToken, firebaseAppName).then(token => setFirebaseJwt(token));
  };

  const handleUploadFileUsingJWT = async () => {
    setFilePublicUrl(await helpers.uploadFileUsingFirebaseJWT(fileContent, firebaseJwt, tokenServiceEnv as "dev" | "staging"));
  };

  const handleUploadFileAnonymously = async () => {
    setFilePublicUrl(await helpers.uploadFileAnonymously(fileContent, tokenServiceEnv as "dev" | "staging"));
  };

  return (
    <div>
      <div className="section">
        <h3>Portal Setup</h3>
        <p className="hint">
          Token Service requires FirebaseJWT that can be obtained from Portal. Provide Portal configuration, click
          "Authorize in Portal" (it will require a login at the Portal if your user is not currently logged in) and then
          click "Get FirebaseJWT". When FirebaseJWT is available, you can upload file to S3 using TokenServiceClient.
        </p>
        {
          !portalAccessToken &&
          <>
            <p>Portal URL: <input type="text" value={portalUrl} onChange={changeText.bind(null, "portalUrl")}/></p>
            <p>Oauth Client Name: <input type="text" value={oauthClientName} onChange={changeText.bind(null, "oauthClientName")}/></p>
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
        <p>Firebase App Name: <input type="text" value={firebaseAppName}
                                     onChange={changeText.bind(null, "firebaseAppName")}/></p>
        <p className="hint">
          It has to be configured in Portal → Admin → Firebase Apps
        </p>
        <p>
          <button onClick={handleGetFirebaseJwt}>Get FirebaseJWT</button>
        </p>
        <p>Firebase JWT: {firebaseJwt && <input value={firebaseJwt} onChange={changeText.bind(null, "firebaseJwt")}/> || "N/A"}</p>
      </div>

      <div className="section">
        <h3>Upload Text File</h3>
        <p>Token Service Env: <input type="text" value={tokenServiceEnv} onChange={changeText.bind(null, "tokenServiceEnv")}/></p>
        <p className="hint">
          "dev" or "staging". Note that "dev" requires running local server at localhost:5000, see: <a target="_blank" href="https://github.com/concord-consortium/token-service#development-setup">https://github.com/concord-consortium/token-service#development-setup</a><br/>
          If you use "staging", you should see a new entry in this collection each time you upload a file: <a target="_blank" href="https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources">https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources</a>
        </p>
        <p><textarea value={fileContent} onChange={changeText.bind(null, "fileContent")}/></p>
        <p>
          <button onClick={handleUploadFileUsingJWT}>Upload using Firebase JWT (Portal Setup necessary)</button>
        </p>
        <p>
          <button onClick={handleUploadFileAnonymously}>Upload Anonymously (generates readWriteToken)</button>
        </p>
        {
          filePublicUrl && <a target="_blank" href={filePublicUrl}>{filePublicUrl}</a>
        }
      </div>
    </div>
  );
};

ReactDOM.render(
  <AppComponent/>,
  document.getElementById("app")
);

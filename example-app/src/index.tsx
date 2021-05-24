import React, { useEffect, useState, ChangeEvent } from "react";
import ReactDOM from "react-dom";
import * as helpers from "./helpers";
import { Section, useLocalStorageInput, useInput} from "./form";
import { Resource, S3Resource, EnvironmentName, ResourceType, Credentials } from "@concord-consortium/token-service";
import { S3Demo } from "./s3-demo";

type ResourceMap = {[key: string]: Resource};

// Simple app handling configuration and using helpers.
const AppComponent = () => {
  const [rawTokenServiceEnv, tokenServiceEnvProps] = useLocalStorageInput("tokenServiceEnv",  "staging");
  const [portalUrl, portalUrlProps] = useLocalStorageInput("portalUrl", "https://learn.staging.concord.org");
  const [oauthClientName, oauthClientNameProps] = useLocalStorageInput("oauthClientName", "token-service-example-app");
  const [firebaseAppName, firebaseAppNameProps] = useLocalStorageInput("firebaseApp", "token-service");
  const [firebaseJwt, firebaseJwtProps, setFirebaseJwt] = useLocalStorageInput("firebaseJwt", "");
  const [resourceType, resourceTypeProps] = useLocalStorageInput("resourceType", "s3Folder");

  const [createResourceName, createResourceNameProps] = useInput("test-resource");
  const [createResourceDescription, createResourceDescriptionProps] = useInput("created by example-app");

  const [currentResource, setCurrentResource] = useState<Resource | undefined>();
  const [credentials, setCredentials] = useState<Credentials | undefined>();

  const [portalAccessToken, setPortalAccessToken] = useState("");
  const [resources, setResources] = useState({} as ResourceMap);
  const [resourcesStatus, setResourcesStatus] = useState("use button to load list");

  // Limit the enviornment to dev or staging
  const tokenServiceEnv = ["dev","staging"].includes(rawTokenServiceEnv) ? rawTokenServiceEnv as EnvironmentName : "staging";

  useEffect(() => {
    setPortalAccessToken(helpers.readPortalAccessToken());
  }, []);

  const handleAuthorizeInPortal = () => {
    helpers.authorizeInPortal(portalUrl, oauthClientName);
  };

  const handleGetFirebaseJwt = () => {
    helpers.getFirebaseJwt(portalUrl, portalAccessToken, firebaseAppName).then(token => setFirebaseJwt(token));
  };

  const createResource = async (authenticated: boolean) => {
    const resource = await helpers.createResource({
      resourceType: resourceType as ResourceType, // TODO Hacky
      resourceName: createResourceName,
      resourceDescription: createResourceDescription,
      firebaseJwt: authenticated ? firebaseJwt: undefined,
      tokenServiceEnv
    });
    setResources(_resources => {
      _resources[resource.id] = resource;
      return _resources;
    });
    setCurrentResource(resource);
    setCredentials(undefined);
  };

  const handleCreateAuthenticatedResource = () => {
    createResource(true);
  };

  const handleCreateAnonymousResource = async () => {
    createResource(false);
  };

  const handleListMyResources = async () => {
    // Clear existing resources
    setResources({} as ResourceMap);
    setResourcesStatus("loading...");
    const resourceList = await helpers.listResources(firebaseJwt, true, tokenServiceEnv, resourceType as ResourceType);
    if(resourceList.length === 0) {
      setResourcesStatus("no resources found");
    } else {
      setResourcesStatus("loaded");
      setResources(resourceList.reduce((map: ResourceMap, resource: Resource) => {
        map[resource.id] = resource;
        return map;
      }, {} as ResourceMap));
      setCurrentResource(resourceList[0]);
      setCredentials(undefined);
    }
  };

  const handleMyResourcesChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCurrentResource(resources[event.target.value]);
    setCredentials(undefined);
  };

  const handleDeleteResource = async () => {
    if(!currentResource){
      return;
    }
    await helpers.deleteResource({
      resource: currentResource,
      firebaseJwt,
      tokenServiceEnv
    });
  };

  const handleGetCredentials = async () => {
    if(!currentResource){
      return;
    }
    const _credentials = await helpers.getCredentials({
      resource: currentResource,
      firebaseJwt,
      tokenServiceEnv
    })
    setCredentials(_credentials);
  };

  const handleLogAllResources = () => {
    helpers.logAllResources(firebaseJwt, tokenServiceEnv);
  };

  return (
    <div>
      <Section title="Token Service Configuration">
        <p>Token Service Env: <select {...tokenServiceEnvProps} >
          <option value="dev">dev</option>
          <option value="staging">staging</option>
        </select></p>
        <p className="hint">
          "dev" or "staging". Note that "dev" requires running local server at localhost:5000, see: <a target="_blank" href="https://github.com/concord-consortium/token-service#development-setup">https://github.com/concord-consortium/token-service#development-setup</a><br/>
          If you use "staging", you should see a new entry in this collection each time you upload a file: <a target="_blank" href="https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources">https://console.firebase.google.com/project/token-service-staging/database/firestore/data~2Fstaging:resources</a>
        </p>
        <p>Resource Type: <select {...resourceTypeProps} >
          <option value="s3Folder">s3Folder</option>
          <option value="iotOrganization">iotOrganization</option>
        </select></p>
      </Section>

      <Section title="Portal Configuration">
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
      </Section>

      <Section title={`My ${resourceType} Resources`}>
        <p><button onClick={handleListMyResources} disabled={!firebaseJwt}>Fetch List (Firebase JWT necessary)</button></p>
        { Object.keys(resources).length > 0 ?
            <p><select size={8} value={currentResource && currentResource.id} onChange={handleMyResourcesChange}>
              {Object.values(resources).map((resource) =>
                <option key={resource.id} value={resource.id}>{resource.name} ({resource.id})</option>
              )}
            </select></p>
          :
            <p>{resourcesStatus}</p>
        }
      </Section>

      <Section title={`Create ${resourceType} Resource`}>
        <p>Name: <input {...createResourceNameProps}/></p>
        <p>Description: <input {...createResourceDescriptionProps}/></p>
        <p><button onClick={handleCreateAnonymousResource}>Create Anonymous Resource</button></p>
        <p><button onClick={handleCreateAuthenticatedResource} disabled={!firebaseJwt}>Create Authenticated Resource (Firebase JWT necessary)</button></p>
      </Section>

      <Section title="Current Resource">
        { currentResource ?
            // It'd be mice for this to just show the name and be able to expand to show the full resource
            <pre>{JSON.stringify(currentResource,null, 2)}</pre>
          :
            <p>no resource selected</p>
        }
        <p><button onClick={handleDeleteResource} disabled={!currentResource}>Delete Resource</button></p>
        <p className="hint">Warning: this only deletes the Resource in the token service. It does not delete
          files, objects or other items associated with the resource in AWS</p>
        <p><button onClick={handleGetCredentials} disabled={!currentResource}>Get Credentials</button></p>
        { credentials ?
          // It'd be mice for this to just show the name and be able to expand to show the full resource
          <pre>{JSON.stringify(credentials,null, 2)}</pre>
        :
          <p>request credentials for this resource</p>
        }
      </Section>

      { resourceType === "s3Folder" &&
        <S3Demo credentials={credentials} s3Resource={currentResource as S3Resource} />
      }

      <Section title="Misc">
        <p><button onClick={handleLogAllResources}>Log All Resources</button></p>
      </Section>
    </div>
  );
};

ReactDOM.render(
  <AppComponent/>,
  document.getElementById("app")
);

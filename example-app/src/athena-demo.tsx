import React, { useState } from "react";
import * as helpers from "./helpers";
import { Section, useInput } from "./form";
import { AthenaResource, EnvironmentName, ResourceType, Credentials } from "@concord-consortium/token-service";
import * as AWS from "aws-sdk";

interface AthenaDemoProps {
  credentials?: Credentials;
  athenaResource?: AthenaResource;
}

export const AthenaDemo : React.FunctionComponent<AthenaDemoProps> = props => {
  const [queries, setQueries] = useState<string[] | undefined>();

  const {credentials, athenaResource} = props;

  const handleListQueryExecutions = async () => {
    if (!credentials || !athenaResource) return;
    const { region } = athenaResource;
    const { accessKeyId, secretAccessKey, sessionToken } = credentials;
    const athena = new AWS.Athena({ region, accessKeyId, secretAccessKey, sessionToken });

    const results = await athena.listQueryExecutions({
      WorkGroup: `${athenaResource.name}-${athenaResource.id}`
    }).promise();

    setQueries(results.QueryExecutionIds);
  };

  return <Section title="Athena API Demo" disabled={!credentials || !athenaResource}>
    <p>A AthenaResource and Credentials are required</p>
    <Section title="List Queries">
      <p>
        <button onClick={handleListQueryExecutions}>List Queries</button>
      </p>
      { queries ?
          <ul>
            { queries.map(query =>
              <li key={query}>{query}</li>
            )}
          </ul>
        :
          <p>click button to load queries</p>
      }
    </Section>
  </Section>;
}

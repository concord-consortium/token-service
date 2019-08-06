import * as functions from 'firebase-functions';
import * as express from 'express';
import * as bodyParser from 'body-parser';

const apiV1 = express();
const main = express();

main.use('/api/v1', apiV1);
main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));

export const webApiV1 = functions.https.onRequest(main);

apiV1.get('/resources', (req, res) => {
  res.send("TODO: find resource...");
})

apiV1.post('/resources', (req, res) => {
  res.send("TODO: create resource...");
})

apiV1.patch('/resources/:id', (req, res) => {
  res.send("TODO: update resource...");
})

apiV1.post('/resources/aws-keys', (req, res) => {
  res.send("TODO: create aws keys from resource...");
})


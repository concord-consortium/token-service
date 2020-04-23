export const fakeAwsCredentials = {
  AccessKeyId: "test-key-id",
  Expiration: 1000,
  SecretAccessKey: "test-secret-access-key",
  SessionToken: "test-session-token",
};

export class STS {
  assumeRole = jest.fn((params, callback) => callback(null, { Credentials: fakeAwsCredentials }))
}

export const fakeAwsCredentials = {
  AccessKeyId: "test-key-id",
  Expiration: 1000,
  SecretAccessKey: "test-secret-access-key",
  SessionToken: "test-session-token",
};

export const mockAssumeRole = jest.fn((params, callback) => callback(null, { Credentials: fakeAwsCredentials }));
export class STS {
  assumeRole = mockAssumeRole;
}

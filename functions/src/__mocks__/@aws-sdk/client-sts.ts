export const fakeAwsCredentials = {
  AccessKeyId: "test-key-id",
  Expiration: 1000,
  SecretAccessKey: "test-secret-access-key",
  SessionToken: "test-session-token",
};

export const mockSend = jest.fn().mockResolvedValue({ Credentials: fakeAwsCredentials });

export class STSClient {
  send = mockSend;
}

export class AssumeRoleCommand {
  constructor(public input: any) {}
}

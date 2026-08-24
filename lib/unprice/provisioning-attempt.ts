export type ProvisioningClaim = {
  attemptId: string;
  user: {
    id: string;
    email: string;
  };
};

type ProvisioningAttemptDependencies = {
  provisionCustomer: (input: {
    userId: string;
    email: string;
    applicationBaseUrl: string;
  }) => Promise<string>;
  complete: (input: {
    id: string;
    attemptId: string;
    unpriceCustomerId: string;
  }) => Promise<boolean>;
  fail: (input: {
    id: string;
    attemptId: string;
    message: string;
  }) => Promise<void>;
};

export const SAFE_PROVISIONING_ERROR =
  'Billing setup did not finish. Retry from the usage card.';

export async function runProvisioningAttempt(
  {
    claim,
    applicationBaseUrl,
  }: {
    claim: ProvisioningClaim;
    applicationBaseUrl: string;
  },
  dependencies: ProvisioningAttemptDependencies,
): Promise<boolean> {
  try {
    const unpriceCustomerId = await dependencies.provisionCustomer({
      userId: claim.user.id,
      email: claim.user.email,
      applicationBaseUrl,
    });

    return dependencies.complete({
      id: claim.user.id,
      attemptId: claim.attemptId,
      unpriceCustomerId,
    });
  } catch (error) {
    await dependencies.fail({
      id: claim.user.id,
      attemptId: claim.attemptId,
      message: SAFE_PROVISIONING_ERROR,
    });
    throw error;
  }
}

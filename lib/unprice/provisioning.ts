import 'server-only';

import {
  claimUserUnpriceProvisioning,
  completeUserUnpriceProvisioning,
  failUserUnpriceProvisioning,
} from '@/lib/db/queries';
import {
  logUnpriceError,
  provisionUnpriceCustomer,
} from '@/lib/unprice/runtime';
import {
  type ProvisioningClaim,
  runProvisioningAttempt,
} from '@/lib/unprice/provisioning-attempt';

export async function claimRegisteredUserProvisioning(
  userId: string,
): Promise<ProvisioningClaim | undefined> {
  return claimUserUnpriceProvisioning({ id: userId });
}

export async function provisionClaimedUser({
  claim,
  applicationBaseUrl,
}: {
  claim: ProvisioningClaim;
  applicationBaseUrl: string;
}): Promise<boolean> {
  try {
    return await runProvisioningAttempt(
      { claim, applicationBaseUrl },
      {
        provisionCustomer: provisionUnpriceCustomer,
        complete: completeUserUnpriceProvisioning,
        fail: failUserUnpriceProvisioning,
      },
    );
  } catch (error) {
    logUnpriceError('Failed to provision registered customer', error);
    throw error;
  }
}

export async function provisionRegisteredUser({
  userId,
  applicationBaseUrl,
}: {
  userId: string;
  applicationBaseUrl: string;
}): Promise<boolean> {
  const claim = await claimRegisteredUserProvisioning(userId);

  if (!claim) {
    return false;
  }

  return provisionClaimedUser({ claim, applicationBaseUrl });
}

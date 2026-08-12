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

const SAFE_PROVISIONING_ERROR =
  'Billing setup did not finish. Retry from the usage card.';

export async function provisionRegisteredUser({
  userId,
  applicationBaseUrl,
}: {
  userId: string;
  applicationBaseUrl: string;
}): Promise<boolean> {
  const user = await claimUserUnpriceProvisioning({ id: userId });

  if (!user) {
    return false;
  }

  try {
    const unpriceCustomerId = await provisionUnpriceCustomer({
      userId: user.id,
      email: user.email,
      applicationBaseUrl,
    });

    await completeUserUnpriceProvisioning({
      id: user.id,
      unpriceCustomerId,
    });

    return true;
  } catch (error) {
    logUnpriceError('Failed to provision registered customer', error);
    await failUserUnpriceProvisioning({
      id: user.id,
      message: SAFE_PROVISIONING_ERROR,
    });
    throw error;
  }
}

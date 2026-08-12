import 'server-only';

import { getUserById } from '@/lib/db/queries';
import { logUnpriceError } from '@/lib/unprice/runtime';
import { getFlatEntitlements } from '@/lib/unprice/billing-profile';
import type { PlanAccessStatus } from './models';

export interface ModelAvailability {
  availableChatModelIds: string[];
  planAccessStatus: PlanAccessStatus;
}

export async function getModelAvailability({
  userId,
}: {
  userId: string;
}): Promise<ModelAvailability> {
  const registeredUser = await getUserById(userId);

  if (!registeredUser?.unpriceCustomerId) {
    return {
      availableChatModelIds: ['chat-model'],
      planAccessStatus: 'unavailable',
    };
  }

  try {
    const entitlements = await getFlatEntitlements(
      registeredUser.unpriceCustomerId,
    );

    return {
      availableChatModelIds: entitlements.canUseReasoning
        ? ['chat-model', 'chat-model-reasoning']
        : ['chat-model'],
      planAccessStatus: 'ready',
    };
  } catch (error) {
    logUnpriceError('Failed to load model availability', error);
    return {
      availableChatModelIds: ['chat-model'],
      planAccessStatus: 'unavailable',
    };
  }
}

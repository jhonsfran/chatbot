export type ChatUsageStep = {
  usage: {
    completionTokens: number;
    promptTokens: number;
  };
};

export type ChatReservationSettlement = {
  accepted: boolean;
  reason: string;
};

type ChatReservationBackend = {
  settle: (totalTokens: number) => Promise<ChatReservationSettlement>;
  release: () => Promise<void>;
};

export function getChatMessageReservationKey({
  customerId,
  chatId,
  messageId,
}: {
  customerId: string;
  chatId: string;
  messageId: string;
}) {
  return `chat:${customerId}:${chatId}:message:${messageId}`;
}

export function getTotalChatTokens(steps: readonly ChatUsageStep[]): number {
  return steps.reduce((total, step) => {
    const { completionTokens, promptTokens } = step.usage;

    if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
      throw new TypeError('The provider did not return finite token usage');
    }

    return (
      total +
      Math.max(0, Math.trunc(promptTokens)) +
      Math.max(0, Math.trunc(completionTokens))
    );
  }, 0);
}

export class ChatMessageReservation {
  private state: 'open' | 'settling' | 'closed' = 'open';

  constructor(private readonly backend: ChatReservationBackend) {}

  async settle(
    steps: readonly ChatUsageStep[],
  ): Promise<ChatReservationSettlement> {
    if (this.state !== 'open') {
      throw new Error('Chat reservation is already finalized');
    }

    this.state = 'settling';

    try {
      const settlement = await this.backend.settle(getTotalChatTokens(steps));
      this.state = 'closed';
      return settlement;
    } catch (error) {
      try {
        await this.backend.release();
      } finally {
        this.state = 'closed';
      }

      throw error;
    }
  }

  async release(): Promise<void> {
    if (this.state !== 'open') {
      return;
    }

    this.state = 'closed';
    await this.backend.release();
  }
}

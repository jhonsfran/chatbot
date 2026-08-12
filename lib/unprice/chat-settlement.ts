export type ChatTokenSettlementInput = {
  runId: string;
  customerId: string;
  chatId: string;
  messageId: string;
  inputTokens: number;
  outputTokens: number;
};

type ConsumptionResult = {
  accepted: boolean;
  reason: string;
  run: { status: string };
};

type ChatTokenSettlementDependencies = {
  consume: (input: {
    runId: string;
    idempotencyKey: string;
    totalTokens: number;
  }) => Promise<ConsumptionResult>;
  recordEvidence: (input: {
    customerId: string;
    idempotencyKey: string;
    totalTokens: number;
  }) => Promise<unknown>;
};

export type ChatTokenSettlementResult = {
  finalStatus: 'completed' | 'failed';
  limitReached: boolean;
  runIsRunning: boolean;
};

function tokenTotal(inputTokens: number, outputTokens: number) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    throw new TypeError('The provider did not return finite token usage');
  }

  return (
    Math.max(0, Math.trunc(inputTokens)) + Math.max(0, Math.trunc(outputTokens))
  );
}

export async function settleChatTokenUsage(
  input: ChatTokenSettlementInput,
  dependencies: ChatTokenSettlementDependencies,
): Promise<ChatTokenSettlementResult> {
  const totalTokens = tokenTotal(input.inputTokens, input.outputTokens);
  const keyRoot = `chat:${input.customerId}:${input.chatId}:${input.messageId}:tokens`;
  const consumption = await dependencies.consume({
    runId: input.runId,
    idempotencyKey: keyRoot,
    totalTokens,
  });
  const runIsRunning = consumption.run.status === 'running';

  if (consumption.accepted || consumption.reason === 'duplicate') {
    return {
      finalStatus: 'completed',
      limitReached: false,
      runIsRunning,
    };
  }

  await dependencies.recordEvidence({
    customerId: input.customerId,
    idempotencyKey: `${keyRoot}:evidence`,
    totalTokens,
  });

  return {
    finalStatus: 'failed',
    limitReached: true,
    runIsRunning,
  };
}

import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
} from 'ai';
import { auth, isRegularUser } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
  getUserById,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import {
  checkTotalTokenAccess,
  consumeChatBudgetTokens,
  endChatBudgetRun,
  logUnpriceError,
  startChatBudgetRun,
  UnpriceRuntimeError,
} from '@/lib/unprice/runtime';
import { getFlatEntitlements } from '@/lib/unprice/billing-profile';
import { getInitialChatTitle } from '@/lib/ai/chat-title';

export const maxDuration = 60;

const budgetRejectionCodes = new Set([
  'LIMIT_EXCEEDED',
  'RUN_BUDGET_EXCEEDED',
  'WALLET_EMPTY',
]);

function getFulfilledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') {
    throw result.reason;
  }

  return result.value;
}

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let unpriceRunId: string | undefined;
  let budgetRunFinalized = false;

  const finalizeBudgetRun = async (status: 'completed' | 'failed') => {
    if (!unpriceRunId || budgetRunFinalized) {
      return;
    }

    budgetRunFinalized = true;

    try {
      await endChatBudgetRun({ runId: unpriceRunId, status });
    } catch (error) {
      logUnpriceError('Failed to close chat budget run', error);
    }
  };

  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!isRegularUser(session)) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const [chat, registeredUser, previousMessages] = await Promise.all([
      getChatById({ id }),
      getUserById(session.user.id),
      getMessagesByChatId({ id }),
    ]);

    if (chat && chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    if (!registeredUser?.unpriceCustomerId) {
      return new ChatSDKError(
        'service_unavailable:billing',
        'BILLING_SETUP_PENDING',
      ).toResponse();
    }

    const unpriceCustomerId = registeredUser.unpriceCustomerId;
    const billingResults = await Promise.allSettled([
      checkTotalTokenAccess(unpriceCustomerId),
      getFlatEntitlements(unpriceCustomerId),
      startChatBudgetRun({
        customerId: unpriceCustomerId,
        chatId: id,
        messageId: message.id,
      }),
    ] as const);
    const budgetResult = billingResults[2];

    if (budgetResult.status === 'fulfilled') {
      unpriceRunId = budgetResult.value.runId;
    }

    const failedBillingResult = billingResults.find(
      (result) => result.status === 'rejected',
    );

    if (failedBillingResult?.status === 'rejected') {
      await finalizeBudgetRun('failed');
      throw failedBillingResult.reason;
    }

    const tokenAccess = getFulfilledValue(billingResults[0]);
    const entitlements = getFulfilledValue(billingResults[1]);
    const budgetRun = getFulfilledValue(billingResults[2]);

    if (!tokenAccess.allowed) {
      await finalizeBudgetRun('failed');
      return new ChatSDKError(
        'rate_limit:billing',
        tokenAccess.rejectionReason,
      ).toResponse();
    }

    if (
      selectedChatModel === 'chat-model-reasoning' &&
      !entitlements.canUseReasoning
    ) {
      await finalizeBudgetRun('failed');
      return new ChatSDKError(
        'forbidden:billing',
        'REASONING_MODEL_REQUIRED',
      ).toResponse();
    }

    if (
      selectedVisibilityType === 'public' &&
      !entitlements.canSharePublicChats
    ) {
      await finalizeBudgetRun('failed');
      return new ChatSDKError(
        'forbidden:billing',
        'PUBLIC_SHARING_REQUIRED',
      ).toResponse();
    }

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });
    if (budgetRun.status !== 'running' || budgetRun.remainingAmountMinor <= 0) {
      if (budgetRun.status === 'running') {
        await finalizeBudgetRun('failed');
      } else {
        budgetRunFinalized = true;
      }

      return new ChatSDKError(
        'rate_limit:billing',
        'BUDGET_EXCEEDED',
      ).toResponse();
    }

    if (!chat) {
      await saveChat({
        id,
        userId: session.user.id,
        title: getInitialChatTitle(message),
        visibility: selectedVisibilityType,
      });

      after(async () => {
        try {
          const title = await generateTitleFromUserMessage({ message });
          await updateChatTitleById({ chatId: id, title });
        } catch (error) {
          console.error('Failed to improve chat title', error);
        }
      });
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const activeTools: Array<
      'getWeather' | 'createDocument' | 'updateDocument' | 'requestSuggestions'
    > = selectedChatModel === 'chat-model-reasoning' ? [] : ['getWeather'];

    if (
      selectedChatModel !== 'chat-model-reasoning' &&
      entitlements.canUseArtifacts
    ) {
      activeTools.push(
        'createDocument',
        'updateDocument',
        'requestSuggestions',
      );
    }

    const stream = createDataStream({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages,
          maxSteps: 5,
          experimental_activeTools: activeTools,
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response, usage }) => {
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [message],
                  responseMessages: response.messages,
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
              } catch (_) {
                console.error('Failed to save chat');
              }
            }

            if (unpriceCustomerId && unpriceRunId) {
              try {
                const consumption = await consumeChatBudgetTokens({
                  runId: unpriceRunId,
                  customerId: unpriceCustomerId,
                  chatId: id,
                  messageId: message.id,
                  inputTokens: usage.promptTokens,
                  outputTokens: usage.completionTokens,
                });

                if (!consumption.accepted) {
                  dataStream.writeData({ type: 'billing-limit-reached' });
                }

                if (consumption.run.status === 'running') {
                  await finalizeBudgetRun(
                    consumption.accepted ? 'completed' : 'failed',
                  );
                } else {
                  budgetRunFinalized = true;
                }
              } catch (error) {
                logUnpriceError('Failed to consume chat budget', error);
                await finalizeBudgetRun('failed');
              }
            }
          },
          onError: async () => {
            await finalizeBudgetRun('failed');
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      return new Response(stream);
    }
  } catch (error) {
    await finalizeBudgetRun('failed');

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    if (error instanceof UnpriceRuntimeError) {
      if (error.code === 'FORBIDDEN') {
        return new ChatSDKError('forbidden:account', error.code).toResponse();
      }

      if (budgetRejectionCodes.has(error.code)) {
        return new ChatSDKError('rate_limit:billing', error.code).toResponse();
      }

      logUnpriceError('Failed to enforce chat monetization', error);
      return new ChatSDKError('service_unavailable:billing').toResponse();
    }

    console.error('Failed to process chat request', error);
    return new ChatSDKError('service_unavailable:chat').toResponse();
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!isRegularUser(session)) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!isRegularUser(session)) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

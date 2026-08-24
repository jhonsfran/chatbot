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
  CHAT_MAX_OUTPUT_TOKENS,
  checkTotalTokenAccess,
  logUnpriceError,
  reserveChatMessage,
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
  let chatReservation:
    | Awaited<ReturnType<typeof reserveChatMessage>>
    | undefined;
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
    const [tokenAccess, entitlements] = await Promise.all([
      checkTotalTokenAccess(unpriceCustomerId),
      getFlatEntitlements(unpriceCustomerId),
    ]);
    if (!tokenAccess.allowed) {
      return new ChatSDKError(
        'rate_limit:billing',
        tokenAccess.rejectionReason,
      ).toResponse();
    }

    if (
      selectedChatModel === 'chat-model-reasoning' &&
      !entitlements.canUseReasoning
    ) {
      return new ChatSDKError(
        'forbidden:billing',
        'REASONING_MODEL_REQUIRED',
      ).toResponse();
    }

    if (
      selectedVisibilityType === 'public' &&
      !entitlements.canSharePublicChats
    ) {
      return new ChatSDKError(
        'forbidden:billing',
        'PUBLIC_SHARING_REQUIRED',
      ).toResponse();
    }

    const reservation = await reserveChatMessage({
      customerId: unpriceCustomerId,
      chatId: id,
      messageId: message.id,
    });
    chatReservation = reservation;

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });
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
          abortSignal: request.signal,
          maxTokens: CHAT_MAX_OUTPUT_TOKENS,
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
          onFinish: async ({ response, steps }) => {
            try {
              const settlement = await reservation.settle(steps);

              if (!settlement.accepted) {
                dataStream.writeData({
                  type: 'billing-limit-reached',
                  reason: 'RUN_BUDGET_EXCEEDED',
                });
              }
            } catch (error) {
              logUnpriceError('Failed to settle chat usage', error);
            }

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
          },
          onError: async () => {
            try {
              await reservation.release();
            } catch (error) {
              logUnpriceError('Failed to release chat reservation', error);
            }
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
    if (chatReservation) {
      try {
        await chatReservation.release();
      } catch (releaseError) {
        logUnpriceError('Failed to release chat reservation', releaseError);
      }
    }

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

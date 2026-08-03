import { customProvider } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { isTestEnvironment } from '../constants';
import { createOpenRouterImageModel } from './openrouter-image-model';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

const openrouter = createOpenRouter({ compatibility: 'strict' });

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': openrouter('x-ai/grok-4.3'),
        'chat-model-reasoning': openrouter('x-ai/grok-4.3', {
          reasoning: { effort: 'low' },
        }),
        'title-model': openrouter('x-ai/grok-4.3'),
        'artifact-model': openrouter('x-ai/grok-4.3'),
      },
      imageModels: {
        'small-model': createOpenRouterImageModel(
          'x-ai/grok-imagine-image-quality',
        ),
      },
    });

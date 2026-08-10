import { customProvider } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOpenRouterImageModel } from './openrouter-image-model';

const openrouter = createOpenRouter({ compatibility: 'strict' });

export const myProvider = customProvider({
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

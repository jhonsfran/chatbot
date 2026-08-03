import type { ImageModel } from 'ai';

type OpenRouterImageResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

export function createOpenRouterImageModel(modelId: string): ImageModel {
  return {
    specificationVersion: 'v1',
    provider: 'openrouter.image',
    modelId,
    maxImagesPerCall: 1,
    async doGenerate({ prompt, n, aspectRatio, headers, abortSignal }) {
      const apiKey = process.env.OPENROUTER_API_KEY;

      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is not configured.');
      }

      const requestHeaders: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };

      for (const [name, value] of Object.entries(headers ?? {})) {
        if (value !== undefined) {
          requestHeaders[name] = value;
        }
      }

      const response = await fetch('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          model: modelId,
          prompt,
          n,
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1_000);
        throw new Error(
          `OpenRouter image generation failed (${response.status}): ${detail}`,
        );
      }

      const result = (await response.json()) as OpenRouterImageResponse;
      const images = result.data
        ?.map((image) => image.b64_json)
        .filter((image): image is string => Boolean(image));

      if (!images?.length) {
        throw new Error('OpenRouter did not return an image.');
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name] = value;
      });

      return {
        images,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: responseHeaders,
        },
      };
    },
  };
}

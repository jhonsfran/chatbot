export const unpriceCatalog = {
  events: {
    aiCompletion: 'ai_completion',
  },
  features: {
    artifactTools: 'artifact-tools',
    reasoningModel: 'reasoning-model',
    totalTokens: 'total-tokens',
  },
  plans: {
    free: 'free',
    pro: 'pro',
    enterprise: 'enterprise',
  },
} as const;

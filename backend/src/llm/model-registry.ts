export type ModelProvider = 'google' | 'groq' | 'openrouter' | 'cloudflare';

export interface ModelDefinition {
  id: string;
  label: string;
  maker: string;
  provider: ModelProvider;
  // Groq streams a reasoning model's chain-of-thought into `content` unless it
  // is told to hide it. Non-reasoning models reject the field outright.
  hideReasoning?: boolean;
  // Some models (e.g. OpenAI's o-series) reject a custom temperature and only
  // accept the provider default. Runs against them record a null temperature.
  fixedTemperature?: boolean;
}

export interface OpenAICompatProvider {
  url: () => string;
  label: string;
  // Sent as max_tokens. Workers AI otherwise stops most models at 256 output
  // tokens, silently truncating anything longer than a paragraph.
  maxTokens?: number;
}

export const PROVIDER_API_KEY_ENV: Record<ModelProvider, string> = {
  google: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
};

// Settings a provider needs besides its API key.
const PROVIDER_EXTRA_ENV: Partial<Record<ModelProvider, string[]>> = {
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID'],
};

export const OPENAI_COMPAT_PROVIDERS: Record<
  Exclude<ModelProvider, 'google'>,
  OpenAICompatProvider
> = {
  groq: {
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    label: 'Groq',
  },
  openrouter: {
    url: () => 'https://openrouter.ai/api/v1/chat/completions',
    label: 'OpenRouter',
  },
  cloudflare: {
    url: () =>
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID?.trim()}/ai/v1/chat/completions`,
    label: 'Cloudflare Workers AI',
    maxTokens: 4096,
  },
};

// Only models that are actually reachable on a free-tier key belong here.
// Verified against each provider's catalogue and a live completion.
export const MODELS: readonly ModelDefinition[] = [
  {
    id: 'gemini-3.8-flash',
    label: 'gemini-3.8-flash',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'gemini-3.7-flash',
    label: 'gemini-3.7-flash',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'gemini-3.6-flash',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'gemini-3.5-flash',
    label: 'gemini-3.5-flash',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'gemini-3.5-flash-lite',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    maker: 'Google',
    provider: 'google',
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'gpt-oss-120b',
    maker: 'OpenAI',
    provider: 'groq',
    hideReasoning: true,
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'gpt-oss-20b',
    maker: 'OpenAI',
    provider: 'groq',
    hideReasoning: true,
  },
  {
    id: 'qwen/qwen3.8-27b',
    label: 'qwen3.8-27b',
    maker: 'Alibaba',
    provider: 'groq',
    hideReasoning: true,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'nemotron-3-ultra-550b',
    maker: 'NVIDIA',
    provider: 'openrouter',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'nemotron-3-super-120b',
    maker: 'NVIDIA',
    provider: 'openrouter',
  },
  {
    id: 'cohere/north-mini-code:free',
    label: 'north-mini-code',
    maker: 'Cohere',
    provider: 'openrouter',
  },
  // Workers AI free plan. Kimi, DeepSeek V4 and GLM 5.x are listed in its
  // catalogue but answer 403 on the free plan, so they are not offered.
  {
    id: '@cf/meta/llama-4-scout-17b-16e-instruct',
    label: 'llama-4-scout-17b',
    maker: 'Meta',
    provider: 'cloudflare',
  },
  {
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    label: 'mistral-small-3.1-24b',
    maker: 'Mistral',
    provider: 'cloudflare',
  },
  {
    id: '@cf/zai-org/glm-4.7-flash',
    label: 'glm-4.7-flash',
    maker: 'Z.ai',
    provider: 'cloudflare',
  },
  {
    id: '@cf/ibm-granite/granite-4.0-h-micro',
    label: 'granite-4.0-h-micro',
    maker: 'IBM',
    provider: 'cloudflare',
  },
];

export const DEFAULT_MODEL_ID = 'gemini-3.5-flash-lite';

// Tried in order when the requested model fails. The first one that is on a
// different provider and has its key configured is used.
export const FALLBACK_MODEL_IDS = [
  'openai/gpt-oss-120b',
  'gemini-3.5-flash-lite',
];

export function findModel(id: string): ModelDefinition | undefined {
  return MODELS.find((model) => model.id === id);
}

export function isProviderConfigured(provider: ModelProvider): boolean {
  const required = [
    PROVIDER_API_KEY_ENV[provider],
    ...(PROVIDER_EXTRA_ENV[provider] ?? []),
  ];
  return required.every((name) => Boolean(process.env[name]?.trim()));
}

export function availableModels(): ModelDefinition[] {
  return MODELS.filter((model) => isProviderConfigured(model.provider));
}

export function defaultModel(): ModelDefinition | undefined {
  const preferred = findModel(DEFAULT_MODEL_ID);
  if (preferred && isProviderConfigured(preferred.provider)) {
    return preferred;
  }
  return availableModels()[0];
}

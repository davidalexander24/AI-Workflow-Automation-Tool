export type ModelProvider = 'google' | 'groq' | 'openrouter';

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
  baseUrl: string;
  label: string;
}

export const PROVIDER_API_KEY_ENV: Record<ModelProvider, string> = {
  google: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

export const OPENAI_COMPAT_PROVIDERS: Record<
  Exclude<ModelProvider, 'google'>,
  OpenAICompatProvider
> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    label: 'Groq',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    label: 'OpenRouter',
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
  return Boolean(process.env[PROVIDER_API_KEY_ENV[provider]]?.trim());
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

const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function toApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(toApiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    const fallbackMessage = `Request failed with status ${response.status}`;
    let errorMessage = fallbackMessage;

    try {
      const errorBody = (await response.json()) as { message?: string | string[] };
      const backendMessage = Array.isArray(errorBody.message)
        ? errorBody.message.join(', ')
        : errorBody.message;

      if (backendMessage) {
        errorMessage = backendMessage;
      }
    } catch {
      errorMessage = fallbackMessage;
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export type Workflow = {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  inputData: unknown;
  outputResult: string;
  status: 'pending' | 'success' | 'failed';
  model?: string | null;
  temperature?: number | null;
  createdAt: string;
};

export type ExecuteWorkflowResponse = {
  workflowId: string;
  runId: string;
  status: 'pending' | 'success' | 'failed';
  outputResult: string;
  model?: string;
  temperature?: number;
};

export const MODELS = [
  { id: 'openai/gpt-5', label: 'gpt-5', maker: 'OpenAI' },
  { id: 'openai/gpt-4o', label: 'gpt-4o', maker: 'OpenAI' },
  { id: 'openai/gpt-4.1-mini', label: 'gpt-4.1-mini', maker: 'OpenAI' },
  { id: 'gpt-oss-120b', label: 'gpt-oss-120b', maker: 'OpenAI' },
  { id: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite', maker: 'Google' },
  { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash', maker: 'Google' },
  { id: 'gemini-3-flash-preview', label: 'gemini-3-flash', maker: 'Google' },
  { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', maker: 'Google' },
  { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', maker: 'Google' },
  { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b', maker: 'Meta' },
  { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b', maker: 'Meta' },
  { id: 'deepseek/deepseek-r1', label: 'deepseek-r1', maker: 'DeepSeek' },
  { id: 'moonshotai/kimi-k2.6:free', label: 'kimi-k2.6', maker: 'Moonshot' },
  { id: 'qwen/qwen3-32b', label: 'qwen3-32b', maker: 'Alibaba' },
  { id: 'zai-glm-4.7', label: 'glm-4.7', maker: 'Z.ai' },
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL: ModelId = 'gemini-3.1-flash-lite';
export const DEFAULT_TEMPERATURE = 1;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;

export type CreateWorkflowPayload = {
  name: string;
  description: string;
  promptTemplate: string;
};

export type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>;

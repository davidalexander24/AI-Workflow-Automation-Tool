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

export const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: '3.1 flash-lite', hint: 'fast · 500 req/day' },
  { id: 'gemini-3.5-flash', label: '3.5 flash', hint: 'GA · most capable' },
  { id: 'gemini-3-flash-preview', label: '3 flash', hint: 'preview' },
  { id: 'gemini-2.5-flash', label: '2.5 flash', hint: 'stable' },
  { id: 'gemini-2.5-flash-lite', label: '2.5 flash-lite', hint: 'stable · fast' },
] as const;

export type GeminiModelId = (typeof GEMINI_MODELS)[number]['id'];

export const DEFAULT_MODEL: GeminiModelId = 'gemini-3.1-flash-lite';
export const DEFAULT_TEMPERATURE = 1;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;

export type CreateWorkflowPayload = {
  name: string;
  description: string;
  promptTemplate: string;
};

export type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>;

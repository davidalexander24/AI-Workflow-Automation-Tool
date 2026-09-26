const API_BASE_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const OFFLINE_MESSAGE =
  'Cannot reach the backend API right now. It is self-hosted and may be briefly offline; please try again in a minute.';

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

  let response: Response;
  try {
    response = await fetch(toApiUrl(path), {
      ...init,
      headers,
    });
  } catch {
    // fetch only rejects when no response arrived at all (DNS, TLS, network).
    throw new Error(OFFLINE_MESSAGE);
  }

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

// A step that runs after the workflow's own promptTemplate. model null means
// "use the model chosen for the run".
export type WorkflowStep = {
  name: string;
  promptTemplate: string;
  model: string | null;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  steps: WorkflowStep[];
  // Curated example: runnable by anyone, not editable or deletable.
  locked: boolean;
  createdAt: string;
};

export type StepResult = {
  name: string;
  model: string;
  fallbackFrom: string | null;
  temperature: number | null;
  attempts: number | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  output: string | null;
  error: string | null;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  inputData: unknown;
  outputResult: string;
  status: 'pending' | 'success' | 'failed';
  // The model that produced the output; fallbackFrom is the one requested
  // when a fallback answered instead.
  model?: string | null;
  fallbackFrom?: string | null;
  temperature?: number | null;
  attempts?: number | null;
  latencyMs?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  // Multi-step runs only; run-level latency, tokens and attempts are totals.
  stepResults?: StepResult[] | null;
  createdAt: string;
};

export type ExecuteWorkflowResponse = {
  workflowId: string;
  runId: string;
  status: 'pending' | 'success' | 'failed';
  outputResult: string;
  model: string;
  fallbackFrom: string | null;
  temperature: number | null;
  attempts: number;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  steps: StepResult[] | null;
};

export type ModelInfo = {
  id: string;
  label: string;
  maker: string;
  provider: string;
};

// Served by the backend, which lists only models it holds a provider key for.
export type ModelsResponse = {
  defaultModel: string | null;
  models: ModelInfo[];
};

// One row per requested model; every step of a multi-step run is one call.
export type ModelStats = {
  model: string;
  calls: number;
  successes: number;
  fallbacks: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgCompletionTokens: number | null;
};

export type AppConfig = {
  // 0 means visitor-created workflows are never cleaned up.
  workflowTtlHours: number;
  maxFollowUpSteps: number;
};

export const DEFAULT_TEMPERATURE = 1;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;

export type CreateWorkflowPayload = {
  name: string;
  description: string;
  promptTemplate: string;
  steps: WorkflowStep[];
};

export type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>;

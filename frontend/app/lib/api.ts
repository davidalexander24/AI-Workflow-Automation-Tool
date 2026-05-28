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
  createdAt: string;
};

export type ExecuteWorkflowResponse = {
  workflowId: string;
  runId: string;
  status: 'pending' | 'success' | 'failed';
  outputResult: string;
};

export type CreateWorkflowPayload = {
  name: string;
  description: string;
  promptTemplate: string;
};

export type UpdateWorkflowPayload = Partial<CreateWorkflowPayload>;

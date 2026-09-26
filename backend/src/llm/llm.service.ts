import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import {
  FALLBACK_MODEL_IDS,
  ModelDefinition,
  OPENAI_COMPAT_PROVIDERS,
  PROVIDER_API_KEY_ENV,
  findModel,
  isProviderConfigured,
} from './model-registry';

// Per-call ceiling. A hung provider would otherwise hold the request open and
// leave the run pending indefinitely.
const PROVIDER_TIMEOUT_MS = 60_000;
// Ceiling for the whole execution, retries and fallback included, so a slow
// primary cannot push the request past what a browser will wait for.
const TOTAL_BUDGET_MS = 90_000;
// Not worth starting another call with less time than this left.
const MIN_CALL_BUDGET_MS = 5_000;
// Backoff before each retry of a transient failure on the same model.
const RETRY_DELAYS_MS = [800, 2_000];
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// Carries the bookkeeping of a failed execution so the run can still record
// how many calls were made and how long they took.
export class GenerationError extends Error {
  constructor(
    readonly primaryError: unknown,
    readonly attempts: number,
    readonly latencyMs: number,
  ) {
    super(describeError(primaryError));
    this.name = 'GenerationError';
  }
}

export interface GenerationResult {
  text: string;
  // The model that produced `text`, which differs from the requested one when
  // a fallback was used.
  model: string;
  fallbackFrom: string | null;
  temperature: number | null;
  attempts: number;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

interface CallResult {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const candidate = (error as { status?: unknown }).status;
    if (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate <= 599
    ) {
      return candidate;
    }
  }
  return undefined;
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return 'Unknown upstream AI provider error.';
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      /timed? ?out|aborted/i.test(error.message))
  );
}

// Worth retrying on the same model: upstream 5xx, or a network failure that
// never produced a status. Timeouts are not, since they already spent the
// per-call budget.
function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) {
    return TRANSIENT_STATUSES.has(status);
  }
  return !isTimeout(error);
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  async generate(
    requested: ModelDefinition,
    prompt: string,
    temperature: number,
    {
      allowFallback = true,
      deadline: callerDeadline,
    }: {
      allowFallback?: boolean;
      // Absolute time (ms since epoch) the caller needs an answer by, e.g. a
      // multi-step chain sharing one budget across its steps.
      deadline?: number;
    } = {},
  ): Promise<GenerationResult> {
    const startedAt = Date.now();
    const deadline = Math.min(
      startedAt + TOTAL_BUDGET_MS,
      callerDeadline ?? Infinity,
    );
    let attempts = 0;

    if (deadline - startedAt < MIN_CALL_BUDGET_MS) {
      throw new GenerationError(
        new ProviderError('Not enough time left in the run budget.'),
        0,
        0,
      );
    }

    const attempt = async (model: ModelDefinition): Promise<CallResult> => {
      attempts += 1;
      return this.call(model, prompt, temperature, deadline);
    };

    let primaryError: unknown;
    for (let retry = 0; ; retry += 1) {
      try {
        const result = await attempt(requested);
        return this.toResult(
          requested,
          null,
          result,
          temperature,
          attempts,
          startedAt,
        );
      } catch (error) {
        primaryError = error;
        const delay = RETRY_DELAYS_MS[retry];
        const canRetry =
          delay !== undefined &&
          isTransient(error) &&
          deadline - Date.now() - delay >= MIN_CALL_BUDGET_MS;
        if (!canRetry) {
          break;
        }
        this.logger.warn(
          `${requested.id} attempt ${attempts} failed (${describeError(error)}); retrying in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    const fallback = allowFallback ? this.pickFallback(requested) : undefined;
    if (!fallback || deadline - Date.now() < MIN_CALL_BUDGET_MS) {
      throw new GenerationError(primaryError, attempts, Date.now() - startedAt);
    }

    this.logger.warn(
      `${requested.id} failed after ${attempts} attempt(s) (${describeError(primaryError)}); falling back to ${fallback.id}`,
    );
    try {
      const result = await attempt(fallback);
      return this.toResult(
        fallback,
        requested.id,
        result,
        temperature,
        attempts,
        startedAt,
      );
    } catch (fallbackError) {
      this.logger.error(
        `Fallback ${fallback.id} also failed: ${describeError(fallbackError)}`,
      );
      // Surface the primary error: it is what the user asked for, and a
      // provider 429 there should still read as rate limiting.
      throw new GenerationError(primaryError, attempts, Date.now() - startedAt);
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async call(
    model: ModelDefinition,
    prompt: string,
    temperature: number,
    deadline: number,
  ): Promise<CallResult> {
    const timeoutMs = Math.min(PROVIDER_TIMEOUT_MS, deadline - Date.now());
    return model.provider === 'google'
      ? this.callGoogle(model, prompt, temperature, timeoutMs)
      : this.callOpenAICompatible(model, prompt, temperature, timeoutMs);
  }

  private pickFallback(
    requested: ModelDefinition,
  ): ModelDefinition | undefined {
    return FALLBACK_MODEL_IDS.map((id) => findModel(id)).find(
      (candidate): candidate is ModelDefinition =>
        candidate !== undefined &&
        candidate.provider !== requested.provider &&
        isProviderConfigured(candidate.provider),
    );
  }

  private toResult(
    model: ModelDefinition,
    fallbackFrom: string | null,
    result: CallResult,
    temperature: number,
    attempts: number,
    startedAt: number,
  ): GenerationResult {
    return {
      ...result,
      model: model.id,
      fallbackFrom,
      temperature: model.fixedTemperature ? null : temperature,
      attempts,
      latencyMs: Date.now() - startedAt,
    };
  }

  private async callGoogle(
    model: ModelDefinition,
    prompt: string,
    temperature: number,
    timeoutMs: number,
  ): Promise<CallResult> {
    const ai = new GoogleGenAI({
      apiKey: process.env[PROVIDER_API_KEY_ENV.google],
    });
    const response = await ai.models.generateContent({
      model: model.id,
      contents: prompt,
      config: {
        ...(model.fixedTemperature ? {} : { temperature }),
        httpOptions: { timeout: timeoutMs },
      },
    });

    // `text` already excludes thought parts, so reasoning models do not leak
    // their chain-of-thought into the output.
    const text = response.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new ProviderError('Google returned an empty response.');
    }

    return {
      text,
      promptTokens: response.usageMetadata?.promptTokenCount ?? null,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    };
  }

  private async callOpenAICompatible(
    model: ModelDefinition,
    prompt: string,
    temperature: number,
    timeoutMs: number,
  ): Promise<CallResult> {
    const providerId = model.provider as Exclude<
      typeof model.provider,
      'google'
    >;
    const provider = OPENAI_COMPAT_PROVIDERS[providerId];
    const apiKey = process.env[PROVIDER_API_KEY_ENV[providerId]];

    const payload: Record<string, unknown> = {
      model: model.id,
      messages: [{ role: 'user', content: prompt }],
    };
    if (!model.fixedTemperature) {
      payload.temperature = temperature;
    }
    if (providerId === 'groq' && model.hideReasoning) {
      payload.reasoning_format = 'hidden';
    }
    if (provider.maxTokens) {
      payload.max_tokens = provider.maxTokens;
    }

    const res = await fetch(provider.url(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new ProviderError(
        await this.readErrorMessage(res, provider.label),
        res.status,
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string; code?: number };
    };
    const text = data?.choices?.[0]?.message?.content;

    if (data?.choices?.[0]?.finish_reason === 'length') {
      this.logger.warn(
        `${model.id} stopped at its output-token limit; the answer is truncated.`,
      );
    }

    if (typeof text !== 'string' || !text.trim()) {
      // OpenRouter can answer 200 with an error body when the upstream fails
      // after headers were sent.
      const upstream = data?.error?.message;
      throw new ProviderError(
        upstream
          ? `${provider.label} upstream error: ${upstream}`
          : `${provider.label} returned an empty response.`,
        typeof data?.error?.code === 'number' ? data.error.code : undefined,
      );
    }

    return {
      text,
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
    };
  }

  private async readErrorMessage(
    res: Response,
    label: string,
  ): Promise<string> {
    let message = `${label} request failed with status ${res.status}.`;
    try {
      const body = (await res.json()) as {
        error?: {
          message?: string;
          metadata?: { provider_name?: string; raw?: unknown };
        };
        // Cloudflare's envelope: { success: false, errors: [{ message }] }
        errors?: { message?: string }[];
      };
      if (body?.error?.message) {
        message = body.error.message;
      } else if (body?.errors?.[0]?.message) {
        message = body.errors[0].message;
      }
      const meta = body?.error?.metadata;
      if (meta) {
        const raw =
          typeof meta.raw === 'string'
            ? meta.raw
            : meta.raw
              ? JSON.stringify(meta.raw)
              : '';
        const extra = [meta.provider_name, raw]
          .filter(Boolean)
          .join(': ')
          .slice(0, 200);
        if (extra) {
          message = `${message} (${extra})`;
        }
      }
    } catch {
      // keep the status-based fallback message
    }
    return message;
  }
}

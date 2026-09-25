import { GenerationError, LlmService, ProviderError } from './llm.service';
import { ModelDefinition, findModel } from './model-registry';

type Step = Error | string;

// Replaces the network call with a per-model script of outcomes and records
// every call and backoff, so the retry and fallback policy is tested alone.
class ScriptedLlmService extends LlmService {
  readonly calls: string[] = [];
  readonly sleeps: number[] = [];

  constructor(private readonly script: Record<string, Step[]>) {
    super();
  }

  protected sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    return Promise.resolve();
  }

  protected call(model: ModelDefinition) {
    this.calls.push(model.id);
    const next = this.script[model.id]?.shift();
    if (next === undefined) {
      return Promise.reject(new Error(`unscripted call to ${model.id}`));
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve({
      text: next,
      promptTokens: 7,
      completionTokens: 2,
    });
  }
}

function model(id: string): ModelDefinition {
  const definition = findModel(id);
  if (!definition) throw new Error(`unknown model ${id}`);
  return definition;
}

function timeoutError(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

const KEYS = ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'];

describe('LlmService retry and fallback', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      process.env[key] = 'test-key';
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('returns the first answer with usage and no fallback', async () => {
    const llm = new ScriptedLlmService({ 'gemini-3.8-flash': ['Tokyo'] });

    const result = await llm.generate(model('gemini-3.8-flash'), 'p', 0.7);

    expect(result).toMatchObject({
      text: 'Tokyo',
      model: 'gemini-3.8-flash',
      fallbackFrom: null,
      temperature: 0.7,
      attempts: 1,
      promptTokens: 7,
      completionTokens: 2,
    });
    expect(llm.sleeps).toEqual([]);
  });

  it('retries a transient 503 on the same model with backoff', async () => {
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [new ProviderError('high demand', 503), 'Tokyo'],
    });

    const result = await llm.generate(model('gemini-3.8-flash'), 'p', 1);

    expect(llm.calls).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash']);
    expect(llm.sleeps).toEqual([800]);
    expect(result).toMatchObject({ model: 'gemini-3.8-flash', attempts: 2 });
  });

  it('falls back to another provider once retries are exhausted', async () => {
    const overloaded = () => new ProviderError('high demand', 503);
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [overloaded(), overloaded(), overloaded()],
      'openai/gpt-oss-120b': ['Tokyo'],
    });

    const result = await llm.generate(model('gemini-3.8-flash'), 'p', 1);

    expect(llm.calls).toEqual([
      'gemini-3.8-flash',
      'gemini-3.8-flash',
      'gemini-3.8-flash',
      'openai/gpt-oss-120b',
    ]);
    expect(result).toMatchObject({
      text: 'Tokyo',
      model: 'openai/gpt-oss-120b',
      fallbackFrom: 'gemini-3.8-flash',
      attempts: 4,
    });
  });

  it.each([
    ['a delisted model (404)', () => new ProviderError('not found', 404)],
    ['rate limiting (429)', () => new ProviderError('slow down', 429)],
    ['a timeout', timeoutError],
  ])('does not retry %s but still falls back', async (_, makeError) => {
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [makeError()],
      'openai/gpt-oss-120b': ['Tokyo'],
    });

    const result = await llm.generate(model('gemini-3.8-flash'), 'p', 1);

    expect(llm.calls).toEqual(['gemini-3.8-flash', 'openai/gpt-oss-120b']);
    expect(llm.sleeps).toEqual([]);
    expect(result.fallbackFrom).toBe('gemini-3.8-flash');
  });

  it('picks a fallback on a different provider than the failed model', async () => {
    const llm = new ScriptedLlmService({
      'openai/gpt-oss-20b': [new ProviderError('not found', 404)],
      'gemini-3.5-flash-lite': ['Tokyo'],
    });

    const result = await llm.generate(model('openai/gpt-oss-20b'), 'p', 1);

    expect(llm.calls).toEqual(['openai/gpt-oss-20b', 'gemini-3.5-flash-lite']);
    expect(result.model).toBe('gemini-3.5-flash-lite');
  });

  it('reports the primary failure when fallback is disabled', async () => {
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [new ProviderError('not found', 404)],
    });

    const failure = await llm
      .generate(model('gemini-3.8-flash'), 'p', 1, { allowFallback: false })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GenerationError);
    expect((failure as GenerationError).attempts).toBe(1);
    expect(llm.calls).toEqual(['gemini-3.8-flash']);
  });

  it('surfaces the primary error when the fallback fails too', async () => {
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [new ProviderError('slow down', 429)],
      'openai/gpt-oss-120b': [new ProviderError('broken', 500)],
    });

    const failure = (await llm
      .generate(model('gemini-3.8-flash'), 'p', 1)
      .catch((error: unknown) => error)) as GenerationError;

    expect(failure).toBeInstanceOf(GenerationError);
    expect((failure.primaryError as ProviderError).status).toBe(429);
    expect(failure.attempts).toBe(2);
  });

  it('does not fall back when no other provider has a key', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const llm = new ScriptedLlmService({
      'gemini-3.8-flash': [new ProviderError('not found', 404)],
    });

    await expect(
      llm.generate(model('gemini-3.8-flash'), 'p', 1),
    ).rejects.toBeInstanceOf(GenerationError);
    expect(llm.calls).toEqual(['gemini-3.8-flash']);
  });
});

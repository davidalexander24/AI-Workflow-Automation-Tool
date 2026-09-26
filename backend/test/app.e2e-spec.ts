import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  GenerationError,
  GenerationResult,
  LlmService,
  ProviderError,
} from '../src/llm/llm.service';
import { PrismaService } from '../src/prisma/prisma.service';

const WORKFLOW_ID = '3f1c2a44-0b6e-4d7a-9c1e-2b5d8f9a0c11';

// Only the database and the model calls are faked; routing, validation,
// guards and filters are the real production setup from configureApp.
const prisma = {
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  $queryRaw: jest.fn(),
  workflow: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workflowRun: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const llm = { generate: jest.fn() };

function generated(
  text: string,
  overrides: Partial<GenerationResult> = {},
): GenerationResult {
  return {
    text,
    model: 'gemini-3.5-flash-lite',
    fallbackFrom: null,
    temperature: 1,
    attempts: 1,
    latencyMs: 100,
    promptTokens: 10,
    completionTokens: 5,
    ...overrides,
  };
}

function chainWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    name: 'Extract action items',
    description: 'd',
    promptTemplate: 'List the action items in: {{notes}}',
    steps: [
      {
        name: 'Draft email',
        promptTemplate: 'Email {{audience}} about: {{previous}}',
        model: null,
      },
    ],
    locked: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  const savedKeys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    // Only Google is configured, so /models must hide every other provider.
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(LlmService)
      .useValue(llm)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of Object.entries(savedKeys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(() => jest.resetAllMocks());

  it('GET / answers as a liveness probe', () => {
    return request(server).get('/').expect(200).expect('Hello World!');
  });

  describe('GET /models', () => {
    it('lists only models whose provider has a key', async () => {
      const res = await request(server).get('/models').expect(200);
      const body = res.body as {
        defaultModel: string;
        models: { id: string; provider: string }[];
      };

      expect(body.defaultModel).toBe('gemini-3.5-flash-lite');
      expect(body.models.length).toBeGreaterThan(0);
      expect(body.models.every((m) => m.provider === 'google')).toBe(true);
    });
  });

  describe('GET /health', () => {
    it('reports ok when the database answers', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const res = await request(server).get('/health').expect(200);

      expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
    });

    it('returns 503 when the database is down', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

      const res = await request(server).get('/health').expect(503);

      expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
    });
  });

  describe('database outages', () => {
    it('turn into a 503 instead of a 500', async () => {
      prisma.workflow.findMany.mockRejectedValue(
        new Prisma.PrismaClientInitializationError(
          "Can't reach database server",
          '6.19.3',
          'P1001',
        ),
      );

      const res = await request(server).get('/workflows').expect(503);

      expect((res.body as { message: string }).message).toMatch(
        /temporarily unavailable/,
      );
    });
  });

  describe('validation', () => {
    it('rejects a non-UUID workflow id before touching the database', async () => {
      await request(server).get('/workflows/not-a-uuid').expect(400);
      expect(prisma.workflow.findUnique).not.toHaveBeenCalled();
    });

    it('requires inputData on execute', () => {
      return request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ model: 'gemini-3.5-flash-lite' })
        .expect(400);
    });

    it('rejects a model the server does not offer', async () => {
      const res = await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: 'hi', model: 'groq/compound' })
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(
        /Unsupported model "groq\/compound"/,
      );
    });

    it('rejects a model whose provider has no key configured', () => {
      return request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: 'hi', model: 'openai/gpt-oss-120b' })
        .expect(400);
    });

    it('rejects an out-of-range temperature and a non-boolean allowFallback', async () => {
      await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: 'hi', temperature: 5 })
        .expect(400);
      await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: 'hi', allowFallback: 'yes' })
        .expect(400);
    });

    it('caps workflow field lengths', () => {
      return request(server)
        .post('/workflows')
        .send({
          name: 'x'.repeat(201),
          description: 'd',
          promptTemplate: 'p',
        })
        .expect(400);
    });

    it('caps the number of follow-up steps', () => {
      const step = { name: 's', promptTemplate: 'p' };
      return request(server)
        .post('/workflows')
        .send({
          name: 'n',
          description: 'd',
          promptTemplate: 'p',
          steps: [step, step, step, step, step],
        })
        .expect(400);
    });

    it('rejects a step pinned to an unknown model', async () => {
      const res = await request(server)
        .post('/workflows')
        .send({
          name: 'n',
          description: 'd',
          promptTemplate: 'p',
          steps: [{ name: 's', promptTemplate: 'p', model: 'made-up-model' }],
        })
        .expect(400);

      expect((res.body as { message: string }).message).toMatch(
        /Step 2 uses unknown model/,
      );
      expect(prisma.workflow.create).not.toHaveBeenCalled();
    });

    it('stores trimmed steps with a null model when none is pinned', async () => {
      prisma.workflow.create.mockImplementation(
        ({ data }: { data: object }) => ({ id: WORKFLOW_ID, ...data }),
      );

      await request(server)
        .post('/workflows')
        .send({
          name: 'n',
          description: 'd',
          promptTemplate: 'p',
          steps: [{ name: ' Draft ', promptTemplate: ' Use {{previous}} ' }],
        })
        .expect(201);

      expect(prisma.workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          steps: [
            { name: 'Draft', promptTemplate: 'Use {{previous}}', model: null },
          ],
        }) as unknown,
      });
    });
  });

  it('GET /config reports the demo limits', async () => {
    const res = await request(server).get('/config').expect(200);
    expect(res.body).toEqual({ workflowTtlHours: 0, maxFollowUpSteps: 4 });
  });

  describe('locked example workflows', () => {
    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue(
        chainWorkflow({ locked: true }),
      );
    });

    it('cannot be edited', async () => {
      await request(server)
        .patch(`/workflows/${WORKFLOW_ID}`)
        .send({ name: 'defaced' })
        .expect(403);
      expect(prisma.workflow.update).not.toHaveBeenCalled();
    });

    it('cannot be deleted', async () => {
      await request(server).delete(`/workflows/${WORKFLOW_ID}`).expect(403);
      expect(prisma.workflow.delete).not.toHaveBeenCalled();
    });
  });

  describe('multi-step execution', () => {
    beforeEach(() => {
      prisma.workflow.findUnique.mockResolvedValue(chainWorkflow());
      prisma.workflowRun.create.mockResolvedValue({ id: 'run-1' });
      prisma.workflowRun.update.mockImplementation(
        ({ data }: { data: object }) => ({ id: 'run-1', ...data }),
      );
    });

    it('feeds each step the previous output and the original inputs', async () => {
      llm.generate
        .mockResolvedValueOnce(generated('1. ship v2', { latencyMs: 300 }))
        .mockResolvedValueOnce(
          generated('Hi team, ...', { latencyMs: 700, completionTokens: 40 }),
        );

      const res = await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: { notes: 'standup notes', audience: 'the team' } })
        .expect(201);

      const prompts = llm.generate.mock.calls.map((call: unknown[]) => call[1]);
      expect(prompts).toEqual([
        'List the action items in: standup notes',
        'Email the team about: 1. ship v2',
      ]);
      expect(res.body).toMatchObject({
        status: 'success',
        outputResult: 'Hi team, ...',
        latencyMs: 1000,
        completionTokens: 45,
      });
      expect((res.body as { steps: unknown[] }).steps).toHaveLength(2);
    });

    it('stops at the failing step and records how far it got', async () => {
      llm.generate
        .mockResolvedValueOnce(generated('1. ship v2'))
        .mockRejectedValueOnce(
          new GenerationError(new ProviderError('overloaded', 503), 3, 4200),
        );

      const res = await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: { notes: 'n', audience: 'a' } })
        .expect(502);

      expect((res.body as { message: string }).message).toBe(
        'Step 2 of 2 ("Draft email") failed: Workflow execution failed due to an upstream AI provider error.',
      );
      const [[update]] = prisma.workflowRun.update.mock.calls as [
        [{ data: { status: string; stepResults: { error: string | null }[] } }],
      ];
      expect(update.data.status).toBe('failed');
      expect(update.data.stepResults.map((s) => s.error === null)).toEqual([
        true,
        false,
      ]);
    });

    it('rejects a step whose pinned model is unavailable before running anything', async () => {
      prisma.workflow.findUnique.mockResolvedValue(
        chainWorkflow({
          steps: [
            {
              name: 'Draft',
              promptTemplate: 'p',
              model: 'openai/gpt-oss-120b',
            },
          ],
        }),
      );

      await request(server)
        .post(`/workflows/${WORKFLOW_ID}/execute`)
        .send({ inputData: { notes: 'n' } })
        .expect(400);
      expect(prisma.workflowRun.create).not.toHaveBeenCalled();
      expect(llm.generate).not.toHaveBeenCalled();
    });
  });
});

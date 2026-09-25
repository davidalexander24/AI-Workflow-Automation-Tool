import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

const WORKFLOW_ID = '3f1c2a44-0b6e-4d7a-9c1e-2b5d8f9a0c11';

// Only the database is faked; routing, validation, guards and filters are the
// real production setup from configureApp.
const prisma = {
  onModuleInit: jest.fn(),
  onModuleDestroy: jest.fn(),
  $queryRaw: jest.fn(),
  workflow: { findMany: jest.fn(), findUnique: jest.fn() },
  workflowRun: { findMany: jest.fn() },
};

describe('API (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  const savedKeys = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    // Only Google is configured, so /models must hide Groq and OpenRouter.
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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
  });
});

import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { DatabaseUnavailableFilter } from './prisma/database-unavailable.filter';

const DEFAULT_CORS_ORIGINS =
  'https://ai-workflow-automation-tool-production.vercel.app,http://localhost:3000,http://localhost:3001';

// Shared by main.ts and the e2e tests, so tests exercise the same pipes,
// filters, and headers as production.
export function configureApp(app: NestExpressApplication): void {
  // Tailscale Funnel terminates TLS and forwards the real client IP via
  // X-Forwarded-For. Trust exactly one proxy hop (never `true` -- a spoofed
  // header could then dodge per-IP rate limiting).
  app.set('trust proxy', 1);

  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGINS?.trim() || DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: false,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(
    new DatabaseUnavailableFilter(app.get(HttpAdapterHost).httpAdapter),
  );
}

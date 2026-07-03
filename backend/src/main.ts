import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

const DEFAULT_CORS_ORIGINS =
  'https://ai-workflow-automation-tool-production.vercel.app,http://localhost:3000,http://localhost:3001';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

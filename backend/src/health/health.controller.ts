import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { availableModels } from '../llm/model-registry';
import { PrismaService } from '../prisma/prisma.service';

const DB_CHECK_TIMEOUT_MS = 5_000;

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Used by the uptime check, which also keeps the free-tier database from
  // pausing for inactivity. 503 when the database cannot answer.
  @SkipThrottle()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const db = await this.pingDatabase();
    if (db === 'down') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      models: availableModels().length,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('database ping timed out')),
            DB_CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}

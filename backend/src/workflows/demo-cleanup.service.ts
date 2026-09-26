import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// 0 (the default) disables the cleanup. Production sets it through
// docker-compose so a public demo does not accumulate visitors' workflows.
export function demoWorkflowTtlHours(): number {
  const hours = Number(process.env.DEMO_WORKFLOW_TTL_HOURS ?? 0);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

// Deletes unlocked workflows (and, by cascade, their runs) once they are
// older than the TTL. Locked example workflows are never touched.
@Injectable()
export class DemoCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DemoCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!demoWorkflowTtlHours()) {
      return;
    }
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const ttlHours = demoWorkflowTtlHours();
    if (!ttlHours) {
      return 0;
    }

    const cutoff = new Date(now.getTime() - ttlHours * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.workflow.deleteMany({
        where: { locked: false, createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(
          `Removed ${count} demo workflow(s) older than ${ttlHours}h.`,
        );
      }
      return count;
    } catch (error) {
      this.logger.warn(
        `Demo cleanup skipped: ${error instanceof Error ? error.message.split('\n').pop() : String(error)}`,
      );
      return 0;
    }
  }
}

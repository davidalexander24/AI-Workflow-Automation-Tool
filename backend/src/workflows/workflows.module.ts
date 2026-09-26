import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DemoCleanupService } from './demo-cleanup.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [PrismaModule, LlmModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, DemoCleanupService],
})
export class WorkflowsModule {}

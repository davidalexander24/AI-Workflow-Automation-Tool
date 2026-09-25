import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ModelsController } from './models.controller';

@Module({
  controllers: [ModelsController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}

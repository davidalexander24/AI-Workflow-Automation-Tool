import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MAX_FOLLOW_UP_STEPS } from './workflows/chain';
import { demoWorkflowTtlHours } from './workflows/demo-cleanup.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Server-side limits the UI explains to visitors.
  @Get('config')
  getConfig() {
    return {
      workflowTtlHours: demoWorkflowTtlHours(),
      maxFollowUpSteps: MAX_FOLLOW_UP_STEPS,
    };
  }
}

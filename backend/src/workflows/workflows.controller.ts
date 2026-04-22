import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  createWorkflow(@Body() body: CreateWorkflowDto) {
    return this.workflowsService.createWorkflow(body);
  }

  @Get()
  getAllWorkflows() {
    return this.workflowsService.getAllWorkflows();
  }

  @Get(':id')
  getWorkflowById(@Param('id') workflowId: string) {
    return this.workflowsService.getWorkflowById(workflowId);
  }

  @Get(':id/runs')
  getWorkflowRuns(@Param('id') workflowId: string) {
    return this.workflowsService.getWorkflowRuns(workflowId);
  }

  @Post(':id/execute')
  executeWorkflow(
    @Param('id') workflowId: string,
    @Body() body: ExecuteWorkflowDto,
  ) {
    return this.workflowsService.executeWorkflow(workflowId, body.inputData);
  }
}

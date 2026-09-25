import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
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
  getWorkflowById(@Param('id', ParseUUIDPipe) workflowId: string) {
    return this.workflowsService.getWorkflowById(workflowId);
  }

  @Patch(':id')
  updateWorkflow(
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Body() body: UpdateWorkflowDto,
  ) {
    return this.workflowsService.updateWorkflow(workflowId, body);
  }

  @Delete(':id')
  deleteWorkflow(@Param('id', ParseUUIDPipe) workflowId: string) {
    return this.workflowsService.deleteWorkflow(workflowId);
  }

  @Get(':id/runs')
  getWorkflowRuns(@Param('id', ParseUUIDPipe) workflowId: string) {
    return this.workflowsService.getWorkflowRuns(workflowId);
  }

  @Get(':id/stats')
  getWorkflowStats(@Param('id', ParseUUIDPipe) workflowId: string) {
    return this.workflowsService.getWorkflowStats(workflowId);
  }

  // Tighter than the global limit: this is the only route that consumes
  // AI provider quota.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':id/execute')
  executeWorkflow(
    @Param('id', ParseUUIDPipe) workflowId: string,
    @Body() body: ExecuteWorkflowDto,
  ) {
    return this.workflowsService.executeWorkflow(workflowId, body.inputData, {
      model: body.model,
      temperature: body.temperature,
      allowFallback: body.allowFallback,
    });
  }
}

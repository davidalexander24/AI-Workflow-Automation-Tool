import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  private extractProviderErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error && typeof error === 'object') {
      const candidate = (error as { message?: unknown }).message;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return 'Workflow execution failed due to an upstream AI provider error.';
  }

  private extractProviderStatus(error: unknown): number {
    if (error && typeof error === 'object') {
      const candidate = (error as { status?: unknown }).status;
      if (
        typeof candidate === 'number' &&
        Number.isInteger(candidate) &&
        candidate >= 400 &&
        candidate <= 599
      ) {
        return candidate;
      }
    }

    return HttpStatus.BAD_GATEWAY;
  }

  async createWorkflow(dto: CreateWorkflowDto) {
    const name = dto.name?.trim();
    const description = dto.description?.trim();
    const promptTemplate = dto.promptTemplate?.trim();

    if (!name || !description || !promptTemplate) {
      throw new BadRequestException(
        'name, description, and promptTemplate are required.',
      );
    }

    return this.prisma.workflow.create({
      data: {
        name,
        description,
        promptTemplate,
      },
    });
  }

  async getAllWorkflows() {
    return this.prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkflowById(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    return workflow;
  }

  async getWorkflowRuns(workflowId: string) {
    await this.getWorkflowById(workflowId);

    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async executeWorkflow(workflowId: string, inputData: unknown) {
    if (inputData === undefined || inputData === null) {
      throw new BadRequestException('inputData is required.');
    }

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Missing GEMINI_API_KEY environment variable.',
      );
    }

    const inputAsString =
      typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
    const prompt = workflow.promptTemplate.replace(
      /\{\{\s*input\s*\}\}/g,
      inputAsString,
    );

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        inputData: inputData as any,
        outputResult: '',
        status: 'pending',
      },
    });

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const response = await model.generateContent(prompt);
      const outputResult = response.response.text();

      const updatedRun = await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          outputResult,
          status: 'success',
        },
      });

      return {
        workflowId: workflow.id,
        runId: updatedRun.id,
        status: updatedRun.status,
        outputResult: updatedRun.outputResult,
      };
    } catch (error) {
      const outputResult =
        error instanceof Error ? error.message : 'Unknown execution error.';

      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          outputResult,
          status: 'failed',
        },
      });

      throw new HttpException(
        this.extractProviderErrorMessage(error),
        this.extractProviderStatus(error),
      );
    }
  }
}

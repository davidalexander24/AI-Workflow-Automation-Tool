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
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const SUPPORTED_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

type SupportedModel = (typeof SUPPORTED_MODELS)[number];

const DEFAULT_MODEL: SupportedModel = 'gemini-3.1-flash-lite';
const DEFAULT_TEMPERATURE = 1;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

export type ExecuteOptions = {
  model?: string;
  temperature?: number;
};

function applyTemplate(template: string, input: unknown): string {
  if (input === null || input === undefined) {
    return template;
  }

  if (typeof input === 'string') {
    return template.replace(/\{\{\s*input\s*\}\}/g, input);
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    return template.replace(VARIABLE_TOKEN, (_, name: string) => {
      const value = (input as Record<string, unknown>)[name];
      if (value === undefined || value === null) {
        return '';
      }
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }

  return template.replace(/\{\{\s*input\s*\}\}/g, JSON.stringify(input));
}

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

  private resolveModel(model?: string): SupportedModel {
    if (model === undefined || model === null || model === '') {
      return DEFAULT_MODEL;
    }

    if (!SUPPORTED_MODELS.includes(model as SupportedModel)) {
      throw new BadRequestException(
        `Unsupported model "${model}". Supported models: ${SUPPORTED_MODELS.join(', ')}.`,
      );
    }

    return model as SupportedModel;
  }

  private resolveTemperature(temperature?: number): number {
    if (temperature === undefined || temperature === null) {
      return DEFAULT_TEMPERATURE;
    }

    if (typeof temperature !== 'number' || Number.isNaN(temperature)) {
      throw new BadRequestException(
        `temperature must be a number between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}.`,
      );
    }

    return Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, temperature));
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

  async updateWorkflow(workflowId: string, dto: UpdateWorkflowDto) {
    const existing = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    const data: { name?: string; description?: string; promptTemplate?: string } = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException('name cannot be empty.');
      }
      data.name = trimmed;
    }

    if (dto.description !== undefined) {
      const trimmed = dto.description.trim();
      if (!trimmed) {
        throw new BadRequestException('description cannot be empty.');
      }
      data.description = trimmed;
    }

    if (dto.promptTemplate !== undefined) {
      const trimmed = dto.promptTemplate.trim();
      if (!trimmed) {
        throw new BadRequestException('promptTemplate cannot be empty.');
      }
      data.promptTemplate = trimmed;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.workflow.update({
      where: { id: workflowId },
      data,
    });
  }

  async deleteWorkflow(workflowId: string) {
    const existing = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    await this.prisma.workflow.delete({ where: { id: workflowId } });

    return { id: workflowId, deleted: true };
  }

  async getWorkflowRuns(workflowId: string) {
    await this.getWorkflowById(workflowId);

    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async executeWorkflow(
    workflowId: string,
    inputData: unknown,
    options: ExecuteOptions = {},
  ) {
    if (inputData === undefined || inputData === null) {
      throw new BadRequestException('inputData is required.');
    }

    const modelName = this.resolveModel(options.model);
    const temperature = this.resolveTemperature(options.temperature);

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

    const prompt = applyTemplate(workflow.promptTemplate, inputData);

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
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature },
      });
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
        model: modelName,
        temperature,
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

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationError,
  LlmService,
  describeError,
  statusOf,
} from '../llm/llm.service';
import {
  ModelDefinition,
  availableModels,
  defaultModel,
  findModel,
  isProviderConfigured,
} from '../llm/model-registry';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { applyTemplate } from './template';

const DEFAULT_TEMPERATURE = 1;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;

export type ExecuteOptions = {
  model?: string;
  temperature?: number;
  allowFallback?: boolean;
};

export type ModelStats = {
  model: string;
  runs: number;
  successes: number;
  fallbacks: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgCompletionTokens: number | null;
};

// Provider error text can include internal URLs, model details, or other
// upstream internals; clients only get a generic message. 429 keeps its
// status so the UI can surface rate limiting.
function toSafeExecutionError(error: unknown): {
  message: string;
  status: number;
} {
  if (statusOf(error) === 429) {
    return {
      message:
        'The AI provider rate-limited this request. Please try again shortly.',
      status: HttpStatus.TOO_MANY_REQUESTS,
    };
  }

  return {
    message: 'Workflow execution failed due to an upstream AI provider error.',
    status: HttpStatus.BAD_GATEWAY,
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  private resolveModel(model?: string): ModelDefinition {
    if (model === undefined || model === null || model === '') {
      const fallback = defaultModel();
      if (!fallback) {
        throw new HttpException(
          'No AI provider is configured on this server.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return fallback;
    }

    const definition = findModel(model);
    if (!definition || !isProviderConfigured(definition.provider)) {
      const supported = availableModels()
        .map((m) => m.id)
        .join(', ');
      throw new BadRequestException(
        `Unsupported model "${model}". Supported models: ${supported}.`,
      );
    }

    return definition;
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

    const data: {
      name?: string;
      description?: string;
      promptTemplate?: string;
    } = {};

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
    });
  }

  // Grouped by the model the user asked for, so a model that keeps needing a
  // fallback shows up as unreliable instead of hiding behind its substitute.
  // Latency and token figures only count runs the requested model served.
  async getWorkflowStats(workflowId: string): Promise<ModelStats[]> {
    await this.getWorkflowById(workflowId);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE("fallbackFrom", "model") AS "model",
        COUNT(*) AS "runs",
        COUNT(*) FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "successes",
        COUNT(*) FILTER (WHERE "fallbackFrom" IS NOT NULL) AS "fallbacks",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "p50LatencyMs",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "p95LatencyMs",
        AVG("completionTokens")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "avgCompletionTokens"
      FROM "WorkflowRun"
      WHERE "workflowId" = ${workflowId}::uuid
        AND "model" IS NOT NULL
        AND "status" <> 'pending'
      GROUP BY 1
      ORDER BY 2 DESC, 1
    `;

    return rows.map((row) => ({
      model: String(row.model),
      runs: toNumber(row.runs) ?? 0,
      successes: toNumber(row.successes) ?? 0,
      fallbacks: toNumber(row.fallbacks) ?? 0,
      p50LatencyMs: toNumber(row.p50LatencyMs),
      p95LatencyMs: toNumber(row.p95LatencyMs),
      avgCompletionTokens: toNumber(row.avgCompletionTokens),
    }));
  }

  async executeWorkflow(
    workflowId: string,
    inputData: unknown,
    options: ExecuteOptions = {},
  ) {
    if (inputData === undefined || inputData === null) {
      throw new BadRequestException('inputData is required.');
    }

    const requested = this.resolveModel(options.model);
    const temperature = this.resolveTemperature(options.temperature);

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    const prompt = applyTemplate(workflow.promptTemplate, inputData);

    // Written before the model call so a crash or timeout still leaves an
    // auditable record.
    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        inputData,
        outputResult: '',
        status: 'pending',
        model: requested.id,
        temperature: requested.fixedTemperature ? null : temperature,
      },
    });

    try {
      const result = await this.llm.generate(requested, prompt, temperature, {
        allowFallback: options.allowFallback,
      });

      const updatedRun = await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          outputResult: result.text,
          status: 'success',
          model: result.model,
          fallbackFrom: result.fallbackFrom,
          temperature: result.temperature,
          attempts: result.attempts,
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        },
      });

      return {
        workflowId: workflow.id,
        runId: updatedRun.id,
        status: updatedRun.status,
        outputResult: updatedRun.outputResult,
        model: result.model,
        fallbackFrom: result.fallbackFrom,
        temperature: result.temperature,
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
    } catch (error: unknown) {
      const failure = error instanceof GenerationError ? error : null;
      const cause = failure ? failure.primaryError : error;

      this.logger.error(
        `Workflow ${workflowId} run ${workflowRun.id} failed: ${describeError(cause)}`,
        cause instanceof Error ? cause.stack : undefined,
      );

      const safe = toSafeExecutionError(cause);

      // Store the sanitized message too: run history is readable by any
      // client via GET /workflows/:id/runs.
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          outputResult: safe.message,
          status: 'failed',
          attempts: failure?.attempts ?? null,
          latencyMs: failure?.latencyMs ?? null,
        },
      });

      throw new HttpException(safe.message, safe.status);
    }
  }
}

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationError,
  GenerationResult,
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
import { StepDefinition, parseSteps, renderStep } from './chain';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowStepDto } from './dto/workflow-step.dto';
import { applyTemplate } from './template';

const DEFAULT_TEMPERATURE = 1;
const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
// Shared by every step of a multi-step run, so a chain cannot hold a request
// open for minutes.
const CHAIN_BUDGET_MS = 180_000;

const LOCKED_MESSAGE =
  'This example workflow is read-only. Duplicate it to make your own version.';

export type ExecuteOptions = {
  model?: string;
  temperature?: number;
  allowFallback?: boolean;
};

export type ModelStats = {
  model: string;
  calls: number;
  successes: number;
  fallbacks: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgCompletionTokens: number | null;
};

// Stored in WorkflowRun.stepResults, one per executed step.
export type StepResult = {
  name: string;
  model: string;
  fallbackFrom: string | null;
  temperature: number | null;
  attempts: number | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  output: string | null;
  error: string | null;
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

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function toStepResult(name: string, result: GenerationResult): StepResult {
  return {
    name,
    model: result.model,
    fallbackFrom: result.fallbackFrom,
    temperature: result.temperature,
    attempts: result.attempts,
    latencyMs: result.latencyMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    output: result.text,
    error: null,
  };
}

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  private resolveModel(model?: string | null): ModelDefinition {
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

  // Trims each step and checks that a pinned model exists at all. Whether its
  // provider is configured is checked at run time, since keys can change.
  private normalizeSteps(steps: WorkflowStepDto[]): StepDefinition[] {
    return steps.map((step, i) => {
      const name = step.name.trim();
      const promptTemplate = step.promptTemplate.trim();
      if (!name || !promptTemplate) {
        throw new BadRequestException(
          `Step ${i + 2} needs a name and a prompt template.`,
        );
      }
      const model = step.model?.trim() || null;
      if (model && !findModel(model)) {
        throw new BadRequestException(
          `Step ${i + 2} uses unknown model "${model}".`,
        );
      }
      return { name, promptTemplate, model };
    });
  }

  private async findEditable(workflowId: string) {
    const existing = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!existing) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }
    if (existing.locked) {
      throw new ForbiddenException(LOCKED_MESSAGE);
    }

    return existing;
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
        steps: this.normalizeSteps(dto.steps ?? []),
      },
    });
  }

  async getAllWorkflows() {
    return this.prisma.workflow.findMany({
      orderBy: [{ locked: 'desc' }, { createdAt: 'desc' }],
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
    const existing = await this.findEditable(workflowId);

    const data: {
      name?: string;
      description?: string;
      promptTemplate?: string;
      steps?: StepDefinition[];
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

    if (dto.steps !== undefined) {
      data.steps = this.normalizeSteps(dto.steps);
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
    await this.findEditable(workflowId);

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

  // One row per model call: a single-step run is one call, and every executed
  // step of a multi-step run is one more. Grouped by the model that was asked
  // for, so a model that keeps needing a fallback shows up as unreliable
  // instead of hiding behind its substitute. Latency and token figures only
  // count calls the requested model answered itself.
  async getWorkflowStats(workflowId: string): Promise<ModelStats[]> {
    await this.getWorkflowById(workflowId);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      WITH calls AS (
        SELECT "model", "fallbackFrom", "status"::text AS "status",
               "latencyMs", "completionTokens"
        FROM "WorkflowRun"
        WHERE "workflowId" = ${workflowId}::uuid
          AND "stepResults" IS NULL
          AND "model" IS NOT NULL
          AND "status" <> 'pending'
        UNION ALL
        SELECT step->>'model', step->>'fallbackFrom',
               CASE WHEN step->>'error' IS NULL THEN 'success' ELSE 'failed' END,
               (step->>'latencyMs')::int, (step->>'completionTokens')::int
        FROM "WorkflowRun" run
        CROSS JOIN LATERAL jsonb_array_elements(run."stepResults") AS step
        WHERE run."workflowId" = ${workflowId}::uuid
          AND run."stepResults" IS NOT NULL
      )
      SELECT
        COALESCE("fallbackFrom", "model") AS "model",
        COUNT(*) AS "calls",
        COUNT(*) FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "successes",
        COUNT(*) FILTER (WHERE "fallbackFrom" IS NOT NULL) AS "fallbacks",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "p50LatencyMs",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "p95LatencyMs",
        AVG("completionTokens")
          FILTER (WHERE "status" = 'success' AND "fallbackFrom" IS NULL) AS "avgCompletionTokens"
      FROM calls
      GROUP BY 1
      ORDER BY 2 DESC, 1
    `;

    return rows.map((row) => ({
      model: String(row.model),
      calls: toNumber(row.calls) ?? 0,
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

    const followUps = parseSteps(workflow.steps);
    // Resolved before anything runs, so an unusable step model fails the
    // request up front instead of halfway through a chain.
    const chain = [
      {
        name: workflow.name,
        promptTemplate: workflow.promptTemplate,
        model: requested,
      },
      ...followUps.map((step) => ({
        ...step,
        model: step.model ? this.resolveModel(step.model) : requested,
      })),
    ];

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

    if (chain.length === 1) {
      return this.executeSingle(
        workflowRun.id,
        workflow.id,
        requested,
        applyTemplate(workflow.promptTemplate, inputData),
        temperature,
        options.allowFallback,
      );
    }

    const deadline = Date.now() + CHAIN_BUDGET_MS;
    const results: StepResult[] = [];
    const outputs: string[] = [];

    for (const [index, step] of chain.entries()) {
      const prompt = renderStep(index, step.promptTemplate, inputData, outputs);
      try {
        const result = await this.llm.generate(
          step.model,
          prompt,
          temperature,
          {
            allowFallback: options.allowFallback,
            deadline,
          },
        );
        outputs.push(result.text);
        results.push(toStepResult(step.name, result));
      } catch (error: unknown) {
        const failure = error instanceof GenerationError ? error : null;
        const cause = failure ? failure.primaryError : error;
        const safe = toSafeExecutionError(cause);
        const label = `Step ${index + 1} of ${chain.length} ("${step.name}")`;

        this.logger.error(
          `Workflow ${workflowId} run ${workflowRun.id}: ${label} failed: ${describeError(cause)}`,
          cause instanceof Error ? cause.stack : undefined,
        );

        results.push({
          name: step.name,
          model: step.model.id,
          fallbackFrom: null,
          temperature: step.model.fixedTemperature ? null : temperature,
          attempts: failure?.attempts ?? null,
          latencyMs: failure?.latencyMs ?? null,
          promptTokens: null,
          completionTokens: null,
          output: null,
          error: safe.message,
        });

        const message = `${label} failed: ${safe.message}`;
        await this.prisma.workflowRun.update({
          where: { id: workflowRun.id },
          data: {
            outputResult: message,
            status: 'failed',
            stepResults: results,
            attempts: sumOrNull(results.map((r) => r.attempts)),
            latencyMs: sumOrNull(results.map((r) => r.latencyMs)),
          },
        });
        throw new HttpException(message, safe.status);
      }
    }

    const last = results[results.length - 1];
    const totals = {
      attempts: sumOrNull(results.map((r) => r.attempts)),
      latencyMs: sumOrNull(results.map((r) => r.latencyMs)),
      promptTokens: sumOrNull(results.map((r) => r.promptTokens)),
      completionTokens: sumOrNull(results.map((r) => r.completionTokens)),
    };

    const updatedRun = await this.prisma.workflowRun.update({
      where: { id: workflowRun.id },
      data: {
        outputResult: last.output ?? '',
        status: 'success',
        model: last.model,
        fallbackFrom: last.fallbackFrom,
        temperature: last.temperature,
        stepResults: results,
        ...totals,
      },
    });

    return {
      workflowId: workflow.id,
      runId: updatedRun.id,
      status: updatedRun.status,
      outputResult: updatedRun.outputResult,
      model: last.model,
      fallbackFrom: last.fallbackFrom,
      temperature: last.temperature,
      ...totals,
      steps: results,
    };
  }

  private async executeSingle(
    runId: string,
    workflowId: string,
    requested: ModelDefinition,
    prompt: string,
    temperature: number,
    allowFallback: boolean | undefined,
  ) {
    try {
      const result = await this.llm.generate(requested, prompt, temperature, {
        allowFallback,
      });

      const updatedRun = await this.prisma.workflowRun.update({
        where: { id: runId },
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
        workflowId,
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
        steps: null,
      };
    } catch (error: unknown) {
      const failure = error instanceof GenerationError ? error : null;
      const cause = failure ? failure.primaryError : error;

      this.logger.error(
        `Workflow ${workflowId} run ${runId} failed: ${describeError(cause)}`,
        cause instanceof Error ? cause.stack : undefined,
      );

      const safe = toSafeExecutionError(cause);

      // Store the sanitized message too: run history is readable by any
      // client via GET /workflows/:id/runs.
      await this.prisma.workflowRun.update({
        where: { id: runId },
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

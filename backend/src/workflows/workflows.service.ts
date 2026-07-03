import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

type ModelProvider = 'google' | 'github' | 'groq' | 'cerebras' | 'openrouter';

interface OpenAICompatProvider {
  baseUrl: string;
  apiKeyEnv: string;
  label: string;
}

const OPENAI_COMPAT_PROVIDERS: Record<
  Exclude<ModelProvider, 'google'>,
  OpenAICompatProvider
> = {
  github: {
    baseUrl: 'https://models.github.ai/inference/chat/completions',
    apiKeyEnv: 'GITHUB_MODELS_TOKEN',
    label: 'GitHub Models',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    apiKeyEnv: 'GROQ_API_KEY',
    label: 'Groq',
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    label: 'Cerebras',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
  },
};

const MODEL_REGISTRY: Record<string, ModelProvider> = {
  'gemini-3.1-flash-lite': 'google',
  'gemini-3.5-flash': 'google',
  'gemini-3-flash-preview': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
  'openai/gpt-5': 'github',
  'openai/gpt-4o': 'github',
  'openai/gpt-4.1-mini': 'github',
  'deepseek/deepseek-r1': 'github',
  'moonshotai/kimi-k2.6:free': 'openrouter',
  'llama-3.3-70b-versatile': 'groq',
  'llama-3.1-8b-instant': 'groq',
  'qwen/qwen3-32b': 'groq',
  'gpt-oss-120b': 'cerebras',
  'zai-glm-4.7': 'cerebras',
};

// Some models (GPT-5 / o-series via GitHub Models) reject a custom temperature
// and only accept the provider default. Omit the field for these.
const NO_TEMPERATURE_MODELS = new Set<string>([
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/o1',
  'openai/o3',
  'openai/o3-mini',
  'openai/o4-mini',
]);

const SUPPORTED_MODELS = Object.keys(MODEL_REGISTRY);

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
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
  private readonly logger = new Logger(WorkflowsService.name);

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

  private resolveModel(model?: string): string {
    if (model === undefined || model === null || model === '') {
      return DEFAULT_MODEL;
    }

    if (!(model in MODEL_REGISTRY)) {
      throw new BadRequestException(
        `Unsupported model "${model}". Supported models: ${SUPPORTED_MODELS.join(', ')}.`,
      );
    }

    return model;
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

  // Provider error text can include internal URLs, model details, or other
  // upstream internals; clients only get a generic message. 429 keeps its
  // status so the UI can surface rate limiting.
  private toSafeExecutionError(error: unknown): {
    message: string;
    status: number;
  } {
    if (this.extractProviderStatus(error) === HttpStatus.TOO_MANY_REQUESTS) {
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

  private async generateViaGoogle(
    model: string,
    prompt: string,
    temperature: number,
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY as string;
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({
      model,
      generationConfig: { temperature },
    });
    const response = await generativeModel.generateContent(prompt);
    return response.response.text();
  }

  private async generateViaOpenAICompatible(
    provider: OpenAICompatProvider,
    model: string,
    prompt: string,
    temperature: number,
  ): Promise<string> {
    const apiKey = process.env[provider.apiKeyEnv] as string;

    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: prompt }],
    };
    if (!NO_TEMPERATURE_MODELS.has(model)) {
      payload.temperature = temperature;
    }

    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let message = `${provider.label} request failed with status ${res.status}.`;
      try {
        const body = (await res.json()) as {
          error?: {
            message?: string;
            metadata?: { provider_name?: string; raw?: unknown };
          };
        };
        if (body?.error?.message) {
          message = body.error.message;
        }
        const meta = body?.error?.metadata;
        if (meta) {
          const raw =
            typeof meta.raw === 'string'
              ? meta.raw
              : meta.raw
                ? JSON.stringify(meta.raw)
                : '';
          const extra = [meta.provider_name, raw]
            .filter(Boolean)
            .join(': ')
            .slice(0, 200);
          if (extra) {
            message = `${message} (${extra})`;
          }
        }
      } catch {
        // keep the status-based fallback message
      }
      const error = new Error(message) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data?.choices?.[0]?.message?.content;

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`${provider.label} returned an empty response.`);
    }

    return text;
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
    // Models that ignore a custom temperature are recorded with null so the
    // run history reflects what was actually applied.
    const appliedTemperature = NO_TEMPERATURE_MODELS.has(modelName)
      ? null
      : temperature;

    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${workflowId} not found.`);
    }

    const provider = MODEL_REGISTRY[modelName];
    if (provider === 'google') {
      if (!process.env.GEMINI_API_KEY) {
        throw new InternalServerErrorException(
          'Missing GEMINI_API_KEY environment variable.',
        );
      }
    } else {
      const { apiKeyEnv } = OPENAI_COMPAT_PROVIDERS[provider];
      if (!process.env[apiKeyEnv]) {
        throw new InternalServerErrorException(
          `Missing ${apiKeyEnv} environment variable.`,
        );
      }
    }

    const prompt = applyTemplate(workflow.promptTemplate, inputData);

    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        inputData: inputData as any,
        outputResult: '',
        status: 'pending',
        model: modelName,
        temperature: appliedTemperature,
      },
    });

    try {
      const outputResult =
        provider === 'google'
          ? await this.generateViaGoogle(modelName, prompt, temperature)
          : await this.generateViaOpenAICompatible(
              OPENAI_COMPAT_PROVIDERS[provider],
              modelName,
              prompt,
              temperature,
            );

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
        temperature: appliedTemperature,
      };
    } catch (error) {
      this.logger.error(
        `Workflow ${workflowId} run ${workflowRun.id} failed: ${this.extractProviderErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      const safe = this.toSafeExecutionError(error);

      // Store the sanitized message too: run history is readable by any
      // client via GET /workflows/:id/runs.
      await this.prisma.workflowRun.update({
        where: { id: workflowRun.id },
        data: {
          outputResult: safe.message,
          status: 'failed',
        },
      });

      throw new HttpException(safe.message, safe.status);
    }
  }
}

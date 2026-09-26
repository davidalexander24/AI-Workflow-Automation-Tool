# Backend

NestJS API for the AI Workflow Automation Engine. Setup, deployment, and the API reference live in the [root README](../README.md).

## Layout

| Path | What it holds |
| :--- | :--- |
| `src/llm/model-registry.ts` | Every supported model, its provider, and the fallback order. The single source of truth behind `GET /models`. |
| `src/llm/llm.service.ts` | Provider calls (Google Gen AI SDK, OpenAI-compatible fetch), timeouts, retry with backoff, and cross-provider fallback. |
| `src/workflows/template.ts` | Fills `{{variables}}` from the run input. |
| `src/workflows/chain.ts` | Multi-step rendering: `{{previous}}`, `{{step_N}}`, and the original inputs for each follow-up step. |
| `src/workflows/workflows.service.ts` | Workflow CRUD, locked-example guard, single and multi-step execution, run logging, and the per-model stats query. |
| `src/workflows/demo-cleanup.service.ts` | Hourly sweep that removes unlocked workflows older than `DEMO_WORKFLOW_TTL_HOURS`. |
| `src/health/health.controller.ts` | `GET /health`, with a bounded database ping. |
| `src/prisma/database-unavailable.filter.ts` | Maps Prisma connection failures to `503`. |
| `src/app.setup.ts` | Helmet, CORS, validation, and filters, shared by `main.ts` and the e2e tests. |
| `prisma/schema.prisma` | Data model. |

## Scripts

```bash
npm run start:dev   # watch mode
npm test            # unit tests
npm run test:e2e    # HTTP-level tests against the real app with a faked database
npm run lint
npm run build
```

## Adding a model

Add one entry to `MODELS` in `src/llm/model-registry.ts`. If it is on a new OpenAI-compatible provider, also add the provider to `OPENAI_COMPAT_PROVIDERS` and `PROVIDER_API_KEY_ENV` (plus `PROVIDER_EXTRA_ENV` if it needs more than a key, as Cloudflare needs an account ID). The frontend picks it up from `GET /models` with no change on its side.

## Locking an example workflow

Locked workflows cannot be edited or deleted through the API and are skipped by the demo cleanup. There is deliberately no endpoint for it; set it in the database:

```sql
UPDATE "Workflow" SET locked = true WHERE name = 'Lead Qualifier';
```

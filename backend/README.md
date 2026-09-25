# Backend

NestJS API for the AI Workflow Automation Engine. Setup, deployment, and the API reference live in the [root README](../README.md).

## Layout

| Path | What it holds |
| :--- | :--- |
| `src/llm/model-registry.ts` | Every supported model, its provider, and the fallback order. The single source of truth behind `GET /models`. |
| `src/llm/llm.service.ts` | Provider calls (Google Gen AI SDK, OpenAI-compatible fetch), timeouts, retry with backoff, and cross-provider fallback. |
| `src/workflows/template.ts` | Fills `{{variables}}` from the run input. |
| `src/workflows/workflows.service.ts` | Workflow CRUD, run logging, and the per-model stats query. |
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

Add one entry to `MODELS` in `src/llm/model-registry.ts`. If it is on a new OpenAI-compatible provider, also add the provider to `OPENAI_COMPAT_PROVIDERS` and `PROVIDER_API_KEY_ENV`. The frontend picks it up from `GET /models` with no change on its side.

# Frontend

Next.js (App Router) client for the AI Workflow Automation Engine. Setup, deployment, and the architecture live in the [root README](../README.md).

## Layout

| Path | What it holds |
| :--- | :--- |
| `app/workflows/page.tsx` | Workflow library: search, create, edit, delete. |
| `app/workflows/[id]/page.tsx` | Run page: inputs per `{{variable}}`, model and temperature, fallback toggle, result, per-model stats, run history. |
| `app/lib/api.ts` | `requestJson` wrapper and the API types. |
| `app/lib/template.ts` | Detects `{{variables}}` in a template. |
| `app/ui/use-dialog-focus.ts` | Focus handling for the modal dialogs (move in, trap Tab, restore on close). |
| `app/opengraph-image.tsx` | Link-preview image, rendered at build time. |
| `next.config.ts` | Security headers and the Content Security Policy. |

The model picker is built from the backend's `GET /models`, so there is no model list to keep in sync here.

## Environment

`NEXT_PUBLIC_API_URL` is the backend base URL. It is read at build time and also feeds the CSP `connect-src`, so changing it needs a rebuild.

## Scripts

```bash
npm run dev     # http://localhost:3001 when the backend is on 3000
npm run lint
npm run build
```

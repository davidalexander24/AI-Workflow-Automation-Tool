'use client';

import { ArrowLeft, Clock3, Loader2, Play, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ExecuteWorkflowResponse,
  requestJson,
  Workflow as WorkflowType,
} from '../../lib/api';

type WorkflowRun = {
  id: string;
  workflowId: string;
  inputData: unknown;
  outputResult: string;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
};

function parseInput(rawValue: string): unknown {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return rawValue;
  }
}

function truncate(value: string, length: number): string {
  if (value.length <= length) {
    return value;
  }

  return `${value.slice(0, length)}...`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object') {
    const errorWithData = error as {
      message?: unknown;
      data?: { message?: unknown };
      response?: { data?: { message?: unknown } };
    };

    const direct = errorWithData.message;
    if (typeof direct === 'string' && direct.trim()) {
      return direct;
    }

    const fetchStyle = errorWithData.data?.message;
    if (typeof fetchStyle === 'string' && fetchStyle.trim()) {
      return fetchStyle;
    }

    if (Array.isArray(fetchStyle)) {
      return fetchStyle.join(', ');
    }

    const axiosStyle = errorWithData.response?.data?.message;
    if (typeof axiosStyle === 'string' && axiosStyle.trim()) {
      return axiosStyle;
    }

    if (Array.isArray(axiosStyle)) {
      return axiosStyle.join(', ');
    }
  }

  return fallback;
}

function statusClasses(status: WorkflowRun['status']): string {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (status === 'failed') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function ExecuteWorkflowPage() {
  const params = useParams<{ id: string }>();
  const workflowId = useMemo(() => params?.id ?? '', [params?.id]);

  const [workflow, setWorkflow] = useState<WorkflowType | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inputData, setInputData] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);

  async function loadRuns(showLoader = true): Promise<void> {
    if (!workflowId) {
      return;
    }

    if (showLoader) {
      setIsLoadingRuns(true);
    }

    setRunsError(null);

    try {
      const history = await requestJson<WorkflowRun[]>(`/workflows/${workflowId}/runs`);
      setRuns(history);
    } catch (error) {
      setRunsError(extractErrorMessage(error, 'Unable to load run history.'));
    } finally {
      setIsLoadingRuns(false);
    }
  }

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    async function loadWorkflow(): Promise<void> {
      setIsLoadingWorkflow(true);
      setLoadError(null);

      try {
        const item = await requestJson<WorkflowType>(`/workflows/${workflowId}`);
        setWorkflow(item);
      } catch (error) {
        setLoadError(
          extractErrorMessage(error, 'Unable to fetch workflow details.'),
        );
      } finally {
        setIsLoadingWorkflow(false);
      }
    }

    void loadWorkflow();
    void loadRuns();
  }, [workflowId]);

  async function handleRunWorkflow(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!workflowId || isRunning) {
      return;
    }

    setIsRunning(true);
    setRunError(null);

    try {
      const payload = {
        inputData: parseInput(inputData),
      };

      const response = await requestJson<ExecuteWorkflowResponse>(
        `/workflows/${workflowId}/execute`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      setResult(response.outputResult);
      await loadRuns(false);
    } catch (error) {
      setRunError(
        extractErrorMessage(error, 'Workflow execution failed. Please try again.'),
      );
    } finally {
      setIsRunning(false);
    }
  }

  if (isLoadingWorkflow) {
    return (
      <section className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-200 bg-white/85 px-6 py-14 text-center shadow-sm">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-500" />
        <p className="mt-3 text-sm text-slate-600">Loading workflow details...</p>
      </section>
    );
  }

  if (loadError || !workflow) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-4">
        <Link
          href="/workflows"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to workflows
        </Link>

        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {loadError ?? 'Workflow not found.'}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to workflows
      </Link>

      <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-200/70 backdrop-blur md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
          Workflow Execution
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{workflow.name}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{workflow.description}</p>
      </div>

      <form
        onSubmit={handleRunWorkflow}
        className="space-y-5 rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-200/70 backdrop-blur md:p-8"
      >
        <div>
          <label
            htmlFor="input-data"
            className="text-sm font-semibold text-slate-800"
          >
            Input Data
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Paste plain text or JSON. JSON will be sent as structured inputData.
          </p>
          <textarea
            id="input-data"
            required
            rows={11}
            value={inputData}
            onChange={(event) => setInputData(event.target.value)}
            placeholder='{"customer": "Acme", "request": "Summarize deployment risks"}'
            className="mt-3 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white"
          />
        </div>

        {runError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {runError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/40 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run AI Workflow
            </>
          )}
        </button>
      </form>

      <section className="rounded-3xl border border-slate-200/70 bg-linear-to-br from-white to-teal-50/50 p-6 shadow-sm shadow-slate-200/60 md:p-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Sparkles className="h-5 w-5 text-orange-500" />
          Results
        </h2>

        {result ? (
          <div className="mt-4 max-h-105 overflow-auto rounded-2xl border border-slate-200 bg-white p-4">
            <div className="space-y-3 text-sm leading-7 text-slate-700 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/80 px-4 py-6 text-sm text-slate-600">
            Your generated output will appear here after a successful run.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-sm shadow-slate-200/70 backdrop-blur md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Clock3 className="h-5 w-5 text-slate-500" />
            Recent Runs
          </h2>
          <button
            type="button"
            onClick={() => {
              void loadRuns();
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>

        {isLoadingRuns ? (
          <div className="mt-4 flex items-center text-sm text-slate-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading recent runs...
          </div>
        ) : runsError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {runsError}
          </div>
        ) : runs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No runs yet for this workflow.
          </p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Created At</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Output Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(
                          run.status,
                        )}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {truncate(run.outputResult || 'No output captured.', 140)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

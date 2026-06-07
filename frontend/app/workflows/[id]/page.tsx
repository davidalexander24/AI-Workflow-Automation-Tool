'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  ExecuteWorkflowResponse,
  MODELS,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  ModelId,
  Workflow,
  WorkflowRun,
  requestJson,
} from '../../lib/api';
import { extractVariables, shouldUseSingleInput } from '../../lib/template';
import { CopyButton } from '../../ui/copy-button';
import { StatusTag } from '../../ui/status-tag';

type StatusFilter = 'all' | 'success' | 'failed' | 'pending';

function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(value: string, length: number): string {
  if (!value) return '';
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function cleanOutputPreview(output: string): string {
  if (!output) return '';
  return output
    .slice(0, 600) // cap work; preview only needs the start
    .replace(/```[\s\S]*?```/g, ' ') // drop fenced code blocks
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // image -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // link -> link text
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/^>\s?/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '') // bullet markers
    .replace(/^\d+\.\s+/gm, '') // numbered-list markers
    .replace(/^[-*_]{3,}\s*$/gm, ' ') // horizontal rules
    .replace(/(\*\*|\*|__|_|~~|`)/g, '') // emphasis + inline code
    .replace(/\s+/g, ' ') // collapse newlines/whitespace
    .trim();
}

function shortModelName(id: string): string {
  const last = id.includes('/') ? (id.split('/').pop() ?? id) : id;
  return last.replace(/:free$/, '').replace(/^gemini-/, '');
}

function formatModelTag(
  model?: string | null,
  temperature?: number | null,
): string | null {
  if (!model) return null;
  const short = shortModelName(model);
  return temperature == null ? short : `${short} · t${temperature.toFixed(1)}`;
}

function formatRunInput(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export default function ExecuteWorkflowPage() {
  const params = useParams<{ id: string }>();
  const workflowId = useMemo(() => params?.id ?? '', [params?.id]);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // input state
  const [singleInput, setSingleInput] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // model config
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState<number>(DEFAULT_TEMPERATURE);

  // run state
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');
  const [resultStatus, setResultStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
  const [resultDuration, setResultDuration] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<{ model: string; temperature: number } | null>(null);

  // history state
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const variables = useMemo(
    () => (workflow ? extractVariables(workflow.promptTemplate) : []),
    [workflow],
  );
  const useSingleInput = useMemo(
    () => (workflow ? shouldUseSingleInput(workflow.promptTemplate) : true),
    [workflow],
  );

  const activeRun = useMemo(
    () => runs.find((r) => r.id === activeRunId) ?? null,
    [runs, activeRunId],
  );

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs;
    return runs.filter((r) => r.status === statusFilter);
  }, [runs, statusFilter]);

  const runCounts = useMemo(() => {
    const counts = { all: runs.length, success: 0, failed: 0, pending: 0 };
    for (const r of runs) {
      counts[r.status] += 1;
    }
    return counts;
  }, [runs]);

  const loadRuns = useCallback(
    async (showLoader = true): Promise<void> => {
      if (!workflowId) return;
      if (showLoader) setIsLoadingRuns(true);
      setRunsError(null);
      try {
        const history = await requestJson<WorkflowRun[]>(
          `/workflows/${workflowId}/runs`,
        );
        setRuns(history);
      } catch (error) {
        setRunsError(extractErrorMessage(error, 'Unable to load run history.'));
      } finally {
        setIsLoadingRuns(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    if (!workflowId) return;

    async function loadWorkflow(): Promise<void> {
      setIsLoadingWorkflow(true);
      setLoadError(null);
      try {
        const item = await requestJson<Workflow>(`/workflows/${workflowId}`);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard mount-fetch pattern
    void loadRuns();
  }, [workflowId, loadRuns]);

  // Reset input state when workflow changes
  useEffect(() => {
    if (!workflow) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting input on prop change
    setSingleInput('');
    const initial: Record<string, string> = {};
    for (const v of variables) initial[v] = '';
    setVariableValues(initial);
  }, [workflow, variables]);

  useEffect(() => {
    if (activeRunId && !runs.some((r) => r.id === activeRunId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale selection
      setActiveRunId(null);
    }
  }, [activeRunId, runs]);

  async function executeRun(): Promise<void> {
    if (!workflowId || isRunning) return;

    let payload: unknown;
    if (useSingleInput) {
      const trimmed = singleInput.trim();
      if (!trimmed) {
        setRunError('Provide an input value before running.');
        return;
      }
      try {
        payload = JSON.parse(trimmed);
      } catch {
        payload = singleInput;
      }
    } else {
      const missing = variables.find((v) => !variableValues[v]?.trim());
      if (missing) {
        setRunError(`Variable {{${missing}}} is required.`);
        return;
      }
      payload = { ...variableValues };
    }

    setIsRunning(true);
    setRunError(null);
    setResultStatus('pending');
    setResult('');
    setResultDuration(null);
    setCompletedAt(null);
    setResultMeta(null);

    const startedAt = performance.now();

    try {
      const response = await requestJson<ExecuteWorkflowResponse>(
        `/workflows/${workflowId}/execute`,
        {
          method: 'POST',
          body: JSON.stringify({ inputData: payload, model, temperature }),
        },
      );
      const duration = Math.round(performance.now() - startedAt);
      setResult(response.outputResult);
      setResultStatus(response.status);
      setResultDuration(duration);
      setCompletedAt(new Date().toISOString());
      setResultMeta({
        model: response.model ?? model,
        temperature: response.temperature ?? temperature,
      });
      await loadRuns(false);
    } catch (error) {
      const duration = Math.round(performance.now() - startedAt);
      setRunError(
        extractErrorMessage(error, 'Workflow execution failed. Please try again.'),
      );
      setResultStatus('failed');
      setResultDuration(duration);
      setCompletedAt(new Date().toISOString());
      setResultMeta({ model, temperature });
      void loadRuns(false);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await executeRun();
  }

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void executeRun();
    }
  }

  function handleVarInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void executeRun();
    }
  }

  function rerunFromHistory(run: WorkflowRun): void {
    if (useSingleInput) {
      const raw = run.inputData;
      const value =
        typeof raw === 'string' ? raw : raw == null ? '' : JSON.stringify(raw, null, 2);
      setSingleInput(value);
    } else {
      const next: Record<string, string> = {};
      for (const v of variables) next[v] = '';
      if (run.inputData && typeof run.inputData === 'object' && !Array.isArray(run.inputData)) {
        for (const [k, val] of Object.entries(run.inputData as Record<string, unknown>)) {
          if (variables.includes(k)) {
            next[k] = typeof val === 'string' ? val : JSON.stringify(val);
          }
        }
      } else if (typeof run.inputData === 'string' && variables.length === 1) {
        next[variables[0]] = run.inputData;
      }
      setVariableValues(next);
    }
    setRunError(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setTimeout(() => textareaRef.current?.focus(), 200);
  }

  function downloadResult(): void {
    if (!result || !workflow) return;
    const slug = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadText(`${slug}-${ts}.md`, result, 'text/markdown;charset=utf-8');
  }

  if (isLoadingWorkflow) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <div className="border border-dashed border-rule px-6 py-14 text-center font-mono text-sm text-ink-muted">
          loading workflow
          <span className="caret ml-1 inline-block h-4 w-2 bg-ink-muted" />
        </div>
      </section>
    );
  }

  if (loadError || !workflow) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-4">
        <Link
          href="/workflows"
          className="inline-block -ml-3 border border-transparent px-3 py-1.5 font-mono text-sm tracking-wide text-ink-muted hover:border-gray-500 hover:text-ink"
        >
          ← workflows
        </Link>
        <div className="border border-fail/40 bg-fail/10 px-5 py-4 font-mono text-sm text-fail">
          [ERROR] {loadError ?? 'Workflow not found.'}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-8">
      {/* Back + header */}
      <div>
        <Link
          href="/workflows"
          className="inline-block -ml-3 border border-transparent px-3 py-1.5 font-mono text-sm tracking-wide text-ink-muted hover:border-gray-500 hover:text-ink"
        >
          ← workflows
        </Link>
        <header className="mt-4 border-b border-rule pb-5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-sm text-accent">{'>'}</span>
            <h1 className="font-mono text-xl font-semibold tracking-tight text-ink md:text-2xl">
              {workflow.name}
            </h1>
          </div>
          <p className="mt-3 font-sans text-sm leading-relaxed text-ink-muted">
            {workflow.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-ink-faint">
            <span>id: {workflow.id.slice(0, 8)}</span>
            <span>·</span>
            <span>created: {formatTimestamp(workflow.createdAt)}</span>
            <span>·</span>
            <span>
              {variables.length} {variables.length === 1 ? 'var' : 'vars'}
            </span>
          </div>
        </header>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {'// input'}
          </h2>
          <span className="font-mono text-[10px] text-ink-faint">
            ⌘/Ctrl + Enter to run
          </span>
        </div>

        {useSingleInput ? (
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {variables[0] ?? 'inputData'}
              <span className="ml-2 normal-case tracking-normal text-ink-faint">
                - plain text or JSON
              </span>
            </label>
            <textarea
              ref={textareaRef}
              required
              rows={10}
              value={singleInput}
              onChange={(e) => setSingleInput(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder='{"customer": "Acme", "request": "Summarize deployment risks"}'
              className="mt-1.5 w-full resize-y border border-rule bg-bg-elev px-3 py-3 font-mono text-sm leading-6 text-ink focus:border-accent focus:outline-none"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {variables.map((v) => (
              <div key={v}>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  {`{{${v}}}`}
                </label>
                {v.toLowerCase().includes('document') ||
                v.toLowerCase().includes('diff') ||
                v.toLowerCase().includes('text') ||
                v.toLowerCase().includes('content') ? (
                  <textarea
                    required
                    rows={6}
                    value={variableValues[v] ?? ''}
                    onChange={(e) =>
                      setVariableValues({
                        ...variableValues,
                        [v]: e.target.value,
                      })
                    }
                    placeholder={`Value for ${v}…`}
                    className="mt-1.5 w-full resize-y border border-rule bg-bg-elev px-3 py-2 font-mono text-sm leading-6 text-ink focus:border-accent focus:outline-none"
                  />
                ) : (
                  <input
                    required
                    type="text"
                    value={variableValues[v] ?? ''}
                    onChange={(e) =>
                      setVariableValues({
                        ...variableValues,
                        [v]: e.target.value,
                      })
                    }
                    onKeyDown={handleVarInputKeyDown}
                    placeholder={`Value for ${v}…`}
                    className="mt-1.5 w-full border border-rule bg-bg-elev px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Model config */}
        <div className="border border-rule">
          <div className="border-b border-rule bg-bg-elev px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              {'// model config'}
            </span>
          </div>
          <div className="flex flex-col gap-4 px-3 py-3 sm:flex-row sm:items-center sm:gap-8">
            <label className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-ink-faint">model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelId)}
                className="border border-rule bg-bg px-2 py-1 font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
              >
                {[...new Set(MODELS.map((m) => m.maker))].map((maker) => (
                  <optgroup key={maker} label={maker}>
                    {MODELS.filter((m) => m.maker === maker).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="flex flex-1 items-center gap-3 font-mono text-[11px]">
              <span className="text-ink-faint">temp</span>
              <input
                type="range"
                min={MIN_TEMPERATURE}
                max={MAX_TEMPERATURE}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-accent"
                aria-label="Temperature"
              />
              <span className="w-7 text-right text-ink">{temperature.toFixed(1)}</span>
              <span className="text-ink-faint">
                {temperature <= 0.4
                  ? 'precise'
                  : temperature >= 1.3
                    ? 'creative'
                    : 'balanced'}
              </span>
            </label>
          </div>
        </div>

        {runError ? (
          <div className="border border-fail/40 bg-fail/10 px-3 py-2 font-mono text-xs text-fail">
            [ERROR] {runError}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] text-ink-faint">
            output is logged to history below.
          </p>
          <button
            type="submit"
            disabled={isRunning}
            className="border border-accent bg-accent px-5 py-2 font-mono text-xs font-semibold tracking-wide text-accent-fg transition hover:bg-bg hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? '[running…]' : '[▶ RUN]'}
          </button>
        </div>
      </form>

      {/* Result panel */}
      <section className="border border-rule">
        <div className="flex items-center justify-between border-b border-rule bg-bg-elev px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              {'// result'}
            </span>
            {resultStatus ? <StatusTag status={resultStatus} /> : null}
            {resultMeta ? (
              <span className="font-mono text-[11px] text-ink-faint">
                {shortModelName(resultMeta.model)} · temp{' '}
                {resultMeta.temperature.toFixed(1)}
              </span>
            ) : null}
            {resultDuration !== null ? (
              <span className="font-mono text-[11px] text-ink-faint">
                {formatDuration(resultDuration)}
              </span>
            ) : null}
            {completedAt ? (
              <span className="font-mono text-[11px] text-ink-faint">
                {formatTimestamp(completedAt)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <CopyButton value={result} />
            <button
              type="button"
              onClick={downloadResult}
              disabled={!result}
              className="font-mono text-[11px] tracking-wide text-ink-muted hover:text-ink disabled:opacity-40 disabled:hover:text-ink-muted"
            >
              [DOWNLOAD .md]
            </button>
          </div>
        </div>
        {isRunning ? (
          <div className="px-4 py-8 font-mono text-sm text-ink-muted">
            executing<span className="caret ml-1 inline-block h-4 w-2 bg-ink-muted" />
          </div>
        ) : result ? (
          <div className="max-h-[28rem] overflow-auto px-4 py-4">
            <div className="prose-sans space-y-3 text-[15px] leading-7 text-ink [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_code]:rounded-none [&_code]:bg-bg-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_pre]:overflow-x-auto [&_pre]:bg-bg-sunken [&_pre]:p-3">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="px-4 py-10 text-center font-mono text-xs text-ink-faint">
            no output yet. fill the input and press [▶ RUN] or ⌘/Ctrl + Enter.
          </div>
        )}
      </section>

      {/* Run history */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-2">
          <h2 className="font-mono text-xs uppercase tracking-wider text-ink-muted">
            {'// recent runs'}
          </h2>
          <button
            type="button"
            onClick={() => void loadRuns(true)}
            className="font-mono text-[11px] tracking-wide text-ink-muted hover:text-ink"
          >
            [↻ refresh]
          </button>
        </div>

        {/* Status filter */}
        <div className="mt-4 flex flex-wrap items-center gap-1 font-mono text-[11px]">
          {(['all', 'success', 'failed', 'pending'] as StatusFilter[]).map((f) => {
            const isActive = statusFilter === f;
            const labelText = f === 'success' ? 'OK' : f === 'failed' ? 'FAIL' : f.toUpperCase();
            const countText =
              f === 'all' ? runCounts.all : runCounts[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`border px-3 py-1 tracking-wide transition ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-rule text-ink-muted hover:border-rule-strong hover:text-ink'
                }`}
              >
                [{labelText}] {countText}
              </button>
            );
          })}
        </div>

        {isLoadingRuns ? (
          <div className="mt-4 font-mono text-sm text-ink-muted">
            loading runs<span className="caret ml-1 inline-block h-4 w-2 bg-ink-muted" />
          </div>
        ) : runsError ? (
          <div className="mt-4 border border-fail/40 bg-fail/10 px-3 py-2 font-mono text-xs text-fail">
            [ERROR] {runsError}
          </div>
        ) : runs.length === 0 ? (
          <p className="mt-6 border border-dashed border-rule px-4 py-8 text-center font-mono text-sm text-ink-faint">
            no runs yet for this workflow.
          </p>
        ) : filteredRuns.length === 0 ? (
          <p className="mt-6 border border-dashed border-rule px-4 py-8 text-center font-mono text-sm text-ink-faint">
            no runs match this filter.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {filteredRuns.map((run) => {
              const isOpen = activeRunId === run.id;
              return (
                <li key={run.id} className="px-1 py-3 sm:px-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <StatusTag status={run.status} />
                      <span className="font-mono text-[11px] text-ink-faint">
                        {formatTimestamp(run.createdAt)}
                      </span>
                      {run.model ? (
                        <span className="font-mono text-[11px] text-ink-faint">
                          · {formatModelTag(run.model, run.temperature)}
                        </span>
                      ) : null}
                    </div>
                    <p className="flex-1 truncate font-sans text-sm text-ink-muted">
                      {truncate(cleanOutputPreview(run.outputResult) || '- no output -', 140)}
                    </p>
                    <div className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
                      <button
                        type="button"
                        onClick={() => rerunFromHistory(run)}
                        className="border border-transparent px-2 py-1 text-accent hover:border-accent"
                      >
                        [RE-RUN]
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveRunId((c) => (c === run.id ? null : run.id))
                        }
                        className="border border-transparent px-2 py-1 text-ink-muted hover:border-rule hover:text-ink"
                      >
                        [{isOpen ? 'HIDE' : 'OPEN'}]
                      </button>
                    </div>
                  </div>

                  {isOpen && activeRun ? (
                    <div className="mt-4 border-l-2 border-accent/40 pl-4">
                      {activeRun.model ? (
                        <p className="mb-3 font-mono text-[11px] text-ink-faint">
                          <span className="uppercase tracking-wider">
                            {'// run config'}
                          </span>{' '}
                          model:{' '}
                          <span className="text-ink-muted">{activeRun.model}</span>
                          {' · '}temp:{' '}
                          <span className="text-ink-muted">
                            {activeRun.temperature?.toFixed(1) ?? 'n/a'}
                          </span>
                        </p>
                      ) : null}
                      <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                          {'// input'}
                        </p>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words border border-rule bg-bg-sunken px-3 py-2 font-mono text-[12px] leading-6 text-ink-muted">
                          {formatRunInput(activeRun.inputData) || '- no input -'}
                        </pre>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                            {'// output'}
                          </p>
                          <CopyButton value={activeRun.outputResult} />
                        </div>
                        {activeRun.outputResult ? (
                          <div className="prose-sans mt-2 max-h-72 overflow-auto border border-rule bg-bg-sunken px-3 py-2 text-sm leading-7 text-ink [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_code]:bg-bg [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]">
                            <ReactMarkdown>{activeRun.outputResult}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="mt-2 font-mono text-xs text-ink-faint">
                            - no output -
                          </p>
                        )}
                      </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

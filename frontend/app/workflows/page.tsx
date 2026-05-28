'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  Workflow,
  requestJson,
} from '../lib/api';
import { workflowExamples } from '../lib/examples';
import { extractVariables } from '../lib/template';

const initialFormState: CreateWorkflowPayload = {
  name: '',
  description: '',
  promptTemplate: '',
};

type DialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; workflow: Workflow }
  | { kind: 'delete'; workflow: Workflow };

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'unnamed-workflow'
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogMode | null>(null);
  const [form, setForm] = useState<CreateWorkflowPayload>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredWorkflows = useMemo(() => {
    if (!search.trim()) return workflows;
    const needle = search.trim().toLowerCase();
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(needle) ||
        w.description.toLowerCase().includes(needle) ||
        w.promptTemplate.toLowerCase().includes(needle),
    );
  }, [workflows, search]);

  const detectedVars = useMemo(
    () => extractVariables(form.promptTemplate),
    [form.promptTemplate],
  );

  async function loadWorkflows(showRefreshSpinner = false): Promise<void> {
    if (showRefreshSpinner) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    try {
      const items = await requestJson<Workflow[]>('/workflows');
      setWorkflows(items);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Unable to fetch workflows from the backend API.',
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard mount-fetch pattern
    void loadWorkflows();
  }, []);

  function openCreate() {
    setForm(initialFormState);
    setSubmitError(null);
    setDialog({ kind: 'create' });
  }

  function openEdit(workflow: Workflow) {
    setForm({
      name: workflow.name,
      description: workflow.description,
      promptTemplate: workflow.promptTemplate,
    });
    setSubmitError(null);
    setDialog({ kind: 'edit', workflow });
  }

  function openDelete(workflow: Workflow) {
    setSubmitError(null);
    setDialog({ kind: 'delete', workflow });
  }

  function closeDialog() {
    setDialog(null);
    setSubmitError(null);
  }

  function loadExample(id: string) {
    const example = workflowExamples.find((e) => e.id === id);
    if (!example) return;
    setForm({
      name: example.name,
      description: example.description,
      promptTemplate: example.promptTemplate,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!dialog) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (dialog.kind === 'create') {
        await requestJson<Workflow>('/workflows', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      } else if (dialog.kind === 'edit') {
        const payload: UpdateWorkflowPayload = {
          name: form.name,
          description: form.description,
          promptTemplate: form.promptTemplate,
        };
        await requestJson<Workflow>(`/workflows/${dialog.workflow.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }

      setForm(initialFormState);
      closeDialog();
      await loadWorkflows(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Request failed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!dialog || dialog.kind !== 'delete') return;
    setIsDeleting(true);
    setSubmitError(null);
    try {
      await requestJson<{ id: string }>(`/workflows/${dialog.workflow.id}`, {
        method: 'DELETE',
      });
      closeDialog();
      await loadWorkflows(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Delete failed.',
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      {/* Header */}
      <header className="border-b border-rule pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              \workflows
            </h1>
            <span className="font-mono text-[28px] self-center -ml-2.5 text-accent font-bold">{'>'}</span>
            <span className="caret self-center h-3 text-2xl bg-accent md:h-6" aria-hidden />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="border border-accent bg-accent px-4 py-2 font-mono text-[12px] font-semibold tracking-wide text-accent-fg transition hover:bg-bg hover:text-accent"
          >
            [+ NEW]
          </button>
        </div>
        <p className="mt-3 font-sans text-sm text-ink-muted">
          # Define prompt blueprints. Run them with structured input. Inspect every execution.
        </p>
      </header>

      {/* Stats + search */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs text-ink-muted">
          <span className="text-ink">[{workflows.length}]</span> templates
          <span className="mx-2 text-ink-faint">·</span>
          <span className="text-ink">[{filteredWorkflows.length}]</span> shown
          {search.trim() ? (
            <>
              <span className="mx-2 text-ink-faint">·</span>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-warn hover:text-ink"
              >
                [clear filter]
              </button>
            </>
          ) : null}
        </p>
        <div className="relative w-full sm:max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-faint">
            ⌕
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search workflows..."
            className="w-full border border-rule bg-bg-elev py-2 pl-9 pr-3 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="mt-6">
        {isLoading ? (
          <div className="border border-dashed border-rule px-6 py-10 text-center font-mono text-sm text-ink-muted">
            loading workflows<span className="caret ml-1 inline-block h-4 w-2 bg-ink-muted" />
          </div>
        ) : loadError ? (
          <div className="border border-fail/40 bg-fail/10 px-5 py-4 font-mono text-sm text-fail">
            [ERROR] {loadError}
            <button
              type="button"
              onClick={() => void loadWorkflows(true)}
              className="ml-3 underline hover:text-ink"
            >
              [retry]
            </button>
          </div>
        ) : workflows.length === 0 ? (
          <div className="border border-dashed border-rule px-6 py-14 text-center">
            <p className="font-mono text-sm text-ink-muted">
              no workflows yet.
            </p>
            <p className="mt-2 font-sans text-sm text-ink-faint">
              Create your first prompt blueprint to start automating.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-5 border border-rule px-4 py-2 font-mono text-xs tracking-wide text-ink hover:border-accent hover:text-accent"
            >
              [+ NEW WORKFLOW]
            </button>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="border border-dashed border-rule px-6 py-10 text-center font-mono text-sm text-ink-muted">
            no matches for &quot;{search}&quot;
          </div>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {filteredWorkflows.map((workflow) => {
              const vars = extractVariables(workflow.promptTemplate);
              return (
                <li
                  key={workflow.id}
                  className="group relative flex flex-col gap-3 px-1 py-5 transition hover:bg-bg-elev sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-4"
                >
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px] text-ink-muted">--</span>
                      <Link
                        href={`/workflows/${workflow.id}`}
                        className="font-mono text-sm font-semibold tracking-tight text-ink hover:text-accent"
                      >
                        {slugify(workflow.name)}
                      </Link>
                    </div>
                    <p className="mt-2 font-sans text-sm leading-relaxed text-ink-muted">
                      {workflow.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-faint">
                      <span>{formatDate(workflow.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {vars.length} {vars.length === 1 ? 'var' : 'vars'}
                      </span>
                      {vars.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-ink-muted">
                            {vars.slice(0, 4).map((v, i) => (
                              <span key={v}>
                                {i > 0 ? ', ' : ''}
                                {`{{${v}}}`}
                              </span>
                            ))}
                            {vars.length > 4 ? ` +${vars.length - 4}` : ''}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="border border-transparent px-3 py-1.5 tracking-wide text-accent hover:border-accent"
                    >
                      [RUN →]
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(workflow)}
                      className="border border-transparent px-3 py-1.5 tracking-wide text-ink-muted hover:border-gray-500"
                    >
                      [EDIT]
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete(workflow)}
                      className="border border-transparent px-3 py-1.5 tracking-wide text-ink-muted hover:border-fail/60 hover:text-fail"
                    >
                      [DEL]
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void loadWorkflows(true)}
            disabled={isRefreshing}
            className="font-mono text-[11px] tracking-wide text-ink-muted hover:text-ink disabled:opacity-50"
          >
            {isRefreshing ? '[refreshing…]' : '[↻ refresh]'}
          </button>
        </div>
      </div>

      {/* Create / Edit dialog */}
      {dialog && (dialog.kind === 'create' || dialog.kind === 'edit') ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-bg/95 px-4 py-10"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div className="w-full max-w-2xl border border-rule-strong bg-bg-elev shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between border-b border-rule px-5 py-3">
              <p className="font-mono text-xs tracking-wide text-ink-muted">
                <span className="text-accent">{'>'}</span>{' '}
                {dialog.kind === 'create' ? 'NEW WORKFLOW' : 'EDIT WORKFLOW'}
              </p>
              <button
                type="button"
                onClick={closeDialog}
                className="font-mono text-xs text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                [×]
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
              {dialog.kind === 'create' ? (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                    {'// start from an example'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {workflowExamples.map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => loadExample(ex.id)}
                        className="border border-rule px-3 py-1.5 font-mono text-[11px] tracking-wide text-ink-muted hover:border-accent hover:text-accent"
                      >
                        [{ex.id}]
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  name
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Lead Qualifier"
                  className="mt-1.5 w-full border border-rule bg-bg px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  description
                </label>
                <input
                  required
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="What this workflow does, in one line."
                  className="mt-1.5 w-full border border-rule bg-bg px-3 py-2 font-sans text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  <span>prompt template</span>
                  <span>
                    use{' '}
                    <code className="text-ink-muted">{'{{variable}}'}</code> tokens
                  </span>
                </label>
                <textarea
                  required
                  rows={8}
                  value={form.promptTemplate}
                  onChange={(e) =>
                    setForm({ ...form, promptTemplate: e.target.value })
                  }
                  placeholder="Summarize {{document}} for {{audience}}."
                  className="mt-1.5 w-full resize-y border border-rule bg-bg px-3 py-2 font-mono text-sm leading-6 text-ink focus:border-accent focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                  <span className="text-ink-faint">detected:</span>
                  {detectedVars.length === 0 ? (
                    <span className="text-ink-faint">- none -</span>
                  ) : (
                    detectedVars.map((v) => (
                      <span
                        key={v}
                        className="border border-accent/40 px-2 py-0.5 text-accent"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {submitError ? (
                <div className="border border-fail/40 bg-fail/10 px-3 py-2 font-mono text-xs text-fail">
                  [ERROR] {submitError}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 border-t border-rule pt-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="border border-rule px-4 py-2 font-mono text-xs tracking-wide text-ink-muted hover:border-rule-strong hover:text-ink"
                >
                  [cancel]
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="border border-accent bg-accent px-4 py-2 font-mono text-xs font-semibold tracking-wide text-accent-fg transition hover:bg-bg hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting
                    ? '[saving…]'
                    : dialog.kind === 'create'
                      ? '[save workflow]'
                      : '[update]'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Delete confirm */}
      {dialog && dialog.kind === 'delete' ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-bg/95 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDialog();
          }}
        >
          <div className="w-full max-w-md border border-fail/40 bg-bg-elev">
            <div className="border-b border-rule px-5 py-3 font-mono text-xs text-fail">
              {'>'} CONFIRM DELETE
            </div>
            <div className="space-y-3 px-5 py-5">
              <p className="font-sans text-sm text-ink">
                Permanently delete{' '}
                <span className="font-mono text-ink">
                  {slugify(dialog.workflow.name)}
                </span>
                ?
              </p>
              <p className="font-sans text-xs text-ink-muted">
                This also removes every run logged for this workflow. The
                action cannot be undone.
              </p>
              {submitError ? (
                <div className="border border-fail/40 bg-fail/10 px-3 py-2 font-mono text-xs text-fail">
                  [ERROR] {submitError}
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="border border-rule px-3 py-1.5 font-mono text-xs text-ink-muted hover:border-rule-strong hover:text-ink"
                >
                  [cancel]
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="border border-fail bg-fail px-3 py-1.5 font-mono text-xs font-semibold text-bg transition hover:bg-bg hover:text-fail disabled:opacity-60"
                >
                  {isDeleting ? '[deleting…]' : '[delete]'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

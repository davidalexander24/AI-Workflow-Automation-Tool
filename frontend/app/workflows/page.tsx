'use client';

import { ArrowRight, Loader2, Plus, Workflow } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { requestJson, Workflow as WorkflowType } from '../lib/api';

type CreateWorkflowPayload = {
  name: string;
  description: string;
  promptTemplate: string;
};

const initialFormState: CreateWorkflowPayload = {
  name: '',
  description: '',
  promptTemplate: '',
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateWorkflowPayload>(initialFormState);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const workflowCountLabel = useMemo(() => {
    if (workflows.length === 1) {
      return '1 workflow';
    }

    return `${workflows.length} workflows`;
  }, [workflows.length]);

  async function loadWorkflows(showRefreshSpinner = false): Promise<void> {
    if (showRefreshSpinner) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setLoadError(null);

    try {
      const items = await requestJson<WorkflowType[]>('/workflows');
      setWorkflows(items);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to fetch workflows from the backend API.';
      setLoadError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadWorkflows();
  }, []);

  function updateForm(field: keyof CreateWorkflowPayload, value: string): void {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleCreateWorkflow(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError(null);

    setIsCreating(true);

    try {
      await requestJson<WorkflowType>('/workflows', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });

      setCreateForm(initialFormState);
      setIsCreateModalOpen(false);
      await loadWorkflows(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Workflow creation failed. Please try again.';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="rounded-3xl border border-slate-200/70 bg-white/85 p-6 shadow-sm shadow-slate-200/70 backdrop-blur md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              AI Orchestration
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">
              Workflow Library
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Manage reusable prompt blueprints and run them with new input in
              seconds.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void loadWorkflows(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Workflow className="h-4 w-4" />
              )}
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-600/40 transition hover:bg-teal-500"
            >
              <Plus className="h-4 w-4" />
              Create Workflow
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          {workflowCountLabel} available
        </div>

        {isLoading ? (
          <div className="mt-8 flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-slate-600">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading workflows...
          </div>
        ) : loadError ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : workflows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-slate-900">No workflows yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Create your first workflow to start automating prompt-driven tasks.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workflows.map((workflow) => (
              <article
                key={workflow.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <h2 className="text-base font-semibold text-slate-900">{workflow.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                  {workflow.description}
                </p>
                <p className="mt-3 line-clamp-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                  {workflow.promptTemplate}
                </p>

                <Link
                  href={`/workflows/${workflow.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 transition group-hover:gap-2.5"
                >
                  Execute workflow
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/20 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                  New Workflow
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Create Prompt Blueprint
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateError(null);
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleCreateWorkflow}>
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  required
                  value={createForm.name}
                  onChange={(event) => updateForm('name', event.target.value)}
                  placeholder="Lead Qualifier"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Description
                <input
                  required
                  value={createForm.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                  placeholder="Classifies incoming lead details into sales tiers"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Prompt Template
                <textarea
                  required
                  rows={6}
                  value={createForm.promptTemplate}
                  onChange={(event) => updateForm('promptTemplate', event.target.value)}
                  placeholder="Analyze this payload and summarize key actions: {{input}}"
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-teal-500"
                />
              </label>

              {createError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createError}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Save Workflow'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export type WorkflowExample = {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
};

export const workflowExamples: WorkflowExample[] = [
  {
    id: 'lead-qualifier',
    name: 'Lead Qualifier',
    description:
      'Scores inbound leads against three tiers using firmographic and intent signals.',
    promptTemplate: `You are a B2B sales analyst. Score the following lead.

Company: {{company}}
Industry: {{industry}}
Signal: {{signal}}

Return:
1. Tier (A / B / C)
2. One-sentence rationale
3. Recommended next action`,
  },
  {
    id: 'document-summarizer',
    name: 'Document Summarizer',
    description:
      'Distills a long document into an executive summary and three action items.',
    promptTemplate: `Read the following document and produce:
- A 3-sentence executive summary
- 3 specific action items
- 1 open question worth raising

Audience: {{audience}}

Document:
{{document}}`,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description:
      'Reviews a code diff for correctness, style, and security concerns.',
    promptTemplate: `Review the following {{language}} diff.

Focus on:
- Correctness bugs
- Style consistency
- Security concerns

Be concise. Use a bulleted list. Cite line numbers when possible.

Diff:
{{diff}}`,
  },
];

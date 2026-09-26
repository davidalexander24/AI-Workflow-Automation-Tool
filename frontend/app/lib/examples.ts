import type { WorkflowStep } from './api';

export type WorkflowExample = {
  id: string;
  name: string;
  description: string;
  promptTemplate: string;
  steps?: WorkflowStep[];
};

export const workflowExamples: WorkflowExample[] = [
  {
    id: 'meeting-to-email',
    name: 'Meeting Notes to Follow-up Email',
    description:
      'Three steps: pull out decisions and owners, draft the follow-up email, then tighten it.',
    promptTemplate: `Read these meeting notes and list:
- every decision that was made
- every action item, with its owner and due date if stated

Notes:
{{notes}}`,
    steps: [
      {
        name: 'Draft the email',
        promptTemplate: `Write a short follow-up email to {{audience}} based on this summary. Open with the decisions, then list the action items with owners.

Summary:
{{previous}}`,
        model: null,
      },
      {
        name: 'Tighten it',
        promptTemplate: `Edit this email to under 150 words without dropping any action item or owner. Return only the email.

{{previous}}`,
        model: null,
      },
    ],
  },
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

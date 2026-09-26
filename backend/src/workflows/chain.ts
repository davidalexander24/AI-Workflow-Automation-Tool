import { applyTemplate, toText } from './template';

// A type alias rather than an interface so it stays assignable to Prisma's
// JSON input type (interfaces lack the implicit index signature).
export type StepDefinition = {
  name: string;
  promptTemplate: string;
  // Overrides the run's model for this step; null means "use the run model".
  model?: string | null;
};

export const MAX_FOLLOW_UP_STEPS = 4;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Follow-up steps are stored as JSON; anything malformed is dropped rather
// than failing the whole workflow.
export function parseSteps(value: unknown): StepDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPlainObject).flatMap((step) =>
    typeof step.name === 'string' && typeof step.promptTemplate === 'string'
      ? [
          {
            name: step.name,
            promptTemplate: step.promptTemplate,
            model:
              typeof step.model === 'string' && step.model ? step.model : null,
          },
        ]
      : [],
  );
}

// Step 1 is the workflow's own promptTemplate and fills exactly like a
// single-step workflow. Later steps can also reference {{previous}} (the step
// just before) and {{step_1}}..{{step_N}} (any earlier step), alongside the
// run's original input variables and {{input}}.
export function renderStep(
  index: number,
  template: string,
  input: unknown,
  outputs: string[],
): string {
  if (index === 0) {
    return applyTemplate(template, input);
  }

  const values: Record<string, unknown> = isPlainObject(input)
    ? {
        ...input,
        input: 'input' in input ? input.input : JSON.stringify(input),
      }
    : { input: toText(input) };
  outputs.forEach((output, i) => {
    values[`step_${i + 1}`] = output;
  });
  values.previous = outputs[outputs.length - 1] ?? '';

  return applyTemplate(template, values);
}

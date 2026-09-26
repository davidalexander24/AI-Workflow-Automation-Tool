const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const match of template.matchAll(VARIABLE_TOKEN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }

  return ordered;
}

export function applyVariables(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(VARIABLE_TOKEN, (_, name: string) => {
    const value = values[name];
    return value === undefined || value === null ? '' : value;
  });
}

// {{previous}} and {{step_N}} are filled from earlier steps' outputs, so in a
// follow-up step they are not inputs the user types.
export function isStepReference(name: string): boolean {
  return name === 'previous' || /^step_\d+$/.test(name);
}

/**
 * Every input variable a workflow run needs: those in the first template plus
 * those that follow-up steps use, minus step references.
 */
export function extractWorkflowVariables(
  promptTemplate: string,
  steps: { promptTemplate: string }[] = [],
): string[] {
  const ordered = extractVariables(promptTemplate);
  const seen = new Set(ordered);
  for (const step of steps) {
    for (const name of extractVariables(step.promptTemplate)) {
      if (!isStepReference(name) && !seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }
  }
  return ordered;
}

/**
 * Decide whether a run should render a single free-text textarea
 * (legacy `{{input}}` convention or no variables at all) or a per-variable form.
 */
export function shouldUseSingleInput(variables: string[]): boolean {
  if (variables.length === 0) return true;
  return variables.length === 1 && variables[0] === 'input';
}

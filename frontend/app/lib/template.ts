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

/**
 * Decide whether a template should render a single free-text textarea
 * (legacy `{{input}}` convention or no variables at all) or a per-variable form.
 */
export function shouldUseSingleInput(template: string): boolean {
  const vars = extractVariables(template);
  if (vars.length === 0) return true;
  return vars.length === 1 && vars[0] === 'input';
}

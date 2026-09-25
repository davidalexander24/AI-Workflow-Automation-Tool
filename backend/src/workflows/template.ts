const VARIABLE_TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const INPUT_TOKEN = /\{\{\s*input\s*\}\}/g;

function toText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Replacements go through a function so `$&`, `$'` and friends in user input
// are inserted literally instead of being expanded as replacement patterns.
export function applyTemplate(template: string, input: unknown): string {
  if (input === null || input === undefined) {
    return template;
  }

  if (typeof input === 'object' && !Array.isArray(input)) {
    const values = input as Record<string, unknown>;
    return template.replace(VARIABLE_TOKEN, (_, name: string) =>
      // A template written for a single {{input}} gets the whole object when
      // the payload has no "input" key of its own, e.g. pasted JSON.
      name === 'input' && !('input' in values)
        ? JSON.stringify(values)
        : toText(values[name]),
    );
  }

  const text = toText(input);
  return template.replace(INPUT_TOKEN, () => text);
}

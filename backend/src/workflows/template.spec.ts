import { applyTemplate } from './template';

describe('applyTemplate', () => {
  it('fills {{input}} from a string payload', () => {
    expect(applyTemplate('Summarize: {{ input }}', 'the report')).toBe(
      'Summarize: the report',
    );
  });

  it('fills named variables from an object payload', () => {
    expect(
      applyTemplate('Summarize {{document}} for {{audience}}.', {
        document: 'Q3 notes',
        audience: 'execs',
      }),
    ).toBe('Summarize Q3 notes for execs.');
  });

  it('JSON-encodes non-string values and blanks missing ones', () => {
    expect(
      applyTemplate('{{count}} / {{tags}} / [{{missing}}]', {
        count: 3,
        tags: ['a', 'b'],
      }),
    ).toBe('3 / ["a","b"] / []');
  });

  it('passes a pasted JSON object whole into an {{input}} template', () => {
    expect(
      applyTemplate('Explain this JSON: {{input}}', {
        orders: 12,
        region: 'APAC',
      }),
    ).toBe('Explain this JSON: {"orders":12,"region":"APAC"}');
  });

  it('still uses an explicit "input" key when the object has one', () => {
    expect(applyTemplate('Echo {{input}}', { input: 'hello' })).toBe(
      'Echo hello',
    );
  });

  it('JSON-encodes array and number payloads into {{input}}', () => {
    expect(applyTemplate('Items: {{input}}', [1, 2])).toBe('Items: [1,2]');
    expect(applyTemplate('Year: {{input}}', 2026)).toBe('Year: 2026');
  });

  it('inserts replacement-pattern characters literally', () => {
    expect(applyTemplate('Quote: {{input}}', "costs $& and $' more")).toBe(
      "Quote: costs $& and $' more",
    );
    expect(applyTemplate('Quote: {{price}}', { price: '$1 or $&' })).toBe(
      'Quote: $1 or $&',
    );
  });

  it('leaves templates without variables untouched', () => {
    expect(applyTemplate('Write a haiku about autumn.', '')).toBe(
      'Write a haiku about autumn.',
    );
  });
});

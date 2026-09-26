import { parseSteps, renderStep } from './chain';

describe('renderStep', () => {
  it('fills step 1 exactly like a single-step workflow', () => {
    expect(renderStep(0, 'Summarize: {{input}}', 'the notes', [])).toBe(
      'Summarize: the notes',
    );
    expect(
      renderStep(
        0,
        'For {{audience}}: {{document}}',
        { audience: 'execs', document: 'Q3' },
        [],
      ),
    ).toBe('For execs: Q3');
  });

  it('gives later steps {{previous}} and numbered step outputs', () => {
    const outputs = ['facts', 'draft'];
    expect(
      renderStep(2, 'Edit {{previous}} using {{step_1}}', 'x', outputs),
    ).toBe('Edit draft using facts');
  });

  it('keeps the original input variables available to later steps', () => {
    expect(
      renderStep(
        1,
        'Write to {{audience}} about: {{previous}}',
        { notes: 'n', audience: 'the team' },
        ['three action items'],
      ),
    ).toBe('Write to the team about: three action items');
  });

  it('exposes a plain-text input as {{input}} in later steps', () => {
    expect(renderStep(1, '{{input}} -> {{previous}}', 'raw', ['out'])).toBe(
      'raw -> out',
    );
  });

  it('exposes a JSON input as {{input}} in later steps', () => {
    expect(renderStep(1, 'Data: {{input}}', { a: 1 }, ['out'])).toBe(
      'Data: {"a":1}',
    );
  });

  it('lets step outputs override input keys with reserved names', () => {
    expect(
      renderStep(1, '{{previous}}', { previous: 'user value' }, [
        'step output',
      ]),
    ).toBe('step output');
  });
});

describe('parseSteps', () => {
  it('keeps well-formed steps and normalizes empty models to null', () => {
    expect(
      parseSteps([
        { name: 'Draft', promptTemplate: 'Use {{previous}}', model: '' },
        {
          name: 'Review',
          promptTemplate: 'Check it',
          model: 'gemini-3.8-flash',
        },
      ]),
    ).toEqual([
      { name: 'Draft', promptTemplate: 'Use {{previous}}', model: null },
      { name: 'Review', promptTemplate: 'Check it', model: 'gemini-3.8-flash' },
    ]);
  });

  it('drops malformed entries and non-array values', () => {
    expect(parseSteps([{ name: 'no template' }, 'x', null, 3])).toEqual([]);
    expect(parseSteps(null)).toEqual([]);
    expect(parseSteps({ name: 'a', promptTemplate: 'b' })).toEqual([]);
  });
});

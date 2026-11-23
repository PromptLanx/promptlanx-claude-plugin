import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_KEY_DETECTION, KEY_PROVIDER_IDS, validateKeyDetectionSettings } from '../src/engine/key-detection.ts';
import { buildDetectors, scan } from '../src/scan.ts';
import { chars } from './fakes.ts';

const BUDGET_MS = 50;
const SIZE = 100 * 1024;

/** Repeat a unit until the text is exactly SIZE characters. */
const fill = (unit: string): string => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);

/**
 * Inputs aimed at the patterns' weak spots: many candidate starts, long runs that almost
 * match, lookaheads that scan far before failing, and the labelled/secret patterns'
 * unbounded `\s*` and `{16,}` / `{12,}` runs.
 */
const HOSTILE: Record<string, string> = {
  'sk- repeated': fill('sk-'),
  'sk- with long almost-key bodies': fill(`sk-${'a-'.repeat(100)} `),
  'sk-ant- with 199-char bodies and no digit': fill(`sk-ant-${'a'.repeat(199)} `),
  'AKIA runs without digits': fill(`${'AK'}IA${'A'.repeat(16)} `),
  'ghp_ with 35-char bodies': fill(`ghp_${'a'.repeat(35)} `),
  'xoxb- with dashes': fill('xoxb-' + '-'.repeat(50)),
  'api_key with whitespace and no separator': fill(`api_key${' '.repeat(200)}x`),
  'password= with long values': fill(`password=${'a'.repeat(500)} `),
  'token: repeated': fill('token:'),
  'one giant word (no boundaries)': fill('a'),
  'one giant run of key characters': fill('Ab3x_'),
  'dashes and underscores': fill('-_'),
  'unicode letters': fill('é中ب'),
  'custom-prefix spam': fill('key1_'),
};

/** Warm up once, then take the best of three, so a scheduler hiccup does not fail CI. */
const time = (fn: () => void): number => {
  fn();
  let best = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const started = performance.now();
    fn();
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

describe(`performance: whole scan of a 100 KB prompt under ${BUDGET_MS} ms`, () => {
  const defaults = buildDetectors(DEFAULT_KEY_DETECTION);
  const largest = validateKeyDetectionSettings({
    providers: KEY_PROVIDER_IDS,
    custom: Array.from({ length: 20 }, (_, i) => ({ name: `K${i}`, prefix: `key${i}_`, min_length: 8, max_length: 256 })),
  });
  assert.ok(largest.ok);
  const maximal = largest.ok ? buildDetectors(largest.value) : defaults;

  const cases: Record<string, string> = {
    ...HOSTILE,
    'ordinary prose': fill('The quick brown fox jumps over the lazy dog. '),
    'code with a key near the end': `${fill('const x = compute(a, b); // comment\n').slice(0, SIZE - 60)} sk-proj-${chars(48)}`,
  };

  for (const [name, text] of Object.entries(cases)) {
    it(`${name}: default settings`, (t) => {
      const ms = time(() => scan(defaults, text));
      t.diagnostic(`best of 3: ${ms.toFixed(1)} ms`);
      assert.ok(ms < BUDGET_MS, `took ${ms.toFixed(1)} ms`);
    });
    it(`${name}: 8 providers + 20 custom formats`, (t) => {
      const ms = time(() => scan(maximal, text));
      t.diagnostic(`best of 3: ${ms.toFixed(1)} ms`);
      assert.ok(ms < BUDGET_MS, `took ${ms.toFixed(1)} ms`);
    });
  }
});

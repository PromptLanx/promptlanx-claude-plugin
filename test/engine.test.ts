import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import apiKeySpecJson from '../src/engine/spec/api-key.json' with { type: 'json' };
import {
  buildApiKeyDetectorSpec,
  DEFAULT_KEY_DETECTION,
  KEY_PROVIDER_IDS,
  validateKeyDetectionSettings,
} from '../src/engine/key-detection.ts';
import { createRegexDetector } from '../src/engine/regex-detector.ts';
import { parseDetectorSpec } from '../src/engine/spec.ts';
import { apiKeyDetectorSpec } from '../src/engine/specs.ts';
import { DetectionBudgetExceededError, InputTooLargeError, InvalidDetectorSpecError } from '../src/engine/errors.ts';
import { chars } from './fakes.ts';

describe('engine: canonical spec', () => {
  it('default settings rebuild exactly the pattern in spec/api-key.json', () => {
    assert.equal(buildApiKeyDetectorSpec(apiKeyDetectorSpec, DEFAULT_KEY_DETECTION).pattern, apiKeySpecJson.pattern);
  });

  it('rejects a spec without the g flag, which would loop forever', () => {
    assert.throws(() => parseDetectorSpec({ ...apiKeySpecJson, flags: 'iu' }), InvalidDetectorSpecError);
  });

  it('rejects an unsupported spec version', () => {
    assert.throws(() => parseDetectorSpec({ ...apiKeySpecJson, spec_version: 99 }));
  });
});

describe('engine: regex detector', () => {
  it('refuses input over max_input_length instead of returning "clean"', () => {
    const detector = createRegexDetector({ ...apiKeyDetectorSpec, max_input_length: 10 });
    assert.throws(() => detector.detect('x'.repeat(11)), InputTooLargeError);
  });

  it('bails out when the time budget is exceeded', () => {
    let t = 0;
    const clock = { now: () => (t += 100) };
    const detector = createRegexDetector(apiKeyDetectorSpec, clock);
    assert.throws(() => detector.detect(`a ${'x'.repeat(5)}`), DetectionBudgetExceededError);
  });
});

describe('engine: validateKeyDetectionSettings', () => {
  const custom = (overrides: Record<string, unknown>) => ({
    providers: [],
    custom: [{ name: 'Acme', prefix: 'acme_', min_length: 16, max_length: 40, ...overrides }],
  });

  it('accepts and normalises valid settings', () => {
    assert.deepEqual(
      validateKeyDetectionSettings({
        providers: ['slack', 'openai', 'slack'],
        custom: [{ name: '  Acme  ', prefix: ' acme_ ', min_length: 16, max_length: 40 }],
      }),
      {
        ok: true,
        value: { providers: ['openai', 'slack'], custom: [{ name: 'Acme', prefix: 'acme_', min_length: 16, max_length: 40 }] },
      },
    );
  });

  const rejected: Array<[string, unknown]> = [
    ['not an object', null],
    ['unknown provider', { providers: ['myspace'], custom: [] }],
    ['missing custom list', { providers: [] }],
    ['empty name', custom({ name: ' ' })],
    ['prefix too short', custom({ prefix: 'ab' })],
    ['prefix too long', custom({ prefix: 'a'.repeat(41) })],
    ['prefix with regex syntax', custom({ prefix: 'a(b)+' })],
    ['prefix with spaces', custom({ prefix: 'acme key' })],
    ['length below the minimum', custom({ min_length: 4 })],
    ['length above the maximum', custom({ max_length: 1000 })],
    ['minimum above maximum', custom({ min_length: 40, max_length: 20 })],
    ['fractional length', custom({ min_length: 16.5 })],
    ['duplicate prefix', { providers: [], custom: [
      { name: 'A', prefix: 'acme_', min_length: 16, max_length: 40 },
      { name: 'B', prefix: 'ACME_', min_length: 16, max_length: 40 },
    ] }],
    ['too many formats', { providers: [], custom: Array.from({ length: 21 }, (_, i) => (
      { name: `K${i}`, prefix: `key${i}_`, min_length: 16, max_length: 40 })) }],
  ];
  for (const [label, raw] of rejected) {
    it(`rejects ${label}`, () => assert.equal(validateKeyDetectionSettings(raw).ok, false));
  }

  it('never repeats the submitted values in its error message', () => {
    const marker = 'zz9plural';
    const result = validateKeyDetectionSettings(custom({ prefix: `${marker} (x)` }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(!result.error.includes(marker));
  });

  it('every built-in provider ID is known', () => {
    assert.deepEqual([...KEY_PROVIDER_IDS], ['labelled', 'openai', 'anthropic', 'aws', 'github', 'google', 'stripe', 'slack']);
  });

  it('custom prefixes are treated as plain text, not as a pattern', () => {
    const value = validateKeyDetectionSettings({ providers: [], custom: [{ name: 'D', prefix: 'co.key', min_length: 8, max_length: 20 }] });
    assert.ok(value.ok);
    if (!value.ok) return;
    const detector = createRegexDetector(buildApiKeyDetectorSpec(apiKeyDetectorSpec, value.value));
    assert.equal(detector.detect(`co.key${chars(10)}`).length, 1);
    assert.equal(detector.detect(`coXkey${chars(10)}`).length, 0);
  });
});

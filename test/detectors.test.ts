import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_KEY_DETECTION, KEY_PROVIDER_IDS } from '../src/engine/key-detection.ts';
import type { KeyProviderId } from '../src/engine/key-detection.ts';
import { buildDetectors, CHUNK_SIZE, lineAndColumn, scan } from '../src/scan.ts';
import { chars, digits, FAKE_KEYS, hardCodedPassword, labelledKey } from './fakes.ts';

const defaults = buildDetectors(DEFAULT_KEY_DETECTION);
const labels = (text: string, detectors = defaults): string[] => scan(detectors, text).map((f) => f.label);
const matched = (text: string): string[] => scan(defaults, text).map((f) => text.slice(f.start, f.end));

describe('detectors: every built-in provider', () => {
  for (const { provider, label, key } of FAKE_KEYS) {
    it(`finds ${provider} (${key.slice(0, 7)}…) in a sentence and names it`, () => {
      const text = `why does this fail? ${key} thanks`;
      assert.deepEqual(labels(text), [label]);
      assert.deepEqual(matched(text), [key]);
    });

    it(`finds ${provider} at the very start and end of the text`, () => {
      assert.deepEqual(labels(key), [label]);
      assert.deepEqual(labels(`key:${key}`), [label]);
    });
  }

  it('finds a labelled key (api_key = …)', () => {
    assert.deepEqual(labels(`config: ${labelledKey()}`), ['a labelled API key (api_key = …)']);
  });

  it('finds a hard-coded password, secret or token', () => {
    assert.deepEqual(labels(`db ${hardCodedPassword()}`), ['a hard-coded password, secret or token']);
    assert.deepEqual(labels(`token=${chars(20)}`), ['a hard-coded password, secret or token']);
  });

  it('reports a provider key inside a labelled assignment once, under the specific name', () => {
    const openai = FAKE_KEYS[0].key;
    assert.deepEqual(labels(`api_key = "${openai}"`), ['an OpenAI API key']);
    assert.deepEqual(labels(`token: ${FAKE_KEYS[5].key}`), ['a GitHub token']);
  });

  it('reports several findings in text order', () => {
    const text = `${hardCodedPassword()}\nand ${FAKE_KEYS[3].key}`;
    assert.deepEqual(labels(text), ['a hard-coded password, secret or token', 'an AWS access key ID']);
  });
});

describe('detectors: false positives stay out', () => {
  const clean = [
    'Please review the task-management-dashboard-component before Friday',
    'The disk-encryption-and-backup-procedure is documented here',
    'We are expanding into Asia next quarter and AsiaPacificRegionalOffice is hiring',
    `${'AK'}IAMANAGEMENTTEAMSX is just shouting`,
    'sk-short',
    'Use sklearn and sk-learn for the model',
    'pip install scikit-learn; import sklearn; see the sk-learn docs',
    'gh_pages branch and ghp_short',
    'The xox-pattern is a design term',
    'Visit https://example.com/docs/sk-reference-guide-for-new-users',
    'Notes in sk-2024-roadmap-planning-notes-final',
    'https://blog.example.com/posts/how-to-rotate-your-api-keys-safely-2024',
    'Set the password field to required and add a token input to the form.',
    'The password must be at least 12 characters.',
    'api_key = os.environ["OPENAI_API_KEY"]',
    'const apiKey = process.env.API_KEY;',
    'password: <redacted>',
    'token = getToken()',
    [
      'function add(a: number, b: number): number {',
      '  // Sum two numbers. See https://example.com/sk-guide',
      '  return a + b;',
      '}',
      'export const config = { retries: 3, timeoutMs: 5000, region: "us-east-1" };',
    ].join('\n'),
    'Hello! Can you explain how OAuth refresh tokens work and when I should rotate my secret keys?',
    `mask-${chars(30)}`,
    `x${'AK'}IA${'QX'.repeat(6)}${digits(4)}`,
  ];

  for (const text of clean) {
    it(`allows: ${text.split('\n')[0]}`, () => assert.deepEqual(labels(text), []));
  }
});

describe('detectors: configuration', () => {
  const without = (off: KeyProviderId) =>
    buildDetectors({ providers: KEY_PROVIDER_IDS.filter((id) => id !== off), custom: [] });

  for (const { provider, key } of FAKE_KEYS) {
    it(`switching ${provider} off stops it being reported`, () => {
      assert.deepEqual(labels(` ${key} `, without(provider)), []);
    });
  }

  it('switching a provider off leaves the others working', () => {
    assert.deepEqual(labels(labelledKey(), without('openai')), ['a labelled API key (api_key = …)']);
  });

  it('the secret detector stays on even with every provider off', () => {
    const none = buildDetectors({ providers: [], custom: [] });
    assert.deepEqual(labels(`${FAKE_KEYS[0].key} ${hardCodedPassword()}`, none), ['a hard-coded password, secret or token']);
  });

  it('custom formats match only bodies within the length range', () => {
    const detectors = buildDetectors({ providers: [], custom: [{ name: 'acme_live_', prefix: 'acme_live_', min_length: 24, max_length: 32 }] });
    const label = 'a key in your custom format "acme_live_"';
    assert.deepEqual(labels(`deploy with acme_live_${chars(28)} now`, detectors), [label]);
    assert.deepEqual(labels(`acme_live_${chars(10)}`, detectors), []);
    assert.deepEqual(labels(`acme_live_${chars(40)}`, detectors), []);
    assert.deepEqual(labels('see acme_live_ docs', detectors), []);
  });
});

describe('scan: long prompts and positions', () => {
  it('finds a key that straddles a chunk boundary', () => {
    const key = FAKE_KEYS[0].key;
    const text = `${'a '.repeat((CHUNK_SIZE - 10) / 2)}${key} tail`;
    assert.deepEqual(labels(text), ['an OpenAI API key']);
    const [finding] = scan(defaults, text);
    assert.equal(text.slice(finding!.start, finding!.end), key);
  });

  it('finds a key near the end of a 1 MB prompt without double-counting overlaps', () => {
    const text = `${'word '.repeat(200_000)}${FAKE_KEYS[2].key}`;
    assert.deepEqual(labels(text), ['an Anthropic API key']);
  });

  it('scans an empty prompt', () => assert.deepEqual(labels(''), []));

  it('computes 1-based line and column', () => {
    const text = 'one\ntwo\nthree X';
    assert.deepEqual(lineAndColumn(text, text.indexOf('X')), { line: 3, column: 7 });
    assert.deepEqual(lineAndColumn(text, 0), { line: 1, column: 1 });
  });
});

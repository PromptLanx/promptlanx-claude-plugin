import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ENV_CUSTOM_KEY_FORMATS, ENV_DISABLED_PROVIDERS, loadConfig, parseList } from '../src/config.ts';
import { DEFAULT_KEY_DETECTION } from '../src/engine/key-detection.ts';

describe('config: list parsing', () => {
  it('accepts commas, spaces, newlines and JSON arrays', () => {
    assert.deepEqual(parseList('openai, slack'), ['openai', 'slack']);
    assert.deepEqual(parseList('openai\nslack  aws'), ['openai', 'slack', 'aws']);
    assert.deepEqual(parseList('["openai","slack"]'), ['openai', 'slack']);
    assert.deepEqual(parseList(''), []);
    assert.deepEqual(parseList(undefined), []);
  });
});

describe('config: loadConfig', () => {
  it('uses every provider and no custom formats by default', () => {
    assert.deepEqual(loadConfig({}), { settings: DEFAULT_KEY_DETECTION, warning: null });
  });

  it('switches providers off (case-insensitive)', () => {
    const { settings, warning } = loadConfig({ [ENV_DISABLED_PROVIDERS]: 'OpenAI,slack' });
    assert.equal(warning, null);
    assert.deepEqual(settings.providers, ['labelled', 'anthropic', 'aws', 'github', 'google', 'stripe']);
  });

  it('adds custom formats written as prefix:min-max', () => {
    const { settings, warning } = loadConfig({ [ENV_CUSTOM_KEY_FORMATS]: 'acme_live_:24-40 corp.key:8-16' });
    assert.equal(warning, null);
    assert.deepEqual(settings.custom, [
      { name: 'acme_live_', prefix: 'acme_live_', min_length: 24, max_length: 40 },
      { name: 'corp.key', prefix: 'corp.key', min_length: 8, max_length: 16 },
    ]);
  });

  const invalid: Array<[string, NodeJS.ProcessEnv]> = [
    ['an unknown provider', { [ENV_DISABLED_PROVIDERS]: 'openai,myspace' }],
    ['a malformed entry', { [ENV_CUSTOM_KEY_FORMATS]: 'acme_live_' }],
    ['a prefix that is too short', { [ENV_CUSTOM_KEY_FORMATS]: 'ab:16-32' }],
    ['a prefix with regex syntax', { [ENV_CUSTOM_KEY_FORMATS]: 'a(b)+:16-32' }],
    ['a length below 8', { [ENV_CUSTOM_KEY_FORMATS]: 'acme_:4-32' }],
    ['a length above 256', { [ENV_CUSTOM_KEY_FORMATS]: 'acme_:16-999' }],
    ['min above max', { [ENV_CUSTOM_KEY_FORMATS]: 'acme_:40-20' }],
    ['a duplicate prefix', { [ENV_CUSTOM_KEY_FORMATS]: 'acme_:16-32,ACME_:16-32' }],
    ['broken JSON', { [ENV_CUSTOM_KEY_FORMATS]: '["acme_:16-32"' }],
  ];
  for (const [label, env] of invalid) {
    it(`falls back to the full defaults with a warning on ${label}`, () => {
      const { settings, warning } = loadConfig(env);
      assert.deepEqual(settings, DEFAULT_KEY_DETECTION);
      assert.match(warning ?? '', /^PromptLanx: plugin settings ignored \(.+\); checking with the default settings\.$/);
    });
  }

  it('does not repeat the configured values in its warning', () => {
    const { warning } = loadConfig({ [ENV_CUSTOM_KEY_FORMATS]: 'zz9secretprefix(:16-32' });
    assert.ok(warning);
    assert.ok(!warning.includes('zz9secretprefix'));
  });
});

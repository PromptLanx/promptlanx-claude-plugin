import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { ENV_EXTRA_PREFIXES } from '../src/config.ts';
import { handle } from '../src/hook.ts';
import { chars, FAKE_KEYS, hardCodedPassword, hookInput } from './fakes.ts';

const openai = FAKE_KEYS[0].key;
const bundle = fileURLToPath(new URL('../plugins/promptlanx/dist/promptlanx-hook.js', import.meta.url));

/** No part of the secret body may appear anywhere in the output. */
const assertNoLeak = (output: string, secret: string): void => {
  assert.ok(!output.includes(secret), 'output contains the secret');
  assert.ok(!output.includes(secret.slice(-12)), 'output contains the tail of the secret');
  assert.ok(!output.includes(chars(12)), 'output contains the fake key body');
};

describe('hook contract: handle()', () => {
  it('blocks a prompt with a key, names the type and position, suppresses the prompt', () => {
    const out = handle(hookInput(`please debug this:\n  client = OpenAI(${openai})`), {});
    assert.equal(out.decision, 'block');
    assert.equal(
      out.reason,
      'PromptLanx blocked this prompt: an OpenAI API key was found at line 2, column 19. Remove it and send again.',
    );
    assert.deepEqual(out.hookSpecificOutput, { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: true });
    assertNoLeak(JSON.stringify(out), openai);
  });

  it('lists several findings without repeating any of them or the prompt', () => {
    const prompt = `Context words here. ${hardCodedPassword()} then ${FAKE_KEYS[3].key} and ${FAKE_KEYS[8].key}`;
    const out = handle(hookInput(prompt), {});
    assert.equal(out.decision, 'block');
    assert.match(out.reason ?? '', /^PromptLanx blocked this prompt\. It contains:\n- a hard-coded password, secret or token at line 1, column 21\n- an AWS access key ID at line 1, column \d+\n- a Stripe secret key at line 1, column \d+\nRemove them and send again\.$/);
    const json = JSON.stringify(out);
    for (const { key } of [FAKE_KEYS[3], FAKE_KEYS[8]]) assertNoLeak(json, key);
    assert.ok(!json.includes('Context words'));
  });

  it('caps the list at five findings', () => {
    const prompt = Array.from({ length: 8 }, () => openai).join('\n');
    const out = handle(hookInput(prompt), {});
    assert.equal((out.reason ?? '').split('\n').filter((l) => l.startsWith('- an OpenAI')).length, 5);
    assert.match(out.reason ?? '', /- and 3 more/);
  });

  it('allows a clean prompt with an empty output object', () => {
    assert.deepEqual(handle(hookInput('Refactor this function to use async/await, please.'), {}), {});
  });

  it('fails open on unreadable input, without echoing it', () => {
    const out = handle(`{"prompt": "${openai}`, {});
    assert.equal(out.decision, undefined);
    assert.equal(out.systemMessage, 'PromptLanx could not check this prompt (unreadable_hook_input); it was sent without a check.');
    assertNoLeak(JSON.stringify(out), openai);
  });

  it('fails open when the prompt field is missing', () => {
    const out = handle(JSON.stringify({ hook_event_name: 'UserPromptSubmit' }), {});
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage ?? '', /no_prompt_in_hook_input/);
  });

  it('fails open on a prompt too large to scan', () => {
    const out = handle(hookInput('a'.repeat(5_000_001)), {});
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage ?? '', /prompt_too_large/);
  });

  it('still blocks, and warns, when the configuration is invalid', () => {
    const out = handle(hookInput(openai), { [ENV_EXTRA_PREFIXES]: 'nope' });
    assert.equal(out.decision, 'block');
    assert.match(out.systemMessage ?? '', /plugin settings ignored/);
  });

  it('blocks a key in a configured custom format', () => {
    const key = `acme_live_${chars(30)}`;
    const out = handle(hookInput(`deploy ${key}`), { [ENV_EXTRA_PREFIXES]: 'acme_live_:24-40' });
    assert.equal(out.decision, 'block');
    assert.match(out.reason ?? '', /custom format "acme_live_"/);
    assertNoLeak(JSON.stringify(out), key);
  });
});

describe('hook contract: the bundled script as Claude Code runs it', { skip: !existsSync(bundle) && 'run npm run build first' }, () => {
  const run = (stdin: string, env: NodeJS.ProcessEnv = {}) => {
    const result = spawnSync(process.execPath, [bundle], {
      input: stdin,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
      timeout: 10_000,
    });
    return { code: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  it('blocks: exit 0, one JSON line with decision "block", nothing on stderr', () => {
    const { code, stdout, stderr } = run(hookInput(`my key is ${openai}`));
    assert.equal(code, 0);
    assert.equal(stderr, '');
    const out = JSON.parse(stdout);
    assert.equal(out.decision, 'block');
    assert.equal(out.hookSpecificOutput.suppressOriginalPrompt, true);
    assertNoLeak(stdout, openai);
  });

  it('allows: exit 0 and "{}"', () => {
    const { code, stdout, stderr } = run(hookInput('What is the capital of France?'));
    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.equal(stdout.trim(), '{}');
  });

  it('fails open: exit 0 with a one-line warning on garbage input', () => {
    const { code, stdout, stderr } = run(`not json ${openai}`);
    assert.equal(code, 0);
    assert.equal(stderr, '');
    const out = JSON.parse(stdout);
    assert.equal(out.decision, undefined);
    assert.ok(!String(out.systemMessage).includes('\n'));
    assertNoLeak(stdout, openai);
  });

  it('fails open on empty stdin', () => {
    const { code, stdout } = run('');
    assert.equal(code, 0);
    assert.match(JSON.parse(stdout).systemMessage, /could not check this prompt/);
  });
});

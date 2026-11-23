import { loadConfig } from './config.ts';
import { buildDetectors, lineAndColumn, scan } from './scan.ts';
import type { Finding } from './scan.ts';

/**
 * PromptLanx UserPromptSubmit hook.
 *
 * Contract (Claude Code hooks reference):
 * - stdin: JSON with a `prompt` string.
 * - To block: exit 0 and print `{"decision":"block","reason":…}`. `suppressOriginalPrompt`
 *   stops Claude Code from appending the prompt itself to the block message, so the secret
 *   is not echoed back on screen.
 * - To allow: exit 0 with no `decision`.
 * - On any internal error: fail OPEN, allowing the prompt with a one-line `systemMessage`
 *   warning, so a bug in this script can never lock the user out of Claude Code.
 *
 * Privacy: nothing here makes a network call, writes a file or logs. Output contains only
 * detector names, positions and fixed text, never the prompt or any part of a match.
 */

export interface HookOutput {
  decision?: 'block';
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: { hookEventName: 'UserPromptSubmit'; suppressOriginalPrompt: true };
}

const MAX_LISTED = 5;

export function blockReason(prompt: string, findings: readonly Finding[]): string {
  const where = (f: Finding): string => {
    const { line, column } = lineAndColumn(prompt, f.start);
    return `line ${line}, column ${column}`;
  };
  if (findings.length === 1) {
    const [only] = findings as [Finding];
    return `PromptLanx blocked this prompt: ${only.label} was found at ${where(only)}. Remove it and send again.`;
  }
  const listed = findings.slice(0, MAX_LISTED).map((f) => `- ${f.label} at ${where(f)}`);
  if (findings.length > MAX_LISTED) listed.push(`- and ${findings.length - MAX_LISTED} more`);
  return [`PromptLanx blocked this prompt. It contains:`, ...listed, 'Remove them and send again.'].join('\n');
}

/**
 * Error names are fixed strings chosen by this code. Error *messages* are never shown:
 * some built-in errors (for example JSON.parse) quote part of their input.
 */
function failOpen(error: unknown): HookOutput {
  const kind =
    error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' &&
    /^[a-z_]{1,40}$/.test(error.code)
      ? error.code
      : 'internal_error';
  return {
    systemMessage: `PromptLanx could not check this prompt (${kind}); it was sent without a check.`,
  };
}

export function handle(stdin: string, env: NodeJS.ProcessEnv): HookOutput {
  try {
    let input: unknown;
    try {
      input = JSON.parse(stdin);
    } catch {
      throw Object.assign(new Error('bad input'), { code: 'unreadable_hook_input' });
    }
    const prompt = (input as { prompt?: unknown } | null)?.prompt;
    if (typeof prompt !== 'string') {
      throw Object.assign(new Error('no prompt'), { code: 'no_prompt_in_hook_input' });
    }

    const { settings, warning } = loadConfig(env);
    const findings = scan(buildDetectors(settings), prompt);

    const output: HookOutput = {};
    if (warning !== null) output.systemMessage = warning;
    if (findings.length > 0) {
      output.decision = 'block';
      output.reason = blockReason(prompt, findings);
      output.hookSpecificOutput = { hookEventName: 'UserPromptSubmit', suppressOriginalPrompt: true };
    }
    return output;
  } catch (error) {
    return failOpen(error);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

export async function main(): Promise<void> {
  let output: HookOutput;
  try {
    output = handle(await readStdin(), process.env);
  } catch (error) {
    output = failOpen(error);
  }
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = 0;
}

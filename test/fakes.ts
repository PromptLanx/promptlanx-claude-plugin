/**
 * Synthetic, obviously fake values built at runtime, so no key-shaped literal sits in the
 * repository for secret scanners to flag. Prefixes are split so even they don't appear whole.
 */
export const chars = (n: number): string => 'Ab3x'.repeat(Math.ceil(n / 4)).slice(0, n);
export const digits = (n: number): string => '7'.repeat(n);
const p = (...parts: string[]): string => parts.join('');

/** One fake key per built-in provider, with the label the block message must use. */
export const FAKE_KEYS = [
  { provider: 'openai', label: 'an OpenAI API key', key: p('s', 'k-') + chars(40) },
  { provider: 'openai', label: 'an OpenAI API key', key: p('s', 'k-proj-') + chars(48) },
  { provider: 'anthropic', label: 'an Anthropic API key', key: p('s', 'k-ant-api03-') + chars(60) },
  { provider: 'aws', label: 'an AWS access key ID', key: p('AK', 'IA') + 'QX'.repeat(6) + digits(4) },
  { provider: 'aws', label: 'an AWS access key ID', key: p('AS', 'IA') + 'QX'.repeat(6) + digits(4) },
  { provider: 'github', label: 'a GitHub token', key: p('gh', 'p_') + chars(36) },
  { provider: 'github', label: 'a GitHub token', key: p('github', '_pat_') + chars(30) },
  { provider: 'google', label: 'a Google API key', key: p('AI', 'za') + chars(35) },
  { provider: 'stripe', label: 'a Stripe secret key', key: p('sk', '_live_') + chars(24) },
  { provider: 'stripe', label: 'a Stripe secret key', key: p('rk', '_test_') + chars(24) },
  { provider: 'slack', label: 'a Slack token', key: p('xo', 'xb-') + digits(12) + '-' + chars(24) },
] as const;

export const labelledKey = (): string => `${p('api', '_key')} = ${chars(20)}`;
export const hardCodedPassword = (): string => `${p('pass', 'word')}: "${chars(16)}"`;

export const hookInput = (prompt: string): string =>
  JSON.stringify({
    session_id: 'test-session',
    transcript_path: '/dev/null',
    cwd: '/tmp',
    permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  });

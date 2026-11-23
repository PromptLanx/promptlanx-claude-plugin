// Adapted from the PromptLanx detection engine. See NOTICE.

import type { RegexDetectorSpec } from './types.ts';

/**
 * Configurable API-key detection.
 *
 * Users choose which built-in key formats to look for and may add their own key formats. A
 * custom format is a literal prefix plus a length range, never a free-form regular
 * expression: the pattern is assembled here from escaped text and bounded, non-nested
 * quantifiers, so no configuration can make detection slow.
 *
 * The default settings rebuild exactly the pattern in `spec/api-key.json` (a test enforces this).
 */

/** Characters allowed in a key body. */
const BODY = '[A-Za-z0-9_\\-]';
/** A match must not be glued to a longer word on either side. */
const START = '(?<![\\p{L}\\p{N}_\\-])';
const END = '(?![\\p{L}\\p{N}])';
/** Real keys contain an unbroken random run with a digit; prose and URL slugs do not. */
const RANDOM_LOOKING = '(?=[A-Za-z0-9_\\-]{0,60}[A-Za-z0-9]{16})(?=[A-Za-z0-9_\\-]{0,199}[0-9])';

const bounded = (body: string): string => `${START}${body}${END}`;

export const KEY_PROVIDERS = [
  {
    id: 'labelled',
    label: 'Labelled keys in code or config',
    example: 'api_key = …',
    source: "(?<![\\p{L}\\p{N}])(?:api[_-]?key|apikey)\\s*[:=]\\s*['\"]?[\\p{L}\\p{N}_\\-]{16,}['\"]?",
  },
  {
    id: 'openai',
    label: 'OpenAI',
    example: 'sk-… / sk-proj-…',
    source: bounded(`sk-(?!ant-)${RANDOM_LOOKING}${BODY}{20,200}`),
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    example: 'sk-ant-…',
    source: bounded(`sk-ant-${RANDOM_LOOKING}${BODY}{20,200}`),
  },
  {
    id: 'aws',
    label: 'AWS access key IDs',
    example: 'AKIA…',
    source: bounded('(?:AKIA|ASIA)(?=[A-Z0-9]{0,15}[0-9])[A-Z0-9]{16}'),
  },
  {
    id: 'github',
    label: 'GitHub tokens',
    example: 'ghp_… / github_pat_…',
    source: bounded('(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})'),
  },
  {
    id: 'google',
    label: 'Google API keys',
    example: 'AIza…',
    source: bounded(`AIza${BODY}{35}`),
  },
  {
    id: 'stripe',
    label: 'Stripe secret keys',
    example: 'sk_live_… / rk_live_…',
    source: bounded('(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,200}'),
  },
  {
    id: 'slack',
    label: 'Slack tokens',
    example: 'xoxb-…',
    source: bounded('xox[abposr]-[A-Za-z0-9\\-]{10,200}'),
  },
] as const;

export type KeyProviderId = (typeof KEY_PROVIDERS)[number]['id'];
export const KEY_PROVIDER_IDS: readonly KeyProviderId[] = KEY_PROVIDERS.map((p) => p.id);

export interface CustomKeyFormat {
  /** A display name; never matched against. */
  readonly name: string;
  /** Literal text every key of this format starts with, e.g. `acme_live_`. */
  readonly prefix: string;
  /** Length of the part after the prefix. */
  readonly min_length: number;
  readonly max_length: number;
}

export interface KeyDetectionSettings {
  readonly providers: readonly KeyProviderId[];
  readonly custom: readonly CustomKeyFormat[];
}

export const DEFAULT_KEY_DETECTION: KeyDetectionSettings = {
  providers: KEY_PROVIDER_IDS,
  custom: [],
};

export const CUSTOM_KEY_LIMITS = {
  maxFormats: 20,
  nameMax: 60,
  prefixMin: 3,
  prefixMax: 40,
  /** Prefixes are plain text from this set, so they never carry regex syntax of their own. */
  prefixPattern: /^[A-Za-z0-9_\-.]+$/,
  lengthMin: 8,
  lengthMax: 256,
} as const;

export type KeyDetectionValidation =
  | { readonly ok: true; readonly value: KeyDetectionSettings }
  | { readonly ok: false; readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates untrusted settings.
 * Error messages never repeat the submitted values. Normalises as it goes: providers are de-duplicated into canonical order, text is trimmed.
 */
export function validateKeyDetectionSettings(raw: unknown): KeyDetectionValidation {
  if (!isRecord(raw)) return { ok: false, error: 'Settings must be an object.' };
  const { providers, custom } = raw;
  if (!Array.isArray(providers) || !providers.every((p) => typeof p === 'string')) {
    return { ok: false, error: 'providers must be a list of provider IDs.' };
  }
  const unknown = providers.filter((p) => !KEY_PROVIDER_IDS.includes(p as KeyProviderId));
  if (unknown.length > 0) return { ok: false, error: 'providers contains an unknown provider ID.' };
  if (!Array.isArray(custom)) return { ok: false, error: 'custom must be a list.' };
  if (custom.length > CUSTOM_KEY_LIMITS.maxFormats) {
    return { ok: false, error: `At most ${CUSTOM_KEY_LIMITS.maxFormats} custom key formats are allowed.` };
  }

  const formats: CustomKeyFormat[] = [];
  const seen = new Set<string>();
  for (const [index, item] of custom.entries()) {
    const at = `Custom key format ${index + 1}`;
    if (!isRecord(item)) return { ok: false, error: `${at} is not valid.` };
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const prefix = typeof item.prefix === 'string' ? item.prefix.trim() : '';
    const { min_length: min, max_length: max } = item;
    if (name.length < 1 || name.length > CUSTOM_KEY_LIMITS.nameMax) {
      return { ok: false, error: `${at}: the name must be 1 to ${CUSTOM_KEY_LIMITS.nameMax} characters.` };
    }
    if (prefix.length < CUSTOM_KEY_LIMITS.prefixMin || prefix.length > CUSTOM_KEY_LIMITS.prefixMax ||
      !CUSTOM_KEY_LIMITS.prefixPattern.test(prefix)) {
      return {
        ok: false,
        error: `${at}: the prefix must be ${CUSTOM_KEY_LIMITS.prefixMin} to ${CUSTOM_KEY_LIMITS.prefixMax} letters, digits, or the characters _ - .`,
      };
    }
    if (typeof min !== 'number' || typeof max !== 'number' || !Number.isInteger(min) || !Number.isInteger(max) ||
      min < CUSTOM_KEY_LIMITS.lengthMin || max > CUSTOM_KEY_LIMITS.lengthMax || min > max) {
      return {
        ok: false,
        error: `${at}: the length after the prefix must be whole numbers between ${CUSTOM_KEY_LIMITS.lengthMin} and ${CUSTOM_KEY_LIMITS.lengthMax}, minimum no larger than maximum.`,
      };
    }
    const key = prefix.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `${at}: another format already uses this prefix.` };
    seen.add(key);
    formats.push({ name, prefix, min_length: min, max_length: max });
  }

  return {
    ok: true,
    value: {
      providers: KEY_PROVIDER_IDS.filter((id) => providers.includes(id)),
      custom: formats,
    },
  };
}

const escapeLiteral = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** The regex source for one custom format. */
export function customKeySource(format: CustomKeyFormat): string {
  return bounded(`${escapeLiteral(format.prefix)}${BODY}{${format.min_length},${format.max_length}}`);
}

/** Never matches anything; used when every key format is switched off. */
const MATCH_NOTHING = '(?!)';

/** The API-key detector spec for these settings, built on the canonical spec's metadata. */
export function buildApiKeyDetectorSpec(
  base: RegexDetectorSpec,
  settings: KeyDetectionSettings,
): RegexDetectorSpec {
  const sources = [
    ...KEY_PROVIDERS.filter((p) => settings.providers.includes(p.id)).map((p) => p.source),
    ...settings.custom.map(customKeySource),
  ];
  const pattern = sources.length === 0 ? MATCH_NOTHING : sources.map((s) => `(?:${s})`).join('|');
  return { ...base, pattern };
}

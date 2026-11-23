import { customKeySource, KEY_PROVIDERS } from './engine/key-detection.ts';
import type { KeyDetectionSettings, KeyProviderId } from './engine/key-detection.ts';
import { createRegexDetector } from './engine/regex-detector.ts';
import { apiKeyDetectorSpec, secretDetectorSpec } from './engine/specs.ts';
import type { Detector } from './engine/types.ts';

/**
 * What the hook reports: which kind of thing was found and where. Deliberately has no field
 * that could carry the matched text.
 */
export interface Finding {
  /** Human-readable kind, e.g. "an OpenAI API key". */
  readonly label: string;
  /** UTF-16 offset of the first character. */
  readonly start: number;
  readonly end: number;
}

interface NamedDetector {
  readonly label: string;
  readonly detector: Detector;
}

const PROVIDER_LABELS: Record<KeyProviderId, string> = {
  labelled: 'a labelled API key (api_key = …)',
  openai: 'an OpenAI API key',
  anthropic: 'an Anthropic API key',
  aws: 'an AWS access key ID',
  github: 'a GitHub token',
  google: 'a Google API key',
  stripe: 'a Stripe secret key',
  slack: 'a Slack token',
};

/**
 * The engine's combined api_key pattern says *that* a key was found, not *which* one. To name
 * the provider in the block message, each enabled format runs as its own detector, built from
 * the same sources `buildApiKeyDetectorSpec` joins together.
 *
 * Order matters: specific formats come first, then the generic "labelled" and "secret"
 * detectors, so `api_key = sk-…` is reported once, as an OpenAI key.
 */
export function buildDetectors(settings: KeyDetectionSettings): readonly NamedDetector[] {
  const specific: NamedDetector[] = [];
  const generic: NamedDetector[] = [];

  for (const provider of KEY_PROVIDERS) {
    if (!settings.providers.includes(provider.id)) continue;
    const detector = createRegexDetector({
      ...apiKeyDetectorSpec,
      id: `api_key.${provider.id}`,
      pattern: provider.source,
    });
    (provider.id === 'labelled' ? generic : specific).push({ label: PROVIDER_LABELS[provider.id], detector });
  }

  settings.custom.forEach((format, index) => {
    specific.push({
      label: `a key in your custom format "${format.prefix}"`,
      detector: createRegexDetector({
        ...apiKeyDetectorSpec,
        id: `api_key.custom_${index + 1}`,
        pattern: customKeySource(format),
      }),
    });
  });

  generic.push({ label: 'a hard-coded password, secret or token', detector: createRegexDetector(secretDetectorSpec) });

  return [...specific, ...generic];
}

/** Chunk size stays well under the engine's 200,000-character per-call limit. */
export const CHUNK_SIZE = 100_000;
/** Overlap so a key straddling a chunk boundary is still seen whole in one chunk. */
export const CHUNK_OVERLAP = 1_024;
/** Beyond this the prompt is not scanned at all (see README, "Limitations"). */
export const MAX_SCAN_LENGTH = 5_000_000;

export class PromptTooLargeError extends Error {
  public readonly code = 'prompt_too_large';
  public constructor() {
    super(`Prompt is longer than ${MAX_SCAN_LENGTH} characters and was not scanned.`);
    this.name = 'PromptTooLargeError';
  }
}

/**
 * Runs every detector over the text and returns non-overlapping findings in text order.
 * Engine errors (time budget, input size) are not caught here: the caller decides.
 */
export function scan(detectors: readonly NamedDetector[], text: string): readonly Finding[] {
  if (text.length > MAX_SCAN_LENGTH) throw new PromptTooLargeError();

  const kept: Finding[] = [];
  const overlaps = (start: number, end: number): boolean => kept.some((f) => start < f.end && f.start < end);

  for (const { label, detector } of detectors) {
    for (let offset = 0; offset < text.length || offset === 0; offset += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunk = text.slice(offset, offset + CHUNK_SIZE);
      for (const detection of detector.detect(chunk)) {
        const start = offset + detection.start;
        const end = offset + detection.end;
        if (!overlaps(start, end)) kept.push({ label, start, end });
      }
      if (offset + CHUNK_SIZE >= text.length) break;
    }
  }

  return kept.sort((a, b) => a.start - b.start);
}

/** 1-based line and column of an offset, for the block message. */
export function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) {
    line += 1;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

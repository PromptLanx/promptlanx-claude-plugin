// Adapted from the PromptLanx detection engine. See NOTICE.

import { InvalidDetectorSpecError, UnknownDetectorError } from './errors.ts';
import { DETECTION_TYPES, DETECTOR_ENGINES, SEVERITIES, SUPPORTED_SPEC_VERSIONS } from './types.ts';
import type { DetectionType, DetectorSpec, RegexDetectorSpec, Severity } from './types.ts';

/**
 * Turns spec JSON into a validated {@link DetectorSpec}, so the shipped JSON and the types
 * cannot drift: a spec that stops matching the contract fails at load time instead of
 * producing a detector that quietly finds nothing.
 */
export function parseDetectorSpec(input: unknown): DetectorSpec {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidDetectorSpecError('Detector spec must be a JSON object.');
  }

  const raw = input as Record<string, unknown>;
  const id = requireNonEmptyString(raw, 'id');

  const specVersion = requireInteger(raw, 'spec_version', id);
  if (!SUPPORTED_SPEC_VERSIONS.includes(specVersion)) {
    throw new UnknownDetectorError(
      `Detector "${id}" declares spec_version ${String(specVersion)}, which this build cannot execute ` +
        `(supported: ${SUPPORTED_SPEC_VERSIONS.join(', ')}).`,
    );
  }

  const type = raw['type'];
  if (!isDetectionType(type)) {
    throw new UnknownDetectorError(`Detector "${id}" declares unknown detection type ${JSON.stringify(type)}.`);
  }

  const engine = raw['engine'];
  if (typeof engine !== 'string' || !(DETECTOR_ENGINES as readonly string[]).includes(engine)) {
    throw new UnknownDetectorError(
      `Detector "${id}" declares unknown engine ${JSON.stringify(engine)} (supported: ${DETECTOR_ENGINES.join(', ')}).`,
    );
  }

  const name = requireNonEmptyString(raw, 'name');

  const defaultSeverity = raw['default_severity'];
  if (!isSeverity(defaultSeverity)) {
    throw new InvalidDetectorSpecError(
      `Detector "${id}" declares invalid default_severity ${JSON.stringify(defaultSeverity)}.`,
    );
  }

  const confidence = raw['confidence'];
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
    throw new InvalidDetectorSpecError(
      `Detector "${id}" declares confidence ${JSON.stringify(confidence)}; expected a number in (0, 1].`,
    );
  }

  const spec: RegexDetectorSpec = {
    id,
    spec_version: specVersion,
    type,
    name,
    default_severity: defaultSeverity,
    confidence,
    engine: 'regex',
    pattern: requireNonEmptyString(raw, 'pattern'),
    flags: requireFlags(raw, id),
    time_budget_ms: requirePositiveInteger(raw, 'time_budget_ms', id),
    max_input_length: requirePositiveInteger(raw, 'max_input_length', id),
  };

  return spec;
}

export function isDetectionType(value: unknown): value is DetectionType {
  return typeof value === 'string' && (DETECTION_TYPES as readonly string[]).includes(value);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

function requireNonEmptyString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidDetectorSpecError(`Detector spec field "${key}" must be a non-empty string.`);
  }
  return value;
}

function requireInteger(raw: Record<string, unknown>, key: string, id: string): number {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidDetectorSpecError(`Detector "${id}" field "${key}" must be an integer.`);
  }
  return value;
}

function requirePositiveInteger(raw: Record<string, unknown>, key: string, id: string): number {
  const value = requireInteger(raw, key, id);
  if (value <= 0) {
    throw new InvalidDetectorSpecError(`Detector "${id}" field "${key}" must be greater than zero.`);
  }
  return value;
}

/**
 * The `g` flag is not cosmetic: the runtime iterates with `lastIndex`, so a non-global
 * pattern would loop forever on the first match. Rejecting it turns a hang into a load error.
 */
function requireFlags(raw: Record<string, unknown>, id: string): string {
  const flags = raw['flags'];
  if (typeof flags !== 'string') {
    throw new InvalidDetectorSpecError(`Detector "${id}" field "flags" must be a string.`);
  }
  if (!flags.includes('g')) {
    throw new InvalidDetectorSpecError(`Detector "${id}" must declare the "g" flag; the runtime scans for every match.`);
  }
  return flags;
}

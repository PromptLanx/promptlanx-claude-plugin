// Adapted from the PromptLanx detection engine. See NOTICE.

export const DETECTION_TYPES = ['api_key', 'secret'] as const;
export type DetectionType = (typeof DETECTION_TYPES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * What a detector found. Offsets are UTF-16 code-unit indices, usable with
 * `String.prototype.slice`. They let a caller say *where* something was found without
 * repeating it.
 */
export interface Detection {
  readonly type: DetectionType;
  readonly severity: Severity;
  /** Calibrated 0..1. */
  readonly confidence: number;
  /** Inclusive start offset. */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
}

/** Injectable clock, so the time-budget bail-out is testable deterministically. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export interface Detector {
  readonly id: string;
  readonly type: DetectionType;
  readonly specVersion: number;
  /** Throws rather than returning a partial result; see errors.ts. */
  detect(text: string): readonly Detection[];
}

export interface RegexDetectorSpec {
  readonly id: string;
  readonly spec_version: number;
  readonly type: DetectionType;
  readonly name: string;
  readonly default_severity: Severity;
  readonly confidence: number;
  readonly engine: 'regex';
  readonly pattern: string;
  readonly flags: string;
  /** Wall-clock bail-out budget. */
  readonly time_budget_ms: number;
  readonly max_input_length: number;
}

export type DetectorSpec = RegexDetectorSpec;

export const DETECTOR_ENGINES = ['regex'] as const;

/** The spec versions this build can execute. Anything else must fail to load. */
export const SUPPORTED_SPEC_VERSIONS: readonly number[] = [1, 2];

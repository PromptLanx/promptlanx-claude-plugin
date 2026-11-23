// Adapted from the PromptLanx detection engine. See NOTICE.

import { DetectionBudgetExceededError, InputTooLargeError, InvalidDetectorSpecError } from './errors.ts';
import { systemClock } from './types.ts';
import type { Clock, Detection, Detector, RegexDetectorSpec } from './types.ts';

/**
 * Compiles a spec-driven regex detector. The pattern is compiled once, at creation, so a
 * malformed spec fails at load time rather than on the first prompt.
 *
 * ## On the time budget
 *
 * The budget is checked *between* matches. A single `exec()` call cannot be interrupted from
 * JavaScript, so this bounds a pattern that is slow across many matches, not one that
 * backtracks catastrophically inside one. The real defences are that every shipped pattern
 * uses bounded, non-nested quantifiers, that custom formats are assembled from escaped
 * literals (never free-form regex), and that `max_input_length` caps the work per call.
 */
export function createRegexDetector(spec: RegexDetectorSpec, clock: Clock = systemClock): Detector {
  const compiled = compile(spec);

  return {
    id: spec.id,
    type: spec.type,
    specVersion: spec.spec_version,

    detect(text: string): readonly Detection[] {
      if (text.length > spec.max_input_length) {
        // Not inspected is not the same as clean.
        throw new InputTooLargeError(spec.id, spec.max_input_length, text.length);
      }

      const detections: Detection[] = [];
      const startedAt = clock.now();

      // A fresh RegExp per call: `lastIndex` is mutable state.
      const pattern = new RegExp(compiled.source, compiled.flags);

      let match: RegExpExecArray | null;
      while (true) {
        const elapsed = clock.now() - startedAt;
        if (elapsed > spec.time_budget_ms) {
          throw new DetectionBudgetExceededError(spec.id, spec.time_budget_ms, elapsed);
        }

        match = pattern.exec(text);
        if (match === null) {
          break;
        }

        detections.push({
          type: spec.type,
          severity: spec.default_severity,
          confidence: spec.confidence,
          start: match.index,
          end: match.index + match[0].length,
        });

        // A zero-length match would leave lastIndex unchanged and spin forever.
        if (match[0].length === 0) {
          pattern.lastIndex += 1;
        }
      }

      return detections;
    },
  };
}

function compile(spec: RegexDetectorSpec): RegExp {
  try {
    return new RegExp(spec.pattern, spec.flags);
  } catch (cause) {
    throw new InvalidDetectorSpecError(
      `Detector "${spec.id}" has a pattern that does not compile: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

// Adapted from the PromptLanx detection engine. See NOTICE.

/**
 * Every error here means the same thing to a caller: **the engine could not reach a
 * verdict.** None of the messages contain any of the scanned text.
 */
export abstract class DetectionEngineError extends Error {
  /** Machine-readable discriminator, so callers switch on this and not on the message. */
  public abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A detector exceeded its wall-clock budget and was abandoned. A bail-out is not a clean
 * result; the caller decides what to do with it.
 */
export class DetectionBudgetExceededError extends DetectionEngineError {
  public override readonly code = 'detection_budget_exceeded';
  public readonly detectorId: string;
  public readonly budgetMs: number;
  public readonly elapsedMs: number;

  public constructor(detectorId: string, budgetMs: number, elapsedMs: number) {
    super(
      `Detector "${detectorId}" exceeded its ${String(budgetMs)}ms budget (${String(elapsedMs)}ms elapsed) and was abandoned.`,
    );
    this.detectorId = detectorId;
    this.budgetMs = budgetMs;
    this.elapsedMs = elapsedMs;
  }
}

/** The input exceeded the detector's maximum length, so it was not inspected. */
export class InputTooLargeError extends DetectionEngineError {
  public override readonly code = 'input_too_large';
  public readonly detectorId: string;
  public readonly maxInputLength: number;
  public readonly actualLength: number;

  public constructor(detectorId: string, maxInputLength: number, actualLength: number) {
    super(
      `Input of ${String(actualLength)} characters exceeds the ${String(maxInputLength)}-character limit for detector "${detectorId}"; it was not inspected.`,
    );
    this.detectorId = detectorId;
    this.maxInputLength = maxInputLength;
    this.actualLength = actualLength;
  }
}

/** A detector spec declares something this build does not understand. */
export class UnknownDetectorError extends DetectionEngineError {
  public override readonly code = 'unknown_detector';

  public constructor(message: string) {
    super(message);
  }
}

/** A spec that cannot be compiled into a working detector. */
export class InvalidDetectorSpecError extends DetectionEngineError {
  public override readonly code = 'invalid_detector_spec';

  public constructor(message: string) {
    super(message);
  }
}

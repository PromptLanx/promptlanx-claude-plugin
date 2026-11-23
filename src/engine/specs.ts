// Adapted from the PromptLanx detection engine. See NOTICE.

import apiKeySpecJson from './spec/api-key.json' with { type: 'json' };
import secretSpecJson from './spec/secret.json' with { type: 'json' };

import { parseDetectorSpec } from './spec.ts';
import type { DetectorSpec } from './types.ts';

/** Canonical specs, validated at load time rather than cast. */
export const apiKeyDetectorSpec: DetectorSpec = parseDetectorSpec(apiKeySpecJson);
export const secretDetectorSpec: DetectorSpec = parseDetectorSpec(secretSpecJson);

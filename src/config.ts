import { DEFAULT_KEY_DETECTION, KEY_PROVIDER_IDS, validateKeyDetectionSettings } from './engine/key-detection.ts';
import type { KeyDetectionSettings } from './engine/key-detection.ts';

/**
 * Plugin options set by the user in Claude Code (`userConfig` in plugin.json). Claude Code
 * exports each one to the hook process as `CLAUDE_PLUGIN_OPTION_<KEY>`.
 */
export const ENV_DISABLED_PROVIDERS = 'CLAUDE_PLUGIN_OPTION_DISABLED_PROVIDERS';
export const ENV_CUSTOM_KEY_FORMATS = 'CLAUDE_PLUGIN_OPTION_CUSTOM_KEY_FORMATS';

export interface LoadedConfig {
  readonly settings: KeyDetectionSettings;
  /** Set when the configuration was invalid and the defaults were used instead. */
  readonly warning: string | null;
}

/**
 * A list option may arrive as a JSON array or as text separated by commas, spaces or
 * newlines. None of the allowed values can contain those separators, so both are safe.
 */
export function parseList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const text = raw.trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new ConfigError('must be a list of text values');
    }
    return parsed.flatMap((item) => parseList(item));
  }
  return text.split(/[\s,]+/).filter((item) => item !== '');
}

class ConfigError extends Error {}

/** `prefix:min-max`, e.g. `acme_live_:24-40`. The engine validates the parts. */
const CUSTOM_ENTRY = /^([^:]*):(\d{1,4})-(\d{1,4})$/;

/**
 * Reads the plugin options and validates them with the engine's own
 * `validateKeyDetectionSettings`. Invalid configuration never switches detection off: the
 * full default set is used and a warning is returned. Messages never repeat the values.
 */
export function loadConfig(env: NodeJS.ProcessEnv): LoadedConfig {
  try {
    const disabled = parseList(env[ENV_DISABLED_PROVIDERS]).map((id) => id.toLowerCase());
    const unknown = disabled.filter((id) => !(KEY_PROVIDER_IDS as readonly string[]).includes(id));
    if (unknown.length > 0) {
      throw new ConfigError(
        `disabled_providers contains an unknown provider ID (allowed: ${KEY_PROVIDER_IDS.join(', ')})`,
      );
    }

    const custom = parseList(env[ENV_CUSTOM_KEY_FORMATS]).map((entry, index) => {
      const match = CUSTOM_ENTRY.exec(entry);
      if (match === null) {
        throw new ConfigError(`custom_key_formats entry ${index + 1} must look like prefix:min-max`);
      }
      const [, prefix = '', min = '', max = ''] = match;
      return { name: prefix, prefix, min_length: Number(min), max_length: Number(max) };
    });

    const result = validateKeyDetectionSettings({
      providers: KEY_PROVIDER_IDS.filter((id) => !disabled.includes(id)),
      custom,
    });
    if (!result.ok) throw new ConfigError(result.error);
    return { settings: result.value, warning: null };
  } catch (error) {
    const reason = error instanceof ConfigError ? error.message : 'the settings could not be read';
    return {
      settings: DEFAULT_KEY_DETECTION,
      warning: `PromptLanx: plugin settings ignored (${reason}); checking with the default settings.`,
    };
  }
}

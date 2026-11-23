# PromptLanx for Claude Code

A Claude Code plugin that blocks prompts containing API keys, access tokens and hard-coded
passwords before they are sent to Claude. The check runs locally, with no network calls, no
storage and no logging of prompt text.

**User documentation is in [plugins/promptlanx/README.md](plugins/promptlanx/README.md)**:
what it detects, what it never does, installation, configuration and limitations.

Learn more at [promptlanx.com](https://promptlanx.com).

## Repository layout

```
.claude-plugin/marketplace.json   marketplace listing the plugin below
plugins/promptlanx/               the plugin (this folder is what Claude Code loads)
  .claude-plugin/plugin.json      manifest and user settings
  hooks/hooks.json                UserPromptSubmit hook
  dist/promptlanx-hook.js         bundled hook script (generated, committed, not minified)
src/                              TypeScript source of the hook
  engine/                         detection engine (see plugins/promptlanx/NOTICE)
  scan.ts  config.ts  hook.ts     per-provider scan, settings, hook input/output
test/                             unit, contract, false-positive and timing tests
scripts/                          build, bundle check, end-to-end check
```

The build tooling (`package.json`, lockfile) stays at the repository root on purpose, so the
plugin folder contains only what runs.

## Development

Requires Node.js 22.18 or later (the tests run TypeScript directly).

```bash
npm ci
```

```bash
npm run check
```

`npm run check` type-checks, rebuilds `plugins/promptlanx/dist/`, runs every test and fails if
the committed bundle differs from a fresh build. Commit the rebuilt bundle with any source
change.

Test keys are assembled at runtime from harmless pieces, so the repository contains no
key-shaped strings for secret scanners to flag.

### End-to-end check

`scripts/e2e.sh` runs the real Claude Code CLI with the plugin loaded via `--plugin-dir`. It
checks that a prompt with a fake key is blocked without reaching Claude, that a clean prompt is
allowed by the hook, and that the key never appears in the output.

```bash
scripts/e2e.sh
```

Set `CLAUDE_BIN` if `claude` is not on your `PATH`.

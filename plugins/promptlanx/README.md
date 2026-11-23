# PromptLanx for Claude Code

PromptLanx stops API keys, access tokens and hard-coded passwords from being sent to Claude by
accident. Every prompt you submit in Claude Code is checked on your own machine first. If it
contains a secret, the prompt is blocked before it leaves your computer and you see a short
message saying what was found and where, for example:

```
PromptLanx blocked this prompt: an OpenAI API key was found at line 2, column 19. Remove it and send again.
```

The message names the kind of secret and its position only. It never repeats the secret or
any other part of your prompt.

PromptLanx for Claude Code is part of [PromptLanx](https://promptlanx.com), an AI
data-protection product.

## What it detects

| Detector | Example of what is blocked |
| --- | --- |
| `labelled` | `api_key = …`, `apiKey: "…"`, `api-key=…` with a value of 16+ characters |
| `openai` | `sk-…`, `sk-proj-…` |
| `anthropic` | `sk-ant-…` |
| `aws` | AWS access key IDs (`AKIA…`, `ASIA…`) |
| `github` | `ghp_…`, `gho_…`, `ghu_…`, `ghs_…`, `ghr_…`, `github_pat_…` |
| `google` | Google API keys (`AIza…`) |
| `stripe` | `sk_live_…`, `sk_test_…`, `rk_live_…`, `rk_test_…` |
| `slack` | `xoxb-…`, `xoxp-…` and the other `xox?-` tokens |
| passwords and tokens | `password = …`, `secret: …`, `token=…` with a value of 12+ characters |
| your own formats | any prefix you add (see [Configuration](#configuration)) |

Provider keys must look random (an unbroken run of letters and digits, including a digit), so
ordinary text such as `sk-learn`, URL slugs like `sk-reference-guide-for-new-users`, or
`api_key = os.environ["API_KEY"]` is not blocked.

## What it never does

- **No network.** The hook makes no network calls of any kind. Detection runs entirely in a
  local `node` process. The plugin declares no network hosts.
- **No storage.** It writes no files: no logs, no cache, no copies of prompts.
- **No telemetry.** It collects and sends nothing.
- **No echo.** Block messages and warnings contain only detector names, line and column
  numbers, and fixed text. They never contain your prompt or the matched secret.

The hook is one readable JavaScript file, [`dist/promptlanx-hook.js`](dist/promptlanx-hook.js),
with no dependencies. It is built from the TypeScript source in this repository's `src/` folder.

## Install

Requires Claude Code and Node.js 18 or later on your `PATH`.

From the PromptLanx marketplace in this repository:

```
/plugin marketplace add promptlanx/promptlanx-claude-plugin
/plugin install promptlanx@promptlanx
```

To try it without installing, start Claude Code with the plugin folder:

```bash
claude --plugin-dir ./plugins/promptlanx
```

## Configuration

Both settings are optional. Set them when Claude Code asks during install, or later with
`claude plugin configure promptlanx`.

| Setting | What it does | Example |
| --- | --- | --- |
| `disabled_providers` | Built-in key formats **not** to block, separated by commas: `labelled`, `openai`, `anthropic`, `aws`, `github`, `google`, `stripe`, `slack`. Passwords and tokens are always checked. | `slack, google` |
| `custom_key_formats` | Your own key formats, separated by commas, each written `prefix:min-max`. A key matches when it starts with the prefix and is followed by `min` to `max` letters, digits, `_` or `-`. | `acme_live_:24-40` |

Rules for custom formats (the same as the PromptLanx dashboard):

- the prefix is 3 to 40 characters from `A-Z a-z 0-9 _ . -`, treated as plain text;
- `min` and `max` are whole numbers from 8 to 256, with `min` no larger than `max`;
- at most 20 formats, and no two with the same prefix (ignoring case).

Free-form regular expressions are deliberately not supported, so no setting can make the
check slow.

If a setting is invalid, PromptLanx does **not** switch itself off. It ignores the settings,
checks with the full default set and shows a one-line warning saying which rule was broken.

## How it behaves when something goes wrong

PromptLanx **fails open**: if the hook itself cannot run its check, your prompt is sent
unchecked and Claude Code shows a one-line warning, for example:

```
PromptLanx could not check this prompt (internal_error); it was sent without a check.
```

This is a deliberate choice: a bug in this plugin should never lock you out of Claude Code.
It applies to unexpected errors, to a check that runs past its time budget, and to prompts
longer than 5,000,000 characters. If Node.js is missing, Claude Code reports a non-blocking
hook error and also sends the prompt. The warning tells you the prompt was not checked, so you
can decide what to do.

## Performance

A 100 KB prompt is scanned in a few milliseconds, including hostile inputs built to make
regular expressions slow. All patterns use bounded, non-nested quantifiers. Most of each hook
run (about 0.1 s in total) is Node.js starting up.

## Limitations

- **Only prompts you submit are checked.** PromptLanx checks the text you send to Claude in
  Claude Code. It does not see files, command output, web pages or anything else Claude reads
  by itself while it works. Keep secrets out of files in your project, or use Claude Code's
  permission settings to stop Claude from reading them.
- **Claude Code keeps its own local record.** A blocked prompt is not sent to Claude, but
  Claude Code may still record what you typed in its own local session transcript and prompt
  history on your computer (under `~/.claude/`). PromptLanx does not write those files and
  cannot remove entries from them.
- **Pattern-based detection.** Keys are recognised by their published formats. A secret with
  no recognisable format, or written without a label like `password =`, is not detected.
  Unusual but harmless text can occasionally look like a key; switch that detector off if it
  gets in your way.
- **Personal data** such as email addresses and phone numbers is not checked in this version.
- Very old Claude Code versions that do not support `suppressOriginalPrompt` may show your
  prompt again under the block message. It is still not sent to Claude.

## License

See [LICENSE](LICENSE). Third-party and origin notices are in [NOTICE](NOTICE).

## Learn more

[promptlanx.com](https://promptlanx.com)

#!/usr/bin/env bash
# End-to-end check: runs the real Claude Code CLI with the plugin loaded via --plugin-dir.
# 1. A prompt with a fake key must be blocked before any model call (0 turns, 0 tokens),
#    and the key must not appear in the output.
# 2. A clean prompt must be allowed by the hook (the debug log shows the hook returned {}).
# The fake key is assembled at runtime, so this file holds no key-shaped literal.
set -euo pipefail

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/plugins/promptlanx"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

KEY="sk-proj-$(printf 'Ab3x%.0s' $(seq 12))"
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "Claude Code: $("$CLAUDE_BIN" --version)"
"$CLAUDE_BIN" plugin validate "$PLUGIN" >/dev/null || fail "plugin validate"

echo "1. Prompt with a fake OpenAI key"
"$CLAUDE_BIN" -p --plugin-dir "$PLUGIN" --output-format json \
  "Why does this fail? client = OpenAI(api_key=\"$KEY\")" > block.json 2> block.err || true
grep -q -- "$KEY" block.json block.err && fail "the key was echoed in the output"
node -e '
  const r = JSON.parse(require("fs").readFileSync("block.json", "utf8"));
  const ok = r.num_turns === 0 && r.usage.input_tokens === 0 && /PromptLanx blocked this prompt: an OpenAI API key/.test(r.result);
  console.log("   result:   " + JSON.stringify(r.result));
  console.log("   turns: " + r.num_turns + ", input tokens: " + r.usage.input_tokens + ", cost: $" + r.total_cost_usd);
  process.exit(ok ? 0 : 1);
' || fail "prompt was not blocked"
echo "   PASS: blocked before reaching Claude; key not echoed"

echo "2. Clean prompt"
"$CLAUDE_BIN" -p --plugin-dir "$PLUGIN" --debug hooks --debug-file "$WORK/clean.log" --output-format json \
  "Reply with exactly the word: pong" > clean.json 2>/dev/null || true
grep -q 'promptlanx.sh.*finished with status 0' clean.log || fail "hook did not run"
grep -q 'Hook UserPromptSubmit (UserPromptSubmit) success:\\n{}' clean.log || fail "hook did not allow the clean prompt"
node -e '
  const r = JSON.parse(require("fs").readFileSync("clean.json", "utf8"));
  console.log("   result:   " + JSON.stringify(String(r.result).slice(0, 80)));
'
echo "   PASS: hook allowed the prompt (a 'Not logged in' result means the CLI itself needs /login)"

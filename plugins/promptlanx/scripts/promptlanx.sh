#!/bin/sh
# PromptLanx UserPromptSubmit hook launcher.
# Runs the bundled, dependency-free checker with the local Node.js. Nothing is downloaded or
# installed. If Node.js is missing, Claude Code reports a non-blocking hook error and the
# prompt is sent unchecked (fail open), as documented in README.md.
exec node "$CLAUDE_PLUGIN_ROOT/dist/promptlanx-hook.js"

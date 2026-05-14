#!/usr/bin/env bash
# Block `git add .env*` (except .env.example) — security hardening (Phase 4.X.2)
# Triggered by PreToolUse on Bash. Reads command from CLAUDE_COMMAND env var.

cmd="${CLAUDE_COMMAND:-}"

# Only check git add commands
if ! echo "$cmd" | grep -qE '^[[:space:]]*git[[:space:]]+add[[:space:]]'; then
  exit 0
fi

# Allow .env.example
if echo "$cmd" | grep -qE '\.env\.example([[:space:]]|$)'; then
  exit 0
fi

# Block any other .env* file
if echo "$cmd" | grep -qE '\.env(\.[^[:space:]]+)?([[:space:]]|$)'; then
  echo "🚫 BLOCKED: Cannot 'git add .env*' files." >&2
  echo "   Only .env.example is allowed in the repository." >&2
  echo "   Command attempted: $cmd" >&2
  exit 1
fi

exit 0

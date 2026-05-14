#!/usr/bin/env bash
# Block destructive operations without explicit user confirmation.
# Phase 4.X.2 security hardening.

cmd="${CLAUDE_COMMAND:-}"

# Patterns blocked unless user typed them directly (Claude Code shouldn't auto-run)
patterns=(
  'rm[[:space:]]+-rf[[:space:]]+/'              # rm -rf at root
  'rm[[:space:]]+-rf[[:space:]]+~'              # rm -rf home
  'git[[:space:]]+push.*--force.*main'          # force push main
  'git[[:space:]]+push.*--force.*master'        # force push master
  'git[[:space:]]+reset[[:space:]]+--hard'      # hard reset
  'git[[:space:]]+clean[[:space:]]+-fd'         # clean force deep
  'prisma[[:space:]]+migrate[[:space:]]+reset'  # nuke DB
  'DROP[[:space:]]+TABLE'                       # SQL drop table
  'DROP[[:space:]]+DATABASE'                    # SQL drop db
  'TRUNCATE[[:space:]]+TABLE'                   # SQL truncate
)

for pattern in "${patterns[@]}"; do
  if echo "$cmd" | grep -qE "$pattern"; then
    echo "🚫 BLOCKED: Destructive command requires explicit user confirmation." >&2
    echo "   Pattern matched: $pattern" >&2
    echo "   Command: $cmd" >&2
    echo "   If you really mean this, ask user to authorize in chat first." >&2
    exit 1
  fi
done

exit 0

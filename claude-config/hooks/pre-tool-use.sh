#!/usr/bin/env bash
# PreToolUse hook — block dangerous commands regardless of --dangerously-skip-permissions
# Exit 2 = block tool (stdout shown to Claude as reason)
set -euo pipefail

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || echo "")

[ "$TOOL" != "Bash" ] && exit 0

CMD=$(printf '%s' "$INPUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || echo "")

block() { echo "BLOCKED: $1"; exit 2; }

# git push --force / -f
echo "$CMD" | grep -qE '\bgit\s+push\b.*(\-\-force|\s-f(\s|$))' && block "git push --force"
echo "$CMD" | grep -qE '\bgit\s+push\s+-f(\s|$)' && block "git push -f"

# git push --delete or colon-delete (git push origin :branch)
echo "$CMD" | grep -qE '\bgit\s+push\s+--delete\b' && block "git push --delete"
echo "$CMD" | grep -qE '\bgit\s+push\s+\S+\s+:\S+' && block "git push colon-delete refspec"

# git push to main/master (direct push without PR)
echo "$CMD" | grep -qE '\bgit\s+push\b' && \
  echo "$CMD" | grep -qE '\b(main|master)\b' && \
  ! echo "$CMD" | grep -qE '\bagent/' && \
  block "git push to main/master — use agent/* branch and open a PR"

# rm -rf on system/home paths
echo "$CMD" | grep -qE '\brm\s+(-[rRf]+\s+)*(\/\s*$|~\s*$|\$HOME)' && block "rm -rf on root/home"
echo "$CMD" | grep -qE '\brm\s+(-rf|-fr)\s+(\/etc|\/sys|\/proc|\/boot|\/dev)' && block "rm -rf system directory"

# kubectl mutations
echo "$CMD" | grep -qE '\bkubectl\s+(delete|apply|patch|edit|replace|create)\b' && block "kubectl mutation — read-only access only"

# helm destructive
echo "$CMD" | grep -qE '\bhelm\s+(uninstall|delete|rollback|upgrade)\b' && block "helm mutation"

# shell-wrapped evasion
echo "$CMD" | grep -qE '(bash|sh)\s+-[a-z]*c\s+.*(rm\s+-rf|git\s+push\s+--force|kubectl\s+delete)' && block "shell-wrapped destructive command"

exit 0

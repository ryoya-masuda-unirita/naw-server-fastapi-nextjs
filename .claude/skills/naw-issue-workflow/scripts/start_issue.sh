#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat <<'EOF' >&2
Usage:
  bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-12
  bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-12-NAW-1234
  bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh 12
EOF
  exit 1
fi

issue_arg="$1"
base_branch="${2:-develop}"

issue_number="$(printf '%s\n' "$issue_arg" | grep -Eo '[0-9]+' | head -n 1)"

if [[ -z "$issue_number" ]]; then
  echo "Could not parse issue number from '$issue_arg'." >&2
  exit 1
fi

if [[ "$issue_arg" =~ ^issue-[0-9]+(-NAW-[0-9]+)?$ ]]; then
  issue_name="$issue_arg"
else
  issue_name="issue-$issue_number"
fi

branch_name="feature/$issue_name"
script_dir="$(cd "$(dirname "$0")" && pwd)"

git fetch origin "$base_branch"
git checkout "$base_branch"
git merge --ff-only "origin/$base_branch"

if git show-ref --verify --quiet "refs/heads/$branch_name"; then
  git checkout "$branch_name"
else
  gh issue develop "$issue_number" --base "$base_branch" --name "$branch_name" --checkout
fi

bash "$script_dir/project_status_sync.sh" --issue "$issue_number" --status "In Progress"

echo "Issue #$issue_number is linked to '$branch_name' and moved to In Progress."

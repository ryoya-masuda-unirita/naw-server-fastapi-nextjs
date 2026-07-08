#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash .codex/skills/naw-pr-workflow/scripts/prepare_code_review.sh issue-45 [base-branch]
  bash .codex/skills/naw-pr-workflow/scripts/prepare_code_review.sh issue-45-NAW-1234 [base-branch]

Outputs:
  ISSUE_DIR=...
  CODE_REVIEW_MD=...
  BASE_BRANCH=...
  MERGE_BASE=...
  DIFF_COMMAND=...

Notes:
  - base-branch omitted時は、カレントブランチが feature/issue-* なら develop を既定にする
  - merge-base が取れない場合は終了する
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

issue_name="${1:-}"
if [[ -z "$issue_name" ]]; then
  echo "error: issue name is required" >&2
  usage >&2
  exit 1
fi

issue_dir="docs/${issue_name}"
if [[ ! -d "$issue_dir" ]]; then
  echo "error: issue dir not found: ${issue_dir}" >&2
  exit 1
fi

current_branch="$(git branch --show-current)"
base_branch="${2:-}"
if [[ -z "$base_branch" ]]; then
  if [[ "$current_branch" == feature/issue-* ]]; then
    base_branch="develop"
  else
    echo "error: base branch is required when current branch is not feature/issue-*" >&2
    exit 1
  fi
fi

if ! git rev-parse --verify "$base_branch" >/dev/null 2>&1; then
  if ! git rev-parse --verify "origin/$base_branch" >/dev/null 2>&1; then
    echo "error: base branch not found locally or on origin: ${base_branch}" >&2
    exit 1
  fi
  base_ref="origin/$base_branch"
else
  base_ref="$base_branch"
fi

merge_base="$(git merge-base HEAD "$base_ref" 2>/dev/null || true)"
if [[ -z "$merge_base" ]]; then
  echo "error: failed to resolve merge-base with ${base_ref}" >&2
  exit 1
fi

code_review_md="${issue_dir}/code-review.md"

printf 'ISSUE_DIR=%s\n' "$issue_dir"
printf 'CODE_REVIEW_MD=%s\n' "$code_review_md"
printf 'BASE_BRANCH=%s\n' "$base_ref"
printf 'MERGE_BASE=%s\n' "$merge_base"
printf 'DIFF_COMMAND=%q\n' "git diff ${merge_base}"

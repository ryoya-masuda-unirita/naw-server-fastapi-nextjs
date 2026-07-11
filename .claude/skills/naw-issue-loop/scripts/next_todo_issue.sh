#!/usr/bin/env bash
# GitHub Projects の Status=Todo かつ type=Issue のうち、番号が最小のものを1件返す。
# ただし frontend-port ラベル付きIssue（naw-frontend-issue-loop の対象）は除外する。
# 該当なしの場合は何も出力せず終了コード0で終わる。

set -euo pipefail

OWNER="ryoya-masuda-unirita"
PROJECT_NUMBER="3"
REPO="${GITHUB_REPOSITORY:-ryoya-masuda-unirita/naw-server-fastapi-nextjs}"

frontend_numbers_json="$(gh issue list --repo "$REPO" --label "frontend-port" --state all --json number --limit 200 --jq '[.[].number]')"

todo_json="$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
  --jq '[.items[] | select(.status=="Todo" and .content.type=="Issue") | .content.number]')"

jq -n --argjson todo "$todo_json" --argjson frontend "$frontend_numbers_json" \
  '($todo - $frontend) | sort | .[0] // empty'

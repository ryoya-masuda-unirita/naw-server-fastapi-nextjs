#!/usr/bin/env bash
# GitHub Projects の Status=Todo かつ frontend-port ラベルが付いた Issue のうち、番号が最小のものを1件返す。
# 該当なしの場合は何も出力せず終了コード0で終わる。
#
# gh project item-list の JSON にはラベル情報が含まれないため、
# frontend-port ラベル付き Issue 一覧を取得したうえで、各 Issue の project status を確認する方式を取る。

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-ryoya-masuda-unirita/naw-server-fastapi-nextjs}"

gh issue list --repo "$REPO" --label "frontend-port" --state open --json number,projectItems --limit 200 \
  --jq '[.[] | select((.projectItems[]?.status.name // "") == "Todo") | .number] | sort | .[0] // empty'

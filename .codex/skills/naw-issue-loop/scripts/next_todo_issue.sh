#!/usr/bin/env bash
# GitHub Projects の Status=Todo かつ type=Issue のうち、番号が最小のものを1件返す。
# 該当なしの場合は何も出力せず終了コード0で終わる。

set -euo pipefail

OWNER="ryoya-masuda-unirita"
PROJECT_NUMBER="3"

gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
  --jq '[.items[] | select(.status=="Todo" and .content.type=="Issue")] | sort_by(.content.number) | .[0].content.number // empty'

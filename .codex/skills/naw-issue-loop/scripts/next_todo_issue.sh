#!/usr/bin/env bash
# GitHub Projects の Status=Todo かつ type=Issue のうち、番号が最小のものを1件返す。
# 該当なしの場合は何も出力せず終了コード0で終わる。

set -euo pipefail

OWNER="ryoya-masuda-unirita"
PROJECT_NUMBER="3"
# ボードの項目数（完了したものも含む）より、十分大きくする。小さいと、新しい Issue の項目が取得から外れる
PROJECT_ITEM_LIMIT="1000"

gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit "$PROJECT_ITEM_LIMIT" \
  --jq '[.items[] | select(.status=="Todo" and .content.type=="Issue")] | sort_by(.content.number) | .[0].content.number // empty'

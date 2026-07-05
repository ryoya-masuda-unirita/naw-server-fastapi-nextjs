#!/usr/bin/env bash

set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 issue-12 or issue-12-NAW-1234" >&2
  exit 1
fi

issue_name="$1"
docs_dir="docs/${issue_name}"

mkdir -p "$docs_dir"

create_file() {
  file_path="$1"
  if [ ! -f "$file_path" ]; then
    : > "$file_path"
  fi
}

create_file "${docs_dir}/00_チケット内容.md"
create_file "${docs_dir}/01_要件定義.md"
create_file "${docs_dir}/02_基本設計.md"
create_file "${docs_dir}/03_詳細設計.md"
create_file "${docs_dir}/04_テスト設計.md"
create_file "${docs_dir}/05_テスト詳細設計.md"
create_file "${docs_dir}/06_タスクリスト.md"
create_file "${docs_dir}/07_gitコミット.md"
create_file "${docs_dir}/08_動作確認.md"

if ! grep -q '^# ' "${docs_dir}/00_チケット内容.md" 2>/dev/null; then
  cat > "${docs_dir}/00_チケット内容.md" <<'EOF'
# タイトルの内容

## 概要

## 説明

## その他
EOF
fi

if ! grep -q '^# 06_タスクリスト' "${docs_dir}/06_タスクリスト.md" 2>/dev/null; then
  cat > "${docs_dir}/06_タスクリスト.md" <<'EOF'
# 06_タスクリスト

## ドキュメント

- [ ] `00_チケット内容.md` を作成
- [ ] `01_要件定義.md`・`02_基本設計.md` を作成
- [ ] `03_詳細設計.md`〜`05_テスト詳細設計.md` を作成

## 実装

- [ ] 実装タスクを列挙

## テスト

- [ ] テストタスクを列挙

## 動作確認

- [ ] 動作確認を記録

## PR・レビュー

- [ ] PR を作成
EOF
fi

echo "created ${docs_dir}"

# naw-serverのfastapi化
# secuaigent-clientのnext.js化

## Codex 運用

`Codex` 用のプロジェクト運用ルールはルートの [AGENTS.md](./AGENTS.md) を参照してください。

## frontend-angular の同期

`frontend-angular/` は `secuaigent-client`（Angular）をこのモノレポに丸ごと取り込んだもの。
コピーすると `secuaigent-client` の最新状態に上書きされるため、手動でcpせず、AI（Claude Code / Codex）に
「secuaigent-clientからfrontend-angularを最新にして」のように依頼すること。モノレポ向けの設定差分の再適用まで
自動で行われる。

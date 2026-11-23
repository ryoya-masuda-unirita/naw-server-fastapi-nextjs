# code-review 結果

`/code-review medium` の結果。各指摘を実際のコードと規約で確かめた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `message_service.py` | `MessageService` が `AssistantService` を呼んでおり、規約「`xxx_service.py` が別の `yyy_service.py` を呼ぶ構造は禁止」に反する | 対応済み |
| 2 | 🔵 提案 | `assistant_service.py` | 1 つのアシスタントの判定のために、所属グループの全アシスタント ID を取っている（メッセージのたびに実行される） | 対応済み |
| 3 | 🟡 注意 | `message_service.py` | ライブラリ画面（`library_service.py`）など、他の経路ではグループの確認がない | 対応しない |
| 4 | 🔵 提案 | `assistant_service.py` | `from uuid import UUID` の import の位置が標準ライブラリの並びと合わない | 対応済み（指摘の箇所ごと取り消した） |

## 詳細

### 1. サービス間の呼び出し（🔴 致命的）→ 対応済み

`server/.claude/CLAUDE.md` に該当の規約があることを確認した。私の設計（`03_詳細設計.md` の初版）が、この規約に触れていなかった。判定を `GroupAssistantRepository.exists_available_to_user` に移し、`MessageService` がリポジトリを直接呼ぶ形に直した。`AssistantService` は変更しない。なお、`group_service.py`・`index_service.py` に既に同種の呼び出しがあるが、既存のもので、今回は触れない。

### 2. 判定の効率（🔵 提案）→ 対応済み

1 つの ID の判定に、2 回の問い合わせと全 ID の取得は無駄だった。EXISTS の 1 クエリにした。一覧 API と同じ条件になっていることは、統合テスト（`test_exists_available_to_user_matches_assistant_list`）で確かめている。

### 3. 他の経路のグループ確認（🟡 注意）→ 対応しない

移植元の NAW-1443（`ba7e0bbbd`・`b18e17112`）は、メッセージ作成・回答生成の 3 か所だけを直している。ライブラリ画面などの経路は、移植元でも対象外で、この Issue の範囲（メッセージ作成・回答生成の拒否）を超える。移植元で同じ確認が必要になれば、別の Issue で移植する。

### 4. import の位置（🔵 提案）→ 対応済み

指摘の import は、サービスの変更を取り消したことでなくなった。

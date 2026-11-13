# NG: 14_チーム管理

71 項目のうち NG は 2 件（14-55、14-67）。どちらも **backend が移植元と違う本当の差**で、原因は 1 つ。ほかの 69 項目は OK。

| 原因 | 項番 | 修正の対象 |
|---|---|---|
| A. 所属アシスタントの「カテゴリ順」の並べ替えが効かない | 14-55・14-67 | backend |

## 原因 A: アシスタントの並べ替え `category` を backend が解釈しない（14-55・14-67）

### [14-55] アシスタント並替（カテゴリ） / [14-67] アシスタント：フィルター＋並べ替え

- 項目書の期待: 「カテゴリ順」で並べ替えると、カテゴリ順に表示される（14-67 は、サーバーフィルターをかけたうえで表示名順・接続サーバー順・カテゴリ順に並べ替えてもエラーにならず、正しく並ぶ）
- 移植元の挙動: `server/.../service/GroupService.java` の `findGroupAssistants` は、並べ替えキーを `Map.of("addedAt", "updatedAt", "server", "assistant.assistantType", "name", "assistant.name", "category", "assistant.categoryMappings.category.name")` で読み替える。`category` はカテゴリ名の並びになる
- React・backend の挙動: 画面は `sort=category,asc` を送る（`group-assistants-filter.tsx` の並べ替え項目 `category`）。backend は 200 を返すが、並びは追加日時順のまま。テストでは、追加順 c → a → b のアシスタントに、カテゴリ名 x・z・y を付けた（カテゴリ名の昇順は c, b, a）。実際の表示は c, a, b だった
- 原因: `backend/app/repositories/group_assistant_repository.py` の `_SORT_COLUMNS` に `category` がない。コメントのとおり、対応表にないキーは「従来どおり追加日時順」になる
- 修正の方針（backend）: `_SORT_COLUMNS` に `category` を足し、アシスタントのカテゴリ名（`AssistantCategoryMapping` → `AssistantCategory.name`）で並べる。複数カテゴリを持つアシスタントは移植元と同じく、結合した行の並びになる。名前・接続サーバー・追加日時の並べ替えは OK（14-52〜14-54・14-56）

## テストの誤りだったもの（直した）

- 14-23: 並べ替え直後の読み込み中（行が 0 件）の値を読んでいた。行数の待ちを足した
- 09-11: 検索（300ms のデバウンス）が反映される前にページ送りを押していた。件数表示の待ちを足した
- 09-39: 移植元・React の `ja.json` に `ADMIN.LIBRARY.TAGS.CREATE_FAILED` の訳がないため、文言を固定せずエラートーストの表示だけ確かめる

## 環境の負荷による失敗（NG ではない）

同時に動かす専用環境が多い間、ログインが遅れて 14-21・14-22・14-24 などが 1 回だけ落ちたが、単独で流すと OK だった。

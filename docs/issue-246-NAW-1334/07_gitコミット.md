# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-246-NAW-1334/00`〜`07` |
| 2 | 日時の解釈と終了の排他化、テスト | `backend/app/core/date_parse.py`、`backend/app/routers/files.py`、`backend/app/routers/rooms.py`、`backend/app/services/file_service.py`、`backend/app/services/room_service.py`、`backend/app/repositories/file_repository.py`、`backend/app/repositories/room_repository.py`、`backend/tests/unit/test_date_parse.py`、`backend/tests/integration/test_files.py`、`backend/tests/integration/test_rooms.py` |
| 3 | 動作確認の記録 | `docs/issue-246-NAW-1334/06_タスクリスト.md`、`docs/issue-246-NAW-1334/08_動作確認.md` |

## 各コミットメッセージ案

```text
#246 issue-246 NAW-1334 日時パラメータの解釈と終了の排他化の設計ドキュメントを作成する
    - docs/issue-246-NAW-1334 に 00〜07 を作成
```

```text
#246 issue-246 NAW-1334 ファイル一覧とルーム履歴一覧の日時の解釈を移植元に揃え終了を排他にする
    - 移植元 DateParseUtil.parseIsoInstant 相当の parse_iso_instant を追加
    - オフセットのない日時・日付だけの値は 400 と移植元と同じメッセージを返す
    - updatedAtTo・createdAtTo をその時刻より前で判定する
    - 使われなくなった RoomService._parse_date を削除
```

```text
#246 issue-246 NAW-1334 動作確認結果を記録する
    - 08_動作確認.md に pytest・mypy・ruff の結果を記録
```

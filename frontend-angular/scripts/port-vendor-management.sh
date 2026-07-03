#!/usr/bin/env bash
# Port vendor ranabase management modules to develop management (Phase 4)
set -euo pipefail

VENDOR_ROOT="${VENDOR_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/secuaigent-client-20260522}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$VENDOR_ROOT/src/app/features/admin/ranabase"
DEST="$REPO_ROOT/src/app/features/admin/management"

MODULES=(feedback-list group-list template-list tenant training-data chat-history)

for mod in "${MODULES[@]}"; do
  echo "Porting $mod..."
  mkdir -p "$DEST/$mod"
  rsync -a --delete \
    --exclude='*.spec.ts' \
    "$SRC/$mod/" "$DEST/$mod/"
done

# Path and symbol renames across ported trees
while IFS= read -r -d '' f; do
  if [[ "$f" == *.ts || "$f" == *.html || "$f" == *.scss ]]; then
    sed -i '' \
      -e 's|features/admin/ranabase/|features/admin/management/|g' \
      -e 's|@features/admin/ranabase/|@features/admin/management/|g' \
      -e 's|RANABASE\.|ADMIN_CONSOLE.|g' \
      -e 's/app-ranabase-/app-admin-/g' \
      -e 's/RanabaseFeedbackListComponent/AdminFeedbackListComponent/g' \
      -e 's/RanabaseGroupListComponent/AdminGroupListComponent/g' \
      -e 's/RanabaseGroupDetailComponent/AdminGroupDetailComponent/g' \
      -e 's/RanabaseTemplateListComponent/AdminTemplateListComponent/g' \
      -e 's/RanabaseTenantComponent/AdminTenantComponent/g' \
      -e 's/RanabaseTrainingDataComponent/AdminTrainingDataComponent/g' \
      -e 's/RanabaseChatHistoryComponent/AdminChatHistoryComponent/g' \
      -e 's/export class Ranabase/export class Admin/g' \
      -e 's/RanabaseAssistant/RanabaseAssistant/g' \
      "$f" 2>/dev/null || sed -i \
      -e 's|features/admin/ranabase/|features/admin/management/|g' \
      -e 's|@features/admin/ranabase/|@features/admin/management/|g' \
      -e 's|RANABASE\.|ADMIN_CONSOLE.|g' \
      -e 's/app-ranabase-/app-admin-/g' \
      -e 's/RanabaseFeedbackListComponent/AdminFeedbackListComponent/g' \
      -e 's/RanabaseGroupListComponent/AdminGroupListComponent/g' \
      -e 's/RanabaseGroupDetailComponent/AdminGroupDetailComponent/g' \
      -e 's/RanabaseTemplateListComponent/AdminTemplateListComponent/g' \
      -e 's/RanabaseTenantComponent/AdminTenantComponent/g' \
      -e 's/RanabaseTrainingDataComponent/AdminTrainingDataComponent/g' \
      -e 's/RanabaseChatHistoryComponent/AdminChatHistoryComponent/g' \
      -e 's/export class Ranabase/export class Admin/g' \
      "$f"
  fi
done < <(find "$DEST" -type f \( -name '*.ts' -o -name '*.html' -o -name '*.scss' \) -print0)

echo "Done."

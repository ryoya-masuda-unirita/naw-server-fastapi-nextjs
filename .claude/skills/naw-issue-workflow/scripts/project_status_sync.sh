#!/usr/bin/env bash

set -euo pipefail

OWNER="ryoya-masuda-unirita"
PROJECT_NUMBER="3"
REPO="${GITHUB_REPOSITORY:-ryoya-masuda-unirita/naw-server-fastapi-nextjs}"

usage() {
  cat <<'EOF'
Usage:
  bash .claude/skills/naw-issue-workflow/scripts/project_status_sync.sh --issue <number> --status <status>
  bash .claude/skills/naw-issue-workflow/scripts/project_status_sync.sh --pr <number> --status <status>

Status:
  Todo
  In Progress
  Review
  Done
EOF
}

require_arg() {
  local value="$1"
  local name="$2"
  if [[ -z "$value" ]]; then
    echo "missing required argument: $name" >&2
    usage
    exit 1
  fi
}

issue_number=""
pr_number=""
target_status=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)
      issue_number="${2:-}"
      shift 2
      ;;
    --pr)
      pr_number="${2:-}"
      shift 2
      ;;
    --status)
      target_status="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_arg "$target_status" "--status"

if [[ -n "$issue_number" && -n "$pr_number" ]]; then
  echo "specify either --issue or --pr" >&2
  exit 1
fi

if [[ -z "$issue_number" && -z "$pr_number" ]]; then
  echo "either --issue or --pr is required" >&2
  exit 1
fi

project_json="$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json)"
project_id="$(jq -r '.id' <<<"$project_json")"

fields_json="$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)"
status_field_id="$(jq -r '.fields[] | select(.name=="Status") | .id' <<<"$fields_json")"
status_option_id="$(jq -r --arg status "$target_status" '.fields[] | select(.name=="Status") | .options[] | select(.name==$status) | .id' <<<"$fields_json")"

if [[ -z "$status_field_id" || "$status_field_id" == "null" ]]; then
  echo "Status field was not found in Project $PROJECT_NUMBER" >&2
  exit 1
fi

if [[ -z "$status_option_id" || "$status_option_id" == "null" ]]; then
  echo "Status option '$target_status' was not found in Project $PROJECT_NUMBER" >&2
  exit 1
fi

issue_numbers=()

if [[ -n "$issue_number" ]]; then
  issue_numbers+=("$issue_number")
else
  pr_body="$(gh pr view "$pr_number" --json body --jq '.body // ""')"
  while IFS= read -r number; do
    [[ -n "$number" ]] && issue_numbers+=("$number")
  done < <(
    printf '%s\n' "$pr_body" \
      | grep -Eio '(close[sd]?|fix(e[sd])?|resolve[sd]?) *#([0-9]+)' \
      | grep -Eo '#[0-9]+' \
      | tr -d '#' \
      | sort -u || true
  )
fi

if [[ "${#issue_numbers[@]}" -eq 0 ]]; then
  echo "No issue references found for status sync."
  exit 0
fi

for current_issue in "${issue_numbers[@]}"; do
  item_id="$(
    gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
      --jq ".items[] | select(.content.number==$current_issue) | .id" \
      | head -n 1
  )"

  if [[ -z "$item_id" ]]; then
    issue_url="https://github.com/$REPO/issues/$current_issue"
    gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$issue_url" >/dev/null
    item_id="$(
      gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
        --jq ".items[] | select(.content.number==$current_issue) | .id" \
        | head -n 1
    )"
  fi

  if [[ -z "$item_id" ]]; then
    echo "Project item for issue #$current_issue was not found." >&2
    exit 1
  fi

  gh project item-edit \
    --id "$item_id" \
    --project-id "$project_id" \
    --field-id "$status_field_id" \
    --single-select-option-id "$status_option_id" \
    >/dev/null

  echo "Updated issue #$current_issue to '$target_status'."
done

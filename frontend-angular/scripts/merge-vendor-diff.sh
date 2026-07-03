#!/usr/bin/env bash
# 納品 vs develop の差分を表示（パスは develop 側表記）
set -euo pipefail

VENDOR_ROOT="${VENDOR_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)/secuaigent-client-20260522}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBPATH="${1:-}"

# vendor の ranabase → develop の management に読み替え
VENDOR_SUBPATH="${SUBPATH}"
if [[ "${SUBPATH}" == management/* ]]; then
  VENDOR_SUBPATH="ranabase/${SUBPATH#management/}"
fi

DEV_PATH="${REPO_ROOT}/src/app/features/admin/${SUBPATH}"
VENDOR_PATH="${VENDOR_ROOT}/src/app/features/admin/${VENDOR_SUBPATH}"

if [[ -n "${SUBPATH}" ]]; then
  if [[ -d "${DEV_PATH}" || -f "${DEV_PATH}" ]]; then
    DEV_TARGET="${DEV_PATH}"
  else
    DEV_TARGET="${REPO_ROOT}/src/${SUBPATH}"
  fi
  if [[ -d "${VENDOR_PATH}" || -f "${VENDOR_PATH}" ]]; then
    VENDOR_TARGET="${VENDOR_PATH}"
  else
    VENDOR_TARGET="${VENDOR_ROOT}/src/${SUBPATH}"
  fi
  echo "develop:  ${DEV_TARGET}"
  echo "vendor:   ${VENDOR_TARGET}"
  echo "---"
  diff -rq "${DEV_TARGET}" "${VENDOR_TARGET}" 2>/dev/null || diff -q "${DEV_TARGET}" "${VENDOR_TARGET}" 2>/dev/null || true
else
  echo "Usage: $0 <path under src or management/...>"
  echo "Example: $0 management/feedback-list"
  exit 1
fi

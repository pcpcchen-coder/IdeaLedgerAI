#!/bin/bash
# launchd 在登入時呼叫：讀 .env 後啟動選單列狀態圖示（T27）。
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
export IDEA_STATUS_FILE="${IDEA_STATUS_FILE:-$STATUS_FILE}"
export IDEALEDGER_HOME IDEALEDGER_REPO="$REPO_ROOT"
cd "$REPO_ROOT"
exec "${IDEALEDGER_PYTHON:-$VENV/bin/python}" -m statusbar

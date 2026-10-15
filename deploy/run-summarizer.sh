#!/bin/bash
# launchd 每 5 分鐘呼叫一次：讀 .env 後執行一輪摘要、寫入 AiMemory ledger/（IDEA_GIT_PUBLISH=1 時推送）。
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
export IDEA_STATUS_FILE="${IDEA_STATUS_FILE:-$STATUS_FILE}"
cd "$REPO_ROOT"
exec "${IDEALEDGER_PYTHON:-$VENV/bin/python}" -m summarizer

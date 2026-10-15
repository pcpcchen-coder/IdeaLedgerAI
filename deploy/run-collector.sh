#!/bin/bash
# launchd 呼叫：讀 .env 後啟動 collector（只綁 127.0.0.1:8787，不對外開放）。
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_env
cd "$REPO_ROOT/collector"
exec "${IDEALEDGER_PYTHON:-$VENV/bin/python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8787

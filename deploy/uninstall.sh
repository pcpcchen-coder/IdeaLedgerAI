#!/bin/bash
# 卸載 Idea Ledger 的 launchd 工作。資料（資料庫、.env、AiMemory clone）保留不動。
set -euo pipefail
. "$(dirname "$0")/lib.sh"

for label in $LABELS; do
  "$LAUNCHCTL" bootout "$DOMAIN/$label" >/dev/null 2>&1 || true
  rm -f "$LAUNCH_AGENTS_DIR/$label.plist"
  echo "已卸載：$label"
done
echo "資料保留在：$IDEALEDGER_HOME"

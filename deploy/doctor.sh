#!/bin/bash
# 部署後的檢查清單：逐項顯示 ✅／❌，全部通過才回傳 0。用法：deploy/doctor.sh
set -uo pipefail
. "$(dirname "$0")/lib.sh"

failed=0
ok() { printf '✅ %s\n' "$*"; }
bad() { printf '❌ %s\n' "$*"; failed=1; }

load_env || exit 1

# 設定
[ -n "${IDEA_TOKEN:-}" ] && ok "collector token 已設定" || bad "IDEA_TOKEN 未設定（$ENV_FILE）"
[ -n "${LLM_MODEL:-}" ] && ok "模型：$LLM_MODEL" || bad "LLM_MODEL 未設定（$ENV_FILE）"
for var in IDEA_DB IDEA_MEMORY_REPO; do
  value="${!var:-}"
  if [ -z "$value" ]; then bad "$var 未設定"
  elif in_icloud "$value"; then bad "$var 在 iCloud 同步的資料夾內：$value"
  else ok "$var：$value"; fi
done

# launchd 工作
for label in $LABELS; do
  "$LAUNCHCTL" print "$DOMAIN/$label" >/dev/null 2>&1 && ok "launchd 已載入：$label" || bad "launchd 未載入：$label（執行 deploy/install.sh）"
done

# collector
if curl -fsS -m 5 -H "Authorization: Bearer ${IDEA_TOKEN:-}" http://127.0.0.1:8787/v2/health >/dev/null 2>&1; then
  ok "collector 正常（127.0.0.1:8787）"
else
  bad "collector 沒有回應（看 $IDEALEDGER_HOME/logs/collector.log）"
fi

# 本地模型（LiteLLM）
auth=()
[ -n "${LLM_API_KEY:-}" ] && auth=(-H "Authorization: Bearer $LLM_API_KEY")
if curl -fsS -m 5 "${auth[@]+"${auth[@]}"}" "${LLM_BASE_URL%/}/models" >/dev/null 2>&1; then
  ok "LiteLLM 可連線：$LLM_BASE_URL"
else
  bad "LiteLLM 連不上：$LLM_BASE_URL"
fi

# AiMemory clone 與推送權限
repo="${IDEA_MEMORY_REPO:-}"
if [ -n "$repo" ] && git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
  ok "AiMemory clone：$repo"
  [ -f "$repo/ledger/README.md" ] && ok "ledger/ 規格存在" || bad "找不到 $repo/ledger/README.md（clone 的是 AiMemory 嗎？）"
  if [ "${IDEA_GIT_PUBLISH:-0}" = "1" ]; then
    git -C "$repo" push --dry-run >/dev/null 2>&1 && ok "可以推送到 AiMemory 遠端" || bad "無法推送到 AiMemory（檢查 GitHub 權限，見 docs/DEPLOY_MAC.md）"
  else
    ok "IDEA_GIT_PUBLISH 未開啟：只寫本機、不推送"
  fi
else
  bad "AiMemory clone 不存在：$repo（見 docs/DEPLOY_MAC.md）"
fi

# 最近一次摘要
log="$IDEALEDGER_HOME/logs/summarizer.log"
[ -f "$log" ] && ok "summarizer 最後輸出：$(tail -n 1 "$log")" || bad "還沒有 summarizer 記錄（$log）"

exit "$failed"

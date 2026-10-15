#!/bin/bash
# 安裝或更新 Idea Ledger 的本機服務（collector 常駐、summarizer 每 5 分鐘）。可重複執行。
# 用法：deploy/install.sh
set -euo pipefail
. "$(dirname "$0")/lib.sh"

PYTHON="${PYTHON:-python3}"

say() { printf '%s\n' "$*"; }
fail() { printf '錯誤：%s\n' "$*" >&2; exit 1; }

# 1. Python 3.12 以上
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' \
  || fail "需要 Python 3.12 以上（目前：$("$PYTHON" --version 2>&1)）。可用 PYTHON=/opt/homebrew/bin/python3.12 deploy/install.sh 指定"

# 2. 資料夾與設定檔（第一次才產生，之後不覆寫）
mkdir -p "$IDEALEDGER_HOME/logs"
if [ ! -f "$ENV_FILE" ]; then
  token="$("$PYTHON" -c 'import secrets; print(secrets.token_hex(24))')"
  # 值加引號：預設路徑含空白（Application Support），.env 會被 shell 讀取
  sed -e "s|^IDEA_TOKEN=.*|IDEA_TOKEN=$token|" \
      -e "s|^IDEA_DB=.*|IDEA_DB=\"$IDEALEDGER_HOME/ledger.db\"|" \
      -e "s|^IDEA_MEMORY_REPO=.*|IDEA_MEMORY_REPO=\"$IDEALEDGER_HOME/AiMemory\"|" \
      "$REPO_ROOT/deploy/env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  say "已建立設定檔：$ENV_FILE（token 已自動產生；請填 LLM_MODEL）"
fi
load_env

# 3. 路徑檢查
for var in IDEA_DB IDEA_MEMORY_REPO; do
  value="${!var:-}"
  [ -n "$value" ] || fail "$var 未設定（$ENV_FILE）"
  case "$value" in /*) ;; *) fail "$var 必須是絕對路徑：$value" ;; esac
  if in_icloud "$value"; then
    fail "$var 在 iCloud 同步的資料夾內（$value）。對話全文不能進 iCloud，請改到 $IDEALEDGER_HOME 底下"
  fi
done

# 4. Python 虛擬環境與套件
if [ "${SKIP_PIP:-0}" != "1" ]; then
  [ -x "$VENV/bin/python" ] || "$PYTHON" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --quiet --upgrade pip
  "$VENV/bin/python" -m pip install --quiet -r "$REPO_ROOT/collector/requirements.txt" -r "$REPO_ROOT/summarizer/requirements.txt"
  say "Python 套件已安裝：$VENV"
fi

# 5. launchd 設定：由範本產生（絕對路徑），先卸載舊的再載入
mkdir -p "$LAUNCH_AGENTS_DIR"
for label in $LABELS; do
  plist="$LAUNCH_AGENTS_DIR/$label.plist"
  sed -e "s|@REPO@|$REPO_ROOT|g" -e "s|@HOME_DIR@|$IDEALEDGER_HOME|g" \
      "$REPO_ROOT/deploy/launchd/$label.plist.in" > "$plist"
  "$LAUNCHCTL" bootout "$DOMAIN/$label" >/dev/null 2>&1 || true
  "$LAUNCHCTL" bootstrap "$DOMAIN" "$plist"
  say "已載入：$label"
done

say ""
say "完成。接著執行 deploy/doctor.sh 檢查各項設定。"

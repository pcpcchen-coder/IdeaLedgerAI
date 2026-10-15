# deploy 腳本共用設定（bash 3.2 相容，macOS 內建 bash 即可執行）。
# 測試時可用環境變數覆寫：IDEALEDGER_HOME、LAUNCH_AGENTS_DIR、LAUNCHCTL、PYTHON。

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IDEALEDGER_HOME="${IDEALEDGER_HOME:-$HOME/Library/Application Support/IdeaLedger}"
LAUNCH_AGENTS_DIR="${LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
LAUNCHCTL="${LAUNCHCTL:-launchctl}"
ENV_FILE="$IDEALEDGER_HOME/.env"
VENV="$IDEALEDGER_HOME/venv"
LABELS="com.idealedger.collector com.idealedger.summarizer"
DOMAIN="gui/$(id -u)"

# 對話全文與 AiMemory clone 都不能放在 iCloud 同步的資料夾（T08 學到的）
in_icloud() {
  case "$1" in
    "$HOME/Library/Mobile Documents"*|"$HOME/Documents"*|"$HOME/Desktop"*) return 0 ;;
    *) return 1 ;;
  esac
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "找不到設定檔：$ENV_FILE（請先執行 deploy/install.sh）" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

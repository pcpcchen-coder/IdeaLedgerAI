"""執行一次摘要（給 launchd 每 5 分鐘呼叫）：python -m summarizer

環境變數：
  IDEA_DB        SQLite 路徑（與 collector 相同），預設 ./ledger.db
  LLM_BASE_URL   OpenAI 相容端點，預設 http://127.0.0.1:4000/v1（LiteLLM Gateway）
  LLM_MODEL      模型名稱；沒設定時不經模型，以「使用者輸入的文字」當想法卡內容（T26）
  LLM_API_KEY    選填
  SUMMARY_BATCH  每次最多處理幾段，預設 20
  IDEA_MEMORY_REPO  AiMemory 本機 clone 的根目錄；有設定才寫想法卡與每日日誌到其 ledger/（T20），
                    專案清單讀其 projects/*.md（T21）
  IDEA_TZ        日期使用的時區，預設 Asia/Taipei
  IDEA_GIT_PUBLISH  設為 1 時，寫入前後與 AiMemory 遠端同步：pull --rebase → 寫入 → commit → push（T23）
  IDEA_GIT_EMAIL    bot commit 的 email，預設 idea-ledger-bot@users.noreply.github.com
  IDEA_STATUS_FILE  有設定時，每次執行結束把結果寫成 JSON（給選單列狀態圖示讀，T27）
"""
import json
import os
import sys
from datetime import datetime, timezone

from .llm import LLMError, OpenAICompatClient
from .obsidian import LedgerWriter
from .prompt import load_projects
from .publisher import BOT_EMAIL, publish
from .store import SummaryStore
from .worker import run_extract_once, run_once


def write_status(path: str | None, **fields) -> None:
    """把這次執行的結果寫到狀態檔（先寫暫存檔再改名，讀的一方不會讀到一半）。失敗不影響摘要本身。"""
    if not path:
        return
    data = {"finished_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), **fields}
    try:
        tmp = f"{path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError as e:
        print(f"寫不進狀態檔 {path}：{e}", file=sys.stderr)


def main() -> int:
    status_file = os.environ.get("IDEA_STATUS_FILE")
    try:
        code, fields = _run()
    except Exception as e:
        write_status(status_file, exit_code=1, error=f"{type(e).__name__}: {e}"[:500])
        raise
    write_status(status_file, exit_code=code, **fields)
    return code


def _run() -> tuple[int, dict]:
    client = None
    if os.environ.get("LLM_MODEL"):
        try:
            client = OpenAICompatClient(
                base_url=os.environ.get("LLM_BASE_URL", "http://127.0.0.1:4000/v1"),
                model=os.environ["LLM_MODEL"],
                api_key=os.environ.get("LLM_API_KEY") or None,
            )
        except LLMError as e:
            print(f"設定錯誤：{e}", file=sys.stderr)
            return 1, {"error": f"設定錯誤：{e}"}
    store = SummaryStore(os.environ.get("IDEA_DB", "./ledger.db"))
    repo = os.environ.get("IDEA_MEMORY_REPO")
    try:
        projects = load_projects(repo)
        batch = int(os.environ.get("SUMMARY_BATCH", "20"))
        if client:
            report = run_once(store, client.complete, client.model, batch=batch, projects=projects)
        else:
            report = run_extract_once(store, batch=batch, projects=projects)
        written = published = None
        if repo:
            tz = os.environ.get("IDEA_TZ", "Asia/Taipei")
            writer = LedgerWriter(store.conn, repo, tz, projects)
            if os.environ.get("IDEA_GIT_PUBLISH") == "1":
                published = publish(repo, writer, email=os.environ.get("IDEA_GIT_EMAIL") or BOT_EMAIL, tz=tz)
                written = published.written
            else:
                written = writer.run()
    finally:
        store.close()
    mode = "模型摘要" if client else "使用者輸入"
    print(f"[{mode}] 完成 {len(report.summarized)}、失敗 {len(report.failed)}、期間又更新 {len(report.still_dirty)}")
    for key in report.failed:
        print(f"  失敗：{key}", file=sys.stderr)
    if written:
        print(f"想法卡寫入 {len(written.written)}、移除舊檔 {len(written.removed)}、日誌更新 {len(written.logs)}、"
              f"索引更新 {len(written.indexes)}")
    fields = {"mode": mode, "summarized": len(report.summarized), "failed": len(report.failed),
              "cards_written": len(written.written) if written else 0}
    if published:
        print(f"發佈：{published.status}" + (f"（{published.detail}）" if published.detail else ""))
        fields.update(publish=published.status, publish_detail=(published.detail or "")[:500])
        if published.outside:
            print(f"  ledger/ 以外的變動：{', '.join(published.outside)}", file=sys.stderr)
        if published.status not in ("pushed", "no_changes"):
            return 2, fields
    return 0, fields


if __name__ == "__main__":
    sys.exit(main())

"""T27：選單列狀態檢查。只測純邏輯（status.py），不需要 macOS／rumps。"""
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from statusbar import status as S  # noqa: E402

NOW = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)


def iso(minutes_ago):
    return (NOW - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def health(*platforms):
    return {"total_conversations": 210, "platforms": list(platforms)}


def plat(pid, name, status="ok", minutes_ago=10, error=None, fetched=30):
    return {"platform": pid, "platform_name": name, "conversations": 1,
            "last_run": {"status": status, "started_at": iso(minutes_ago), "finished_at": iso(minutes_ago),
                         "listed": 0, "fetched": fetched, "error": error, "sweeper": None}}


def status_file(tmp_path, minutes_ago=2, **fields):
    data = {"finished_at": iso(minutes_ago), "exit_code": 0, "mode": "使用者輸入", "summarized": 20, "failed": 0,
            "publish": "pushed", **fields}
    p = tmp_path / "summarizer_status.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return str(p)


def run(tmp_path, h=None, sf=None, db=None, error=None):
    def fetch(url, token):
        assert url == S.HEALTH_URL and token == "tok"
        if error:
            raise error
        return h
    return S.check(token="tok", status_file=sf, db_path=db, now=NOW, fetch=fetch)


def texts(st):
    return [i.text for i in st.items]


def test_all_green(tmp_path):
    st = run(tmp_path, health(plat("claude", "Claude"), plat("gemini", "Gemini")), status_file(tmp_path))
    assert st.level == S.GREEN and st.icon == "🟢" and st.headline == "Idea Ledger 一切正常"
    assert "Collector：正常（已收 210 篇對話）" in texts(st)
    assert "Summarizer：2 分鐘前，處理 20 篇，已推送 AiMemory" in texts(st)
    assert "Gemini：正常（10 分鐘前，讀 30 篇）" in texts(st)  # 平台來自資料，不寫死


def test_collector_down_is_red(tmp_path):
    st = run(tmp_path, sf=status_file(tmp_path), error=ConnectionRefusedError("refused"))
    assert st.level == S.RED and st.items[0].text == "Collector：沒有回應"
    assert "refused" in st.items[0].detail
    assert st.headline == "1 項異常"


def test_rate_limited_is_yellow(tmp_path):
    st = run(tmp_path, health(plat("chatgpt", "ChatGPT", "rate_limited", 30, "HTTP 429"), plat("claude", "Claude")),
             status_file(tmp_path))
    assert st.level == S.YELLOW and st.icon == "🟡"
    item = next(i for i in st.items if i.text.startswith("ChatGPT"))
    assert "限流" in item.text and item.detail == "HTTP 429"


def test_needs_login_and_format_error_are_red(tmp_path):
    for status in ("needs_login", "format_error"):
        st = run(tmp_path, health(plat("claude", "Claude", status)), status_file(tmp_path))
        assert st.level == S.RED


def test_unknown_sweep_status_is_yellow(tmp_path):
    st = run(tmp_path, health(plat("x-ai", "X", "weird")), status_file(tmp_path))
    assert st.level == S.YELLOW and "X：weird（10 分鐘前）" in texts(st)


def test_sweeping_stopped_is_red(tmp_path):
    st = run(tmp_path, health(plat("claude", "Claude", minutes_ago=180)), status_file(tmp_path))
    assert st.level == S.RED and texts(st)[2].startswith("巡檢停了")


def test_summarizer_stale_failed_or_push_failed(tmp_path):
    assert run(tmp_path, health(), status_file(tmp_path, minutes_ago=20)).items[1].text.startswith("Summarizer：停了")
    st = run(tmp_path, health(), status_file(tmp_path, exit_code=2, publish="push_failed", publish_detail="auth"))
    assert st.level == S.RED and "推送 AiMemory 失敗（push_failed" in st.items[1].text and st.items[1].detail == "auth"
    st = run(tmp_path, health(), status_file(tmp_path, exit_code=1, error="ValueError: x"))
    assert st.items[1].text.startswith("Summarizer：執行失敗") and st.items[1].detail == "ValueError: x"
    st = run(tmp_path, health(), status_file(tmp_path, failed=3))
    assert st.level == S.YELLOW and st.items[1].text.endswith("3 篇失敗")


def test_summarizer_missing_or_broken_file(tmp_path):
    assert run(tmp_path, health(), None).items[1].level == S.YELLOW
    bad = tmp_path / "bad.json"
    bad.write_text("{", encoding="utf-8")
    assert run(tmp_path, health(), str(bad)).items[1].text == "Summarizer：狀態檔讀不到"


def test_pending_count_readonly(tmp_path):
    db = tmp_path / "ledger.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE conv(platform, conv_id, dirty)")
    conn.executemany("INSERT INTO conv VALUES(?,?,?)", [("a", "1", 1), ("a", "2", 0), ("b", "3", 1)])
    conn.commit()
    conn.close()
    st = run(tmp_path, health(), status_file(tmp_path), db=str(db))
    assert "待處理對話：2 篇" in texts(st)
    missing = run(tmp_path, health(), status_file(tmp_path), db=str(tmp_path / "none.db"))
    assert not any(t.startswith("待處理") for t in texts(missing))  # 不會因此建立空資料庫
    assert not (tmp_path / "none.db").exists()


def test_no_hardcoded_platforms():
    src = (Path(S.__file__).parent / "status.py").read_text(encoding="utf-8").lower()
    for pid in ("chatgpt", "claude", "gemini"):
        assert pid not in src

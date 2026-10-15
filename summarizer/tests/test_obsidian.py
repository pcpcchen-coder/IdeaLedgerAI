from datetime import datetime, timezone

import pytest

from conftest import NOW, PROJECTS, FakeLLM, good_output, put
from summarizer.obsidian import NOTES_MARKER, LedgerWriter, OutsideLedgerError, ensure_in_ledger, safe_title
from summarizer.worker import run_once

EXPECTED_CARD = """---
platform: chatgpt
platform_name: "ChatGPT"
conv_id: "abc"
url: https://chatgpt.com/c/abc
platform_project: "換電站EMS系統"
created: 2026-10-15T18:00+08:00
updated: 2026-10-15T19:00+08:00
projects: ["swap-ems"]
status: inbox
---

# 換電站排程

## 摘要

討論換電站的充電排程。決定先用規則式排程。

## 想法

- [新想法] 依電價分時充電 → 下一步：拉三個月電價資料

## 決策

- 先用規則式排程

來源：[ChatGPT](https://chatgpt.com/c/abc)

<!-- 以下為個人筆記，系統不會覆寫 -->
"""


@pytest.fixture
def vault(tmp_path):
    """假的 AiMemory 本機 clone：預先放一個人工維護的檔案，確認工具不會碰到。"""
    repo = tmp_path / "AiMemory"
    repo.mkdir()
    (repo / "profile.md").write_text("# 人工維護\n", encoding="utf-8")
    return repo


def summarize(summary, *outputs):
    return run_once(summary, FakeLLM(*outputs), "test-model", now=NOW, projects=PROJECTS)


def writer(summary, vault):
    return LedgerWriter(summary.conn, vault)


def add_run(collector, platform, status, finished="2026-10-15T11:30:00Z"):
    collector.conn.execute(
        """INSERT INTO sweep_run(platform, started_at, finished_at, status, listed, fetched, received_at)
           VALUES(?,?,?,?,0,0,?)""", (platform, finished, finished, status, finished))
    collector.conn.commit()


def card_files(vault):
    return sorted(p.relative_to(vault).as_posix() for p in (vault / "ledger/conversations").rglob("*.md"))


def test_card_matches_snapshot(db, vault):
    collector, summary = db
    put(collector, project="換電站EMS系統", created_at="2026-10-15T10:00:00Z")
    summarize(summary)
    report = writer(summary, vault).run(now=NOW)
    assert report.written == ["ledger/conversations/2026/10/2026-10-15_chatgpt_換電站排程.md"]
    assert (vault / report.written[0]).read_text(encoding="utf-8") == EXPECTED_CARD


def test_local_date_and_safe_filename(db, vault):
    collector, summary = db
    put(collector, created_at="2026-10-15T17:00:00Z")  # 台北 10/16 01:00
    summarize(summary, good_output(title='A/B: "測試"?'))
    report = writer(summary, vault).run(now=NOW)
    assert report.written == ["ledger/conversations/2026/10/2026-10-16_chatgpt_A-B- -測試.md"]
    assert safe_title("") == "未命名"
    assert len(safe_title("長" * 100)) == 60


def test_user_status_and_notes_preserved_on_rewrite(db, vault):
    collector, summary = db
    put(collector)
    summarize(summary)
    w = writer(summary, vault)
    path = vault / w.run(now=NOW).written[0]
    edited = path.read_text(encoding="utf-8").replace("status: inbox", "status: 探索中")
    edited += "\n我的補充：先問電力公司\n"
    path.write_text(edited, encoding="utf-8")

    put(collector, updated_at="2026-10-15T11:30:00Z", messages=[
        {"role": "user", "text": "第一則：想做換電站排程"},
        {"role": "assistant", "text": "第二則：可以依電價分時"},
        {"role": "user", "text": "第三則：加需量反應"},
    ])
    summarize(summary, good_output(summary="更新後的摘要。"))
    assert w.run(now=NOW).written == [path.relative_to(vault).as_posix()]
    text = path.read_text(encoding="utf-8")
    assert "status: 探索中" in text
    assert "更新後的摘要。" in text
    assert text.endswith(NOTES_MARKER + "\n\n我的補充：先問電力公司\n")


def test_title_change_moves_file(db, vault):
    collector, summary = db
    put(collector)
    summarize(summary)
    w = writer(summary, vault)
    old = w.run(now=NOW).written[0]
    (vault / old).write_text((vault / old).read_text(encoding="utf-8").replace("status: inbox", "status: 立項"), encoding="utf-8")

    put(collector, updated_at="2026-10-15T11:30:00Z", title="改名")
    summarize(summary, good_output(title="新的標題"))
    report = w.run(now=NOW)
    assert report.removed == [old]
    assert card_files(vault) == ["ledger/conversations/2026/10/2026-10-15_chatgpt_新的標題.md"]
    assert "status: 立項" in (vault / report.written[0]).read_text(encoding="utf-8")


def test_second_run_without_new_summaries_changes_nothing(db, vault):
    collector, summary = db
    put(collector)
    summarize(summary)
    w = writer(summary, vault)
    w.run(now=NOW)
    mtimes = {p: p.stat().st_mtime_ns for p in vault.rglob("*.md")}
    report = w.run(now=NOW)
    assert report.written == [] and report.logs == []
    assert {p: p.stat().st_mtime_ns for p in vault.rglob("*.md")} == mtimes


def test_daily_log(db, vault):
    collector, summary = db
    put(collector, conv_id="a", updated_at="2026-10-15T01:05:00Z")   # 台北 09:05，會摘要
    put(collector, conv_id="b", platform="grok", platform_name="Grok", url="https://grok.com/c/b",
        updated_at="2026-10-15T11:55:00Z")                              # 台北 19:55，還沒靜止 → 摘要中
    put(collector, conv_id="c", updated_at="2026-10-14T03:00:00Z")    # 前一天
    add_run(collector, "chatgpt", "ok")
    add_run(collector, "grok", "needs_login")
    summarize(summary)

    report = writer(summary, vault).run(now=NOW)
    assert "ledger/daily/2026/10/2026-10-15.md" in report.logs
    assert "ledger/daily/2026/10/2026-10-14.md" in report.logs
    lines = (vault / "ledger/daily/2026/10/2026-10-15.md").read_text(encoding="utf-8").splitlines()
    assert lines[0] == "巡檢狀態：ChatGPT 正常（10-15 19:30）；Grok 需重新登入（10-15 19:30）"
    rows = [l for l in lines if l.startswith("| ") and not l.startswith("| 時間")]
    assert rows == [
        "| 09:05 | ChatGPT | [[2026-10-15_chatgpt_換電站排程]] | swap-ems |",
        "| 19:55 | Grok | 換電站排程想法（摘要中） |  |",
    ]


def test_empty_day_log(db, vault):
    collector, summary = db
    report = writer(summary, vault).run(now=NOW)
    text = (vault / report.logs[0]).read_text(encoding="utf-8")
    assert text.startswith("巡檢狀態：尚無紀錄")
    assert "今天沒有對話紀錄。" in text


def snapshot(root):
    return {p.relative_to(root).as_posix(): (p.read_bytes(), p.stat().st_mtime_ns)
            for p in root.rglob("*") if p.is_file()}


def test_writes_stay_inside_ledger(db, vault):
    collector, summary = db
    put(collector, conv_id="a")
    put(collector, conv_id="b", platform="grok", platform_name="Grok", url="https://grok.com/c/b")
    add_run(collector, "chatgpt", "ok")
    summarize(summary)
    before = {k: v for k, v in snapshot(vault).items()}
    writer(summary, vault).run(now=NOW)
    after = snapshot(vault)
    outside = {k: v for k, v in after.items() if not k.startswith("ledger/")}
    assert outside == before            # ledger/ 以外沒有新檔、沒有變動（profile.md 內容與時間都不變）
    assert any(k.startswith("ledger/conversations/") for k in after)


@pytest.mark.parametrize("rel", ["profile.md", "ledger", "ledger/../profile.md", "../x.md", "Ideas/a.md", "/etc/x.md"])
def test_ensure_in_ledger_rejects_outside(vault, rel):
    with pytest.raises(OutsideLedgerError):
        ensure_in_ledger(vault, rel)


def test_legacy_card_path_outside_ledger_is_ignored(db, vault):
    collector, summary = db
    put(collector)
    summarize(summary)
    w = writer(summary, vault)
    w.run(now=NOW)
    legacy = vault / "Ideas/2026/10/2026-10-15_chatgpt_舊卡.md"
    legacy.parent.mkdir(parents=True)
    legacy.write_text("---\nstatus: 立項\n---\n", encoding="utf-8")
    summary.conn.execute("UPDATE card SET path = ?", (legacy.relative_to(vault).as_posix(),))
    summary.conn.commit()

    put(collector, updated_at="2026-10-15T11:30:00Z", title="改名")
    summarize(summary, good_output(title="新的標題"))
    report = w.run(now=NOW)
    assert report.removed == []
    assert legacy.exists()                                   # ledger/ 外的舊檔不刪
    assert "status: inbox" in (vault / report.written[0]).read_text(encoding="utf-8")  # 也不讀它的 status

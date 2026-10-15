"""T22 衍生索引：平台總覽、每月彙總、想法索引、依專案分組。"""
import pytest

from conftest import NOW, PROJECTS, FakeLLM, good_output, put
from summarizer.obsidian import LedgerWriter
from summarizer.prompt import load_projects
from summarizer.worker import run_once


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "AiMemory"
    (root / "projects").mkdir(parents=True)
    (root / "projects/README.md").write_text("# 索引\n", encoding="utf-8")
    for code, name in PROJECTS.items():
        (root / f"projects/{code}.md").write_text(f"# {name}\n", encoding="utf-8")
    (root / "ledger/ideas/by-project").mkdir(parents=True)
    (root / "ledger/ideas/by-project/.gitkeep").write_text("", encoding="utf-8")
    return root


def add_run(collector, platform, status, finished="2026-10-15T11:30:00Z"):
    collector.conn.execute(
        """INSERT INTO sweep_run(platform, started_at, finished_at, status, listed, fetched, received_at)
           VALUES(?,?,?,?,0,0,?)""", (platform, finished, finished, status, finished))
    collector.conn.commit()


def seed(collector, summary):
    put(collector, conv_id="a", created_at="2026-10-14T23:00:00Z", updated_at="2026-10-15T01:05:00Z")
    put(collector, conv_id="b", platform="grok", platform_name="Grok", url="https://grok.com/c/b",
        created_at="2026-10-15T02:00:00Z", updated_at="2026-10-15T03:00:00Z")
    put(collector, conv_id="c", created_at="2026-09-30T16:00:00Z", updated_at="2026-09-30T17:00:00Z")  # 台北 10/01
    put(collector, conv_id="d", created_at="2026-09-20T02:00:00Z", updated_at="2026-09-20T03:00:00Z")
    add_run(collector, "chatgpt", "ok")
    add_run(collector, "grok", "rate_limited")
    outputs = {
        "a": good_output(),
        "b": good_output(title="Grok 閒聊", projects=[], decisions=[],
                         ideas=[{"type": "待驗證", "idea": "A|B\n比較", "next_step": ""}]),
        "c": good_output(title="電池壽命", projects=["電池", "換電站EMS"], ideas=[], decisions=["改用 LFP"]),
        "d": good_output(title="九月的對話", projects=["battery"],
                         ideas=[{"type": "延伸", "idea": "九月想法", "next_step": "再看看"}], decisions=[]),
    }
    # pending 依 updated_at 由舊到新：d、c、a、b
    run_once(summary, FakeLLM(outputs["d"], outputs["c"], outputs["a"], outputs["b"]), "test-model",
             now=NOW, projects=PROJECTS)


def write(summary, repo, projects=None):
    return LedgerWriter(summary.conn, repo, projects=PROJECTS if projects is None else projects).run(now=NOW)


def read(repo, rel):
    return (repo / "ledger" / rel).read_text(encoding="utf-8")


EXPECTED_PLATFORMS = """# 平台總覽

| 平台 | 首次互動 | 最後互動 | 對話數 | 最近巡檢 |
|---|---|---|---|---|
| ChatGPT | 2026-09-20 | 2026-10-15 | 3 | 正常（10-15 19:30） |
| Grok | 2026-10-15 | 2026-10-15 | 1 | 退避中（10-15 19:30） |
"""

EXPECTED_MONTHLY = """# 2026-10 每月彙總

## 各平台

| 平台 | 對話數 | 使用天數 |
|---|---|---|
| ChatGPT | 2 | 2 |
| Grok | 1 | 1 |

## 各專案

| 專案 | 相關對話數 |
|---|---|
| 換電站EMS（swap-ems） | 2 |
| 電池（battery） | 1 |
| 未歸類 | 1 |

## 本月新想法

| 日期 | 平台 | 類型 | 想法 | 下一步 | 狀態 | 想法卡 |
|---|---|---|---|---|---|---|
| 2026-10-15 | Grok | 待驗證 | A\\|B 比較 |  | inbox | [[2026-10-15_grok_Grok 閒聊]] |
| 2026-10-15 | ChatGPT | 新想法 | 依電價分時充電 | 拉三個月電價資料 | inbox | [[2026-10-15_chatgpt_換電站排程]] |

## 本月決策

- 先用規則式排程 — [[2026-10-15_chatgpt_換電站排程]]
- 改用 LFP — [[2026-10-01_chatgpt_電池壽命]]
"""

EXPECTED_INDEX = """# 想法索引

所有未封存的想法，依對話最後更新時間由新到舊。共 3 則。

| 日期 | 平台 | 類型 | 想法 | 下一步 | 狀態 | 專案 | 想法卡 |
|---|---|---|---|---|---|---|---|
| 2026-10-15 | Grok | 待驗證 | A\\|B 比較 |  | inbox | other | [[2026-10-15_grok_Grok 閒聊]] |
| 2026-10-15 | ChatGPT | 新想法 | 依電價分時充電 | 拉三個月電價資料 | inbox | swap-ems | [[2026-10-15_chatgpt_換電站排程]] |
| 2026-09-20 | ChatGPT | 延伸 | 九月想法 | 再看看 | inbox | battery | [[2026-09-20_chatgpt_九月的對話]] |
"""

EXPECTED_BY_PROJECT = """# 換電站EMS（swap-ems）

專案檔：[projects/swap-ems.md](../../../projects/swap-ems.md)

| 日期 | 平台 | 類型 | 想法 | 下一步 | 狀態 | 想法卡 |
|---|---|---|---|---|---|---|
| 2026-10-15 | ChatGPT | 新想法 | 依電價分時充電 | 拉三個月電價資料 | inbox | [[2026-10-15_chatgpt_換電站排程]] |
"""


def test_snapshots(db, repo):
    collector, summary = db
    seed(collector, summary)
    report = write(summary, repo)
    assert sorted(report.indexes) == [
        "ledger/ideas/by-project/battery.md", "ledger/ideas/by-project/other.md",
        "ledger/ideas/by-project/swap-ems.md", "ledger/ideas/index.md",
        "ledger/monthly/2026-09.md", "ledger/monthly/2026-10.md", "ledger/platforms.md",
    ]
    assert read(repo, "platforms.md") == EXPECTED_PLATFORMS
    assert read(repo, "monthly/2026-10.md") == EXPECTED_MONTHLY
    assert read(repo, "ideas/index.md") == EXPECTED_INDEX
    assert read(repo, "ideas/by-project/swap-ems.md") == EXPECTED_BY_PROJECT
    assert read(repo, "ideas/by-project/other.md").startswith("# 未歸類\n")
    assert "九月想法" in read(repo, "monthly/2026-09.md")


def test_new_platform_and_project_appear_without_code_change(db, repo):
    collector, summary = db
    (repo / "projects/solar-lab.md").write_text("# 太陽能實驗室\n", encoding="utf-8")
    projects = load_projects(repo)
    put(collector, conv_id="z", platform="some-new-ai", platform_name="Some New AI", url="https://x.example/c/z")
    run_once(summary, FakeLLM(good_output(title="新平台", projects=["solar-lab"])), "test-model",
             now=NOW, projects=projects)
    write(summary, repo, projects)
    assert "| Some New AI | 2026-10-15 | 2026-10-15 | 1 |  |" in read(repo, "platforms.md")
    by_project = read(repo, "ideas/by-project/solar-lab.md")
    assert by_project.startswith("# 太陽能實驗室（solar-lab）\n")
    assert "[[2026-10-15_some-new-ai_新平台]]" in by_project
    assert read(repo, "ideas/by-project/swap-ems.md").endswith("目前沒有未封存的想法。\n")  # 有專案檔、沒有想法


def test_archived_ideas_leave_index_but_stay_in_monthly(db, repo):
    collector, summary = db
    seed(collector, summary)
    w = LedgerWriter(summary.conn, repo, projects=PROJECTS)
    w.run(now=NOW)
    card = repo / "ledger/conversations/2026/10/2026-10-15_chatgpt_換電站排程.md"
    card.write_text(card.read_text(encoding="utf-8").replace("status: inbox", "status: 封存"), encoding="utf-8")
    report = w.run(now=NOW)
    assert set(report.indexes) == {"ledger/ideas/index.md", "ledger/ideas/by-project/swap-ems.md",
                                   "ledger/monthly/2026-10.md"}
    assert "依電價分時充電" not in read(repo, "ideas/index.md")
    assert "共 2 則" in read(repo, "ideas/index.md")
    assert read(repo, "ideas/by-project/swap-ems.md").endswith("目前沒有未封存的想法。\n")
    assert "| 依電價分時充電 | 拉三個月電價資料 | 封存 |" in read(repo, "monthly/2026-10.md")


def test_second_run_changes_nothing(db, repo):
    collector, summary = db
    seed(collector, summary)
    w = LedgerWriter(summary.conn, repo, projects=PROJECTS)
    w.run(now=NOW)
    mtimes = {p: p.stat().st_mtime_ns for p in repo.rglob("*") if p.is_file()}
    report = w.run(now=NOW)
    assert report.indexes == [] and report.removed == []
    assert {p: p.stat().st_mtime_ns for p in repo.rglob("*") if p.is_file()} == mtimes


def test_stale_by_project_files_removed_and_gitkeep_kept(db, repo):
    collector, summary = db
    seed(collector, summary)
    write(summary, repo)
    (repo / "projects/battery.md").unlink()             # George 移除專案檔
    put(collector, conv_id="d", created_at="2026-09-20T02:00:00Z", updated_at="2026-10-15T04:00:00Z")
    put(collector, conv_id="c", created_at="2026-09-30T16:00:00Z", updated_at="2026-10-15T04:30:00Z")
    run_once(summary, FakeLLM(good_output(title="九月的對話", projects=["swap-ems"]),
                              good_output(title="電池壽命", projects=["swap-ems"])),
             "test-model", now=NOW, projects={"swap-ems": "換電站EMS"})
    report = write(summary, repo, {"swap-ems": "換電站EMS"})
    assert "ledger/ideas/by-project/battery.md" in report.removed
    assert not (repo / "ledger/ideas/by-project/battery.md").exists()
    assert (repo / "ledger/ideas/by-project/.gitkeep").exists()
    assert (repo / "projects/swap-ems.md").exists()     # projects/ 不被碰

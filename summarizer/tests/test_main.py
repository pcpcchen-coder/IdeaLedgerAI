"""python -m summarizer 的寫入開關：IDEA_MEMORY_REPO 有設定才寫 ledger/。"""
from conftest import Store  # collector 建立 conv、sweep_run 表
from summarizer.__main__ import main


def run_main(monkeypatch, tmp_path, repo):
    monkeypatch.chdir(tmp_path)
    Store(str(tmp_path / "ledger.db")).close()
    monkeypatch.setenv("IDEA_DB", str(tmp_path / "ledger.db"))
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.delenv("IDEA_VAULT", raising=False)
    if repo is None:
        monkeypatch.delenv("IDEA_MEMORY_REPO", raising=False)
    else:
        monkeypatch.setenv("IDEA_MEMORY_REPO", str(repo))
    assert main() == 0


def test_no_repo_writes_nothing(monkeypatch, tmp_path):
    run_main(monkeypatch, tmp_path, None)
    assert sorted(p.name for p in tmp_path.iterdir()) == ["ledger.db"]


def test_repo_set_writes_daily_log(monkeypatch, tmp_path):
    repo = tmp_path / "AiMemory"
    repo.mkdir()
    run_main(monkeypatch, tmp_path, repo)
    logs = list((repo / "ledger/daily").rglob("*.md"))
    assert len(logs) == 1
    assert [p.name for p in repo.iterdir()] == ["ledger"]


def test_publish_enabled_without_git_fails_safely(monkeypatch, tmp_path, capsys):
    """IDEA_GIT_PUBLISH=1 但 repo 不是 git clone：pull 失敗、不寫入、結束碼 2。"""
    repo = tmp_path / "AiMemory"
    repo.mkdir()
    monkeypatch.setenv("IDEA_GIT_PUBLISH", "1")
    monkeypatch.chdir(tmp_path)
    Store(str(tmp_path / "ledger.db")).close()
    monkeypatch.setenv("IDEA_DB", str(tmp_path / "ledger.db"))
    monkeypatch.setenv("LLM_MODEL", "test-model")
    monkeypatch.setenv("IDEA_MEMORY_REPO", str(repo))
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path))   # 不往上找到其他 repo
    assert main() == 2
    assert "發佈：" in capsys.readouterr().out
    assert list(repo.iterdir()) == []

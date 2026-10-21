"""T23 Git 發佈器：以本機 bare repo 當假遠端，不碰真正的 AiMemory。"""
import subprocess

import pytest

from conftest import NOW, PROJECTS, FakeLLM, good_output, put
from summarizer.obsidian import LedgerWriter
from summarizer.publisher import BOT_NAME, publish
from summarizer.worker import run_once

USER = ["-c", "user.name=George", "-c", "user.email=george@example.com", "-c", "core.quotepath=false"]
CARD = "ledger/conversations/2026/10/2026-10-15_chatgpt_換電站排程.md"


def git(cwd, *args, check=True):
    proc = subprocess.run(["git", *USER, *args], cwd=cwd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise AssertionError(proc.stderr)
    return proc.stdout


@pytest.fixture(autouse=True)
def isolated_git(monkeypatch, tmp_path):
    """不讀使用者的 git 設定：確認發佈器不依賴本機已設定的 user.name。"""
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "no-gitconfig"))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")


class Remote:
    """假遠端 + George 在其他裝置的 clone + Mac Mini 上 bot 的 clone。"""

    def __init__(self, tmp_path):
        self.bare = tmp_path / "remote.git"
        git(tmp_path, "init", "-q", "--bare", "-b", "main", str(self.bare))
        self.user = tmp_path / "george"
        git(tmp_path, "clone", "-q", str(self.bare), str(self.user))
        git(self.user, "checkout", "-q", "-b", "main")
        (self.user / "profile.md").write_text("# 人工維護\n", encoding="utf-8")
        (self.user / "ledger").mkdir()
        (self.user / "ledger/README.md").write_text("# ledger 規格\n", encoding="utf-8")
        git(self.user, "add", "-A")
        git(self.user, "commit", "-q", "-m", "init")
        git(self.user, "push", "-q", "-u", "origin", "main")
        self.bot = tmp_path / "AiMemory"
        git(tmp_path, "clone", "-q", str(self.bare), str(self.bot))
        self.offline = tmp_path / "remote.offline"

    def head(self):
        return git(self.bare, "rev-parse", "main").strip()

    def show(self, path):
        return git(self.bare, "show", f"main:{path}")

    def files(self):
        return sorted(git(self.bare, "ls-tree", "-r", "--name-only", "main").split())

    def log(self, fmt="%an|%s"):
        return git(self.bare, "log", f"--format={fmt}", "main").splitlines()

    def user_commit(self, edit, msg):
        git(self.user, "pull", "-q", "--rebase")
        edit(self.user)
        git(self.user, "add", "-A")
        git(self.user, "commit", "-q", "-m", msg)
        git(self.user, "push", "-q")

    def go_offline(self):
        self.bare.rename(self.offline)

    def go_online(self):
        self.offline.rename(self.bare)


class HookWriter:
    """包住 LedgerWriter，在寫入期間插入事件（模擬競態、斷線、寫到 ledger/ 外）。"""

    def __init__(self, writer, before=None):
        self.writer, self.before = writer, before

    def run(self, now=None):
        if self.before:
            self.before()
        return self.writer.run(now)

    def reset_card(self, *a, **kw):
        return self.writer.reset_card(*a, **kw)


@pytest.fixture
def env(db, tmp_path):
    collector, summary = db
    remote = Remote(tmp_path)
    return collector, summary, remote, LedgerWriter(summary.conn, remote.bot)


def summarize(summary, *outputs):
    return run_once(summary, FakeLLM(*outputs), "test-model", now=NOW, projects=PROJECTS)


def update_conv(collector, store, at, **out):
    put(collector, updated_at=at, messages=[
        {"role": "user", "text": "第一則：想做換電站排程"},
        {"role": "assistant", "text": "第二則：可以依電價分時"},
        {"role": "user", "text": f"新訊息 {at}"},
    ])
    summarize(store, good_output(**out))


def set_status(text, status):
    return text.replace("status: inbox", f"status: {status}")


def test_publish_pushes_cards_and_logs(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    report = publish(remote.bot, writer, now=NOW)
    assert report.status == "pushed"
    assert CARD in remote.files() and "ledger/daily/2026/10/2026-10-15.md" in remote.files()
    assert remote.log()[0] == f"{BOT_NAME}|ledger: 想法卡 1、日誌 1、索引 5（2026-10-15 20:00）"
    assert git(remote.bare, "log", "-1", "--format=%cn", "main").strip() == BOT_NAME


def test_no_changes_no_commit(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    publish(remote.bot, writer, now=NOW)
    head = remote.head()
    report = publish(remote.bot, writer, now=NOW)
    assert report.status == "no_changes" and report.commit is None
    assert remote.head() == head


def test_rebases_onto_new_remote_commit(env):
    collector, summary, remote, writer = env
    remote.user_commit(lambda d: (d / "profile.md").write_text("# 人工維護\n新的一行\n", encoding="utf-8"), "更新 profile")
    put(collector)
    summarize(summary)
    assert publish(remote.bot, writer, now=NOW).status == "pushed"
    assert [l.split("|")[1] for l in remote.log()][:2] == ["ledger: 想法卡 1、日誌 1、索引 5（2026-10-15 20:00）", "更新 profile"]
    assert git(remote.bare, "rev-list", "--merges", "main") == ""     # 線性歷史
    assert "新的一行" in remote.show("profile.md")


def test_user_status_and_notes_from_remote_preserved(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    publish(remote.bot, writer, now=NOW)

    def edit(d):
        f = d / CARD
        f.write_text(set_status(f.read_text(encoding="utf-8"), "探索中") + "\n手機上補的筆記\n", encoding="utf-8")
    remote.user_commit(edit, "改 status")

    update_conv(collector, summary, "2026-10-15T11:30:00Z", summary="更新後的摘要。")
    assert publish(remote.bot, writer, now=NOW).status == "pushed"
    text = remote.show(CARD)
    assert "status: 探索中" in text and "更新後的摘要。" in text and text.endswith("手機上補的筆記\n")


def test_aborts_when_outside_ledger_is_dirty(env):
    collector, summary, remote, writer = env
    (remote.bot / "profile.md").write_text("bot 機器上被改到\n", encoding="utf-8")
    put(collector)
    summarize(summary)
    head = remote.head()
    report = publish(remote.bot, writer, now=NOW)
    assert report.status == "aborted" and report.outside == ["profile.md"]
    assert report.written is None and not (remote.bot / "ledger/conversations").exists()
    assert remote.head() == head and git(remote.bot, "rev-parse", "HEAD").strip() == head


def test_aborts_before_commit_when_writer_touches_outside(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)

    def stray():
        (remote.bot / "inbox").mkdir()
        (remote.bot / "inbox/x.md").write_text("不該出現\n", encoding="utf-8")
    head = remote.head()
    report = publish(remote.bot, HookWriter(writer, stray), now=NOW)
    assert report.status == "aborted" and report.outside == ["inbox/x.md"]
    assert git(remote.bot, "rev-parse", "HEAD").strip() == head            # 沒有 commit
    assert git(remote.bot, "diff", "--cached", "--name-only") == ""        # 也沒有暫存


def test_push_rejected_then_pull_and_retry(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    race = lambda: remote.user_commit(lambda d: (d / "profile.md").write_text("# 同時改\n", encoding="utf-8"), "同時提交")
    report = publish(remote.bot, HookWriter(writer, race), now=NOW)
    assert report.status == "pushed"
    assert [l.split("|")[1] for l in remote.log()][:2] == ["ledger: 想法卡 1、日誌 1、索引 5（2026-10-15 20:00）", "同時提交"]


def test_offline_commit_kept_and_pushed_next_round(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    head = remote.head()
    report = publish(remote.bot, HookWriter(writer, remote.go_offline), now=NOW)
    assert report.status == "push_failed" and report.commit
    remote.go_online()
    assert remote.head() == head                                            # 遠端還沒有

    report = publish(remote.bot, writer, now=NOW)
    assert report.status == "pushed" and report.commit is None              # 沒有新 commit，只是補推
    assert CARD in remote.files()


def test_conflicting_unpushed_commit_is_discarded_and_rewritten(env):
    collector, summary, remote, writer = env
    put(collector)
    summarize(summary)
    publish(remote.bot, writer, now=NOW)

    # bot 重新摘要（標題與摘要都變，檔案搬到新檔名）但推不出去
    update_conv(collector, summary, "2026-10-15T11:30:00Z", title="新的標題", summary="bot 的新摘要。")
    assert publish(remote.bot, HookWriter(writer, remote.go_offline), now=NOW).status == "push_failed"
    remote.go_online()

    # 同時 George 在其他裝置改了舊檔的 status，也順手改了摘要那一行 → rebase 衝突
    def edit(d):
        f = d / CARD
        text = set_status(f.read_text(encoding="utf-8"), "立項")
        f.write_text(text.replace("討論換電站的充電排程。決定先用規則式排程。", "George 手改的摘要。"), encoding="utf-8")
    remote.user_commit(edit, "立項")

    report = publish(remote.bot, writer, now=NOW)
    assert report.status == "pushed" and report.discarded == 1
    new = "ledger/conversations/2026/10/2026-10-15_chatgpt_新的標題.md"
    cards = [f for f in remote.files() if f.startswith("ledger/conversations/")]
    assert cards == [new]
    assert "status: 立項" in remote.show(new)            # 使用者的 status 保留
    assert "bot 的新摘要。" in remote.show(new)            # 摘要區依規格由系統覆寫
    assert "立項" in [l.split("|")[1] for l in remote.log()]                 # George 的 commit 保留

    assert publish(remote.bot, writer, now=NOW).status == "no_changes"     # 之後恢復正常

"""把 ledger/ 的寫入發佈到 AiMemory 遠端（T23）：pull --rebase → 寫入 → 有變動才 commit → push。

規則以 AiMemory/ledger/README.md「寫入與同步規則」為準：
- 寫入前先 pull，讀到使用者在其他裝置改過的 status 與筆記後才重寫。
- 只 commit ledger/ 底下的變動；工作區有 ledger/ 以外的變動就中止，不 commit。
- push 被拒時重新 pull 再試一次；仍失敗留到下一輪，不強制覆蓋。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from zoneinfo import ZoneInfo

from .obsidian import LEDGER_DIR, WriteReport

BOT_NAME = "Idea Ledger Bot"
BOT_EMAIL = "idea-ledger-bot@users.noreply.github.com"
CARDS = f"{LEDGER_DIR}/conversations/"
DAILY = f"{LEDGER_DIR}/daily/"


class Writer(Protocol):
    def run(self) -> WriteReport: ...
    def reset_card(self, platform: str, conv_id: str, path: str | None = None) -> None: ...


@dataclass
class PublishReport:
    status: str                      # pushed | no_changes | aborted | pull_failed | push_failed | error
    detail: str = ""
    commit: str | None = None        # 本輪新增的 commit
    discarded: int = 0               # 因衝突丟棄的未推出 bot commit 數
    written: WriteReport | None = None
    outside: list[str] = field(default_factory=list)


class GitError(RuntimeError):
    pass


class Repo:
    def __init__(self, root: str | Path, email: str = BOT_EMAIL):
        self.root = Path(root)
        self.env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"}
        # 本機只會有 bot 的 commit（rebase、autostash 也會產生 commit），一律以 bot 身分執行
        self.identity = ["-c", f"user.name={BOT_NAME}", "-c", f"user.email={email}", "-c", "commit.gpgsign=false"]

    def run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        proc = subprocess.run(["git", *self.identity, *args], cwd=self.root, env=self.env,
                              capture_output=True, text=True)
        if check and proc.returncode != 0:
            raise GitError(f"git {' '.join(args)}：{proc.stderr.strip() or proc.stdout.strip()}")
        return proc

    def out(self, *args: str) -> str:
        return self.run(*args).stdout

    def paths(self, *args: str) -> list[str]:
        """以 -z 輸出取路徑，避免非 ASCII 檔名被加引號跳脫。"""
        cmd, *rest = args          # -z 要放在子命令之後、"--" 之前
        return [p for p in self.out(cmd, "-z", *rest).split("\0") if p]

    def name_status(self, *args: str) -> list[tuple[str, str]]:
        """diff --name-status --no-renames -z → [(狀態字母, 路徑)]。"""
        parts = self.paths("diff", "--name-status", "--no-renames", *args)
        return [(parts[i][0], parts[i + 1]) for i in range(0, len(parts) - 1, 2)]

    def changed_paths(self) -> list[str]:
        """工作區與暫存區所有變動（含未追蹤檔），相對於 repo 根。"""
        raw = self.out("status", "--porcelain=v1", "-z", "--untracked-files=all")
        parts = raw.split("\0")
        paths, i = [], 0
        while i < len(parts) and parts[i]:
            entry = parts[i]
            paths.append(entry[3:])
            if entry[0] in "RC":          # 改名：下一段是原路徑
                i += 1
                paths.append(parts[i])
            i += 1
        return paths

    def rebasing(self) -> bool:
        git_dir = Path(self.out("rev-parse", "--absolute-git-dir").strip())
        return (git_dir / "rebase-merge").exists() or (git_dir / "rebase-apply").exists()

    def ahead(self) -> int:
        return int(self.out("rev-list", "--count", "@{u}..HEAD").strip())


def outside_ledger(paths: list[str]) -> list[str]:
    return [p for p in paths if not p.startswith(f"{LEDGER_DIR}/")]


def card_key(text: str) -> tuple[str, str] | None:
    """從想法卡 frontmatter 取出 (platform, conv_id)。"""
    platform = re.search(r"^platform:\s*(\S+)\s*$", text, re.M)
    conv_id = re.search(r"^conv_id:\s*(.+?)\s*$", text, re.M)
    if not platform or not conv_id:
        return None
    raw = conv_id.group(1)
    return platform.group(1), json.loads(raw) if raw.startswith('"') else raw


def commit_message(names: list[tuple[str, str]], now: datetime, tz: str) -> str:
    cards = sum(1 for s, p in names if p.startswith(CARDS) and s != "D")
    logs = sum(1 for s, p in names if p.startswith(DAILY) and s != "D")
    others = sum(1 for s, p in names if not p.startswith((CARDS, DAILY)) and s != "D")
    parts = [f"想法卡 {cards}", f"日誌 {logs}"] + ([f"其他 {others}"] if others else [])
    return f"ledger: {'、'.join(parts)}（{now.astimezone(ZoneInfo(tz)):%Y-%m-%d %H:%M}）"


def discard_unpushed(repo: Repo, writer: Writer) -> int:
    """pull 衝突時：丟棄未推出的 bot commit 與 ledger/ 的未提交變動，回到遠端版本，並讓相關想法卡下次重寫。

    只在未推出的 commit 全部由 bot 提交、且只動 ledger/ 時才做；否則丟出 GitError。
    """
    authors = {a for a in repo.out("log", "--format=%an", "@{u}..HEAD").splitlines() if a}
    if authors - {BOT_NAME}:
        raise GitError(f"未推出的 commit 含非 bot 作者：{sorted(authors - {BOT_NAME})}")
    if outside := outside_ledger(repo.paths("diff", "--name-only", "@{u}", "HEAD")):
        raise GitError(f"未推出的 commit 動到 ledger/ 以外：{outside}")
    count = repo.ahead()

    # 工作區（含未提交、未追蹤）相對於遠端版本的想法卡變動
    changes = repo.name_status("@{u}", "--", CARDS)
    changes += [("A", p) for p in repo.paths("ls-files", "--others", "--exclude-standard", "--", CARDS)]

    resets = []
    for status, path in changes:
        if status == "D":
            key = card_key(repo.out("show", f"@{{u}}:{path}"))
            if key:
                resets.append((1, key, path))     # 遠端仍是舊檔名：指回舊檔
        else:
            file = repo.root / path
            key = card_key(file.read_text(encoding="utf-8")) if file.exists() else None
            if key:
                resets.append((0, key, None))
    for _, (platform, conv_id), path in sorted(resets, key=lambda r: r[0]):
        writer.reset_card(platform, conv_id, path)

    repo.run("reset", "-q", "--hard", "@{u}")
    repo.run("clean", "-q", "-fd", "--", f"{LEDGER_DIR}/")
    return count


def push_with_retry(repo: Repo) -> tuple[bool, str]:
    first = repo.run("push", "-q", check=False)
    if first.returncode == 0:
        return True, ""
    pull = repo.run("pull", "-q", "--rebase", check=False)
    if pull.returncode != 0:
        if repo.rebasing():
            repo.run("rebase", "--abort", check=False)
        return False, f"push 被拒且重新 pull 失敗：{pull.stderr.strip()}"
    second = repo.run("push", "-q", check=False)
    if second.returncode == 0:
        return True, ""
    return False, f"push 失敗：{second.stderr.strip()}"


def publish(root: str | Path, writer: Writer, *, now: datetime | None = None,
            email: str = BOT_EMAIL, tz: str = "Asia/Taipei") -> PublishReport:
    """執行一輪發佈；git 本身出錯（例如不是 git clone）時回報 error，不丟例外。"""
    try:
        return _publish(Repo(root, email), writer, now or datetime.now(timezone.utc), tz)
    except GitError as e:
        return PublishReport("error", str(e))


def _publish(repo: Repo, writer: Writer, now: datetime, tz: str) -> PublishReport:

    # 1. 前置檢查：ledger/ 以外有變動就不動這個 repo
    if outside := outside_ledger(repo.changed_paths()):
        return PublishReport("aborted", "工作區有 ledger/ 以外的變動，這輪不寫入", outside=outside)

    # 2. pull
    discarded = 0
    pull = repo.run("pull", "-q", "--rebase", "--autostash", check=False)
    if pull.returncode != 0:
        if not repo.rebasing():
            return PublishReport("pull_failed", pull.stderr.strip())
        repo.run("rebase", "--abort", check=False)
        try:
            discarded = discard_unpushed(repo, writer)
        except GitError as e:
            return PublishReport("pull_failed", f"pull 衝突且無法自動處理：{e}")

    # 3. 寫入
    written = writer.run()

    # 4. commit 前再檢查一次
    if outside := outside_ledger(repo.changed_paths()):
        return PublishReport("aborted", "寫入後出現 ledger/ 以外的變動，不 commit", written=written,
                             outside=outside, discarded=discarded)
    repo.run("add", "-A", "--", f"{LEDGER_DIR}/")
    names = repo.name_status("--cached")

    # 5. commit（有變動才做）
    commit = None
    if names:
        msg = commit_message(names, now, tz)
        repo.run("commit", "-q", "--no-verify", "-m", msg)
        commit = repo.out("rev-parse", "HEAD").strip()

    # 6. push（含上一輪留下沒推出的 commit）
    if repo.ahead() == 0:
        return PublishReport("no_changes", written=written, discarded=discarded)
    ok, detail = push_with_retry(repo)
    return PublishReport("pushed" if ok else "push_failed", detail, commit=commit, written=written, discarded=discarded)

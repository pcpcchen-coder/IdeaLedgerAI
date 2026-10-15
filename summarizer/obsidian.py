"""把 summary 表寫成想法卡與每日平台互動日誌（T10），寫到 AiMemory 的 ledger/（T20）。

路徑規格以 AiMemory/ledger/README.md 為準。寫入根目錄是 AiMemory 本機 clone 的根，
所有寫入與刪除都必須落在 ledger/ 之內（ensure_in_ledger）。
平台是開放的：只用 conv 表裡的平台 id 與顯示名稱，不認得任何特定平台。
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LEDGER_DIR = "ledger"
NOTES_MARKER = "<!-- 以下為個人筆記，系統不會覆寫 -->"
DEFAULT_STATUS = "inbox"
STATUS_LABEL = {
    "ok": "正常",
    "rate_limited": "退避中",
    "needs_login": "需重新登入",
    "format_error": "介面失效",
    "error": "錯誤",
}
UNSAFE = re.compile(r'[\\/:*?"<>|\r\n\t#^\[\]]+')

SCHEMA = """
CREATE TABLE IF NOT EXISTS card(
  platform TEXT NOT NULL,
  conv_id TEXT NOT NULL,
  path TEXT NOT NULL,              -- 相對於 AiMemory repo 根的路徑（ledger/...）
  version TEXT NOT NULL,           -- 寫入時依據的摘要版本：摘要時間 + 對話版本
  written_at TEXT NOT NULL,
  PRIMARY KEY(platform, conv_id)
);
"""


def parse_ts(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def safe_title(title: str, limit: int = 60) -> str:
    cleaned = UNSAFE.sub("-", title or "").strip(" .-")
    return (cleaned or "未命名")[:limit]


def yaml_str(v) -> str:
    if v is None:
        return "null"
    return json.dumps(str(v), ensure_ascii=False)


def atomic_write(path: Path, text: str) -> bool:
    """內容相同就不寫（不改動修改時間，避免 Obsidian 同步無謂變動）；回傳是否有寫入。"""
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".md")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)
    return True


class OutsideLedgerError(ValueError):
    """路徑不在 ledger/ 之內。"""


def ensure_in_ledger(root: Path, rel: str) -> Path:
    """回傳 root/rel 的絕對路徑；解析後不在 root/ledger/ 之內就丟出錯誤。"""
    ledger = (root / LEDGER_DIR).resolve()
    target = (root / rel).resolve()
    if target == ledger or ledger not in target.parents:
        raise OutsideLedgerError(f"拒絕寫入 ledger/ 以外的路徑：{rel}")
    return target


def is_in_ledger(root: Path, rel: str) -> bool:
    try:
        ensure_in_ledger(root, rel)
        return True
    except OutsideLedgerError:
        return False


@dataclass
class WriteReport:
    written: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)


class LedgerWriter:
    def __init__(self, conn: sqlite3.Connection, repo: str | Path, tz: str = "Asia/Taipei"):
        """repo：AiMemory 本機 clone 的根目錄。"""
        self.conn = conn
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.repo = Path(repo)
        self.tz = ZoneInfo(tz)

    def path(self, rel: str) -> Path:
        return ensure_in_ledger(self.repo, rel)

    # ---- 共用 ----

    def local(self, iso: str) -> datetime:
        return parse_ts(iso).astimezone(self.tz)

    def card_relpath(self, row) -> str:
        d = self.local(row["created_at"])
        name = f"{d:%Y-%m-%d}_{row['platform']}_{safe_title(row['s_title'] or row['title'])}.md"
        return f"{LEDGER_DIR}/conversations/{d:%Y}/{d:%m}/{name}"

    @staticmethod
    def existing_user_parts(path: Path) -> tuple[str, str]:
        """讀出既有檔案中使用者可改的部分：status、個人筆記。"""
        if not path.exists():
            return DEFAULT_STATUS, ""
        text = path.read_text(encoding="utf-8")
        m = re.search(r"^status:\s*(.+?)\s*$", text, re.M)
        status = m.group(1).strip().strip('"') if m else DEFAULT_STATUS
        notes = text.split(NOTES_MARKER, 1)[1] if NOTES_MARKER in text else ""
        return status or DEFAULT_STATUS, notes

    def render_card(self, row, status: str, notes: str) -> str:
        ideas = json.loads(row["ideas_json"])
        decisions = json.loads(row["decisions_json"])
        projects = json.loads(row["projects_json"])
        fm = [
            "---",
            f"platform: {row['platform']}",
            f"platform_name: {yaml_str(row['platform_name'] or row['platform'])}",
            f"conv_id: {yaml_str(row['conv_id'])}",
            f"url: {row['url']}",
            f"platform_project: {yaml_str(row['project'])}",
            f"created: {self.local(row['created_at']).isoformat(timespec='minutes')}",
            f"updated: {self.local(row['updated_at']).isoformat(timespec='minutes')}",
            f"projects: [{', '.join(yaml_str(p) for p in projects)}]",
            f"status: {status}",
            "---",
        ]
        body = [f"# {row['s_title']}", "", "## 摘要", "", row["summary"], "", "## 想法", ""]
        body += [f"- [{i['type']}] {i['idea']}" + (f" → 下一步：{i['next_step']}" if i.get("next_step") else "") for i in ideas] or ["- （無）"]
        body += ["", "## 決策", ""]
        body += [f"- {d}" for d in decisions] or ["- （無）"]
        body += ["", f"來源：[{row['platform_name'] or row['platform']}]({row['url']})", "", NOTES_MARKER]
        return "\n".join(fm + [""] + body) + (notes if notes else "\n")

    # ---- 想法卡 ----

    def write_cards(self, report: WriteReport) -> set[str]:
        """寫有新摘要的想法卡；回傳受影響的日誌日期（依對話最後更新時間）。"""
        rows = self.conn.execute(
            """SELECT c.*, s.title AS s_title, s.summary, s.ideas_json, s.decisions_json, s.projects_json,
                      s.summarized_at || '|' || s.source_updated_at AS version, k.path AS old_path
               FROM summary s
               JOIN conv c ON c.platform = s.platform AND c.conv_id = s.conv_id
               LEFT JOIN card k ON k.platform = s.platform AND k.conv_id = s.conv_id
               WHERE s.summary IS NOT NULL
                 AND (k.version IS NULL OR k.version != s.summarized_at || '|' || s.source_updated_at)"""
        ).fetchall()
        days = set()
        now = datetime.now(timezone.utc).isoformat()
        for row in rows:
            rel = self.card_relpath(row)
            target = self.path(rel)
            # T10 時期的舊路徑（ledger/ 以外）視為沒有舊檔：不讀、不刪
            old = row["old_path"] if row["old_path"] and is_in_ledger(self.repo, row["old_path"]) else None
            source = self.path(old) if old else target
            status, notes = self.existing_user_parts(source)
            atomic_write(target, self.render_card(row, status, notes))
            if old and old != rel and source.exists():
                source.unlink()
                report.removed.append(old)
            with self.conn:
                self.conn.execute(
                    """INSERT INTO card(platform, conv_id, path, version, written_at) VALUES(?,?,?,?,?)
                       ON CONFLICT(platform, conv_id) DO UPDATE SET path=excluded.path,
                         version=excluded.version, written_at=excluded.written_at""",
                    (row["platform"], row["conv_id"], rel, row["version"], now),
                )
            report.written.append(rel)
            days.add(f"{self.local(row['updated_at']):%Y-%m-%d}")
        return days

    def reset_card(self, platform: str, conv_id: str, path: str | None = None) -> None:
        """讓這張想法卡下一次重寫（發佈器丟棄未推出的 commit 後使用）；path 指定它目前在 repo 中的位置。"""
        with self.conn:
            if path:
                self.conn.execute("UPDATE card SET version='', path=? WHERE platform=? AND conv_id=?",
                                  (path, platform, conv_id))
            else:
                self.conn.execute("UPDATE card SET version='' WHERE platform=? AND conv_id=?", (platform, conv_id))

    # ---- 每日日誌 ----

    def status_line(self) -> str:
        names = {r["platform"]: r["name"] for r in self.conn.execute(
            "SELECT platform, MAX(platform_name) AS name FROM conv GROUP BY platform")}
        runs = self.conn.execute(
            """SELECT s.platform, s.status, s.finished_at FROM sweep_run s
               JOIN (SELECT platform, MAX(id) AS id FROM sweep_run GROUP BY platform) m ON s.id = m.id
               ORDER BY s.platform"""
        ).fetchall()
        if not runs:
            return "巡檢狀態：尚無紀錄"
        parts = [
            f"{names.get(r['platform']) or r['platform']} {STATUS_LABEL.get(r['status'], r['status'])}"
            f"（{self.local(r['finished_at']):%m-%d %H:%M}）"
            for r in runs
        ]
        return "巡檢狀態：" + "；".join(parts)

    def write_log(self, day: str) -> str:
        rows = self.conn.execute(
            """SELECT c.platform, c.platform_name, c.title, c.updated_at, k.path, s.projects_json
               FROM conv c
               LEFT JOIN card k ON k.platform = c.platform AND k.conv_id = c.conv_id
               LEFT JOIN summary s ON s.platform = c.platform AND s.conv_id = c.conv_id AND s.summary IS NOT NULL"""
        ).fetchall()
        today = sorted((r for r in rows if f"{self.local(r['updated_at']):%Y-%m-%d}" == day),
                       key=lambda r: r["updated_at"])
        lines = [self.status_line(), "", f"# {day} 平台互動日誌", ""]
        if not today:
            lines.append("今天沒有對話紀錄。")
        else:
            lines += ["| 時間 | 平台 | 對話 | 專案 |", "|---|---|---|---|"]
            for r in today:
                link = f"[[{Path(r['path']).stem}]]" if r["path"] else f"{safe_title(r['title'])}（摘要中）"
                projects = "、".join(json.loads(r["projects_json"])) if r["projects_json"] else ""
                lines.append(f"| {self.local(r['updated_at']):%H:%M} | {r['platform_name'] or r['platform']} | {link} | {projects} |")
        rel = f"{LEDGER_DIR}/daily/{day[:4]}/{day[5:7]}/{day}.md"
        return rel if atomic_write(self.path(rel), "\n".join(lines) + "\n") else None

    def run(self, now: datetime | None = None) -> WriteReport:
        report = WriteReport()
        days = self.write_cards(report)
        now = now or datetime.now(timezone.utc)
        days.add(f"{now.astimezone(self.tz):%Y-%m-%d}")
        for day in sorted(days):
            if rel := self.write_log(day):
                report.logs.append(rel)
        return report

"""衍生索引（T22）：平台總覽、每月彙總、想法索引、依專案分組的想法索引。

格式依 AiMemory/ledger/README.md。平台與專案都是開放的：平台來自 conv 表，專案來自 AiMemory 的 projects/。
想法卡的 status 由使用者擁有，一律從想法卡檔案讀。
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING

from .obsidian import DEFAULT_STATUS, LEDGER_DIR, STATUS_LABEL, atomic_write
from .prompt import OTHER_PROJECT

if TYPE_CHECKING:
    from .obsidian import LedgerWriter

ARCHIVED = "封存"
BY_PROJECT = f"{LEDGER_DIR}/ideas/by-project"
IDEA_HEADER = ["日期", "平台", "類型", "想法", "下一步", "狀態"]


def cell(value) -> str:
    """表格欄位：跳脫 | 並把換行壓成空白。"""
    return re.sub(r"\s*\n\s*", " ", str(value or "")).replace("|", "\\|")


def table(header: list[str], rows: list[list]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    return lines + ["| " + " | ".join(cell(v) for v in r) + " |" for r in rows]


def card_status(path: Path) -> str:
    m = re.search(r"^status:\s*(.+?)\s*$", path.read_text(encoding="utf-8"), re.M)
    return (m.group(1).strip().strip('"') if m else "") or DEFAULT_STATUS


class IndexWriter:
    def __init__(self, ledger: "LedgerWriter", projects: dict[str, str]):
        self.w = ledger
        self.projects = projects
        self.convs = [dict(r) for r in ledger.conn.execute(
            "SELECT platform, platform_name, conv_id, created_at, updated_at FROM conv")]
        self.names = {}
        for c in self.convs:
            self.names[c["platform"]] = c["platform_name"] or self.names.get(c["platform"]) or c["platform"]
        self.cards = self._cards()

    def _cards(self) -> list[dict]:
        """已寫成想法卡、檔案仍存在的對話，由新到舊。"""
        rows = self.w.conn.execute(
            """SELECT c.platform, c.updated_at, k.path, s.ideas_json, s.decisions_json, s.projects_json
               FROM card k
               JOIN conv c ON c.platform = k.platform AND c.conv_id = k.conv_id
               JOIN summary s ON s.platform = k.platform AND s.conv_id = k.conv_id
               WHERE s.summary IS NOT NULL
               ORDER BY c.updated_at DESC, k.path"""
        ).fetchall()
        cards = []
        for r in rows:
            file = self.w.path(r["path"])
            if not file.exists():
                continue
            local = self.w.local(r["updated_at"])
            cards.append({
                "platform": r["platform"],
                "date": f"{local:%Y-%m-%d}",
                "month": f"{local:%Y-%m}",
                "link": f"[[{file.stem}]]",
                "status": card_status(file),
                "ideas": json.loads(r["ideas_json"]),
                "decisions": json.loads(r["decisions_json"]),
                "projects": json.loads(r["projects_json"]) or [OTHER_PROJECT],
            })
        return cards

    def project_label(self, code: str) -> str:
        if code == OTHER_PROJECT:
            return "未歸類"
        name = self.projects.get(code)
        return f"{name}（{code}）" if name and name != code else code

    def idea_rows(self, cards: list[dict], *, with_projects: bool = False) -> list[list]:
        rows = []
        for c in cards:
            for i in c["ideas"]:
                row = [c["date"], self.names.get(c["platform"], c["platform"]), i["type"], i["idea"],
                       i.get("next_step", ""), c["status"]]
                if with_projects:
                    row.append("、".join(c["projects"]))
                rows.append(row + [c["link"]])
        return rows

    # ---- 各檔 ----

    def platforms(self) -> str:
        runs = {r["platform"]: r for r in self.w.conn.execute(
            """SELECT s.platform, s.status, s.finished_at FROM sweep_run s
               JOIN (SELECT platform, MAX(id) AS id FROM sweep_run GROUP BY platform) m ON s.id = m.id""")}
        by_platform = defaultdict(list)
        for c in self.convs:
            by_platform[c["platform"]].append(c)
        rows = []
        for p in sorted(set(by_platform) | set(runs)):
            convs = by_platform.get(p, [])
            first = f"{min(self.w.local(c['created_at']) for c in convs):%Y-%m-%d}" if convs else ""
            last = f"{max(self.w.local(c['updated_at']) for c in convs):%Y-%m-%d}" if convs else ""
            run = runs.get(p)
            sweep = (f"{STATUS_LABEL.get(run['status'], run['status'])}"
                     f"（{self.w.local(run['finished_at']):%m-%d %H:%M}）") if run else ""
            rows.append([self.names.get(p, p), first, last, len(convs), sweep])
        lines = ["# 平台總覽", ""]
        lines += table(["平台", "首次互動", "最後互動", "對話數", "最近巡檢"], rows) if rows else ["尚無紀錄。"]
        return "\n".join(lines) + "\n"

    def monthly(self, month: str) -> str:
        convs = [c for c in self.convs if f"{self.w.local(c['updated_at']):%Y-%m}" == month]
        cards = [c for c in self.cards if c["month"] == month]
        per_platform = defaultdict(lambda: [0, set()])
        for c in convs:
            stat = per_platform[c["platform"]]
            stat[0] += 1
            stat[1].add(f"{self.w.local(c['updated_at']):%Y-%m-%d}")
        per_project = defaultdict(int)
        for c in cards:
            for code in c["projects"]:
                per_project[code] += 1

        lines = [f"# {month} 每月彙總", "", "## 各平台", ""]
        lines += table(["平台", "對話數", "使用天數"],
                       [[self.names.get(p, p), n, len(days)] for p, (n, days) in sorted(per_platform.items())])
        lines += ["", "## 各專案", ""]
        projects = sorted(per_project.items(), key=lambda kv: (kv[0] == OTHER_PROJECT, -kv[1], kv[0]))
        lines += table(["專案", "相關對話數"], [[self.project_label(k), n] for k, n in projects]) if projects \
            else ["本月沒有已整理的對話。"]
        ideas = self.idea_rows(cards)
        lines += ["", "## 本月新想法", ""]
        lines += table(IDEA_HEADER + ["想法卡"], ideas) if ideas else ["本月沒有想法。"]
        decisions = [f"- {cell(d)} — {c['link']}" for c in cards for d in c["decisions"]]
        lines += ["", "## 本月決策", ""] + (decisions or ["本月沒有決策。"])
        return "\n".join(lines) + "\n"

    def ideas_index(self) -> str:
        rows = self.idea_rows([c for c in self.cards if c["status"] != ARCHIVED], with_projects=True)
        lines = ["# 想法索引", "", f"所有未封存的想法，依對話最後更新時間由新到舊。共 {len(rows)} 則。", ""]
        lines += table(IDEA_HEADER + ["專案", "想法卡"], rows) if rows else ["目前沒有未封存的想法。"]
        return "\n".join(lines) + "\n"

    def by_project(self, code: str) -> str:
        cards = [c for c in self.cards if c["status"] != ARCHIVED and code in c["projects"]]
        rows = self.idea_rows(cards)
        lines = [f"# {self.project_label(code)}", ""]
        if code in self.projects:
            # 不用 [[代號]]：by-project 底下有同名檔，Obsidian 會連到自己
            lines += [f"專案檔：[projects/{code}.md](../../../projects/{code}.md)", ""]
        lines += table(IDEA_HEADER + ["想法卡"], rows) if rows else ["目前沒有未封存的想法。"]
        return "\n".join(lines) + "\n"

    # ---- 寫入 ----

    def run(self) -> tuple[list[str], list[str]]:
        """回傳（有寫入的檔案, 刪除的檔案）。"""
        files = {f"{LEDGER_DIR}/platforms.md": self.platforms(),
                 f"{LEDGER_DIR}/ideas/index.md": self.ideas_index()}
        months = {f"{self.w.local(c['updated_at']):%Y-%m}" for c in self.convs}
        for m in sorted(months):
            files[f"{LEDGER_DIR}/monthly/{m}.md"] = self.monthly(m)
        codes = set(self.projects) | {OTHER_PROJECT} | {p for c in self.cards for p in c["projects"]}
        for code in sorted(codes):
            files[f"{BY_PROJECT}/{code}.md"] = self.by_project(code)

        written = [rel for rel, text in files.items() if atomic_write(self.w.path(rel), text)]
        removed = []
        folder = self.w.path(BY_PROJECT)
        if folder.is_dir():
            for f in sorted(folder.glob("*.md")):
                rel = f"{BY_PROJECT}/{f.name}"
                if rel not in files:
                    self.w.path(rel).unlink()
                    removed.append(rel)
        return written, removed

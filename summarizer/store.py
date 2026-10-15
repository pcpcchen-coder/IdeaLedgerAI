"""summarizer 的資料存取。與 collector 共用同一個 SQLite 檔；conv 表由 collector 建立，summary 表由這裡建立。"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

SCHEMA = """
CREATE TABLE IF NOT EXISTS summary(
  platform TEXT NOT NULL,
  conv_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  ideas_json TEXT,
  decisions_json TEXT,
  projects_json TEXT,
  model TEXT,
  source_updated_at TEXT,      -- 摘要所依據的對話版本
  summarized_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,   -- 對同一版本連續失敗次數
  failed_version TEXT,                   -- 失敗時的對話版本（updated_at）
  last_error TEXT,
  PRIMARY KEY(platform, conv_id)
);
"""

MAX_ATTEMPTS = 3


def iso_utc(dt: datetime) -> str:
    u = dt.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"


class SummaryStore:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    def pending(self, now: datetime, settle: timedelta, limit: int) -> list[dict]:
        """待摘要：dirty=1、已靜止，且同一版本失敗未達上限。"""
        cutoff = iso_utc(now - settle)
        rows = self.conn.execute(
            """SELECT c.* FROM conv c
               LEFT JOIN summary s ON s.platform = c.platform AND s.conv_id = c.conv_id
               WHERE c.dirty = 1 AND c.updated_at <= ?
                 AND NOT (COALESCE(s.attempts, 0) >= ? AND s.failed_version = c.updated_at)
               ORDER BY c.updated_at
               LIMIT ?""",
            (cutoff, MAX_ATTEMPTS, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    def previous(self, platform: str, conv_id: str) -> Optional[dict]:
        row = self.conn.execute(
            "SELECT * FROM summary WHERE platform=? AND conv_id=? AND summary IS NOT NULL", (platform, conv_id)
        ).fetchone()
        if row is None:
            return None
        return {
            "title": row["title"],
            "summary": row["summary"],
            "ideas": json.loads(row["ideas_json"]),
            "decisions": json.loads(row["decisions_json"]),
            "projects": json.loads(row["projects_json"]),
        }

    def save(self, conv: dict, result: dict, model: str, now: datetime) -> bool:
        """存摘要並清除 dirty。若期間 collector 已寫入新版本，摘要照存但維持 dirty=1；回傳是否清除了 dirty。"""
        with self.conn:
            self.conn.execute(
                """INSERT INTO summary(platform, conv_id, title, summary, ideas_json, decisions_json, projects_json,
                     model, source_updated_at, summarized_at, attempts, failed_version, last_error)
                   VALUES(?,?,?,?,?,?,?,?,?,?,0,NULL,NULL)
                   ON CONFLICT(platform, conv_id) DO UPDATE SET
                     title=excluded.title, summary=excluded.summary, ideas_json=excluded.ideas_json,
                     decisions_json=excluded.decisions_json, projects_json=excluded.projects_json,
                     model=excluded.model, source_updated_at=excluded.source_updated_at,
                     summarized_at=excluded.summarized_at, attempts=0, failed_version=NULL, last_error=NULL""",
                (conv["platform"], conv["conv_id"], result["title"], result["summary"],
                 json.dumps(result["ideas"], ensure_ascii=False), json.dumps(result["decisions"], ensure_ascii=False),
                 json.dumps(result["projects"], ensure_ascii=False), model, conv["updated_at"], iso_utc(now)),
            )
            cur = self.conn.execute(
                """UPDATE conv SET dirty=0, summarized_count=message_count
                   WHERE platform=? AND conv_id=? AND updated_at=?""",
                (conv["platform"], conv["conv_id"], conv["updated_at"]),
            )
            return cur.rowcount == 1

    def record_failure(self, conv: dict, error: str) -> None:
        with self.conn:
            self.conn.execute(
                """INSERT INTO summary(platform, conv_id, attempts, failed_version, last_error)
                   VALUES(?,?,1,?,?)
                   ON CONFLICT(platform, conv_id) DO UPDATE SET
                     attempts = CASE WHEN summary.failed_version = excluded.failed_version
                                     THEN summary.attempts + 1 ELSE 1 END,
                     failed_version=excluded.failed_version, last_error=excluded.last_error""",
                (conv["platform"], conv["conv_id"], conv["updated_at"], error[:2000]),
            )

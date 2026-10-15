"""狀態檢查（純邏輯，不依賴 macOS，可在任何地方測試）。

檢查三件事，每項給 🟢／🟡／🔴，整體取最差的：
1. collector：GET /v2/health（帶 token）有沒有回應。
2. summarizer：讀它每次執行後寫的狀態檔（IDEA_STATUS_FILE）——多久前跑過、成功與否、有沒有推到 AiMemory。
3. 各平台巡檢：/v2/health 回傳的每個平台最後一輪結果。平台清單完全來自資料，不寫死任何平台。
另外顯示待處理對話數（資料庫唯讀開啟）。
"""
from __future__ import annotations

import json
import sqlite3
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

GREEN, YELLOW, RED = 0, 1, 2
ICON = {GREEN: "🟢", YELLOW: "🟡", RED: "🔴"}

HEALTH_URL = "http://127.0.0.1:8787/v2/health"
SUMMARIZER_STALE_MIN = 15      # launchd 每 5 分鐘跑一次；超過 15 分鐘沒新結果 = 停了
SWEEP_STALE_HOURS = 2          # 擴充預設 30 分鐘一輪（最長 120）；所有平台都超過 2 小時沒紀錄 = 擴充沒在跑
OK_PUBLISH = ("pushed", "no_changes")

# 擴充回報的巡檢狀態 → (燈號, 說明)。不認得的狀態一律 🟡 並原樣顯示。
SWEEP_STATUS = {
    "ok": (GREEN, "正常"),
    "rate_limited": (YELLOW, "被平台限流，退避中（會自動重試）"),
    "needs_login": (RED, "需要登入（在專用 Chrome 重新登入）"),
    "format_error": (RED, "平台回應格式變了（adapter 需要更新）"),
    "error": (YELLOW, "上一輪出錯"),
}


@dataclass
class Item:
    level: int
    text: str
    detail: Optional[str] = None


@dataclass
class Status:
    checked_at: datetime
    items: list[Item] = field(default_factory=list)

    @property
    def level(self) -> int:
        return max((i.level for i in self.items), default=GREEN)

    @property
    def icon(self) -> str:
        return ICON[self.level]

    @property
    def headline(self) -> str:
        bad = [i for i in self.items if i.level == self.level and i.level != GREEN]
        if not bad:
            return "Idea Ledger 一切正常"
        return f"{len(bad)} 項{'異常' if self.level == RED else '需要注意'}"


def parse_time(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def ago(t: datetime, now: datetime) -> str:
    sec = max(0, int((now - t).total_seconds()))
    if sec < 60:
        return "剛剛"
    if sec < 3600:
        return f"{sec // 60} 分鐘前"
    if sec < 86400:
        return f"{sec // 3600} 小時前"
    return f"{sec // 86400} 天前"


def fetch_health(url: str, token: str, timeout: float = 3) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def check_collector(health: Optional[dict], error: Optional[str]) -> Item:
    if health is None:
        return Item(RED, "Collector：沒有回應", error)
    return Item(GREEN, f"Collector：正常（已收 {health.get('total_conversations', 0)} 篇對話）")


def check_summarizer(status_file: Optional[str], now: datetime) -> Item:
    if not status_file or not Path(status_file).exists():
        return Item(YELLOW, "Summarizer：還沒有執行紀錄", "等 5 分鐘；若一直如此，看 logs/summarizer.log")
    try:
        data = json.loads(Path(status_file).read_text(encoding="utf-8"))
        finished = parse_time(data["finished_at"])
    except (OSError, ValueError, KeyError) as e:
        return Item(YELLOW, "Summarizer：狀態檔讀不到", str(e))
    when = ago(finished, now)
    if (now - finished).total_seconds() > SUMMARIZER_STALE_MIN * 60:
        return Item(RED, f"Summarizer：停了（最後執行 {when}）", "看 logs/summarizer.log，或執行完整檢查")
    if data.get("exit_code", 0) != 0:
        publish = data.get("publish")
        if publish and publish not in OK_PUBLISH:
            return Item(RED, f"Summarizer：推送 AiMemory 失敗（{publish}，{when}）", data.get("publish_detail") or None)
        return Item(RED, f"Summarizer：執行失敗（{when}）", data.get("error"))
    failed = data.get("failed", 0)
    done = f"處理 {data.get('summarized', 0)} 篇"
    pushed = {"pushed": "已推送 AiMemory", "no_changes": "AiMemory 無變動"}.get(data.get("publish"), "")
    text = "，".join(x for x in (f"Summarizer：{when}", done, pushed) if x)
    if failed:
        return Item(YELLOW, f"{text}，{failed} 篇失敗", "看 logs/summarizer.log")
    return Item(GREEN, text)


def check_platforms(health: Optional[dict], now: datetime) -> list[Item]:
    if health is None:
        return []
    items: list[Item] = []
    latest: Optional[datetime] = None
    for p in health.get("platforms", []):
        name = p.get("platform_name") or p.get("platform")
        run = p.get("last_run")
        if not run:
            items.append(Item(YELLOW, f"{name}：還沒有巡檢紀錄"))
            continue
        t = parse_time(run["finished_at"])
        latest = t if latest is None or t > latest else latest
        level, text = SWEEP_STATUS.get(run.get("status"), (YELLOW, run.get("status") or "未知狀態"))
        extra = f"，讀 {run.get('fetched', 0)} 篇" if run.get("status") == "ok" else ""
        items.append(Item(level, f"{name}：{text}（{ago(t, now)}{extra}）", run.get("error") or None))
    if latest is not None and (now - latest).total_seconds() > SWEEP_STALE_HOURS * 3600:
        items.insert(0, Item(RED, f"巡檢停了：所有平台 {ago(latest, now)}起沒有新紀錄",
                             "專用 Chrome 有開嗎？擴充有啟用嗎？"))
    elif latest is None and not items:
        items.append(Item(YELLOW, "巡檢：還沒有任何紀錄", "在擴充設定頁按「立即巡檢」"))
    return items


def pending_count(db_path: Optional[str]) -> Optional[int]:
    """待處理（尚未產生想法卡內容）的對話數。唯讀開啟，失敗就不顯示。"""
    if not db_path or not Path(db_path).exists():
        return None
    try:
        conn = sqlite3.connect(f"{Path(db_path).as_uri()}?mode=ro", uri=True, timeout=2)
        try:
            return conn.execute("SELECT COUNT(*) FROM conv WHERE dirty=1").fetchone()[0]
        finally:
            conn.close()
    except sqlite3.Error:
        return None


def check(*, token: str, status_file: Optional[str], db_path: Optional[str], now: Optional[datetime] = None,
          health_url: str = HEALTH_URL, fetch: Callable[[str, str], dict] = fetch_health) -> Status:
    now = now or datetime.now(timezone.utc)
    health, error = None, None
    try:
        health = fetch(health_url, token)
    except Exception as e:  # 連不上、401、逾時都算沒有回應
        error = f"{type(e).__name__}: {e}"
    st = Status(checked_at=now)
    st.items.append(check_collector(health, error))
    st.items.append(check_summarizer(status_file, now))
    st.items.extend(check_platforms(health, now))
    n = pending_count(db_path)
    if n is not None:
        st.items.append(Item(GREEN, f"待處理對話：{n} 篇"))
    return st

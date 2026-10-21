"""瀏覽介面（T28）的查詢邏輯：搜尋、篩選、片段、單篇全文。只讀。

搜尋用 LIKE 子字串比對（不分大小寫只對英文字母有效）：中文沒有空白斷詞，FTS5 預設斷詞器會把整句當一個詞，
子字串比對反而最準。幾千篇對話全表掃描仍在百毫秒內；資料量大到變慢時再換 FTS5 trigram。
平台是開放的：篩選選項全部來自資料。
"""
from __future__ import annotations

import json
import sqlite3
from typing import Optional

MAX_TERMS = 8
SNIPPET_RADIUS = 60


def _like(term: str) -> str:
    return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _json_inner(term: str) -> str:
    """messages_json 是 JSON 字串：引號、反斜線、換行在裡面是跳脫過的，比對前要用同樣方式跳脫。"""
    return json.dumps(term, ensure_ascii=False)[1:-1]


def parse_terms(q: Optional[str]) -> list[str]:
    return [t for t in (q or "").split() if t][:MAX_TERMS]


def _where(terms: list[str], platform: Optional[str], project: Optional[str]) -> tuple[str, list]:
    clauses, args = [], []
    if platform:
        clauses.append("platform = ?")
        args.append(platform)
    if project is not None:
        if project == "":
            clauses.append("project IS NULL")
        else:
            clauses.append("project = ?")
            args.append(project)
    for t in terms:  # 多個詞：全部都要出現（AND），可分散在標題、專案、訊息
        clauses.append("(title LIKE ? ESCAPE '\\' OR IFNULL(project,'') LIKE ? ESCAPE '\\'"
                       " OR messages_json LIKE ? ESCAPE '\\' OR IFNULL(page_text,'') LIKE ? ESCAPE '\\')")
        args += [_like(t), _like(t), _like(_json_inner(t)), _like(t)]
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", args


def snippet(text: str, terms: list[str], radius: int = SNIPPET_RADIUS) -> Optional[str]:
    """回傳第一個命中詞前後各 radius 字；沒有命中回傳 None。"""
    low = text.casefold()
    hits = [(low.find(t.casefold()), t) for t in terms]
    hits = [(i, t) for i, t in hits if i >= 0]
    if not hits:
        return None
    i, t = min(hits)
    start, end = max(0, i - radius), min(len(text), i + len(t) + radius)
    s = " ".join(text[start:end].split())
    return ("…" if start > 0 else "") + s + ("…" if end < len(text) else "")


def _preview(row: sqlite3.Row, terms: list[str]) -> tuple[Optional[str], Optional[str]]:
    """搜尋結果的片段：優先找命中的訊息；沒有搜尋詞（或只命中標題）就用第一則使用者輸入的開頭。"""
    messages = json.loads(row["messages_json"] or "[]")
    for m in messages:
        s = snippet(m.get("text") or "", terms) if terms else None
        if s:
            return s, m.get("role")
    if terms and row["page_text"]:
        s = snippet(row["page_text"], terms)
        if s:
            return s, None
    first = next((m for m in messages if m.get("role") == "user"), None)
    text = (first or {}).get("text") or row["page_text"] or ""
    text = " ".join(text.split())
    return (text[: SNIPPET_RADIUS * 2] + ("…" if len(text) > SNIPPET_RADIUS * 2 else "")) or None, \
        ("user" if first else None)


LIST_COLUMNS = ("platform, conv_id, platform_name, capture, title, url, project, created_at, updated_at, "
                "message_count, messages_json, page_text")


def search(conn: sqlite3.Connection, *, q: Optional[str] = None, platform: Optional[str] = None,
           project: Optional[str] = None, limit: int = 50, offset: int = 0) -> dict:
    terms = parse_terms(q)
    where, args = _where(terms, platform, project)
    total = conn.execute(f"SELECT COUNT(*) FROM conv{where}", args).fetchone()[0]
    rows = conn.execute(f"SELECT {LIST_COLUMNS} FROM conv{where} ORDER BY updated_at DESC, conv_id LIMIT ? OFFSET ?",
                        [*args, limit, offset]).fetchall()
    items = []
    for r in rows:
        text, role = _preview(r, terms)
        items.append({
            "platform": r["platform"], "platform_name": r["platform_name"] or r["platform"],
            "conv_id": r["conv_id"], "title": r["title"], "url": r["url"], "project": r["project"],
            "created_at": r["created_at"], "updated_at": r["updated_at"], "message_count": r["message_count"],
            "capture": r["capture"], "snippet": text, "snippet_role": role,
        })
    return {"total": total, "offset": offset, "limit": limit, "terms": terms, "items": items}


def facets(conn: sqlite3.Connection) -> dict:
    platforms = [
        {"platform": r["platform"], "platform_name": r["name"] or r["platform"], "count": r["n"]}
        for r in conn.execute("SELECT platform, MAX(platform_name) AS name, COUNT(*) AS n FROM conv "
                              "GROUP BY platform ORDER BY n DESC, platform")
    ]
    projects = [
        {"project": r["project"], "count": r["n"]}
        for r in conn.execute("SELECT project, COUNT(*) AS n FROM conv WHERE project IS NOT NULL "
                              "GROUP BY project ORDER BY n DESC, project")
    ]
    no_project = conn.execute("SELECT COUNT(*) FROM conv WHERE project IS NULL").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM conv").fetchone()[0]
    return {"total": total, "platforms": platforms, "projects": projects, "no_project": no_project}


def _card_path(conn: sqlite3.Connection, platform: str, conv_id: str) -> Optional[str]:
    """summarizer 寫在同一個資料庫的想法卡路徑（AiMemory 內）；summarizer 沒跑過就沒有這張表。"""
    try:
        row = conn.execute("SELECT path FROM card WHERE platform=? AND conv_id=?", (platform, conv_id)).fetchone()
    except sqlite3.OperationalError:
        return None
    return row["path"] if row else None


def detail(conn: sqlite3.Connection, platform: str, conv_id: str) -> Optional[dict]:
    r = conn.execute("SELECT * FROM conv WHERE platform=? AND conv_id=?", (platform, conv_id)).fetchone()
    if r is None:
        return None
    return {
        "platform": r["platform"], "platform_name": r["platform_name"] or r["platform"], "conv_id": r["conv_id"],
        "title": r["title"], "url": r["url"], "project": r["project"], "capture": r["capture"],
        "created_at": r["created_at"], "updated_at": r["updated_at"], "swept_at": r["swept_at"],
        "message_count": r["message_count"], "messages": json.loads(r["messages_json"] or "[]"),
        "page_text": r["page_text"], "card_path": _card_path(conn, platform, conv_id),
    }

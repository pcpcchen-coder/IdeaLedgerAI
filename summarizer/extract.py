"""不經模型：把對話中使用者輸入的文字整理成想法卡資料（T26，George 決定先不跑摘要）。

交辦工作時使用者輸入的字少，但足以表達需求。輸出與模型摘要相同形狀（title、summary、ideas、decisions、projects），
沿用同一套儲存與想法卡寫入。平台是開放的：只看訊息的 role，不認得任何特定平台。
"""
from __future__ import annotations

import json

from .prompt import OTHER_PROJECT

MODE = "user-inputs"          # 存在 summary.model，想法卡依此決定版面
MAX_PER_MESSAGE = 1000
MAX_TOTAL = 6000
MAX_PAGE_TEXT = 1500
TRUNCATED = "…（已截斷）"
TITLE_MAX = 60


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit].rstrip() + TRUNCATED


def _project_code(platform_project: str | None, projects: dict[str, str]) -> str:
    """平台專案名稱等於 AiMemory 專案的代號或名稱（不分大小寫）就用該代號，否則 other。"""
    if platform_project:
        key = platform_project.strip().lower()
        for code, name in projects.items():
            if key in (code.lower(), name.strip().lower()):
                return code
    return OTHER_PROJECT


def user_inputs(conv: dict) -> list[str]:
    messages = json.loads(conv.get("messages_json") or "[]")
    return [m["text"].strip() for m in messages if m.get("role") == "user" and (m.get("text") or "").strip()]


def extract_result(conv: dict, projects: dict[str, str] | None = None) -> dict:
    projects = projects or {}
    inputs = user_inputs(conv)
    lines: list[str] = []
    total = 0
    if inputs:
        for i, text in enumerate(inputs, 1):
            item = _clip(text, MAX_PER_MESSAGE).replace("\n", "\n   ")   # 多行輸入縮排在同一個清單項目下
            if total + len(item) > MAX_TOTAL:
                lines.append(f"{i}. {TRUNCATED}（其餘 {len(inputs) - i + 1} 則略過）")
                break
            lines.append(f"{i}. {item}")
            total += len(item)
        summary = "\n".join(lines)
    elif (conv.get("page_text") or "").strip():
        summary = "（頁面擷取，未區分使用者輸入）\n\n" + _clip(conv["page_text"], MAX_PAGE_TEXT)
    else:
        summary = "（沒有使用者輸入）"

    title = (conv.get("title") or "").strip() or (inputs[0].splitlines()[0] if inputs else "") or "（無標題）"
    return {
        "title": title[:TITLE_MAX],
        "summary": summary,
        "ideas": [],
        "decisions": [],
        "projects": [_project_code(conv.get("project"), projects)],
    }

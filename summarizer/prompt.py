"""系統提示與輸入組裝。平台是開放的：只用顯示名稱，不認得任何特定平台。"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

MAX_INPUT_CHARS = 20000
OTHER_PROJECT = "other"   # 與 ledger/ideas/by-project/other.md 對應
IDEA_TYPES = ("新想法", "延伸", "待驗證")

ROLE_LABEL = {"user": "使用者", "assistant": "助理"}


def load_projects(repo: str | Path | None) -> dict[str, str]:
    """讀 AiMemory 的 projects/*.md（只讀）：{代號: 名稱}。

    代號＝檔名（不含 .md），名稱＝第一個 "# " 標題，沒有就用代號。
    排除 README、隱藏檔與保留字 other；未設定 repo 或沒有 projects/ 時回傳空清單。
    """
    if not repo:
        return {}
    folder = Path(repo) / "projects"
    if not folder.is_dir():
        return {}
    projects = {}
    for f in sorted(folder.glob("*.md")):
        code = f.stem
        if code.startswith(".") or code.lower() in ("readme", OTHER_PROJECT):
            continue
        m = re.search(r"^#[ \t]+(.+?)[ \t]*$", f.read_text(encoding="utf-8"), re.M)
        projects[code] = m.group(1) if m else code
    return projects


def system_prompt(projects: dict[str, str]) -> str:
    choices = "；".join(f"{code}（{name}）" for code, name in projects.items()) or "（目前沒有專案）"
    return f"""你是想法整理員，負責把使用者與 AI 的對話整理成「想法卡」。
只輸出一個 JSON 物件，不要任何其他文字，格式如下：
{{
  "title": "15 字內的標題",
  "summary": "3 句內的摘要，說明這段對話在處理什麼、得到什麼",
  "ideas": [{{"type": "新想法|延伸|待驗證", "idea": "想法內容", "next_step": "下一步"}}],
  "decisions": ["已經做出的決定"],
  "projects": ["從清單中選擇"]
}}
規則：
- 一律使用繁體中文。
- ideas 只收使用者自己提出或採納的想法；AI 提出但使用者沒有回應的建議不算。
- type 只能是：新想法、延伸、待驗證。
- projects 填專案代號（括號前的英文），只能從這份清單選，可複選，都不符合就填「{OTHER_PROJECT}」：{choices}
- 對話只是查資料、沒有任何想法或決策時，ideas 與 decisions 給空陣列。"""


def _truncate(text: str, limit: int = MAX_INPUT_CHARS) -> str:
    if len(text) <= limit:
        return text
    return "（前段已省略）\n" + text[-limit:]


def format_messages(messages: list[dict]) -> str:
    return "\n\n".join(f"[{ROLE_LABEL.get(m['role'], m['role'])}] {m['text']}" for m in messages)


def build_user_prompt(conv: dict, previous: Optional[dict]) -> str:
    """conv：conv 表的一列（dict）；previous：前一版摘要（增量時才有）。"""
    header = [
        f"平台：{conv.get('platform_name') or conv['platform']}",
        f"標題：{conv.get('title') or '（無）'}",
        f"平台上的專案：{conv.get('project') or '（無）'}",
    ]

    if conv["capture"] == "page":
        body = "以下是對話頁面的文字，可能夾雜介面按鈕、側邊欄等雜訊，請忽略：\n\n" + _truncate(conv["page_text"] or "")
        return "\n".join(header) + "\n\n" + body

    messages = json.loads(conv["messages_json"])
    start = conv["summarized_count"] if previous else 0
    new_messages = messages[start:]
    if previous:
        prev = json.dumps(
            {k: previous[k] for k in ("title", "summary", "ideas", "decisions", "projects")}, ensure_ascii=False
        )
        body = (
            f"這段對話先前已整理過，前一版結果如下：\n{prev}\n\n"
            f"以下是之後新增的 {len(new_messages)} 則訊息。請整合成更新後的完整結果（不是只摘要新增部分）：\n\n"
            + _truncate(format_messages(new_messages))
        )
    else:
        body = "對話內容：\n\n" + _truncate(format_messages(new_messages))
    return "\n".join(header) + "\n\n" + body

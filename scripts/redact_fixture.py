#!/usr/bin/env python3
"""遮罩平台回應樣本，產出可提交的 fixtures。

用法：
    python scripts/redact_fixture.py <輸入資料夾> <輸出資料夾> [--extra-value 值 ...] [--allow 正規式 ...]

處理規則：
1. 敏感鍵（含 token、email、phone、cookie、authorization、session、password、secret）的值換成 "[REDACTED]"。
2. 人員／組織的識別碼（例如 user_id、org_uuid，或 user、account、organization 物件底下的 id／uuid）
   換成一致的佔位字串（USER_1、ORG_1…）；同一個值在所有檔案、所有字串中（包含網址）都換成同一個佔位。
   人員物件底下的 name、image 等個資也換成 "[REDACTED]"。
3. --extra-value 指定的字串（例如採樣時看到的組織 ID）也換成佔位。
4. 全部處理完後掃描結果：若仍有 email、JWT 或疑似 API 金鑰，列出位置並以代碼 1 結束，不寫出任何檔案。
   誤判時可用 --allow 傳入允許的正規式。

只處理 .json 檔，輸出保留原本的子資料夾結構。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REDACTED = "[REDACTED]"

SENSITIVE_KEY = re.compile(r"token|email|phone|cookie|authorization|session|password|secret", re.I)
ID_KEY = re.compile(r"^(?:.*[_-])?(user|account|org|organization|workspace)[_-]?(id|uuid)s?$", re.I)
PERSON_PARENT = re.compile(r"^(user|account|org|organization|workspace|owner|creator|member)s?$", re.I)
PERSONAL_FIELDS = {"name", "full_name", "display_name", "image", "picture", "avatar", "avatar_url"}

LEAK_PATTERNS = {
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "jwt": re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    "api_key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}"),
}


class Redactor:
    def __init__(self, extra_values: list[str] | None = None):
        self.ids: dict[str, str] = {}
        self.counters: dict[str, int] = {}
        for v in extra_values or []:
            self._placeholder(v, "ID")

    def _placeholder(self, value: str, category: str) -> str:
        if value not in self.ids:
            self.counters[category] = self.counters.get(category, 0) + 1
            self.ids[value] = f"{category}_{self.counters[category]}"
        return self.ids[value]

    @staticmethod
    def _category(key: str, parent: str | None) -> str:
        source = key if ID_KEY.match(key) else (parent or "")
        m = re.match(r"(?:.*[_-])?(user|account|organization|org|workspace|owner|creator|member)", source, re.I)
        word = m.group(1).lower() if m else "id"
        return {"organization": "ORG"}.get(word, word.upper())

    def collect(self, node, key: str | None = None, parent: str | None = None) -> None:
        """第一輪：遮罩敏感鍵、收集識別碼。會就地修改 node。"""
        if isinstance(node, dict):
            # 這個物件本身是否為人員／組織（由它所在的鍵名判斷，例如 "user": {...}）
            is_person = key is not None and PERSON_PARENT.match(str(key)) is not None
            for k, v in list(node.items()):
                if SENSITIVE_KEY.search(k):
                    if v is not None:
                        node[k] = REDACTED
                    continue
                is_id = ID_KEY.match(k) or (is_person and k in ("id", "uuid"))
                if is_id and isinstance(v, (str, int)) and not isinstance(v, bool):
                    self._placeholder(str(v), self._category(k, str(key) if key else None))
                    continue
                if is_person and k in PERSONAL_FIELDS and v is not None:
                    node[k] = REDACTED
                    continue
                self.collect(v, k, key)
        elif isinstance(node, list):
            for item in node:
                self.collect(item, key, parent)

    def replace(self, node):
        """第二輪：把收集到的識別碼在所有字串（含鍵名）中換成佔位。"""
        if isinstance(node, dict):
            return {self._sub(k): self.replace(v) for k, v in node.items()}
        if isinstance(node, list):
            return [self.replace(i) for i in node]
        if isinstance(node, str):
            return self._sub(node)
        if isinstance(node, int) and not isinstance(node, bool) and str(node) in self.ids:
            return self.ids[str(node)]
        return node

    def _sub(self, s: str) -> str:
        for value in sorted(self.ids, key=len, reverse=True):
            if value and value in s:
                s = s.replace(value, self.ids[value])
        return s


def find_leaks(node, path: str, allow: list[re.Pattern]) -> list[tuple[str, str, str]]:
    leaks = []

    def check(s: str, where: str):
        for kind, pat in LEAK_PATTERNS.items():
            for m in pat.finditer(s):
                if not any(a.search(m.group(0)) for a in allow):
                    leaks.append((where, kind, m.group(0)[:12] + "…"))

    if isinstance(node, dict):
        for k, v in node.items():
            check(k, f"{path}.{k}（鍵名）")
            leaks += find_leaks(v, f"{path}.{k}", allow)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            leaks += find_leaks(v, f"{path}[{i}]", allow)
    elif isinstance(node, str):
        check(node, path)
    return leaks


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="遮罩平台回應樣本")
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--extra-value", action="append", default=[], help="額外要換成佔位的字串")
    ap.add_argument("--allow", action="append", default=[], help="允許的字串正規式（處理誤判）")
    args = ap.parse_args(argv)

    files = sorted(args.src.rglob("*.json"))
    if not files:
        print(f"找不到任何 .json：{args.src}", file=sys.stderr)
        return 1

    redactor = Redactor(args.extra_value)
    docs = {}
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        redactor.collect(data)
        docs[f] = data
    docs = {f: redactor.replace(d) for f, d in docs.items()}

    allow = [re.compile(a) for a in args.allow]
    leaks = [(f.relative_to(args.src), *leak) for f, d in docs.items() for leak in find_leaks(d, "$", allow)]
    if leaks:
        print("遮罩後仍偵測到疑似個資，未寫出任何檔案：", file=sys.stderr)
        for f, where, kind, sample in leaks:
            print(f"  {f} {where}：{kind}（{sample}）", file=sys.stderr)
        return 1

    for f, d in docs.items():
        out = args.dst / f.relative_to(args.src)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已遮罩 {len(docs)} 個檔案 → {args.dst}；替換識別碼 {len(redactor.ids)} 個")
    return 0


if __name__ == "__main__":
    sys.exit(main())

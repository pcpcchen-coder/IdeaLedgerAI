#!/usr/bin/env python3
"""匯入採樣腳本下載的檔案，產出可提交的 fixtures（T01、T02）。

用法：
    python scripts/import_sample.py <idealedger_<平台>_sample.json> [--dest 資料夾] [--extra-value 值 ...] [--allow 正規式 ...]

流程：拆成每個請求一個 JSON → 用 redact_fixture 遮罩（失敗就不寫出任何檔案）→ 產生 REQUESTS.md（路徑、狀態碼、
測試對話是否出現在清單中），供撰寫 NOTES.md 使用。預設輸出到 extension/fixtures/<平台>/。
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("redact_fixture", Path(__file__).with_name("redact_fixture.py"))
redact = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(redact)

SAFE_NAME = re.compile(r"^[a-z0-9_]+$")


def requests_md(bundle: dict) -> str:
    lines = [
        f"# {bundle['platform']} 採樣紀錄",
        "",
        f"採樣時間：{bundle.get('captured_at', '')}（由 tools/sampler 主控台腳本產生）",
        "",
        "## 請求",
        "",
        "| 檔案 | 方法 | 路徑 | 狀態碼 |",
        "|---|---|---|---|",
    ]
    for r in bundle["requests"]:
        lines.append(f"| `{r['name']}.json` | {r['method']} | `{r['path']}` | {r['status']} |")
    lines += ["", "## 測試對話是否出現在歷史清單（前兩頁）", "", "| 標籤 | 出現在清單 |", "|---|---|"]
    for t in bundle.get("tests", []):
        lines.append(f"| {t['label']} | {'是' if t['found_in_lists'] else '否'} |")
    lines += [
        "",
        "「否」不一定代表不同步：可能只是不在前兩頁。手機 App 對話（mobile）若為「否」，請在網頁歷史中手動確認。",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="匯入採樣檔案並遮罩")
    ap.add_argument("bundle", type=Path)
    ap.add_argument("--dest", type=Path)
    ap.add_argument("--extra-value", action="append", default=[])
    ap.add_argument("--allow", action="append", default=[])
    args = ap.parse_args(argv)

    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    if bundle.get("tool") != "idealedger-sampler":
        print("這不是採樣腳本產生的檔案（缺少 tool: idealedger-sampler）", file=sys.stderr)
        return 1
    platform = bundle["platform"]
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,31}", platform):
        print(f"平台 id 不合法：{platform}", file=sys.stderr)
        return 1
    dest = args.dest or ROOT / "extension" / "fixtures" / platform

    failed = [r for r in bundle["requests"] if r["status"] != 200]
    with tempfile.TemporaryDirectory() as tmp:
        for r in bundle["requests"]:
            if not SAFE_NAME.match(r["name"]):
                print(f"請求名稱不合法：{r['name']}", file=sys.stderr)
                return 1
            Path(tmp, f"{r['name']}.json").write_text(json.dumps(r["body"], ensure_ascii=False), encoding="utf-8")
        extra = [x for v in args.extra_value for x in ("--extra-value", v)] + [x for v in args.allow for x in ("--allow", v)]
        code = redact.main([tmp, str(dest), *extra])
        if code != 0:
            return code

    (dest / "REQUESTS.md").write_text(requests_md(bundle), encoding="utf-8")
    print(f"已寫入 {dest}（含 REQUESTS.md）")
    if failed:
        print("以下請求不是 200，對應的介面路徑可能不對，需要用 DevTools 手動確認：", file=sys.stderr)
        for r in failed:
            print(f"  {r['status']} {r['name']} {r['path']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

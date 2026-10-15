"""run_once：挑出待摘要的對話 → 呼叫模型 → 驗證 → 存回。"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .prompt import OTHER_PROJECT, build_user_prompt, load_projects, system_prompt
from .store import SummaryStore

SETTLE = timedelta(minutes=15)


class Idea(BaseModel):
    type: Literal["新想法", "延伸", "待驗證"]
    idea: str = Field(min_length=1)
    next_step: str = ""


class SummaryResult(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    summary: str = Field(min_length=1)
    ideas: list[Idea] = []
    decisions: list[str] = []
    projects: list[str] = []

    @field_validator("title", "summary")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


def parse_result(text: str, allowed_projects: list[str]) -> dict:
    """從模型輸出取出 JSON 並驗證；容忍 ```json 包裹與前後多餘文字。"""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    raw = fenced.group(1) if fenced else text[text.find("{"): text.rfind("}") + 1]
    if not raw:
        raise ValueError("輸出中找不到 JSON 物件")
    data = SummaryResult.model_validate(json.loads(raw)).model_dump()
    kept = [p for p in data["projects"] if p in allowed_projects]
    data["projects"] = list(dict.fromkeys(kept)) or [OTHER_PROJECT]
    return data


@dataclass
class RunReport:
    summarized: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    still_dirty: list[str] = field(default_factory=list)  # 摘要期間對話又更新


def run_once(store: SummaryStore, complete: Callable[[str, str], str], model: str, *,
             now: datetime | None = None, batch: int = 20, projects: list[str] | None = None) -> RunReport:
    """complete(system, user) -> 模型輸出文字。"""
    now = now or datetime.now(timezone.utc)
    projects = load_projects() if projects is None else projects
    allowed = [*projects, OTHER_PROJECT]
    system = system_prompt(projects)
    report = RunReport()

    for conv in store.pending(now, SETTLE, batch):
        key = f"{conv['platform']}/{conv['conv_id']}"
        previous = store.previous(conv["platform"], conv["conv_id"]) if conv["summarized_count"] else None
        user = build_user_prompt(conv, previous)
        try:
            output = complete(system, user)
            try:
                result = parse_result(output, allowed)
            except (ValueError, ValidationError) as first:
                retry_user = f"{user}\n\n上一次的輸出無法使用（{str(first)[:200]}）。請只輸出符合格式的 JSON 物件。"
                result = parse_result(complete(system, retry_user), allowed)
        except Exception as e:  # noqa: BLE001 — 單段失敗不影響其他對話
            store.record_failure(conv, f"{type(e).__name__}: {e}")
            report.failed.append(key)
            continue

        if store.save(conv, result, model, now):
            report.summarized.append(key)
        else:
            report.still_dirty.append(key)
    return report

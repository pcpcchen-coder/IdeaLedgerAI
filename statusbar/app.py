"""macOS 選單列 UI（rumps）。檢查邏輯在 status.py；這裡只負責顯示與幾個操作。"""
from __future__ import annotations

import json
import os
import subprocess
from urllib.parse import quote

import rumps
from AppKit import NSApplication, NSApplicationActivationPolicyAccessory

from . import status as S

REFRESH_SECONDS = 60
UID = os.getuid()
SUMMARIZER = f"gui/{UID}/com.idealedger.summarizer"
COLLECTOR = f"gui/{UID}/com.idealedger.collector"
BROWSE_URL = "http://127.0.0.1:8787/ui"


def notify(title: str, text: str) -> None:
    """用 osascript 發系統通知（rumps.notification 需要在 venv 的 python 旁放 Info.plist，較麻煩）。"""
    script = f"display notification {json.dumps(text, ensure_ascii=False)} with title {json.dumps(title, ensure_ascii=False)}"
    subprocess.run(["osascript", "-e", script], check=False)


class StatusApp(rumps.App):
    def __init__(self) -> None:
        super().__init__("Idea Ledger", title="⚪", quit_button=None)
        self.home = os.environ.get("IDEALEDGER_HOME", "")
        self.repo = os.environ.get("IDEALEDGER_REPO", "")
        self.last_level: int | None = None
        self.timer = rumps.Timer(self.refresh, REFRESH_SECONDS)
        self.timer.start()
        self.refresh(None)

    def refresh(self, _sender) -> None:
        st = S.check(token=os.environ.get("IDEA_TOKEN", ""),
                     status_file=os.environ.get("IDEA_STATUS_FILE"),
                     db_path=os.environ.get("IDEA_DB"))
        self.title = st.icon
        self.menu.clear()
        self.menu.add(rumps.MenuItem(f"{st.icon} {st.headline}"))
        self.menu.add(rumps.separator)
        for item in st.items:
            mi = rumps.MenuItem(f"{S.ICON[item.level]} {item.text}")
            if item.detail:
                mi.add(rumps.MenuItem(item.detail[:200]))
            self.menu.add(mi)
        self.menu.add(rumps.separator)
        self.menu.add(rumps.MenuItem(f"檢查時間 {st.checked_at.astimezone():%H:%M}，每分鐘更新"))
        self.menu.add(rumps.MenuItem("瀏覽對話紀錄…", callback=self.browse))
        self.menu.add(rumps.MenuItem("立即重新檢查", callback=self.refresh))
        self.menu.add(rumps.MenuItem("立即執行一次 summarizer", callback=self.kick_summarizer))
        self.menu.add(rumps.MenuItem("重新啟動 collector", callback=self.restart_collector))
        self.menu.add(rumps.MenuItem("執行完整檢查（doctor）", callback=self.doctor))
        self.menu.add(rumps.MenuItem("打開記錄資料夾", callback=self.open_logs))
        self.menu.add(rumps.separator)
        self.menu.add(rumps.MenuItem("結束狀態圖示", callback=rumps.quit_application))
        # 從正常變成異常時通知一次，之後同樣狀態不重複通知
        if st.level == S.RED and self.last_level is not None and self.last_level != S.RED:
            bad = next(i for i in st.items if i.level == S.RED)
            notify("Idea Ledger 異常", bad.text)
        self.last_level = st.level

    def browse(self, _sender) -> None:
        """在預設瀏覽器開 collector 的瀏覽介面（T28）；token 放在片段，頁面讀到就從網址移除。"""
        token = os.environ.get("IDEA_TOKEN", "")
        url = BROWSE_URL + (f"#token={quote(token, safe='')}" if token else "")
        subprocess.run(["open", url], check=False)

    def kick_summarizer(self, _sender) -> None:
        subprocess.run(["launchctl", "kickstart", SUMMARIZER], check=False)
        rumps.Timer(lambda t: (t.stop(), self.refresh(None)), 20).start()

    def restart_collector(self, _sender) -> None:
        subprocess.run(["launchctl", "kickstart", "-k", COLLECTOR], check=False)
        rumps.Timer(lambda t: (t.stop(), self.refresh(None)), 5).start()

    def doctor(self, _sender) -> None:
        if self.repo:
            subprocess.run(["open", "-a", "Terminal", os.path.join(self.repo, "deploy", "doctor.sh")], check=False)

    def open_logs(self, _sender) -> None:
        if self.home:
            subprocess.run(["open", os.path.join(self.home, "logs")], check=False)


def main() -> int:
    # 沒有 .app 包裝的 Python 預設會在 Dock 出現圖示；設為 Accessory 只留選單列
    NSApplication.sharedApplication().setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    StatusApp().run()
    return 0

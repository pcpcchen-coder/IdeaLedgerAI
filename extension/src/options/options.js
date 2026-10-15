// 設定頁：讀寫 chrome.storage 的設定、顯示各平台燈號、「立即巡檢」。顯示邏輯在 view.js。
import { loadConfig } from "../bg/config.js";
import { formToConfig, platformRows } from "./view.js";

const storage = chrome.storage.local;
const $ = (id) => document.getElementById(id);
const FIELDS = ["collectorUrl", "token", "intervalMinutes", "sweeper"];

function message(text) {
  $("message").textContent = text;
}

function renderPlatforms(rows) {
  const body = $("platforms");
  body.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr");
      const cell = (...nodes) => {
        const td = document.createElement("td");
        td.append(...nodes);
        tr.append(td);
        return td;
      };
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.platform = r.id;
      box.checked = r.enabled;
      cell(box);
      cell(r.name);
      const dot = document.createElement("span");
      dot.className = `dot ${r.light}`;
      const status = cell(dot, r.label);
      if (r.error) {
        const err = document.createElement("div");
        err.className = "error";
        err.textContent = r.error;
        status.append(err);
      }
      cell(r.lastSuccess);
      cell(r.fetched);
      return tr;
    }),
  );
}

async function refresh() {
  const config = await loadConfig(storage);
  const status = await chrome.runtime.sendMessage({ type: "getStatus" });
  const platforms = status?.platforms ?? []; // 來自背景程式的 registeredPlatforms()
  renderPlatforms(platformRows(platforms, status?.states ?? {}, config));
  $("sweepNow").disabled = Boolean(status?.running);
}

async function load() {
  const config = await loadConfig(storage);
  for (const f of FIELDS) $(f).value = config[f];
  $("sweepEnabled").checked = config.sweepEnabled;
  await refresh();
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const platforms = Object.fromEntries(
    [...document.querySelectorAll("input[data-platform]")].map((b) => [b.dataset.platform, b.checked]),
  );
  const form = Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
  const config = formToConfig({ ...form, sweepEnabled: $("sweepEnabled").checked, platforms });
  await storage.set({ config });
  for (const f of FIELDS) $(f).value = config[f];
  message(config.token ? "已儲存。" : "已儲存；尚未設定 token，巡檢不會執行。");
  await refresh();
});

$("sweepNow").addEventListener("click", async () => {
  $("sweepNow").disabled = true;
  message("巡檢中…");
  const res = await chrome.runtime.sendMessage({ type: "sweepNow" });
  message(res?.ok ? `巡檢完成（${res.results.length} 個平台）。` : `巡檢失敗：${res?.error ?? "未知錯誤"}`);
  await refresh();
});

// 巡檢狀態寫在 storage，變動時即時更新表格
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k.startsWith("platform:"))) refresh();
});

load();

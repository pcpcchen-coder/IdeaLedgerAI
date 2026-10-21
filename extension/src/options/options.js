// 設定頁：讀寫 chrome.storage 的設定、顯示各平台燈號、「立即巡檢」「瀏覽紀錄」。顯示邏輯在 view.js。
import { loadConfig } from "../bg/config.js";
import { createCustomManager } from "../bg/custom.js";
import { browseUrl, formToConfig, platformRows, shortTime } from "./view.js";

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

let registered = []; // 內建 adapter（來自背景程式的 registeredPlatforms()）
let customList = []; // 自訂平台（先載入，新增時同步檢查，權限請求才會留在點擊之內）
const customManager = () =>
  createCustomManager({ storage, permissions: chrome.permissions, scripting: chrome.scripting, registered });

function renderCustom(list, status) {
  $("customPlatforms").replaceChildren(
    ...list.map((p) => {
      const tr = document.createElement("tr");
      for (const text of [p.name, p.hosts.join("、"), p.idPattern, shortTime(status[p.id]?.lastCaptureAt)]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      const err = status[p.id]?.lastError;
      if (err) {
        const div = document.createElement("div");
        div.className = "error";
        div.textContent = err;
        tr.children[3].append(div);
      }
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "刪除";
      del.addEventListener("click", async () => {
        await customManager().remove(p.id);
        $("customMessage").textContent = `已刪除 ${p.name}（已收集的資料保留在 collector）。`;
        await refresh();
      });
      const td = document.createElement("td");
      td.append(del);
      tr.append(td);
      return tr;
    }),
  );
}

async function refresh() {
  const config = await loadConfig(storage);
  const status = await chrome.runtime.sendMessage({ type: "getStatus" });
  registered = status?.platforms ?? [];
  renderPlatforms(platformRows(registered, status?.states ?? {}, config));
  $("sweepNow").disabled = Boolean(status?.running);
  const manager = customManager();
  customList = await manager.list();
  renderCustom(customList, await manager.status());
}

async function load() {
  const config = await loadConfig(storage);
  for (const f of FIELDS) $(f).value = config[f];
  $("sweepEnabled").checked = config.sweepEnabled;
  $("projectBlacklist").value = config.projectBlacklist.join("\n");
  await refresh();
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const platforms = Object.fromEntries(
    [...document.querySelectorAll("input[data-platform]")].map((b) => [b.dataset.platform, b.checked]),
  );
  const form = Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
  const config = formToConfig({ ...form, sweepEnabled: $("sweepEnabled").checked, platforms, projectBlacklist: $("projectBlacklist").value });
  await storage.set({ config });
  for (const f of FIELDS) $(f).value = config[f];
  $("projectBlacklist").value = config.projectBlacklist.join("\n");
  message(config.token ? "已儲存。" : "已儲存；尚未設定 token，巡檢不會執行。");
  await refresh();
});

$("addCustom").addEventListener("click", async () => {
  const input = { name: $("customName").value, host: $("customHost").value, idPattern: $("customPattern").value };
  try {
    const p = await customManager().add(input, customList);
    for (const id of ["customName", "customHost", "customPattern"]) $(id).value = "";
    $("customMessage").textContent = `已新增 ${p.name}（平台 id：${p.id}）。打開該平台的對話後，頁面靜止 20 秒就會擷取。`;
  } catch (e) {
    $("customMessage").textContent = e.message;
  }
  await refresh();
});

$("sweepNow").addEventListener("click", async () => {
  $("sweepNow").disabled = true;
  message("巡檢中…");
  const res = await chrome.runtime.sendMessage({ type: "sweepNow" });
  message(res?.ok ? `巡檢完成（${res.results.length} 個平台）。` : `巡檢失敗：${res?.error ?? "未知錯誤"}`);
  await refresh();
});

// 瀏覽完整紀錄（T28）：在這個 Chrome 設定檔開分頁，點「開啟原對話」時平台已是登入狀態
$("browse").addEventListener("click", async () => {
  const url = browseUrl(await loadConfig(storage));
  if (url) await chrome.tabs.create({ url });
});

// 巡檢狀態寫在 storage，變動時即時更新表格
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k.startsWith("platform:") || k === "pageStatus")) refresh();
});

load();

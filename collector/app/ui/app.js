// Idea Ledger 對話紀錄瀏覽介面（T28）。只讀；資料來自同源的 /v2 API（需要 token）。
// 安全：對話內容一律用 textContent／文字節點呈現，不把任何字串當 HTML 解析；外部連結只接受 http(s)。
"use strict";

const TOKEN_KEY = "idealedger.token";
const PAGE = 50;
const $ = (id) => document.getElementById(id);

const state = {
  q: "", platform: "", project: "*", offset: 0, total: 0,
  items: [], selected: -1, current: null, terms: [], loading: 0,
};

// ---- token：選單列或擴充以 #token=… 帶入（片段不會送到伺服器），讀到就存起來並從網址移除 ----

function readToken() {
  const h = new URLSearchParams(location.hash.slice(1));
  const fromHash = h.get("token");
  if (fromHash) {
    try { localStorage.setItem(TOKEN_KEY, h.get("token")); } catch {}
    h.delete("token");
    const rest = h.toString();
    history.replaceState(null, "", location.pathname + (rest ? "#" + rest : ""));
  }
  try { return fromHash || localStorage.getItem(TOKEN_KEY) || ""; } catch { return fromHash || ""; }
}

let token = "";

class AuthError extends Error {}

async function api(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401) throw new AuthError("token 錯誤");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function askToken(message = "") {
  $("loginError").textContent = message;
  const dlg = $("login");
  if (!dlg.open) dlg.showModal();
  $("token").focus();
}

$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("token").value.trim();
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  $("login").close();
  start();
});

// ---- 網址狀態：#q=…&p=…&proj=…&c=平台/對話id，重新整理與上一頁都保留 ----

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.q = h.get("q") || "";
  state.platform = h.get("p") || "";
  state.project = h.has("proj") ? h.get("proj") : "*";
  return h.get("c");
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.q) h.set("q", state.q);
  if (state.platform) h.set("p", state.platform);
  if (state.project !== "*") h.set("proj", state.project);
  if (state.current) h.set("c", `${state.current.platform}/${state.current.conv_id}`);
  const s = h.toString();
  history.replaceState(null, "", location.pathname + (s ? "#" + s : ""));
}

// ---- 小工具 ----

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

const fmt = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? iso : fmt.format(d);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** 把 text 依搜尋詞切成文字節點與 <mark>，回傳命中數。 */
function highlight(parent, text, terms) {
  if (!terms.length || !text) { parent.append(text || ""); return 0; }
  const re = new RegExp(terms.map(escapeRe).join("|"), "gi");
  let last = 0, hits = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    parent.append(el("mark", null, m[0]));
    last = m.index + m[0].length;
    hits += 1;
  }
  if (last < text.length) parent.append(text.slice(last));
  return hits;
}

// ---- 篩選選項（全部來自資料，不寫死平台） ----

async function loadFacets() {
  const f = await api("/v2/facets");
  const ps = $("platform");
  ps.replaceChildren(new Option(`全部平台（${f.total}）`, ""));
  for (const p of f.platforms) ps.append(new Option(`${p.platform_name}（${p.count}）`, p.platform));
  ps.value = state.platform;
  const pj = $("project");
  pj.replaceChildren(new Option("全部專案", "*"));
  if (f.no_project) pj.append(new Option(`（不在專案內）（${f.no_project}）`, ""));
  for (const p of f.projects) pj.append(new Option(`${p.project}（${p.count}）`, p.project));
  pj.value = state.project;
  if (pj.value !== state.project) { state.project = "*"; pj.value = "*"; }
}

// ---- 清單 ----

function query(offset) {
  const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.platform) p.set("platform", state.platform);
  if (state.project !== "*") p.set("project", state.project);
  return `/v2/conversations?${p}`;
}

async function search(append = false) {
  const ticket = ++state.loading;
  const offset = append ? state.items.length : 0;
  const data = await api(query(offset));
  if (ticket !== state.loading) return; // 已有更新的查詢
  state.terms = data.terms;
  state.total = data.total;
  state.items = append ? state.items.concat(data.items) : data.items;
  if (!append) state.selected = -1;
  renderList(append ? offset : 0);
}

function renderList(from) {
  const ol = $("items");
  if (from === 0) ol.replaceChildren();
  state.items.slice(from).forEach((it, k) => ol.append(itemNode(it, from + k)));
  $("count").textContent = state.terms.length
    ? `找到 ${state.total} 段對話` : `共 ${state.total} 段對話，依最後更新排序`;
  $("more").hidden = state.items.length >= state.total;
  $("empty").hidden = state.total > 0;
  markSelected();
}

function itemNode(it, i) {
  const li = el("li", "item");
  li.tabIndex = -1;
  li.dataset.index = String(i);
  const top = el("div", "item-top");
  top.append(el("span", "badge", it.platform_name));
  if (it.project) top.append(el("span", "tag", it.project));
  top.append(el("span", "date", when(it.updated_at)));
  const url = safeUrl(it.url);
  if (url) {
    const a = el("a", "ext", "↗");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = `在 ${it.platform_name} 開啟原對話`;
    a.addEventListener("click", (e) => e.stopPropagation());
    top.append(a);
  }
  const title = el("div", "item-title");
  highlight(title, it.title || "（無標題）", state.terms);
  li.append(top, title);
  if (it.snippet) {
    const sn = el("div", "snippet");
    if (it.snippet_role === "assistant") sn.append(el("span", "who", "AI："));
    highlight(sn, it.snippet, state.terms);
    li.append(sn);
  }
  li.addEventListener("click", () => select(i, true));
  return li;
}

function markSelected() {
  for (const li of $("items").children) li.classList.toggle("selected", Number(li.dataset.index) === state.selected);
}

async function select(i, open) {
  if (i < 0 || i >= state.items.length) return;
  state.selected = i;
  markSelected();
  const li = $("items").children[i];
  li?.scrollIntoView({ block: "nearest" });
  if (open) await openConversation(state.items[i].platform, state.items[i].conv_id);
}

// ---- 單篇 ----

async function openConversation(platform, convId) {
  const c = await api(`/v2/conversations/${encodeURIComponent(platform)}/${encodeURIComponent(convId)}`);
  state.current = c;
  writeHash();
  renderConversation();
  document.body.classList.add("reading");
}

function renderConversation() {
  const c = state.current;
  if (!c) return;
  $("placeholder").hidden = true;
  $("conv").hidden = false;
  $("title").replaceChildren();
  highlight($("title"), c.title || "（無標題）", state.terms);
  const meta = [c.platform_name, c.project && `專案：${c.project}`, `最後更新 ${when(c.updated_at)}`,
    `建立 ${when(c.created_at)}`, `${c.message_count} 則`].filter(Boolean);
  $("meta").textContent = meta.join("　·　");
  const url = safeUrl(c.url);
  const open = $("open");
  open.textContent = `在 ${c.platform_name} 開啟原對話 ↗`;
  open.hidden = !url;
  if (url) open.href = url;
  $("copy").hidden = !url;
  $("card").textContent = c.card_path ? `想法卡：AiMemory/${c.card_path}` : "";

  const mine = $("mine").checked;
  const box = $("messages");
  box.replaceChildren();
  let hits = 0;
  if (c.capture === "page" && c.page_text) {
    const m = el("section", "msg page");
    m.append(el("div", "who", "頁面擷取（未區分發言者）"));
    const body = el("div", "text");
    hits += highlight(body, c.page_text, state.terms);
    m.append(body);
    box.append(m);
  }
  c.messages.forEach((msg, i) => {
    if (mine && msg.role !== "user") return;
    const m = el("section", `msg ${msg.role}`);
    const head = el("div", "who", msg.role === "user" ? "我" : c.platform_name);
    if (msg.at) head.append(el("span", "at", when(msg.at)));
    head.append(el("span", "n", `#${i + 1}`));
    const body = el("div", "text");
    hits += highlight(body, msg.text, state.terms);
    m.append(head, body);
    box.append(m);
  });
  $("hits").textContent = state.terms.length ? `本篇命中 ${hits} 處` : "";
  const first = box.querySelector("mark");
  if (first) first.scrollIntoView({ block: "center" });
  else $("detail").scrollTop = 0;
}

function closeConversation() {
  document.body.classList.remove("reading");
}

// ---- 事件 ----

let timer = 0;
$("q").addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.q = $("q").value;
    writeHash();
    run(() => search());
  }, 250);
});
$("platform").addEventListener("change", () => { state.platform = $("platform").value; writeHash(); run(() => search()); });
$("project").addEventListener("change", () => { state.project = $("project").value; writeHash(); run(() => search()); });
$("more").addEventListener("click", () => run(() => search(true)));
$("mine").addEventListener("change", renderConversation);
$("back").addEventListener("click", closeConversation);
$("copy").addEventListener("click", async () => {
  const url = safeUrl(state.current?.url);
  if (!url) return;
  try { await navigator.clipboard.writeText(url); $("copy").textContent = "已複製"; }
  catch { $("copy").textContent = "無法複製"; }
  setTimeout(() => { $("copy").textContent = "複製網址"; }, 1500);
});

document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  if (e.key === "/" && !typing) { e.preventDefault(); $("q").focus(); $("q").select(); return; }
  if (e.key === "Escape") { if (typing) e.target.blur(); else closeConversation(); return; }
  if (typing && e.target !== $("q")) return;
  if (e.key === "ArrowDown") { e.preventDefault(); select(Math.min(state.selected + 1, state.items.length - 1), false); }
  else if (e.key === "ArrowUp") { e.preventDefault(); select(Math.max(state.selected - 1, 0), false); }
  else if (e.key === "Enter" && state.selected >= 0) { e.preventDefault(); run(() => select(state.selected, true)); }
  else if ((e.key === "o" || e.key === "O") && !typing) {
    const url = safeUrl(state.current?.url ?? state.items[state.selected]?.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
});

async function run(fn) {
  try { await fn(); }
  catch (err) {
    if (err instanceof AuthError) askToken("token 不正確，請重新輸入。");
    else $("count").textContent = `讀取失敗：${err.message}（collector 有在跑嗎？）`;
  }
}

async function start() {
  const conv = readHash();
  $("q").value = state.q;
  await run(async () => {
    await loadFacets();
    await search();
    if (conv) {
      const i = conv.indexOf("/");
      await openConversation(conv.slice(0, i), conv.slice(i + 1));
    }
  });
}

token = readToken();
if (token) start();
else askToken();

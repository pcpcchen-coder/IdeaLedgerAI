// Idea Ledger 介面採樣腳本。在已登入的 chatgpt 網頁按 F12 → Console，整段貼上後按 Enter。
// 只發 GET 請求；下載前已在你的瀏覽器內遮蔽非測試對話標題、token、email。
(async () => {
// Idea Ledger 介面採樣：共用核心（T01、T02）。
// 由 build-sampler.mjs 與各平台設定組成一段可直接貼進瀏覽器主控台的腳本。
// 原則：
//   - 只發 GET 請求，不改動任何平台資料。
//   - 在你的瀏覽器內先遮蔽：非測試對話的標題、token、email、JWT、組織名稱，然後才下載檔案。
//   - 介面路徑是社群觀察到的非官方路徑，未經驗證；每個請求都記錄狀態碼，失敗就退回工單的手動 DevTools 方式。

/* eslint-disable no-unused-vars */
const IdeaLedgerSamplerCore = (() => {
  const MASK = "（其他對話，已遮蔽）";
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
  const TEXT_FIELDS = ["title", "name", "summary", "snippet", "preview"];

  /** 從貼上的網址（或 ID）取出對話 ID */
  function idsFromInput(text) {
    return [...new Set((String(text || "").match(UUID) || []).map((s) => s.toLowerCase()))];
  }

  /** 只保留結構（鍵名與型別），不保留任何值：用於登入狀態等含 token 的回應 */
  function shapeOnly(v) {
    if (Array.isArray(v)) return v.length ? [shapeOnly(v[0])] : [];
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOnly(x)]));
    return v === null ? null : `<${typeof v}>`;
  }

  /** 清單回應：不是測試對話的項目，標題等文字欄位一律遮蔽 */
  function maskList(node, keep) {
    if (Array.isArray(node)) return node.map((x) => maskList(x, keep));
    if (!node || typeof node !== "object") return node;
    const id = String(node.id ?? node.uuid ?? node.conversation_id ?? "").toLowerCase();
    const isItem = id && TEXT_FIELDS.some((f) => typeof node[f] === "string");
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = isItem && !keep.has(id) && TEXT_FIELDS.includes(k) && typeof v === "string" ? MASK : maskList(v, keep);
    }
    return out;
  }

  /** 收集清單回應中出現的所有對話 ID */
  function collectIds(node, acc = new Set()) {
    if (Array.isArray(node)) node.forEach((x) => collectIds(x, acc));
    else if (node && typeof node === "object") {
      const id = node.id ?? node.uuid ?? node.conversation_id;
      if (typeof id === "string") acc.add(id.toLowerCase());
      Object.values(node).forEach((x) => collectIds(x, acc));
    }
    return acc;
  }

  /** 最後一道防線：整份輸出再掃一次 email、JWT，並把指定字串（例如組織 ID）換成佔位 */
  function scrub(text, replacements = {}) {
    let out = text.replace(EMAIL, "[EMAIL]").replace(JWT, "[JWT]");
    for (const [from, to] of Object.entries(replacements)) {
      if (from) out = out.split(from).join(to);
    }
    return out;
  }

  /**
   * @param {object} platform 平台設定（見 sampler-chatgpt.js、sampler-claude.js）
   * @param {object} env { fetch, prompt, download, sleep, log, now }
   */
  async function run(platform, env) {
    const { fetch, prompt, download, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log } = env;
    const labels = platform.testLabels || [];
    const input = prompt(
      `Idea Ledger 採樣（${platform.name}）\n\n` +
        "請依序貼上測試對話的網址，用空白或逗號分隔：\n" +
        labels.map((l, i) => `${String.fromCharCode(65 + i)}. ${l.hint}`).join("\n"),
    );
    const testIds = idsFromInput(input);
    if (!testIds.length) throw new Error("沒有讀到任何對話網址，已取消。");
    const keep = new Set(testIds);
    const labelOf = (id) => (labels[testIds.indexOf(id)] || { key: `extra${testIds.indexOf(id) + 1}` }).key;

    const requests = [];
    const ctx = { headers: {}, vars: {}, replacements: {} };
    async function get(name, path, { kind = "data", pathTemplate } = {}) {
      if (requests.length) await sleep(1500);
      let status = 0;
      let body = null;
      try {
        const res = await fetch(path, { method: "GET", credentials: "include", headers: ctx.headers });
        status = res.status;
        body = await res.json().catch(() => null);
      } catch (e) {
        body = { error: String(e) };
      }
      const stored = kind === "shape" ? shapeOnly(body) : kind === "list" ? maskList(body, keep) : body;
      requests.push({ name, method: "GET", path: pathTemplate ?? path, status, body: stored });
      log(`${status} ${name}`);
      return { status, body };
    }

    const listedIds = new Set();
    await platform.collect({ get, ctx, testIds, labelOf, listedIds: (body) => collectIds(body, listedIds) });

    const bundle = {
      tool: "idealedger-sampler",
      platform: platform.id,
      captured_at: (env.now ? env.now() : new Date()).toISOString(),
      tests: testIds.map((id) => ({ label: labelOf(id), id, found_in_lists: listedIds.has(id) })),
      requests,
    };
    const text = scrub(JSON.stringify(bundle, null, 2), ctx.replacements);
    download(`idealedger_${platform.id}_sample.json`, text);
    return JSON.parse(text);
  }

  function browserEnv() {
    return {
      fetch: window.fetch.bind(window),
      prompt: window.prompt.bind(window),
      download(filename, text) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    };
  }

  return { run, browserEnv, idsFromInput, shapeOnly, maskList, collectIds, scrub, MASK };
})();

// ChatGPT 採樣設定（T01）。路徑為社群觀察到的非官方介面，未經驗證；以實際狀態碼為準。
/* eslint-disable no-unused-vars */
const IdeaLedgerSamplerPlatform = {
  id: "chatgpt",
  name: "ChatGPT",
  testLabels: [
    { key: "simple", hint: "一般對話（網頁，來回 3 輪）" },
    { key: "branched", hint: "有分支的對話（重新生成＋編輯過）" },
    { key: "project", hint: "專案內的對話" },
    { key: "mobile", hint: "手機 App 上開的對話（在網頁上打開後的網址）" },
  ],
  host: "chatgpt.com",
  async collect({ get, ctx, testIds, labelOf, listedIds }) {
    // 登入狀態：只保留結構，token 不寫進檔案
    const session = await get("session", "/api/auth/session", { kind: "shape" });
    const token = session.body && session.body.accessToken;
    if (token) ctx.headers = { Authorization: `Bearer ${token}` };

    for (const [i, offset] of [0, 28].entries()) {
      const r = await get(`list_page${i + 1}`, `/backend-api/conversations?offset=${offset}&limit=28&order=updated`, {
        kind: "list",
      });
      listedIds(r.body);
    }

    for (const id of testIds) {
      await get(`conversation_${labelOf(id)}`, `/backend-api/conversation/${id}`, {
        pathTemplate: "/backend-api/conversation/{id}",
      });
    }
  },
};

try {
  const result = await IdeaLedgerSamplerCore.run(IdeaLedgerSamplerPlatform, IdeaLedgerSamplerCore.browserEnv());
  console.log("完成，已下載檔案。各請求狀態：", result.requests.map((r) => r.status + " " + r.name).join("、"));
} catch (e) {
  console.error("採樣失敗：", e.message);
}
})();

// ChatGPT 取資料層：在 chatgpt.com 分頁內以同源 GET 讀取，回應交給 parse.js。
// 請求路徑、分頁、header 以 fixtures/chatgpt/NOTES.md 為準。
import { NeedsLogin, RateLimited } from "../../lib/errors.js";
import { createGetter } from "../../lib/http.js";
import { realClock } from "../../lib/throttle.js";
import { parseConversation, parseList, parseProjects, parseSession } from "./parse.js";

export const PAGE_SIZE = 28; // 網頁本身使用的頁大小（NOTES 第 1 題）
const PROJECTS_URL = "/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false";
const PROJECT_PAGES_MAX = 10; // 每頁 20 個專案，最多讀 200 個
/** 遇到名稱表裡沒有的專案 ID 時，距上次讀名稱表超過這段時間才重讀（大約每輪最多一次） */
export const PROJECTS_REFRESH_MS = 10 * 60 * 1000;

/**
 * @param {Parameters<typeof createGetter>[0]} [opts] 測試時注入假 fetch 與時鐘
 */
export function createChatgptClient(opts) {
  const http = createGetter(opts);
  const clock = opts?.clock ?? realClock;
  let token = null; // 分頁存活期間快取
  const projectNames = new Map(); // g-p-… → 專案名稱（分頁存活期間快取）
  let projectsLoadedAt = null;

  /** 讀專案名稱表（多頁）。限流、未登入照常拋出；其他失敗只記錄，對話保留專案 ID */
  async function loadProjects() {
    projectsLoadedAt = clock.now();
    try {
      let cursor = null;
      for (let page = 0; page < PROJECT_PAGES_MAX; page++) {
        const url = cursor ? `${PROJECTS_URL}&cursor=${encodeURIComponent(cursor)}` : PROJECTS_URL;
        const { names, cursor: next } = parseProjects(await api(url));
        for (const [id, name] of Object.entries(names)) projectNames.set(id, name);
        if (!next) break;
        cursor = next;
      }
    } catch (e) {
      if (e instanceof RateLimited || e instanceof NeedsLogin) throw e;
      console.warn("Idea Ledger：ChatGPT 專案名稱表讀取失敗，保留專案 ID", e);
    }
  }

  /** g-p-… → 名稱；沒有名稱就保留 ID */
  async function projectName(id) {
    if (id == null) return null;
    const stale = projectsLoadedAt == null || clock.now() - projectsLoadedAt >= PROJECTS_REFRESH_MS;
    if (!projectNames.has(id) && stale) await loadProjects();
    return projectNames.get(id) ?? id;
  }

  async function getToken() {
    if (!token) token = parseSession(await http.getJson("/api/auth/session")).accessToken;
    return token;
  }

  /** 帶 Authorization 的請求；401 時清掉權杖重取一次，不無限重試 */
  async function api(path) {
    const headers = () => ({ Authorization: `Bearer ${token}` });
    await getToken();
    try {
      return await http.getJson(path, { headers: headers() });
    } catch (e) {
      if (!(e instanceof NeedsLogin)) throw e;
      token = null;
      await getToken();
      return http.getJson(path, { headers: headers() });
    }
  }

  return {
    async checkLogin() {
      try {
        await getToken();
        return { ok: true };
      } catch (e) {
        if (e instanceof NeedsLogin) return { ok: false, reason: e.message };
        throw e;
      }
    },
    async listUpdated(cursor) {
      const offset = cursor?.offset ?? 0;
      const page = parseList(await api(`/backend-api/conversations?offset=${offset}&limit=${PAGE_SIZE}&order=updated`));
      for (const it of page.items) it.project = await projectName(it.project);
      return page;
    },
    async getConversation(id) {
      const conv = parseConversation(await api(`/backend-api/conversation/${encodeURIComponent(id)}`));
      return { ...conv, project: await projectName(conv.project) };
    },
  };
}

const client = createChatgptClient();
export const checkLogin = () => client.checkLogin();
export const listUpdated = (cursor) => client.listUpdated(cursor);
export const getConversation = (id) => client.getConversation(id);

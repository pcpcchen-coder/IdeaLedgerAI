// Claude 取資料層：在 claude.ai 分頁內以同源 GET 讀取（只帶 cookie），回應交給 parse.js。
// 請求路徑、分頁以 fixtures/claude/NOTES.md 為準。
import { NeedsLogin, RateLimited } from "../../lib/errors.js";
import { createGetter } from "../../lib/http.js";
import { parseConversation, parseList, parseOrganizations, parseProject, projectUuidOf } from "./parse.js";

export const PAGE_SIZE = 30;

/**
 * @param {Parameters<typeof createGetter>[0]} [opts] 測試時注入假 fetch 與時鐘
 */
export function createClaudeClient(opts) {
  const http = createGetter(opts);
  let orgId = null; // 分頁存活期間快取
  const projectNames = new Map(); // 對話 id → 清單上的專案名稱（單篇回應只有 project_uuid）
  const projectsByUuid = new Map(); // project_uuid → 專案名稱（null 代表查不到，不重查）

  /**
   * 單篇只有 project_uuid：查一次專案取名稱，分頁存活期間快取。
   * 回填時不列清單、分頁也可能剛重新載入，不能只靠清單上的名稱（T08 首測發現）。
   * 查不到（404、格式不符等）就退回 project_uuid，不讓整篇失敗；登入或限流錯誤照常往上拋。
   */
  async function projectName(uuid) {
    if (!projectsByUuid.has(uuid)) {
      try {
        projectsByUuid.set(uuid, parseProject(await api(`/projects/${encodeURIComponent(uuid)}`)));
      } catch (e) {
        if (e instanceof NeedsLogin || e instanceof RateLimited) throw e;
        projectsByUuid.set(uuid, null);
      }
    }
    return projectsByUuid.get(uuid);
  }

  async function getOrg() {
    if (!orgId) {
      // 未登入時這個端點回 403（NOTES 第 6 題），不是限流
      const json = await http.getJson("/api/organizations", {
        statusMap: { 403: () => new NeedsLogin("Claude 未登入（/api/organizations 回 403）") },
      });
      orgId = parseOrganizations(json).orgId;
    }
    return orgId;
  }

  /** 組織底下的請求；401 時清掉組織 ID 重取一次，不無限重試 */
  async function api(path) {
    const url = () => `/api/organizations/${encodeURIComponent(orgId)}${path}`;
    await getOrg();
    try {
      return await http.getJson(url());
    } catch (e) {
      if (!(e instanceof NeedsLogin)) throw e;
      orgId = null;
      await getOrg();
      return http.getJson(url());
    }
  }

  return {
    async checkLogin() {
      try {
        await getOrg();
        return { ok: true };
      } catch (e) {
        if (e instanceof NeedsLogin) return { ok: false, reason: e.message };
        throw e;
      }
    },
    async listUpdated(cursor) {
      const offset = cursor?.offset ?? 0;
      const json = await api(`/chat_conversations?limit=${PAGE_SIZE}&offset=${offset}`);
      const page = parseList(json, { offset, limit: PAGE_SIZE });
      for (const it of page.items) if (it.project) projectNames.set(it.id, it.project);
      return page;
    },
    async getConversation(id) {
      const json = await api(`/chat_conversations/${encodeURIComponent(id)}?tree=True&rendering_mode=messages&render_all_tools=true`);
      const uuid = projectUuidOf(json);
      const name = projectNames.get(id) ?? (uuid ? await projectName(uuid) : null);
      return parseConversation(json, { project: name });
    },
  };
}

const client = createClaudeClient();
export const checkLogin = () => client.checkLogin();
export const listUpdated = (cursor) => client.listUpdated(cursor);
export const getConversation = (id) => client.getConversation(id);

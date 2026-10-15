// ChatGPT 取資料層：在 chatgpt.com 分頁內以同源 GET 讀取，回應交給 parse.js。
// 請求路徑、分頁、header 以 fixtures/chatgpt/NOTES.md 為準。
import { NeedsLogin } from "../../lib/errors.js";
import { createGetter } from "../../lib/http.js";
import { parseConversation, parseList, parseSession } from "./parse.js";

export const PAGE_SIZE = 28; // 網頁本身使用的頁大小（NOTES 第 1 題）

/**
 * @param {Parameters<typeof createGetter>[0]} [opts] 測試時注入假 fetch 與時鐘
 */
export function createChatgptClient(opts) {
  const http = createGetter(opts);
  let token = null; // 分頁存活期間快取

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
      return parseList(await api(`/backend-api/conversations?offset=${offset}&limit=${PAGE_SIZE}&order=updated`));
    },
    async getConversation(id) {
      return parseConversation(await api(`/backend-api/conversation/${encodeURIComponent(id)}`));
    },
  };
}

const client = createChatgptClient();
export const checkLogin = () => client.checkLogin();
export const listUpdated = (cursor) => client.listUpdated(cursor);
export const getConversation = (id) => client.getConversation(id);

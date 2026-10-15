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

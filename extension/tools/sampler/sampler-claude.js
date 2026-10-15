// Claude 採樣設定（T02）。路徑為社群觀察到的非官方介面，未經驗證；以實際狀態碼為準。
/* eslint-disable no-unused-vars */
const IdeaLedgerSamplerPlatform = {
  id: "claude",
  name: "Claude",
  testLabels: [
    { key: "simple", hint: "一般對話（網頁，來回 3 輪）" },
    { key: "branched", hint: "有分支的對話（重試＋編輯過）" },
    { key: "project", hint: "專案內的對話" },
    { key: "mobile", hint: "手機 App 上開的對話（在網頁上打開後的網址）" },
    { key: "attachment", hint: "含附件的對話" },
  ],
  host: "claude.ai",
  async collect({ get, ctx, testIds, labelOf, listedIds }) {
    const orgs = await get("organizations", "/api/organizations", { kind: "list" });
    const list = Array.isArray(orgs.body) ? orgs.body : [];
    // 組織名稱常含 email 或真名：遮蔽；組織 ID 一律換成佔位
    list.forEach((o, i) => {
      if (o && o.uuid) ctx.replacements[o.uuid] = `ORG_${i + 1}`;
    });
    const org = list.find((o) => (o.capabilities || []).includes("chat")) || list[0];
    if (!org || !org.uuid) return;
    const base = `/api/organizations/${org.uuid}`;

    const r = await get("list_page1", `${base}/chat_conversations?limit=30&offset=0`, {
      kind: "list",
      pathTemplate: "/api/organizations/{org}/chat_conversations?limit=30&offset=0",
    });
    listedIds(r.body);
    const r2 = await get("list_page2", `${base}/chat_conversations?limit=30&offset=30`, {
      kind: "list",
      pathTemplate: "/api/organizations/{org}/chat_conversations?limit=30&offset=30",
    });
    listedIds(r2.body);

    for (const id of testIds) {
      await get(
        `conversation_${labelOf(id)}`,
        `${base}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`,
        { pathTemplate: "/api/organizations/{org}/chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true" },
      );
    }
  },
};

// 確保每個平台都有一個可用的分頁：找現有的 → 沒有就開釘選、非作用中的分頁 → 被休眠就重新載入。
// 讀取請求必須在平台分頁內以同源方式發出（見 CLAUDE.md），所以分頁是必要的。

/**
 * @param {typeof chrome.tabs} tabsApi chrome.tabs 或相容物件
 * @param {{ loadTimeoutMs?: number }} [opts]
 */
export function createTabManager(tabsApi, { loadTimeoutMs = 60000 } = {}) {
  function waitComplete(tabId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        tabsApi.onUpdated.removeListener(listener);
        reject(new Error(`分頁 ${tabId} 載入逾時`));
      }, loadTimeoutMs);
      function listener(id, info) {
        if (id === tabId && info.status === "complete") {
          clearTimeout(timer);
          tabsApi.onUpdated.removeListener(listener);
          resolve();
        }
      }
      tabsApi.onUpdated.addListener(listener);
    });
  }

  return {
    /**
     * @param {{ id: string, hosts: string[] }} platform
     * @returns {Promise<number>} tabId
     */
    async ensureTab(platform) {
      const url = platform.hosts.map((h) => `https://${h}/*`);
      const tabs = await tabsApi.query({ url });
      const usable = tabs.find((t) => !t.discarded && t.status === "complete");
      if (usable) return usable.id;

      const existing = tabs[0];
      if (existing) {
        const done = waitComplete(existing.id);
        await tabsApi.reload(existing.id);
        await done;
        return existing.id;
      }

      const created = await tabsApi.create({ url: `https://${platform.hosts[0]}/`, pinned: true, active: false });
      await waitComplete(created.id);
      return created.id;
    },
  };
}

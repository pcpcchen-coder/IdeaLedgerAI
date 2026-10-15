// Claude 取資料層：在 claude.ai 分頁內以同源 GET 讀取。實作見 T07。

const TODO = (name) => {
  throw new Error(`未實作：claude.${name}（T07）`);
};

export async function checkLogin() {
  return TODO("checkLogin");
}

export async function listUpdated(_cursor) {
  return TODO("listUpdated");
}

export async function getConversation(_id) {
  return TODO("getConversation");
}

// ChatGPT 取資料層：在 chatgpt.com 分頁內以同源 GET 讀取。實作見 T07。

const TODO = (name) => {
  throw new Error(`未實作：chatgpt.${name}（T07）`);
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

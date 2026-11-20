/* Shared client, helpers and page shell for Rubbish House. */

const config = window.RUHOUSE_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || "").trim().replace(/\/+$/, "");
const supabaseKey = String(config.supabaseAnonKey || "").trim();
const bucket = String(config.storageBucket || "room-photos").trim();

let client = null;
try {
  if (window.supabase?.createClient && supabaseUrl && supabaseKey) {
    client = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "ruhouse-auth"
      }
    });
  }
} catch (error) {
  console.error("Supabase client init failed:", error);
}

let sessionPromise = null;

function requireClient() {
  if (!client) {
    throw new Error("云端连接尚未配置。请检查 config.js 中的 Supabase URL 和 publishable key。");
  }
  return client;
}

function messageOf(error) {
  if (!error) return "未知错误";
  return error.message || error.error_description || error.msg || String(error);
}

export function friendlyError(error) {
  const message = messageOf(error);
  if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确。";
  if (/email not confirmed/i.test(message)) return "邮箱还没有确认，请先完成邮箱验证。";
  if (/already registered|already been registered/i.test(message)) return "这个邮箱已经绑定过账号，请直接用邮箱登录。";
  if (/password should be at least|password.*6 characters/i.test(message)) return "密码至少需要 6 位。";
  if (/unable to validate email|invalid email/i.test(message)) return "邮箱格式不正确。";
  if (/for security purposes/i.test(message)) return "操作太频繁了，请稍后再试。";
  if (/anonymous.*(disabled|not.*enabled)/i.test(message)) {
    return "Supabase 的匿名登录未开启，请先在 Authentication 中开启 Anonymous Sign-Ins。";
  }
  if (/could not find the function|PGRST202/i.test(message)) {
    return "审核功能尚未安装。请先在 Supabase SQL Editor 中执行最新 schema.sql。";
  }
  if (/permission denied|row-level security|42501/i.test(message)) {
    return "数据库拒绝了这次操作。请确认最新 schema.sql 已经完整执行。";
  }
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return "暂时无法连接云端，请检查网络后重试。";
  }
  return message;
}

export async function getSession() {
  const db = requireClient();
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function ensureAnonymousSession() {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const db = requireClient();
    let session = await getSession();

    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 30000) {
      const { data: refreshed, error } = await db.auth.refreshSession();
      if (!error && refreshed?.session) session = refreshed.session;
      else session = null;
    }

    if (!session) {
      const { data, error } = await db.auth.signInAnonymously();
      if (error) throw error;
      session = data?.session || null;
    }

    if (!session?.user) throw new Error("匿名身份初始化失败。");
    return session.user;
  })();

  try {
    return await sessionPromise;
  } catch (error) {
    sessionPromise = null;
    throw error;
  }
}

export async function signInAdmin(email, password) {
  const db = requireClient();
  await db.auth.signOut({ scope: "local" }).catch(() => {});
  sessionPromise = null;

  const { data, error } = await db.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || "")
  });
  if (error) throw error;

  const { data: isAdmin, error: adminError } = await db.rpc("rh_is_admin");
  if (adminError) throw adminError;
  if (!isAdmin) {
    await db.auth.signOut({ scope: "local" }).catch(() => {});
    throw new Error("这个账号不在管理员名单中。");
  }

  return data.user;
}

export async function signOut() {
  const db = requireClient();
  sessionPromise = null;
  await db.auth.signOut({ scope: "local" });
}

export async function refreshUser() {
  const db = requireClient();
  const { data, error } = await db.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

export async function bindEmail(email, password) {
  const db = requireClient();
  const { data, error } = await db.auth.updateUser(
    { email: String(email || "").trim(), password: String(password || "") },
    { emailRedirectTo: window.location.origin + "/me.html?linked=1" }
  );
  if (error) throw error;
  sessionPromise = null;
  return data?.user || null;
}

export async function signInWithEmail(email, password) {
  const db = requireClient();
  const { data, error } = await db.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || "")
  });
  if (error) throw error;
  sessionPromise = null;
  return data?.user || null;
}

export async function getAdminUser() {
  const session = await getSession();
  if (!session?.user) return null;
  const db = requireClient();
  const { data, error } = await db.rpc("rh_is_admin");
  if (error) throw error;
  return data ? session.user : null;
}

async function rpc(name, params = {}) {
  const db = requireClient();
  const { data, error } = await db.rpc(name, params);
  if (error) throw error;
  return data;
}

export const api = {
  async listPosts() {
    return (await rpc("rh_list_posts")) || [];
  },

  async getPost(id) {
    const rows = await rpc("rh_get_post", { p_post_id: id });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async listComments(postId) {
    return (await rpc("rh_list_comments", { p_post_id: postId })) || [];
  },

  async castVote(postId) {
    const rows = await rpc("rh_cast_vote", { p_post_id: postId });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async addComment(postId, content) {
    const rows = await rpc("rh_add_comment", { p_post_id: postId, p_content: content });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async reportComment(commentId, reason) {
    const rows = await rpc("rh_report_comment", {
      p_comment_id: commentId,
      p_reason: reason
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async createPost(payload) {
    const rows = await rpc("rh_create_post", {
      p_title: payload.title,
      p_body: payload.body,
      p_tags: payload.tags,
      p_duration: payload.duration,
      p_images: payload.images
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async updatePost(payload) {
    const rows = await rpc("rh_update_post", {
      p_post_id: payload.id,
      p_title: payload.title,
      p_body: payload.body,
      p_tags: payload.tags,
      p_duration: payload.duration,
      p_images: payload.images
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async deleteMyPost(postId) {
    const rows = await rpc("rh_delete_my_post", { p_post_id: postId });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async listMyPosts() {
    return (await rpc("rh_list_my_posts")) || [];
  },

  async getMyPost(id) {
    const rows = await rpc("rh_get_my_post", { p_post_id: id });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async isAdmin() {
    return Boolean(await rpc("rh_is_admin"));
  },

  async adminListPosts(status = null) {
    return (await rpc("rh_admin_list_posts", { p_status: status })) || [];
  },

  async adminStats() {
    const rows = await rpc("rh_admin_stats");
    return Array.isArray(rows) ? rows[0] || { pending: 0, approved: 0, rejected: 0 } : rows;
  },

  async adminReview(postId, status, note = null) {
    const rows = await rpc("rh_admin_review_post", {
      p_post_id: postId,
      p_status: status,
      p_note: note
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async adminDeletePost(postId) {
    const rows = await rpc("rh_admin_delete_post", { p_post_id: postId });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async adminListReportedComments() {
    return (await rpc("rh_admin_list_reported_comments")) || [];
  },

  async adminReviewComment(commentId, decision) {
    const rows = await rpc("rh_admin_review_comment", {
      p_comment_id: commentId,
      p_decision: decision
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  },

  async adminListEmailAccounts() {
    const db = requireClient();
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) {
      throw new Error("登录状态已失效，请重新登录。");
    }

    const response = await fetch("/.netlify/functions/admin-delete-user", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + session.access_token
      }
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload?.error || "读取邮箱账号失败。");
    }
    return Array.isArray(payload?.users) ? payload.users : [];
  },

  async adminDeleteEmailAccount(email) {
    const db = requireClient();
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) {
      throw new Error("登录状态已失效，请重新登录。");
    }

    const response = await fetch("/.netlify/functions/admin-delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token
      },
      body: JSON.stringify({ email })
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload?.error || "删除邮箱账号失败。");
    }
    return payload;
  }
};

export async function uploadImage(dataUrl, userId) {
  const db = requireClient();
  if (!dataUrl || !userId) throw new Error("图片或用户信息不完整。");
  const blob = dataUrlToBlob(dataUrl);
  const randomPart = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  const path = "rooms/" + userId + "/" + randomPart + ".jpg";
  const { error } = await db.storage.from(bucket).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false
  });
  if (error) throw error;
  return path;
}

export async function removeImages(paths) {
  if (!paths?.length) return;
  const db = requireClient();
  const { error } = await db.storage.from(bucket).remove(paths);
  if (error) throw error;
}

export function resolveImage(path) {
  if (!path) return "";
  if (path.startsWith("local:")) return path.slice(6);
  if (/^(https?:|data:|assets\/)/.test(path)) return path;
  if (!client) return "";
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function nl2br(value) {
  return escapeHTML(value).replace(/\n/g, "<br>");
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date).replaceAll("/", ".");
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export const STATUS = {
  pending: { label: "待审核", className: "pending" },
  approved: { label: "已通过", className: "approved" },
  rejected: { label: "未通过", className: "rejected" }
};

export function statusBadge(status) {
  const meta = STATUS[status] || STATUS.pending;
  return `<span class="status status--${meta.className}"><i aria-hidden="true"></i>${meta.label}</span>`;
}

export function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function showToast(message, type = "success", timeout = 3600) {
  let region = document.querySelector(".toast-stack");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-stack";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = "toast" + (type === "error" ? " toast--error" : "");
  toast.textContent = message;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 250);
  }, timeout);
}

export function setButtonBusy(button, busy, label = "处理中…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = escapeHTML(label);
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

export function renderShell(activePage) {
  const headerHost = document.querySelector("[data-site-header]");
  const footerHost = document.querySelector("[data-site-footer]");
  const links = [
    ["wall", "wall.html", "避雷墙"],
    ["submit", "submit.html", "发布记录"],
    ["me", "me.html", "个人中心"],
    ["leaderboard", "leaderboard.html", "排行榜"],
    ["rules", "rules.html", "规则"]
  ];
  const nav = links.map(([key, href, label]) => `
    <a href="${href}" class="nav-link ${activePage === key ? "is-active" : ""}" ${activePage === key ? 'aria-current="page"' : ""}>${label}</a>
  `).join("");

  if (headerHost) {
    headerHost.innerHTML = `
      <header class="site-header">
        <div class="shell header-inner">
          <a class="brand" href="index.html" aria-label="Rubbish House 首页">
            <span class="brand-cn">垃圾房子</span>
            <span class="brand-en">RUBBISH HOUSE</span>
          </a>
          <nav class="site-nav" aria-label="主导航">${nav}</nav>
          <a class="btn btn--primary header-action" href="submit.html">记录一间房 <span aria-hidden="true">↗</span></a>
        </div>
      </header>
    `;
  }

  if (footerHost) {
    footerHost.innerHTML = `
      <footer class="site-footer">
        <div class="shell footer-inner">
          <div class="footer-brand">
            <a class="brand brand--footer" href="index.html">
              <span class="brand-cn">垃圾房子</span>
              <span class="brand-en">RUBBISH HOUSE</span>
            </a>
            <p>只记录房间，不记录地址。</p>
          </div>
          <nav class="footer-nav" aria-label="页脚导航">
            <a href="wall.html">避雷墙</a>
            <a href="submit.html">发布记录</a>
            <a href="me.html">个人中心</a>
            <a href="leaderboard.html">首月排行榜</a>
            <a href="rules.html">发帖与审核规则</a>
          </nav>
          <div class="footer-meta">
            <span>© <span data-year></span> RUHOUSE</span>
          </div>
        </div>
      </footer>
    `;
  }

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
}

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f6f3ec";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败。"));
    };

    image.src = objectUrl;
  });
}

export function dataUrlToBlob(dataUrl) {
  const [header, base64] = String(dataUrl).split(",");
  if (!header || !base64) throw new Error("图片数据无效。");
  const mime = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

const privacyPatterns = [
  {
    label: "手机号或身份证号",
    patterns: [
      /(?:\+?86[\s-]?)?1[3-9]\d{9}/g,
      /(?<!\d)\d{17}[\dXx](?!\d)/g
    ]
  },
  {
    label: "社交账号或联系方式",
    patterns: [
      /(?:微信|wechat|vx|v信|qq|电话|手机号|联系方式|加我)\s*(?:号|是|为)?\s*[:：]?\s*[A-Za-z0-9_-]{5,}/gi,
      /(?:小红书|微博|抖音|B站|b站)\s*(?:号|账号|ID|id)?\s*[:：]?\s*[A-Za-z0-9_.-]{3,}/g
    ]
  },
  {
    label: "地址或门牌号",
    patterns: [
      /(?:[\u4e00-\u9fa5A-Za-z0-9]{2,12}(?:小区|花园|苑|公寓|大厦|广场|公馆|新村|家园|里弄))(?:\s*[\dA-Za-z一二三四五六七八九十百千]{1,6}\s*(?:号|栋|幢|单元|楼|室|层))?/g,
      /(?:[\u4e00-\u9fa5A-Za-z0-9]{2,12}(?:路|街|巷|弄|大道))(?:\s*[\d一二三四五六七八九十百]{1,5}\s*(?:号|弄|巷|街|路|大道)?)/g,
      /(?:\d{1,4}|[A-Za-z]{1,2}[-]?\d{1,4})\s*(?:号楼|栋|幢|单元|层|室|房)(?!间)/g
    ]
  },
  {
    label: "房东或中介信息",
    patterns: [
      /(?:房东|中介|管家|经纪人)\s*(?:姓|叫|是|电话|微信|手机号|身份证)[^，。,.!?；;\n]{0,16}/g
    ]
  }
];

export function detectPrivacy(text) {
  const source = String(text || "");
  if (!source.trim()) return [];
  const found = [];
  const seen = new Set();

  privacyPatterns.forEach((group) => {
    group.patterns.forEach((pattern) => {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(source)) !== null) {
        const value = match[0].trim();
        const key = group.label + "::" + value;
        if (value && !seen.has(key)) {
          seen.add(key);
          found.push({ label: group.label, value });
        }
        if (regex.lastIndex === match.index) regex.lastIndex += 1;
      }
    });
  });

  return found;
}

export function renderError(container, error, retry) {
  if (!container) return;
  container.innerHTML = `
    <div class="page-error">
      <span class="eyebrow">CONNECTION</span>
      <h2>页面没有加载成功</h2>
      <p>${escapeHTML(friendlyError(error))}</p>
      <button class="btn btn--outline" type="button" data-retry>重新加载</button>
    </div>
  `;
  container.querySelector("[data-retry]")?.addEventListener("click", () => {
    if (typeof retry === "function") retry();
    else window.location.reload();
  });
}

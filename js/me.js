import {
  api,
  bindEmail,
  ensureAnonymousSession,
  escapeHTML,
  formatDate,
  formatDateTime,
  friendlyError,
  queryParam,
  refreshUser,
  removeImages,
  renderError,
  renderShell,
  showToast,
  signInWithEmail,
  signOut,
  statusBadge
} from "./core.js";

renderShell("me");

const state = {
  posts: [],
  filter: "all",
  loading: true,
  user: null,
  accountNotice: ""
};

const elements = {
  banner: document.getElementById("meBanner"),
  accountPanel: document.getElementById("accountPanel"),
  memberState: document.getElementById("memberState"),
  posts: document.getElementById("myPosts"),
  tabs: Array.from(document.querySelectorAll("[data-status]")),
  refresh: document.getElementById("refreshPosts")
};

function showBanner() {
  const created = queryParam("created");
  const updated = queryParam("updated");
  const logged = queryParam("logged");
  if (!created && !updated && !logged) return;
  elements.banner.hidden = false;
  elements.banner.className = "page-banner page-banner--success";
  elements.banner.innerHTML = created
    ? "<strong>已提交审核。</strong><span>管理员通过后，这条记录才会出现在避雷墙。你可以随时回来修改或查看进度。</span>"
    : updated
      ? "<strong>修改已提交审核。</strong><span>审核期间，这条记录会暂时从避雷墙隐藏。</span>"
      : "<strong>已登录邮箱账号。</strong><span>这里显示的是这个邮箱账号名下的记录。</span>";
  const url = new URL(window.location.href);
  url.searchParams.delete("created");
  url.searchParams.delete("updated");
  url.searchParams.delete("logged");
  window.history.replaceState({}, "", url);
}

function countByStatus(status) {
  if (status === "all") return state.posts.length;
  return state.posts.filter((post) => post.status === status).length;
}

function updateTabs() {
  elements.tabs.forEach((tab) => {
    const status = tab.dataset.status;
    const count = tab.querySelector("[data-tab-count]");
    if (count) count.textContent = String(countByStatus(status));
    const active = state.filter === status;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function visiblePosts() {
  if (state.filter === "all") return state.posts;
  return state.posts.filter((post) => post.status === state.filter);
}

function reviewNote(post) {
  if (post.status !== "rejected" || !post.review_note) return "";
  return '<div class="review-note"><strong>审核说明</strong><span>' + escapeHTML(post.review_note) + "</span></div>";
}

function myPost(post) {
  const tags = (post.tags || []).slice(0, 4).map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>").join("");
  const approved = post.status === "approved";
  return `
    <article class="my-post">
      <div class="my-post__body">
        <div class="my-post__topline">
          ${statusBadge(post.status)}
          <span>最后更新 ${formatDateTime(post.updated_at || post.created_at)}</span>
        </div>
        <h2><a href="${approved ? "post.html?id=" + encodeURIComponent(post.id) : "submit.html?edit=" + encodeURIComponent(post.id)}">${escapeHTML(post.title)}</a></h2>
        <p class="my-post__summary">${escapeHTML(String(post.body || "").slice(0, 110))}${String(post.body || "").length > 110 ? "…" : ""}</p>
        <div class="tag-list">${tags}</div>
        ${reviewNote(post)}
        <div class="my-post__footer">
          <span>提交于 ${formatDate(post.created_at)}</span>
          <div class="my-post__actions">
            ${approved ? '<a class="text-button" href="post.html?id=' + encodeURIComponent(post.id) + '">查看公开页</a>' : ""}
            <a class="text-link" href="submit.html?edit=${encodeURIComponent(post.id)}">修改 <span aria-hidden="true">→</span></a>
            <button class="text-button text-button--danger" type="button" data-delete-post="${escapeHTML(post.id)}">删除</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function render() {
  updateTabs();
  if (state.loading) {
    elements.memberState.hidden = false;
    elements.memberState.innerHTML = '<span class="loader" aria-hidden="true"></span><span>正在读取我的记录</span>';
    elements.posts.innerHTML = "";
    return;
  }

  const posts = visiblePosts();
  if (!posts.length) {
    elements.memberState.hidden = false;
    elements.posts.innerHTML = "";
    elements.memberState.innerHTML = `
      <div class="empty-state empty-state--compact">
        <p class="eyebrow">NO RECORDS</p>
        <h2>${state.filter === "all" ? "还没有提交过房间记录" : "这个状态下没有记录"}</h2>
        <p>${state.filter === "all" ? "拍下房间，让下一位租客少踩一次坑。" : "切换上方状态，或发布一条新的房间记录。"}</p>
        ${state.filter === "all" ? '<a class="btn btn--primary" href="submit.html">记录一间房 <span aria-hidden="true">↗</span></a>' : ""}
      </div>
    `;
    return;
  }

  elements.memberState.hidden = true;
  elements.posts.innerHTML = posts.map(myPost).join("");
}

function accountMessageHTML() {
  if (!state.accountNotice) return "";
  return '<p class="account-message">' + escapeHTML(state.accountNotice) + "</p>";
}

function renderAccount() {
  const user = state.user;
  if (!user) {
    elements.accountPanel.hidden = true;
    return;
  }

  elements.accountPanel.hidden = false;
  const email = String(user.email || "");
  const pendingEmail = String(user.new_email || "");
  const confirmed = Boolean(user.email_confirmed_at) && !pendingEmail;
  const isBound = Boolean(email) && confirmed;

  if (isBound) {
    elements.accountPanel.innerHTML = `
      <div class="account-panel__head">
        <div>
          <p class="eyebrow">EMAIL ACCOUNT <span>/</span> 邮箱账号</p>
          <h2>邮箱已绑定</h2>
        </div>
        <span class="status status--approved"><i aria-hidden="true"></i>永久账号</span>
      </div>
      <p class="account-panel__intro">当前邮箱：<strong>${escapeHTML(email)}</strong>。换设备或清除浏览器数据后，用这个邮箱和密码登录，之前的帖子仍然在。</p>
      ${accountMessageHTML()}
      <div class="account-panel__actions">
        <button class="text-button text-button--danger" type="button" id="accountSignOut">退出登录</button>
      </div>
    `;
    elements.accountPanel.querySelector("#accountSignOut")?.addEventListener("click", async () => {
      await signOut().catch(() => {});
      window.location.href = "index.html";
    });
    return;
  }

  if (pendingEmail || (email && !user.email_confirmed_at)) {
    const waitingEmail = pendingEmail || email;
    elements.accountPanel.innerHTML = `
      <div class="account-panel__head">
        <div>
          <p class="eyebrow">EMAIL ACCOUNT <span>/</span> 邮箱账号</p>
          <h2>等待邮箱确认</h2>
        </div>
        <span class="status status--pending"><i aria-hidden="true"></i>待确认</span>
      </div>
      <p class="account-panel__intro">确认邮件已发送到 <strong>${escapeHTML(waitingEmail)}</strong>。点击邮件里的确认链接后，回到这里用邮箱和密码登录。确认之前，当前匿名身份仍然有效。</p>
      ${accountMessageHTML()}
      <div class="account-panel__actions">
        <button class="text-button text-button--danger" type="button" id="accountSignOut">退出当前账号</button>
      </div>
    `;
    elements.accountPanel.querySelector("#accountSignOut")?.addEventListener("click", async () => {
      await signOut().catch(() => {});
      window.location.href = "index.html";
    });
    return;
  }

  elements.accountPanel.innerHTML = `
    <div class="account-panel__head">
      <div>
        <p class="eyebrow">OPTIONAL ACCOUNT <span>/</span> 可选邮箱</p>
        <h2>换设备，也能找回记录</h2>
      </div>
      <span class="status status--pending"><i aria-hidden="true"></i>当前匿名</span>
    </div>
    <p class="account-panel__intro">绑定邮箱会把当前匿名身份变成永久账号，已有帖子不会丢。以后换电脑或清除浏览器数据，用邮箱和密码登录就能找回。</p>
    ${accountMessageHTML()}
    <form class="account-form" id="bindEmailForm" novalidate>
      <label class="field">
        <span class="field__label"><span>邮箱</span></span>
        <input id="bindEmailInput" type="email" autocomplete="email" placeholder="name@example.com">
      </label>
      <label class="field">
        <span class="field__label"><span>设置密码</span><small>至少 6 位</small></span>
        <input id="bindPasswordInput" type="password" autocomplete="new-password" minlength="6" placeholder="至少 6 位">
      </label>
      <button class="btn btn--primary" type="submit" id="bindEmailButton">绑定邮箱</button>
    </form>
    <p class="form-hint form-hint--error" id="bindAccountMessage" hidden></p>

    <details class="account-login">
      <summary>已有邮箱账号？登录</summary>
      <p class="form-hint">登录会替换当前浏览器里的匿名身份。如果当前身份已经有帖子，请先绑定邮箱，不要直接登录。</p>
      <form class="account-form" id="emailLoginForm" novalidate>
        <label class="field">
          <span class="field__label"><span>邮箱</span></span>
          <input id="loginEmailInput" type="email" autocomplete="email" placeholder="name@example.com">
        </label>
        <label class="field">
          <span class="field__label"><span>密码</span></span>
          <input id="loginPasswordInput" type="password" autocomplete="current-password" placeholder="请输入密码">
        </label>
        <button class="btn btn--outline" type="submit" id="emailLoginButton">登录</button>
      </form>
      <p class="form-hint form-hint--error" id="loginAccountMessage" hidden></p>
    </details>
  `;

  const bindForm = elements.accountPanel.querySelector("#bindEmailForm");
  const bindMessage = elements.accountPanel.querySelector("#bindAccountMessage");
  bindForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = elements.accountPanel.querySelector("#bindEmailInput");
    const passwordInput = elements.accountPanel.querySelector("#bindPasswordInput");
    const button = elements.accountPanel.querySelector("#bindEmailButton");
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    bindMessage.hidden = true;
    if (!email || !email.includes("@")) {
      bindMessage.hidden = false;
      bindMessage.textContent = "请输入有效邮箱。";
      emailInput.focus();
      return;
    }
    if (password.length < 6) {
      bindMessage.hidden = false;
      bindMessage.textContent = "密码至少需要 6 位。";
      passwordInput.focus();
      return;
    }

    button.disabled = true;
    button.textContent = "发送中…";
    try {
      const updated = await bindEmail(email, password);
      state.user = updated || state.user;
      const waiting = Boolean(state.user?.new_email) || (Boolean(state.user?.email) && !state.user?.email_confirmed_at);
      state.accountNotice = waiting
        ? "确认邮件已发送，请到邮箱点击确认链接。"
        : "邮箱绑定成功。以后可以用这个邮箱和密码登录。";
      renderAccount();
      showToast(waiting ? "请检查邮箱完成确认。" : "邮箱绑定成功。", "success", 5000);
    } catch (error) {
      bindMessage.hidden = false;
      bindMessage.textContent = friendlyError(error);
      button.disabled = false;
      button.textContent = "绑定邮箱";
    }
  });

  const loginForm = elements.accountPanel.querySelector("#emailLoginForm");
  const loginMessage = elements.accountPanel.querySelector("#loginAccountMessage");
  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = elements.accountPanel.querySelector("#loginEmailInput");
    const passwordInput = elements.accountPanel.querySelector("#loginPasswordInput");
    const button = elements.accountPanel.querySelector("#emailLoginButton");
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    loginMessage.hidden = true;

    if (!email || !password) {
      loginMessage.hidden = false;
      loginMessage.textContent = "请输入邮箱和密码。";
      return;
    }

    if (state.posts.length && state.user?.is_anonymous !== false) {
      if (!window.confirm("当前匿名身份下还有 " + state.posts.length + " 条记录。登录会切换身份，这些记录将不再显示在个人中心。确定登录？")) return;
    }

    button.disabled = true;
    button.textContent = "登录中…";
    try {
      await signInWithEmail(email, password);
      window.location.href = "me.html?logged=1";
    } catch (error) {
      loginMessage.hidden = false;
      loginMessage.textContent = friendlyError(error);
      button.disabled = false;
      button.textContent = "登录";
    }
  });
}

async function deleteMyPost(postId, button) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  if (!window.confirm('确定删除「' + post.title + '」？删除后不会出现在避雷墙，也不能恢复。')) return;

  button.disabled = true;
  button.textContent = "删除中…";
  try {
    await api.deleteMyPost(postId);
    if (Array.isArray(post.images) && post.images.length) {
      removeImages(post.images).catch(() => {});
    }
    state.posts = state.posts.filter((item) => item.id !== postId);
    render();
    showToast("记录已删除。");
  } catch (error) {
    button.disabled = false;
    button.textContent = "删除";
    showToast(friendlyError(error), "error");
  }
}

async function load() {
  state.loading = true;
  render();
  try {
    state.user = await ensureAnonymousSession();
    try {
      const freshUser = await refreshUser();
      if (freshUser) state.user = freshUser;
    } catch (refreshError) {
      console.warn("User refresh failed:", refreshError);
    }
    state.posts = await api.listMyPosts();
    state.loading = false;
    render();
    renderAccount();
  } catch (error) {
    state.loading = false;
    elements.memberState.hidden = false;
    elements.memberState.innerHTML = "";
    renderError(elements.memberState, error, load);
  }
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.filter = tab.dataset.status;
    render();
  });
});

elements.posts.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-post]");
  if (!button) return;
  deleteMyPost(button.dataset.deletePost, button);
});

elements.refresh.addEventListener("click", () => {
  showToast("正在刷新…", "success", 1200);
  load();
});

showBanner();
load();

import {
  api,
  escapeHTML,
  formatDateTime,
  friendlyError,
  getSession,
  removeImages,
  renderError,
  renderShell,
  resolveImage,
  showToast,
  signInAdmin,
  signOut,
  statusBadge
} from "./core.js";

renderShell("admin");

const elements = {
  auth: document.getElementById("adminAuth"),
  dashboard: document.getElementById("adminDashboard"),
  login: document.getElementById("adminLogin"),
  email: document.getElementById("adminEmail"),
  password: document.getElementById("adminPassword"),
  loginButton: document.getElementById("adminLoginButton"),
  loginError: document.getElementById("adminLoginError"),
  adminEmailLabel: document.getElementById("adminEmailLabel"),
  logout: document.getElementById("adminLogout"),
  stats: Array.from(document.querySelectorAll("[data-stat]")),
  filterTabs: Array.from(document.querySelectorAll("[data-admin-filter]")),
  state: document.getElementById("adminState"),
  list: document.getElementById("adminList"),
  refresh: document.getElementById("adminRefresh"),
  rejectDialog: document.getElementById("rejectDialog"),
  rejectForm: document.getElementById("rejectForm"),
  rejectTitle: document.getElementById("rejectTitle"),
  rejectPostTitle: document.getElementById("rejectPostTitle"),
  rejectNote: document.getElementById("rejectNote"),
  rejectError: document.getElementById("rejectError"),
  rejectConfirm: document.getElementById("rejectConfirm")
};

const state = {
  filter: "pending",
  loading: false,
  posts: [],
  adminUser: null,
  rejectId: null
};

function showLogin(message = "") {
  elements.auth.hidden = false;
  elements.dashboard.hidden = true;
  if (message) {
    elements.loginError.hidden = false;
    elements.loginError.textContent = message;
  } else {
    elements.loginError.hidden = true;
  }
}

function showDashboard(user) {
  state.adminUser = user;
  elements.auth.hidden = true;
  elements.dashboard.hidden = false;
  elements.adminEmailLabel.textContent = user?.email || "管理员";
  loadQueue();
}

function setQueueState(message = "", loading = false) {
  elements.state.hidden = !message;
  elements.state.innerHTML = message
    ? (loading
      ? '<span class="loader" aria-hidden="true"></span><span>' + escapeHTML(message) + "</span>"
      : "<p>" + escapeHTML(message) + "</p>")
    : "";
}

function updateStats(stats) {
  const values = {
    pending: Number(stats?.pending) || 0,
    approved: Number(stats?.approved) || 0,
    rejected: Number(stats?.rejected) || 0
  };
  elements.stats.forEach((node) => {
    node.textContent = String(values[node.dataset.stat] || 0);
  });
}

function imageStrip(images) {
  const urls = (images || []).map(resolveImage).filter(Boolean);
  if (!urls.length) return '<div class="review-photo review-photo--empty">无照片</div>';
  return urls.map((url, index) => `
    <a class="review-photo" href="${escapeHTML(url)}" target="_blank" rel="noopener" aria-label="查看第 ${index + 1} 张照片">
      <img src="${escapeHTML(url)}" alt="" loading="lazy">
    </a>
  `).join("");
}

function reviewItem(post) {
  const tags = (post.tags || []).map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>").join("");
  const note = post.review_note
    ? '<div class="review-note"><strong>审核说明</strong><span>' + escapeHTML(post.review_note) + "</span></div>"
    : "";
  const canApprove = post.status !== "approved";
  const canReject = post.status !== "rejected";

  return `
    <article class="review-item" data-review-id="${escapeHTML(post.id)}">
      <div class="review-item__photos">${imageStrip(post.images)}</div>
      <div class="review-item__body">
        <div class="review-item__topline">
          ${statusBadge(post.status)}
          <span>更新于 ${formatDateTime(post.updated_at || post.created_at)}</span>
        </div>
        <h2>${escapeHTML(post.title)}</h2>
        <p class="review-item__meta">
          ${escapeHTML(post.author_label || "匿名租客")}
          <span>·</span> ${escapeHTML(post.duration || "未填写入住时长")}
          <span>·</span> 投稿于 ${formatDateTime(post.created_at)}
        </p>
        <p class="review-item__copy">${escapeHTML(post.body)}</p>
        <div class="tag-list">${tags}</div>
        ${note}
        <div class="review-item__actions">
          <span class="review-item__counts">投票 ${Number(post.votes_count) || 0} · 评论 ${Number(post.comments_count) || 0}</span>
          <div class="review-buttons">
            ${canApprove ? '<button class="btn btn--small btn--primary" type="button" data-approve="' + escapeHTML(post.id) + '">通过</button>' : ""}
            ${canReject ? '<button class="btn btn--small btn--outline" type="button" data-reject="' + escapeHTML(post.id) + '">不通过</button>' : ""}
            <button class="text-button text-button--danger" type="button" data-delete-post="${escapeHTML(post.id)}">删除</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderQueue() {
  if (state.loading) {
    setQueueState("正在读取审核队列", true);
    elements.list.innerHTML = "";
    return;
  }

  if (!state.posts.length) {
    setQueueState("这个状态下没有记录。", false);
    elements.list.innerHTML = "";
    return;
  }

  setQueueState("", false);
  elements.list.innerHTML = state.posts.map(reviewItem).join("");
}

async function loadQueue() {
  if (state.loading) return;
  state.loading = true;
  renderQueue();
  try {
    const [stats, posts] = await Promise.all([
      api.adminStats(),
      api.adminListPosts(state.filter === "all" ? null : state.filter)
    ]);
    updateStats(stats);
    state.posts = posts;
    state.loading = false;
    renderQueue();
  } catch (error) {
    state.loading = false;
    console.error(error);
    elements.list.innerHTML = "";
    elements.state.hidden = false;
    renderError(elements.state, error, loadQueue);
  }
}

async function approve(postId) {
  const button = document.querySelector('[data-approve="' + postId + '"]');
  if (button) {
    button.disabled = true;
    button.textContent = "通过中…";
  }
  try {
    await api.adminReview(postId, "approved");
    showToast("已通过审核，记录现在会出现在避雷墙。");
    await loadQueue();
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "通过";
    }
    showToast(friendlyError(error), "error");
  }
}

function openRejectDialog(postId) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  state.rejectId = postId;
  elements.rejectTitle.textContent = "不通过这条记录";
  elements.rejectPostTitle.textContent = post.title;
  elements.rejectNote.value = "";
  elements.rejectError.hidden = true;
  elements.rejectConfirm.disabled = false;
  elements.rejectConfirm.textContent = "确认不通过";
  elements.rejectDialog.showModal();
  window.setTimeout(() => elements.rejectNote.focus(), 50);
}

function closeRejectDialog() {
  elements.rejectDialog.close();
  state.rejectId = null;
}

async function deletePost(postId, button) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  if (!window.confirm('确定删除「' + post.title + '」？删除后不会出现在任何页面，也不能恢复。')) return;

  button.disabled = true;
  button.textContent = "删除中…";
  try {
    await api.adminDeletePost(postId);
    if (Array.isArray(post.images) && post.images.length) {
      removeImages(post.images).catch(() => {});
    }
    showToast("帖子已删除。");
    await loadQueue();
  } catch (error) {
    button.disabled = false;
    button.textContent = "删除";
    showToast(friendlyError(error), "error");
  }
}

elements.list.addEventListener("click", (event) => {
  const approveButton = event.target.closest("[data-approve]");
  if (approveButton) {
    approve(approveButton.dataset.approve);
    return;
  }
  const rejectButton = event.target.closest("[data-reject]");
  if (rejectButton) {
    openRejectDialog(rejectButton.dataset.reject);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-post]");
  if (deleteButton) deletePost(deleteButton.dataset.deletePost, deleteButton);
});

elements.filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (state.filter === tab.dataset.adminFilter) return;
    state.filter = tab.dataset.adminFilter;
    elements.filterTabs.forEach((button) => {
      const active = button === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    loadQueue();
  });
});

elements.refresh.addEventListener("click", loadQueue);
elements.logout.addEventListener("click", async () => {
  await signOut().catch(() => {});
  window.location.href = "index.html";
});

elements.login.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = elements.email.value.trim();
  const password = elements.password.value;
  if (!email || !password) {
    elements.loginError.hidden = false;
    elements.loginError.textContent = "请输入管理员邮箱和密码。";
    return;
  }

  elements.loginButton.disabled = true;
  elements.loginButton.textContent = "登录中…";
  elements.loginError.hidden = true;
  try {
    const user = await signInAdmin(email, password);
    elements.password.value = "";
    showDashboard(user);
  } catch (error) {
    elements.loginError.hidden = false;
    elements.loginError.textContent = friendlyError(error);
    elements.loginButton.disabled = false;
    elements.loginButton.textContent = "登录审核台";
  }
});

document.querySelectorAll("[data-close-reject]").forEach((button) => {
  button.addEventListener("click", closeRejectDialog);
});

elements.rejectDialog.addEventListener("click", (event) => {
  if (event.target === elements.rejectDialog) closeRejectDialog();
});

elements.rejectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.rejectId) return;
  const note = elements.rejectNote.value.trim();
  if (note.length < 2) {
    elements.rejectError.hidden = false;
    elements.rejectError.textContent = "请填写至少 2 个字的审核说明，发布者会在个人中心看到它。";
    return;
  }

  elements.rejectError.hidden = true;
  elements.rejectConfirm.disabled = true;
  elements.rejectConfirm.textContent = "提交中…";
  try {
    await api.adminReview(state.rejectId, "rejected", note);
    closeRejectDialog();
    showToast("已退回，发布者可以在个人中心查看原因并修改。");
    await loadQueue();
  } catch (error) {
    elements.rejectError.hidden = false;
    elements.rejectError.textContent = friendlyError(error);
    elements.rejectConfirm.disabled = false;
    elements.rejectConfirm.textContent = "确认不通过";
  }
});

async function init() {
  try {
    const session = await getSession();
    if (!session?.user) {
      showLogin();
      return;
    }
    const admin = await api.isAdmin();
    if (!admin) {
      showLogin("当前登录账号不是管理员。请使用管理员邮箱和密码登录。");
      return;
    }
    showDashboard(session.user);
  } catch (error) {
    showLogin(friendlyError(error));
  }
}

init();

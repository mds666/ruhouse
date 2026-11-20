import {
  api,
  ensureAnonymousSession,
  escapeHTML,
  formatDate,
  formatDateTime,
  friendlyError,
  queryParam,
  removeImages,
  renderError,
  renderShell,
  showToast,
  statusBadge
} from "./core.js";

renderShell("me");

const state = {
  posts: [],
  filter: "all",
  loading: true
};

const elements = {
  banner: document.getElementById("meBanner"),
  memberState: document.getElementById("memberState"),
  posts: document.getElementById("myPosts"),
  tabs: Array.from(document.querySelectorAll("[data-status]")),
  refresh: document.getElementById("refreshPosts")
};

function showBanner() {
  const created = queryParam("created");
  const updated = queryParam("updated");
  if (!created && !updated) return;
  elements.banner.hidden = false;
  elements.banner.className = "page-banner page-banner--success";
  elements.banner.innerHTML = created
    ? "<strong>已提交审核。</strong><span>管理员通过后，这条记录才会出现在避雷墙。你可以随时回来修改或查看进度。</span>"
    : "<strong>修改已提交审核。</strong><span>审核期间，这条记录会暂时从避雷墙隐藏。</span>";
  const url = new URL(window.location.href);
  url.searchParams.delete("created");
  url.searchParams.delete("updated");
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
    await ensureAnonymousSession();
    state.posts = await api.listMyPosts();
    state.loading = false;
    render();
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

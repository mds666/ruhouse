import {
  api,
  ensureAnonymousSession,
  escapeHTML,
  formatDate,
  queryParam,
  renderError,
  renderShell
} from "./core.js";

renderShell("wall");

const PAGE_SIZE = 8;
const state = {
  posts: [],
  sort: "latest",
  page: 1,
  query: queryParam("q") || "",
  loading: true
};

const elements = {
  grid: document.getElementById("postGrid"),
  stateBox: document.getElementById("wallState"),
  count: document.getElementById("wallCount"),
  pagination: document.getElementById("pagination"),
  search: document.getElementById("wallSearch"),
  clearSearch: document.getElementById("clearWallSearch"),
  tabs: Array.from(document.querySelectorAll("[data-sort]"))
};

function setState(message, loading = false) {
  elements.stateBox.hidden = !message;
  elements.stateBox.innerHTML = loading
    ? '<span class="loader" aria-hidden="true"></span><span>' + escapeHTML(message) + "</span>"
    : "<p>" + escapeHTML(message) + "</p>";
}

function matchingPosts() {
  const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return state.posts.slice();
  return state.posts.filter((post) => {
    const haystack = [
      post.title,
      post.body,
      (post.tags || []).join(" "),
      post.author_label
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function sortedPosts() {
  const posts = matchingPosts();
  if (state.sort === "hot") {
    posts.sort((a, b) => {
      const scoreA = Number(a.votes_count) + Number(a.comments_count) * 2;
      const scoreB = Number(b.votes_count) + Number(b.comments_count) * 2;
      return scoreB - scoreA;
    });
  } else {
    posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return posts;
}

function postRow(post) {
  const tags = (post.tags || []).slice(0, 3).map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>").join("");
  const summary = String(post.body || "").replace(/\s+/g, " ").trim();
  const shortSummary = summary.length > 118 ? summary.slice(0, 118) + "…" : summary;

  return `
    <a class="post-row" href="post.html?id=${encodeURIComponent(post.id)}">
      <div class="post-row__body">
        <div class="post-row__meta">
          <span>${escapeHTML(post.author_label || "匿名租客")}</span>
          <span>${formatDate(post.created_at)}</span>
        </div>
        <h2>${escapeHTML(post.title)}</h2>
        <p class="post-row__summary">${escapeHTML(shortSummary)}</p>
        <div class="tag-list">${tags}</div>
      </div>
      <div class="post-row__stats">
        <span><b>${Number(post.votes_count) || 0}</b>投票</span>
        <span><b>${Number(post.comments_count) || 0}</b>评论</span>
        <span class="post-row__arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  `;
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  elements.pagination.hidden = pages <= 1;
  if (pages <= 1) {
    elements.pagination.innerHTML = "";
    return;
  }

  const buttons = [];
  buttons.push(`<button class="page-button" type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>上一页</button>`);
  for (let index = 1; index <= pages; index += 1) {
    buttons.push(`<button class="page-button ${index === state.page ? "is-current" : ""}" type="button" data-page="${index}" ${index === state.page ? 'aria-current="page"' : ""}>${index}</button>`);
  }
  buttons.push(`<button class="page-button" type="button" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""}>下一页</button>`);
  elements.pagination.innerHTML = buttons.join("");
}

function render() {
  if (state.loading) {
    elements.grid.innerHTML = "";
    setState("正在读取已审核记录", true);
    elements.count.textContent = "正在读取…";
    return;
  }

  const posts = sortedPosts();
  const hasQuery = Boolean(state.query.trim());
  elements.count.textContent = hasQuery
    ? "找到 " + posts.length + " 条记录"
    : "共 " + posts.length + " 条已审核记录";

  if (!posts.length) {
    elements.grid.innerHTML = "";
    elements.pagination.hidden = true;
    elements.stateBox.hidden = false;
    elements.stateBox.innerHTML = hasQuery
      ? `
        <div class="empty-state">
          <p class="eyebrow">NO MATCH</p>
          <h2>没有找到匹配的记录</h2>
          <p>可以试试搜索城市区域、地铁站名或公交站名，或者清除关键词。</p>
          <button class="btn btn--outline" type="button" data-clear-search>清除搜索</button>
        </div>
      `
      : `
        <div class="empty-state">
          <p class="eyebrow">EMPTY WALL</p>
          <h2>还没有公开的房间记录</h2>
          <p>第一条通过审核的记录，会出现在这里。</p>
          <a class="btn btn--primary" href="submit.html">记录一间房 <span aria-hidden="true">↗</span></a>
        </div>
      `;
    elements.stateBox.querySelector("[data-clear-search]")?.addEventListener("click", clearSearch);
    return;
  }

  const pages = Math.ceil(posts.length / PAGE_SIZE);
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = posts.slice(start, start + PAGE_SIZE);
  elements.stateBox.hidden = true;
  elements.grid.innerHTML = visible.map(postRow).join("");
  renderPagination(posts.length);
}

function updateSearchUrl() {
  const url = new URL(window.location.href);
  if (state.query.trim()) url.searchParams.set("q", state.query.trim());
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
}

function clearSearch() {
  state.query = "";
  state.page = 1;
  if (elements.search) elements.search.value = "";
  if (elements.clearSearch) elements.clearSearch.hidden = true;
  updateSearchUrl();
  render();
}

async function load() {
  state.loading = true;
  state.page = 1;
  if (elements.search) elements.search.value = state.query;
  if (elements.clearSearch) elements.clearSearch.hidden = !state.query.trim();
  render();
  try {
    await ensureAnonymousSession();
    state.posts = await api.listPosts();
    state.loading = false;
    render();
  } catch (error) {
    state.loading = false;
    elements.count.textContent = "读取失败";
    elements.grid.innerHTML = "";
    elements.pagination.hidden = true;
    renderError(elements.stateBox, error, load);
  }
}

elements.search?.addEventListener("input", () => {
  state.query = elements.search.value;
  state.page = 1;
  elements.clearSearch.hidden = !state.query.trim();
  updateSearchUrl();
  render();
});

elements.clearSearch?.addEventListener("click", clearSearch);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.sort = tab.dataset.sort;
    state.page = 1;
    elements.tabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });
    render();
  });
});

elements.pagination.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  const page = Number(button.dataset.page);
  if (!Number.isFinite(page)) return;
  state.page = page;
  render();
  document.querySelector(".wall-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

load();

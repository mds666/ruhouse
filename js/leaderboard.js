import {
  api,
  escapeHTML,
  queryParam,
  renderError,
  renderShell
} from "./core.js";

renderShell("leaderboard");

const MONTHS = [
  { key: "2026-11", label: "2026.11", title: "2026 年 11 月" },
  { key: "2026-12", label: "2026.12", title: "2026 年 12 月" },
  { key: "2027-01", label: "2027.01", title: "2027 年 1 月" },
  { key: "2027-02", label: "2027.02", title: "2027 年 2 月" },
  { key: "2027-03", label: "2027.03", title: "2027 年 3 月" },
  { key: "2027-04", label: "2027.04", title: "2027 年 4 月" },
  { key: "2027-05", label: "2027.05", title: "2027 年 5 月" },
  { key: "2027-06", label: "2027.06", title: "2027 年 6 月" },
  { key: "2027-07", label: "2027.07", title: "2027 年 7 月" },
  { key: "2027-08", label: "2027.08", title: "2027 年 8 月" }
];
const PRIZES = [90, 60, 50];

const stateBox = document.getElementById("boardState");
const board = document.getElementById("boardList");
const count = document.getElementById("boardCount");
const title = document.getElementById("boardTitle");
const monthsBox = document.getElementById("boardMonths");

function monthKey(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return values.year + "-" + values.month;
}

function initialMonth() {
  const requested = queryParam("month");
  if (MONTHS.some((month) => month.key === requested)) return requested;
  const current = monthKey(new Date().toISOString());
  if (MONTHS.some((month) => month.key === current)) return current;
  if (current < MONTHS[0].key) return MONTHS[0].key;
  return MONTHS[MONTHS.length - 1].key;
}

const state = {
  posts: [],
  month: initialMonth()
};

function selectedMonth() {
  return MONTHS.find((month) => month.key === state.month) || MONTHS[0];
}

function renderMonths() {
  monthsBox.innerHTML = MONTHS.map((month) => `
    <button class="month-button ${month.key === state.month ? "is-active" : ""}"
      type="button" role="tab" aria-selected="${month.key === state.month}"
      data-month="${month.key}">${month.label}</button>
  `).join("");
}

function aggregate(posts) {
  const map = new Map();
  for (const post of posts) {
    const key = post.author_label || "匿名租客";
    if (!map.has(key)) {
      map.set(key, {
        label: key,
        posts: 0,
        likes: 0,
        comments: 0,
        score: 0
      });
    }
    const row = map.get(key);
    const likes = Number(post.votes_count) || 0;
    const comments = Number(post.comments_count) || 0;
    row.posts += 1;
    row.likes += likes;
    row.comments += comments;
    row.score += likes + comments;
  }
  return [...map.values()].sort((a, b) => (
    b.score - a.score ||
    b.likes - a.likes ||
    b.comments - a.comments ||
    b.posts - a.posts ||
    a.label.localeCompare(b.label, "zh-CN")
  ));
}

function monthPosts() {
  return state.posts.filter((post) => monthKey(post.created_at) === state.month);
}

function rowHTML(row, index) {
  const prize = index < PRIZES.length
    ? `<span class="board-prize">¥${PRIZES[index]}</span>`
    : "";
  return `
    <article class="board-row ${index < 3 ? "is-top" : ""}">
      <span class="board-rank">${String(index + 1).padStart(2, "0")}</span>
      <div class="board-author">
        <strong>${escapeHTML(row.label)}</strong>
        <span>${row.posts} 条记录</span>
        ${prize}
      </div>
      <span class="board-stat"><b>${row.likes}</b><small>点赞</small></span>
      <span class="board-stat"><b>${row.comments}</b><small>评论</small></span>
      <span class="board-score"><b>${row.score}</b><small>总分</small></span>
    </article>
  `;
}

function render() {
  const month = selectedMonth();
  title.textContent = month.title + "榜";
  renderMonths();
  const rows = aggregate(monthPosts());
  count.textContent = rows.length ? `${rows.length} 位作者` : "暂无记录";

  if (!rows.length) {
    stateBox.hidden = false;
    stateBox.innerHTML = `
      <div class="empty-state empty-state--compact">
        <p class="eyebrow">NO SCORES YET</p>
        <h2>这个月还没有可排行的记录</h2>
        <p>当月发布的记录通过审核、收到点赞或评论后，就会进入本月榜。</p>
        <a class="btn btn--primary" href="wall.html">去避雷墙看看 <span aria-hidden="true">↗</span></a>
      </div>
    `;
    board.innerHTML = "";
    return;
  }

  stateBox.hidden = true;
  board.innerHTML = rows.map(rowHTML).join("");
}

function updateUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("month", state.month);
  window.history.replaceState({}, "", url);
}

async function load() {
  stateBox.hidden = false;
  stateBox.innerHTML = '<span class="loader" aria-hidden="true"></span><span>正在计算月度榜单</span>';
  board.innerHTML = "";
  renderMonths();
  try {
    state.posts = await api.listPosts();
    render();
  } catch (error) {
    stateBox.hidden = false;
    stateBox.innerHTML = "";
    count.textContent = "读取失败";
    renderError(stateBox, error, load);
  }
}

monthsBox.addEventListener("click", (event) => {
  const button = event.target.closest("[data-month]");
  if (!button) return;
  state.month = button.dataset.month;
  updateUrl();
  render();
});

updateUrl();
load();

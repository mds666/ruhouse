import {
  api,
  escapeHTML,
  renderError,
  renderShell
} from "./core.js";

renderShell("leaderboard");

const stateBox = document.getElementById("boardState");
const board = document.getElementById("boardList");
const count = document.getElementById("boardCount");

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

function rowHTML(row, index) {
  return `
    <article class="board-row ${index < 3 ? "is-top" : ""}">
      <span class="board-rank">${String(index + 1).padStart(2, "0")}</span>
      <div class="board-author">
        <strong>${escapeHTML(row.label)}</strong>
        <span>${row.posts} 条记录</span>
      </div>
      <span class="board-stat"><b>${row.likes}</b><small>点赞</small></span>
      <span class="board-stat"><b>${row.comments}</b><small>评论</small></span>
      <span class="board-score"><b>${row.score}</b><small>总分</small></span>
    </article>
  `;
}

function render(rows) {
  count.textContent = rows.length ? `${rows.length} 位作者` : "暂无记录";
  if (!rows.length) {
    stateBox.hidden = false;
    stateBox.innerHTML = `
      <div class="empty-state empty-state--compact">
        <p class="eyebrow">NO SCORES YET</p>
        <h2>还没有可排行的记录</h2>
        <p>记录通过审核、收到点赞或评论后，就会出现在这里。</p>
        <a class="btn btn--primary" href="wall.html">去避雷墙看看 <span aria-hidden="true">↗</span></a>
      </div>
    `;
    board.innerHTML = "";
    return;
  }
  stateBox.hidden = true;
  board.innerHTML = rows.map(rowHTML).join("");
}

async function load() {
  stateBox.hidden = false;
  stateBox.innerHTML = '<span class="loader" aria-hidden="true"></span><span>正在计算榜单</span>';
  board.innerHTML = "";
  try {
    const posts = await api.listPosts();
    const rows = aggregate(posts);
    render(rows);
  } catch (error) {
    stateBox.hidden = false;
    stateBox.innerHTML = "";
    count.textContent = "读取失败";
    renderError(stateBox, error, load);
  }
}

load();

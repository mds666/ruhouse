import {
  api,
  detectPrivacy,
  ensureAnonymousSession,
  escapeHTML,
  formatDate,
  friendlyError,
  getSession,
  nl2br,
  queryParam,
  renderError,
  renderShell,
  resolveImage,
  showToast
} from "./core.js";

renderShell("post");

const postId = queryParam("id");
const stateBox = document.getElementById("articleState");
const root = document.getElementById("articleRoot");

let post = null;
let comments = [];
let currentUser = null;
let commentSubmit = null;

function showLoading() {
  stateBox.hidden = false;
  stateBox.innerHTML = '<span class="loader" aria-hidden="true"></span><span>正在读取房间记录</span>';
  root.hidden = true;
}

function showMissing() {
  stateBox.hidden = false;
  stateBox.innerHTML = `
    <div class="page-error page-error--quiet">
      <p class="eyebrow">ROOM NOT FOUND</p>
      <h1>这条记录还没有公开</h1>
      <p>它可能还在审核中，或者已经被下架。只有管理员审核通过的记录才会出现在避雷墙。</p>
      <div class="error-actions">
        <a class="btn btn--primary" href="wall.html">返回避雷墙</a>
        <a class="text-link" href="me.html">查看我的记录 <span aria-hidden="true">→</span></a>
      </div>
    </div>
  `;
  root.hidden = true;
}

function commentsHTML() {
  if (!comments.length) {
    return '<p class="muted-text">还没有评论。成为第一个回应的人。</p>';
  }

  return comments.map((comment) => `
    <article class="comment">
      <div class="comment__mark" aria-hidden="true">${comment.is_mine ? "你" : "匿"}</div>
      <div class="comment__body">
        <div class="comment__meta">
          <strong>${escapeHTML(comment.author_label || "匿名租客")}</strong>
          <span>${formatDate(comment.created_at)}</span>
          ${comment.can_report ? '<button class="text-button text-button--danger comment__report" type="button" data-report-comment="' + escapeHTML(comment.id) + '">举报</button>' : ""}
        </div>
        <p>${escapeHTML(comment.content)}</p>
      </div>
    </article>
  `).join("");
}

function updateCommentCount(count) {
  const target = document.querySelector("[data-comment-total]");
  if (target) target.textContent = String(count);
  const aside = document.querySelector("[data-comment-aside]");
  if (aside) aside.textContent = String(count);
}

function renderGallery(images) {
  const urls = images.map(resolveImage).filter(Boolean);
  if (!urls.length) return "";
  const thumbnails = urls.length > 1
    ? `<div class="article-thumbs" aria-label="房间照片列表">
        ${urls.map((url, index) => `
          <button class="article-thumb ${index === 0 ? "is-active" : ""}" type="button" data-image-url="${escapeHTML(url)}" aria-label="查看第 ${index + 1} 张照片">
            <img src="${escapeHTML(url)}" alt="">
          </button>
        `).join("")}
      </div>`
    : "";

  return `
    <figure class="article-figure">
      <div class="article-main-image"><img src="${escapeHTML(urls[0])}" alt="匿名用户上传的房间照片"></div>
      ${thumbnails}
      <figcaption>仅展示房间画面 · 无定位信息</figcaption>
    </figure>
  `;
}

function render() {
  const images = Array.isArray(post.images) ? post.images : [];
  const tags = (post.tags || []).map((tag) => '<span class="tag">' + escapeHTML(tag) + "</span>").join("");
  const ownerAction = post.is_owner
    ? '<a class="text-link" href="submit.html?edit=' + encodeURIComponent(post.id) + '">修改这条记录 <span aria-hidden="true">→</span></a>'
    : "";
  const votedClass = post.has_voted ? "is-voted" : "";
  const votedLabel = post.has_voted ? "已投票" : "投票";

  root.innerHTML = `
    <header class="article-header">
      <div class="article-kicker">
        <span class="status status--approved"><i aria-hidden="true"></i>已通过审核</span>
        <span class="article-number">NO. ${escapeHTML(String(post.number || "—"))}</span>
      </div>
      <h1>${escapeHTML(post.title)}</h1>
      <div class="article-meta">
        <span>${escapeHTML(post.author_label || "匿名租客")}</span>
        <span>${escapeHTML(post.duration || "入住时长未填写")}</span>
        <span>发布于 ${formatDate(post.created_at)}</span>
      </div>
    </header>

    <div class="article-layout">
      <div class="article-content">
        ${renderGallery(images)}
        <div class="article-copy">${nl2br(post.body)}</div>
        <div class="tag-list">${tags}</div>
      </div>

      <aside class="article-aside">
        <div class="article-action-card">
          <p class="eyebrow">有用吗</p>
          <button class="vote-button ${votedClass}" type="button" data-vote ${post.has_voted ? "disabled" : ""}>
            <span class="vote-button__icon" aria-hidden="true">↑</span>
            <span data-vote-label>${votedLabel}</span>
            <span data-vote-count>${Number(post.votes_count) || 0}</span>
          </button>
          <div class="article-action-row">
            <a href="#comments">评论 <span data-comment-aside>${Number(post.comments_count) || 0}</span></a>
            <button type="button" class="text-button" data-share>复制链接</button>
          </div>
          ${ownerAction}
        </div>
        <p class="aside-note">这条记录没有公开地址、房间名或房东信息。</p>
      </aside>
    </div>

    <section class="comments-section" id="comments" aria-label="评论">
      <div class="comments-heading">
        <div>
          <p class="eyebrow">COMMENTS <span>/</span> 匿名回应</p>
          <h2>写下你的经历</h2>
        </div>
        <span class="comments-count">共 <span data-comment-total>${Number(post.comments_count) || 0}</span> 条</span>
      </div>
      <div class="comment-list" data-comment-list>${commentsHTML()}</div>
      <form class="comment-form" id="commentForm" novalidate>
        <label for="commentInput">只谈房间和居住感受</label>
        <textarea id="commentInput" maxlength="160" rows="4" placeholder="不要写地址、联系方式或任何人的个人信息。"></textarea>
        <p class="form-hint form-hint--error" id="commentGuard" hidden></p>
        <div class="comment-form__footer">
          <span class="char-count"><span data-comment-count>0</span> / 160</span>
          <button class="btn btn--primary" type="submit">发表评论</button>
        </div>
      </form>
    </section>
  `;

  root.hidden = false;
  stateBox.hidden = true;
  bindArticle();
}

function bindArticle() {
  const voteButton = root.querySelector("[data-vote]");
  voteButton?.addEventListener("click", async () => {
    if (!post || post.has_voted) return;
    voteButton.disabled = true;
    try {
      const result = await api.castVote(post.id);
      post.votes_count = Number(result?.votes_count ?? (post.votes_count + 1));
      post.has_voted = Boolean(result?.has_voted ?? true);
      voteButton.classList.add("is-voted");
      voteButton.querySelector("[data-vote-label]").textContent = "已投票";
      voteButton.querySelector("[data-vote-count]").textContent = String(post.votes_count);
      showToast("投票已记录。");
    } catch (error) {
      voteButton.disabled = false;
      showToast(friendlyError(error), "error");
    }
  });

  root.querySelector("[data-share]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("链接已复制。");
    } catch {
      showToast("复制失败，请手动复制地址栏。", "error");
    }
  });

  root.querySelector(".article-thumbs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-url]");
    if (!button) return;
    const main = root.querySelector(".article-main-image img");
    if (main) main.src = button.dataset.imageUrl;
    root.querySelectorAll(".article-thumb").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
  });

  root.querySelector("[data-comment-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-report-comment]");
    if (!button || !post) return;
    if (!window.confirm("举报后这条评论会暂时下架，等待管理员审核。确定举报吗？")) return;

    const commentId = button.dataset.reportComment;
    button.disabled = true;
    button.textContent = "举报中…";
    try {
      const row = await api.reportComment(commentId);
      comments = comments.filter((comment) => comment.id !== commentId);
      post.comments_count = Number(row?.comments_count ?? Math.max(0, post.comments_count - 1));
      updateCommentCount(post.comments_count);
      root.querySelector("[data-comment-list]").innerHTML = commentsHTML();
      showToast("已举报，评论已暂时下架，等待管理员审核。");
    } catch (error) {
      button.disabled = false;
      button.textContent = "举报";
      showToast(friendlyError(error), "error");
    }
  });

  const form = root.querySelector("#commentForm");
  const input = root.querySelector("#commentInput");
  const guard = root.querySelector("#commentGuard");
  const count = root.querySelector("[data-comment-count]");
  commentSubmit = form.querySelector('button[type="submit"]');

  input?.addEventListener("input", () => {
    count.textContent = String(input.value.length);
    const issues = detectPrivacy(input.value);
    guard.hidden = issues.length === 0;
    guard.textContent = issues.length
      ? "请先删除疑似" + [...new Set(issues.map((item) => item.label))].join("、") + "。"
      : "";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!post) return;
    const content = input.value.trim();
    if (content.length < 2) {
      showToast("写点什么再发送吧。", "error");
      input.focus();
      return;
    }
    const issues = detectPrivacy(content);
    if (issues.length) {
      guard.hidden = false;
      guard.textContent = "评论里含有疑似隐私信息，请删除后再发送。";
      input.focus();
      return;
    }

    commentSubmit.disabled = true;
    commentSubmit.textContent = "发送中…";
    try {
      const row = await api.addComment(post.id, content);
      if (row) {
        comments.push({
          author_label: row.author_label,
          content: row.content,
          created_at: row.created_at,
          is_mine: true,
          can_report: false
        });
        post.comments_count = Number(row.comments_count ?? (post.comments_count + 1));
      }
      updateCommentCount(post.comments_count);
      root.querySelector("[data-comment-list]").innerHTML = commentsHTML();
      form.reset();
      count.textContent = "0";
      guard.hidden = true;
      showToast("评论已发布。");
    } catch (error) {
      showToast(friendlyError(error), "error");
      commentSubmit.disabled = false;
      commentSubmit.textContent = "发表评论";
    }
  });
}

async function load() {
  if (!postId) {
    showMissing();
    return;
  }
  showLoading();
  try {
    currentUser = await ensureAnonymousSession();
    post = await api.getPost(postId);
    if (!post) {
      showMissing();
      return;
    }
    document.title = post.title + "｜垃圾房子";
    comments = await api.listComments(post.id);
    render();
  } catch (error) {
    console.error(error);
    stateBox.hidden = false;
    stateBox.innerHTML = "";
    renderError(stateBox, error, load);
  }
}

load();

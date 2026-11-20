import {
  api,
  compressImage,
  detectPrivacy,
  ensureAnonymousSession,
  escapeHTML,
  friendlyError,
  queryParam,
  renderError,
  renderShell,
  resolveImage,
  showToast,
  uploadImage,
  removeImages
} from "./core.js";

renderShell("submit");

const editId = queryParam("edit");
const isEditing = Boolean(editId);
const MAX_IMAGES = 6;
const MAX_FILE_MB = 12;
const MAX_TAGS = 5;

const state = {
  user: null,
  post: null,
  images: [],
  tags: new Set(),
  privacyIssues: [],
  busy: false,
  removedExistingPaths: new Set()
};

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  banner: document.getElementById("reviewBanner"),
  submitState: document.getElementById("submitState"),
  form: document.getElementById("publishForm"),
  title: document.getElementById("postTitle"),
  body: document.getElementById("postBody"),
  duration: document.getElementById("postDuration"),
  titleCount: document.getElementById("titleCount"),
  bodyCount: document.getElementById("bodyCount"),
  tagPicker: document.getElementById("tagPicker"),
  dropzone: document.getElementById("dropzone"),
  dropzoneEmpty: document.getElementById("dropzoneEmpty"),
  imageInput: document.getElementById("imageInput"),
  imageGrid: document.getElementById("imageGrid"),
  imageCount: document.getElementById("imageCount"),
  addMore: document.getElementById("addMore"),
  privacyCheck: document.getElementById("privacyCheck"),
  privacyState: document.getElementById("privacyState"),
  privacyMessage: document.getElementById("privacyMessage"),
  confirm: document.getElementById("privacyConfirm"),
  formStatus: document.getElementById("formStatus"),
  save: document.getElementById("savePost")
};

function setBusy(busy, label = "处理中…") {
  state.busy = busy;
  elements.save.disabled = busy || !formReady();
  if (busy) {
    elements.save.dataset.original = elements.save.innerHTML;
    elements.save.innerHTML = '<span>' + escapeHTML(label) + "</span>";
  } else if (elements.save.dataset.original) {
    elements.save.innerHTML = elements.save.dataset.original;
    delete elements.save.dataset.original;
  }
  updateSaveState();
}

function formReady() {
  return Boolean(
    state.images.length > 0
    && !state.images.some((item) => item.loading)
    && elements.title.value.trim().length >= 4
    && elements.body.value.trim().length >= 10
    && state.tags.size >= 1
    && state.tags.size <= MAX_TAGS
    && state.privacyIssues.length === 0
    && elements.confirm.checked
    && !state.busy
  );
}

function updateSaveState() {
  const ready = formReady();
  if (!state.busy) elements.save.disabled = !ready;
  elements.save.setAttribute("aria-disabled", String(!ready));
  updateFormStatus();
}

function updateFormStatus() {
  if (!elements.formStatus) return;
  let message = "";
  let status = "idle";

  if (state.busy) {
    message = "正在提交，请稍候…";
  } else if (!state.images.length) {
    message = "还需要上传至少一张房间照片。";
    status = "error";
  } else if (state.images.some((item) => item.loading)) {
    message = "照片处理中，请稍候。";
  } else if (elements.title.value.trim().length < 4) {
    message = "标题还差 " + (4 - elements.title.value.trim().length) + " 个字（至少 4 个字）。";
    status = "error";
  } else if (elements.body.value.trim().length < 10) {
    message = "正文还差 " + (10 - elements.body.value.trim().length) + " 个字（至少 10 个字）。";
    status = "error";
  } else if (!state.tags.size) {
    message = "请至少选择一个气味或问题标签。";
    status = "error";
  } else if (state.privacyIssues.length) {
    message = "请先删除文字里的疑似隐私信息。";
    status = "error";
  } else if (!elements.confirm.checked) {
    message = "请勾选隐私确认后再提交。";
    status = "error";
  } else {
    message = "信息完整，可以提交审核。";
    status = "ok";
  }

  elements.formStatus.textContent = message;
  elements.formStatus.dataset.state = status;
}

function setPrivacy() {
  const text = (elements.title.value + " " + elements.body.value).trim();
  state.privacyIssues = detectPrivacy(text);
  const labels = [...new Set(state.privacyIssues.map((item) => item.label))];
  if (state.privacyIssues.length) {
    elements.privacyCheck.dataset.state = "warning";
    elements.privacyState.textContent = "发现疑似隐私信息";
    elements.privacyMessage.textContent = "请删除疑似" + labels.join("、") + "后再提交。";
  } else if (text.length >= 8) {
    elements.privacyCheck.dataset.state = "ok";
    elements.privacyState.textContent = "检查通过";
    elements.privacyMessage.textContent = "没有发现明显的地址、联系方式或门牌号。照片里也请再检查一次。";
  } else {
    elements.privacyCheck.dataset.state = "idle";
    elements.privacyState.textContent = "等待输入";
    elements.privacyMessage.textContent = "发布前会检查文字中的手机号、地址、门牌号、房间名和房东信息。";
  }
  updateSaveState();
}

function updateCounts() {
  elements.titleCount.textContent = String(elements.title.value.length);
  elements.bodyCount.textContent = String(elements.body.value.length);
  setPrivacy();
}

function renderImages() {
  const hasImages = state.images.length > 0;
  elements.dropzone.classList.toggle("has-images", hasImages);
  elements.dropzoneEmpty.hidden = hasImages;
  elements.imageGrid.hidden = !hasImages;
  elements.imageCount.textContent = String(state.images.length);
  elements.addMore.hidden = !hasImages || state.images.length >= MAX_IMAGES;
  elements.addMore.disabled = state.images.length >= MAX_IMAGES || state.images.some((item) => item.loading);

  elements.imageGrid.innerHTML = state.images.map((item, index) => {
    const source = item.kind === "existing" ? resolveImage(item.path) : item.preview;
    return `
      <div class="image-tile ${item.loading ? "is-loading" : ""}">
        ${source ? '<img src="' + escapeHTML(source) + '" alt="房间照片 ' + (index + 1) + '">' : ""}
        <button class="image-remove" type="button" data-remove-image="${escapeHTML(item.id)}" aria-label="移除第 ${index + 1} 张照片">×</button>
        <span class="image-index">${String(index + 1).padStart(2, "0")}</span>
      </div>
    `;
  }).join("");

  updateSaveState();
}

function addTagButton(tag) {
  let button = elements.tagPicker.querySelector('[data-tag="' + CSS.escape(tag) + '"]');
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "tag-choice";
    button.dataset.tag = tag;
    button.textContent = tag;
    elements.tagPicker.appendChild(button);
  }
  return button;
}

function setTag(tag, active) {
  const button = addTagButton(tag);
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
}

function renderTags() {
  elements.tagPicker.querySelectorAll(".tag-choice").forEach((button) => {
    const active = state.tags.has(button.dataset.tag);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateSaveState();
}

async function processFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const remaining = MAX_IMAGES - state.images.length;
  if (remaining <= 0) {
    showToast("最多上传 6 张照片。", "error");
    return;
  }

  if (files.length > remaining) {
    showToast("最多上传 6 张，已保留前 " + remaining + " 张。", "error");
  }

  const fresh = [];
  files.slice(0, remaining).forEach((file) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("只支持 JPG、PNG、WebP 格式。", "error");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      showToast("单张照片不能超过 " + MAX_FILE_MB + "MB。", "error");
      return;
    }
    const item = {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now() + Math.random()),
      kind: "new",
      preview: "",
      dataUrl: "",
      file,
      loading: true
    };
    fresh.push(item);
    state.images.push(item);
  });

  renderImages();
  for (const item of fresh) {
    try {
      item.dataUrl = await compressImage(item.file);
      item.preview = item.dataUrl;
      item.loading = false;
    } catch {
      state.images = state.images.filter((candidate) => candidate.id !== item.id);
      showToast("有一张照片读取失败，请换一张。", "error");
    }
    renderImages();
  }
}

function durationText() {
  return elements.duration.value === "看房时发现"
    ? "看房时发现"
    : "入住 " + elements.duration.value;
}

function fillDuration(value) {
  const text = String(value || "").replace(/^入住\s*/, "");
  if (text === "看房时发现") {
    elements.duration.value = "看房时发现";
    return;
  }
  const option = Array.from(elements.duration.options).find((item) => item.value === text);
  if (option) {
    elements.duration.value = text;
  } else if (value) {
    const custom = document.createElement("option");
    custom.value = text;
    custom.textContent = text;
    elements.duration.appendChild(custom);
    elements.duration.value = text;
  }
}

function setBanner() {
  if (!elements.banner) return;
  elements.banner.hidden = false;
  elements.banner.className = "review-banner";

  if (!isEditing) {
    elements.banner.classList.add("review-banner--neutral");
    elements.banner.innerHTML = "<strong>提交后进入待审核。</strong><span>管理员通过后，这条记录才会出现在避雷墙。</span>";
    return;
  }

  if (state.post.status === "rejected") {
    elements.banner.classList.add("review-banner--rejected");
    elements.banner.innerHTML = "<strong>上次审核未通过。</strong><span>" + escapeHTML(state.post.review_note || "可以修改后重新提交审核。") + "</span>";
  } else if (state.post.status === "approved") {
    elements.banner.classList.add("review-banner--approved");
    elements.banner.innerHTML = "<strong>当前已通过审核。</strong><span>保存修改后会重新进入待审核，审核期间会暂时从避雷墙隐藏。</span>";
  } else {
    elements.banner.classList.add("review-banner--pending");
    elements.banner.innerHTML = "<strong>当前正在审核中。</strong><span>可以继续修改，保存后会保持待审核状态。</span>";
  }
}

async function load() {
  try {
    state.user = await ensureAnonymousSession();

    if (isEditing) {
      elements.pageTitle.textContent = "修改房间记录";
      document.title = "修改记录｜垃圾房子";
      elements.save.querySelector("span").textContent = "保存修改";
      const post = await api.getMyPost(editId);
      if (!post) {
        throw new Error("找不到这条记录，或者它不属于当前匿名身份。");
      }
      state.post = post;
      elements.title.value = post.title || "";
      elements.body.value = post.body || "";
      fillDuration(post.duration);
      state.tags = new Set(post.tags || []);
      state.images = (post.images || []).map((path) => ({
        id: "existing-" + path,
        kind: "existing",
        path
      }));
      for (const tag of state.tags) addTagButton(tag);
    } else {
      elements.pageTitle.textContent = "记录一间房";
    }

    setBanner();
    renderTags();
    renderImages();
    updateCounts();
    elements.submitState.hidden = true;
    elements.form.hidden = false;
    elements.form.scrollIntoView({ behavior: "instant", block: "start" });
  } catch (error) {
    elements.submitState.hidden = false;
    elements.submitState.innerHTML = "";
    renderError(elements.submitState, error, load);
  }
}

elements.title.addEventListener("input", updateCounts);
elements.body.addEventListener("input", updateCounts);
elements.confirm.addEventListener("change", updateSaveState);

elements.tagPicker.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  const tag = button.dataset.tag;
  if (state.tags.has(tag)) {
    state.tags.delete(tag);
    setTag(tag, false);
  } else {
    if (state.tags.size >= MAX_TAGS) {
      showToast("最多选择 5 个标签。", "error");
      return;
    }
    state.tags.add(tag);
    setTag(tag, true);
  }
  updateSaveState();
});

elements.dropzone.addEventListener("click", (event) => {
  if (event.target.closest("button") || event.target === elements.imageInput) return;
  elements.imageInput.click();
});

elements.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.imageInput.click();
  }
});

elements.imageInput.addEventListener("click", (event) => event.stopPropagation());
elements.imageInput.addEventListener("change", () => {
  const files = Array.from(elements.imageInput.files || []);
  elements.imageInput.value = "";
  processFiles(files);
});

elements.addMore.addEventListener("click", (event) => {
  event.stopPropagation();
  elements.imageInput.click();
});

elements.imageGrid.addEventListener("click", (event) => {
  event.stopPropagation();
  const button = event.target.closest("[data-remove-image]");
  if (!button) return;
  const target = state.images.find((item) => item.id === button.dataset.removeImage);
  if (target?.kind === "existing") state.removedExistingPaths.add(target.path);
  state.images = state.images.filter((item) => item.id !== button.dataset.removeImage);
  renderImages();
  updateSaveState();
});

["dragover", "dragleave", "drop"].forEach((eventName) => {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.toggle("is-dragging", eventName === "dragover");
    if (eventName === "drop") processFiles(event.dataTransfer?.files);
  });
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;

  updateCounts();
  if (!formReady()) {
    if (!state.images.length) showToast("至少上传一张房间照片。", "error");
    else if (!state.tags.size) showToast("请至少选择一个标签。", "error");
    else if (!elements.confirm.checked) showToast("请先确认没有上传隐私信息。", "error");
    return;
  }

  setBusy(true, "准备上传…");
  const uploadedPaths = [];

  try {
    const finalImages = [];
    let index = 0;
    for (const item of state.images) {
      if (item.kind === "existing") {
        finalImages.push(item.path);
        continue;
      }
      index += 1;
      elements.save.innerHTML = "<span>上传照片 " + index + " / " + state.images.filter((image) => image.kind === "new").length + "…</span>";
      const path = await uploadImage(item.dataUrl, state.user.id);
      uploadedPaths.push(path);
      finalImages.push(path);
    }

    const payload = {
      title: elements.title.value.trim(),
      body: elements.body.value.trim(),
      tags: Array.from(state.tags),
      duration: durationText(),
      images: finalImages
    };

    elements.save.innerHTML = "<span>写入审核队列…</span>";

    if (isEditing) {
      await api.updatePost({ ...payload, id: editId });
      const removed = Array.from(state.removedExistingPaths).filter((path) => path.startsWith("rooms/"));
      if (removed.length) removeImages(removed).catch(() => {});
      window.location.href = "me.html?updated=1";
    } else {
      await api.createPost(payload);
      window.location.href = "me.html?created=1";
    }
  } catch (error) {
    if (uploadedPaths.length) removeImages(uploadedPaths).catch(() => {});
    setBusy(false);
    showToast(friendlyError(error), "error", 5000);
  }
});

load();

const STORAGE = {
  queue: "ux_commenter_queue",
  prUrl: "ux_commenter_pr_url",
  token: "ux_commenter_github_token",
  displayName: "ux_commenter_display_name",
};

/** Inline data-URL images larger than this are omitted from Markdown. */
const MAX_INLINE_IMAGE_CHARS = 400_000;
/** GitHub issue comment bodies are rejected if too large; stay conservative. */
const MAX_GITHUB_COMMENT_CHARS = 55_000;

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("err", Boolean(isError));
}

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(obj) {
  return chrome.storage.local.set(obj);
}

/** Accepts GitHub pull or issue URLs (same API # for PRs and issues). */
function parseGithubThreadUrl(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  const pullRe =
    /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|\?|#|$)/;
  const issueRe =
    /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:\/|\?|#|$)/;
  const m = u.match(pullRe) || u.match(issueRe);
  if (!m) return null;
  let host = m[1].toLowerCase();
  if (host === "www.github.com") host = "github.com";
  const owner = m[2];
  const repo = m[3];
  const number = m[4];
  const apiBase =
    host === "github.com"
      ? "https://api.github.com"
      : `https://${host}/api/v3`;
  return { host, owner, repo, number, apiBase };
}

/**
 * Repository root, pull request, or issue URL — for opening a cloud dev preview.
 */
function parseGithubPreviewContext(raw) {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim();
  const thread = parseGithubThreadUrl(u);
  if (thread) {
    const kind = /\/pull\/\d+/.test(u) ? "pull" : "issue";
    return { ...thread, kind };
  }
  const repoRe = /^https:\/\/([^/]+)\/([^/]+)\/([^/]+)\/?(?:$|[?#])/i;
  const m = u.match(repoRe);
  if (!m) return null;
  let host = m[1].toLowerCase();
  if (host === "www.github.com") host = "github.com";
  const owner = m[2];
  const repo = m[3];
  const reservedOwners = new Set([
    "settings",
    "apps",
    "orgs",
    "topics",
    "collections",
    "marketplace",
    "sponsors",
    "explore",
  ]);
  if (reservedOwners.has(owner)) return null;
  if (repo === "pull" || repo === "issues" || repo === "compare") return null;
  const apiBase =
    host === "github.com"
      ? "https://api.github.com"
      : `https://${host}/api/v3`;
  return { host, owner, repo, apiBase, kind: "repo" };
}

async function buildCloudPreviewUrl(inputUrl) {
  const ctx = parseGithubPreviewContext(inputUrl);
  if (!ctx) {
    return {
      ok: false,
      error: "Enter a GitHub repository, pull request, or issue URL.",
    };
  }

  if (ctx.kind === "pull" && ctx.host === "github.com") {
    return {
      ok: true,
      url: `https://pr.new/github.com/${ctx.owner}/${ctx.repo}/pull/${ctx.number}`,
    };
  }

  if (ctx.kind === "pull") {
    const { [STORAGE.token]: token } = await storageGet([STORAGE.token]);
    if (!token) {
      return {
        ok: false,
        error:
          "Add a GitHub token in Options to open Enterprise pull request previews.",
      };
    }
    try {
      const head = await fetchPullRequestHead(
        ctx.apiBase,
        ctx.owner,
        ctx.repo,
        ctx.number,
        token
      );
      const b = encodeURIComponent(head.branch);
      return {
        ok: true,
        url: `https://stackblitz.com/github/${head.headOwner}/${head.headRepo}/tree/${b}`,
      };
    } catch (e) {
      return {
        ok: false,
        error: e.message || "Could not resolve PR branch.",
      };
    }
  }

  if (ctx.host === "github.com") {
    return {
      ok: true,
      url: `https://pr.new/github.com/${ctx.owner}/${ctx.repo}`,
    };
  }

  return {
    ok: true,
    url: `https://stackblitz.com/github/${ctx.owner}/${ctx.repo}`,
  };
}

function syncPreviewLaunchUi() {
  const wrap = $("previewLaunchWrap");
  if (!wrap) return;
  const ctx = parseGithubPreviewContext($("prUrl").value.trim());
  wrap.hidden = !ctx;
}

function stylesToCssBlock(styles) {
  if (!styles || typeof styles !== "object") return "";
  return Object.entries(styles)
    .map(([k, v]) => `${k}: ${(v || "").trim()};`)
    .join("\n");
}

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

function dataUrlToBase64(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/\w+;base64,([\s\S]+)$/);
  if (!m) throw new Error("Invalid screenshot data");
  return m[1].replace(/\s/g, "");
}

/**
 * Returns { headOwner, headRepo, branch } for Contents API (supports cross-repo PRs).
 */
async function fetchPullRequestHead(apiBase, owner, repo, prNumber, token) {
  const res = await fetch(
    `${apiBase}/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: GH_HEADERS(token) }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(formatFetchError(t, res.statusText));
  }
  const pr = await res.json();
  const head = pr.head?.repo;
  const branch = pr.head?.ref;
  if (!head?.owner?.login || !head?.name || !branch) {
    throw new Error("Could not read PR head branch (merged or branch deleted?)");
  }
  return {
    headOwner: head.owner.login,
    headRepo: head.name,
    branch,
  };
}

async function fetchDefaultBranchUpload(apiBase, owner, repo, token) {
  const res = await fetch(`${apiBase}/repos/${owner}/${repo}`, {
    headers: GH_HEADERS(token),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(formatFetchError(t, res.statusText));
  }
  const data = await res.json();
  const branch = data.default_branch;
  if (!branch) throw new Error("Could not read repository default branch");
  return { headOwner: owner, headRepo: repo, branch };
}

/**
 * PR → head branch; plain issue → default branch (for image uploads).
 */
async function resolveUploadTarget(apiBase, owner, repo, number, token) {
  const res = await fetch(
    `${apiBase}/repos/${owner}/${repo}/issues/${number}`,
    { headers: GH_HEADERS(token) }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(formatFetchError(t, res.statusText));
  }
  const issue = await res.json();
  const isPullRequest = Boolean(issue.pull_request?.url);
  if (isPullRequest) {
    const head = await fetchPullRequestHead(
      apiBase,
      owner,
      repo,
      number,
      token
    );
    return { ...head, threadKind: "pr" };
  }
  const head = await fetchDefaultBranchUpload(apiBase, owner, repo, token);
  return { ...head, threadKind: "issue" };
}

/**
 * Create or update one file on a branch; returns raw/download URL for markdown images.
 */
async function putRepositoryImage({
  apiBase,
  owner,
  repo,
  path,
  branch,
  message,
  contentBase64,
  token,
}) {
  const pathInUrl = path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `${apiBase}/repos/${owner}/${repo}/contents/${pathInUrl}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...GH_HEADERS(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(formatFetchError(t, res.statusText));
  }
  const data = await res.json();
  const downloadUrl = data.content?.download_url;
  if (!downloadUrl) throw new Error("GitHub did not return an image URL");
  return downloadUrl;
}

/**
 * @param {{ images?: "embed"|"omit"|"hosted"; hostedUrls?: (string|null)[] }} imageOpts
 */
function formatMarkdownReport(items, displayName, imageOpts = {}) {
  const images = imageOpts.images ?? "embed";
  const hostedUrls = imageOpts.hostedUrls;
  const header = `## UX Review Feedback by ${displayName}`;
  const blocks = items.map((it, i) => {
    const n = i + 1;
    const css = stylesToCssBlock(it.styles);
    const lines = [
      `### ${n}. ${it.comment || "(no description)"}`,
      "",
      `- **Page**: ${it.pageUrl}`,
      `- **Target**: \`${it.elementLabel || it.selector || "—"}\``,
      `- **Selector**: \`${it.selector}\``,
      "",
    ];
    if (css.trim()) {
      lines.push("```css", css, "```", "");
    } else {
      lines.push(
        "_No single-element CSS snapshot (e.g. custom region)._",
        ""
      );
    }
    const du = it.regionDataUrl;
    const hosted = images === "hosted" && hostedUrls?.[i];
    if (hosted) {
      lines.push(`![Finding ${n} screenshot](${hosted})`, "");
    } else if (images === "embed" && du && du.length <= MAX_INLINE_IMAGE_CHARS) {
      lines.push(`![Finding ${n} screenshot](${du})`, "");
    } else if (du) {
      lines.push(
        `*Screenshot #${n}: use **Copy image**, or fix **Post to GitHub** uploads (\`repo\` / Contents write on the PR head branch or default branch for issues).*`,
        ""
      );
    }
    return lines.join("\n");
  });
  return [header, "", ...blocks].join("\n");
}

function formatFetchError(bodyText, statusLine) {
  if (!bodyText) return statusLine || "Request failed";
  try {
    const j = JSON.parse(bodyText);
    if (typeof j.message === "string" && j.message) return j.message;
  } catch {
    /* ignore */
  }
  const t = String(bodyText).trim();
  return t.length > 280 ? `${t.slice(0, 280)}…` : t;
}

async function copyImageFromDataUrl(dataUrl) {
  if (!dataUrl) throw new Error("No screenshot");
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || "image/png";
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
}

/**
 * When the UI runs in a separate popup window, `currentWindow` is that window.
 * Prefer the last-focused normal window with an http(s) page.
 */
async function getActiveTabId() {
  const isHttpPage = (url) =>
    typeof url === "string" && /^https?:\/\//i.test(url);

  try {
    const win = await chrome.windows.getLastFocused({ populate: true });
    const tab = win.tabs?.find((t) => t.active);
    if (tab?.id != null && isHttpPage(tab.url)) return tab.id;
  } catch {
    /* ignore */
  }

  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.type !== "normal" || w.state === "minimized") continue;
    const t = w.tabs?.find((x) => x.active);
    if (t?.id != null && isHttpPage(t.url)) return t.id;
  }

  const [fallback] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (fallback?.id != null && isHttpPage(fallback.url)) return fallback.id;

  return undefined;
}

async function loadQueue() {
  const data = await storageGet([STORAGE.queue]);
  return Array.isArray(data[STORAGE.queue]) ? data[STORAGE.queue] : [];
}

async function saveQueue(list) {
  await storageSet({ [STORAGE.queue]: list });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderQueue(list) {
  $("queueCount").textContent = String(list.length);
  const ul = $("queueList");
  ul.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "queue-empty";
    li.textContent =
      "Use Capture element or Capture region on the page, add a note, and items appear here.";
    ul.appendChild(li);
    return;
  }
  list.forEach((it, i) => {
    const li = document.createElement("li");
    li.className = "queue-item";
    li.dataset.itemId = it.id;
    const title = escapeHtml(it.comment || "(no description)");
    const target = escapeHtml(it.elementLabel || "");
    const sel = escapeHtml(it.selector || "");
    const pageUrl = escapeHtml(it.pageUrl || "");
    const hasImg = Boolean(it.regionDataUrl);
    const imgSrc = hasImg ? escapeHtml(it.regionDataUrl) : "";
    const detailsId = `qdet-${it.id}`;

    li.innerHTML = `
      <div class="queue-item-card">
        <div class="queue-item-top">
          <button
            type="button"
            class="queue-item-chevron"
            data-action="toggle-details"
            aria-expanded="false"
            aria-controls="${detailsId}"
            aria-label="Show selector and page details"
          >
            <span class="queue-chevron-icon" aria-hidden="true">▸</span>
          </button>
          <strong class="queue-item-title">${i + 1}. ${title}</strong>
          <button type="button" class="queue-item-remove" data-action="remove">
            Remove
          </button>
        </div>
        <div class="queue-item-thumb-wrap">
          ${
            hasImg
              ? `<img class="queue-item-thumb" src="${imgSrc}" alt="" />`
              : `<div class="queue-item-thumb-empty">No screenshot</div>`
          }
        </div>
        <div class="queue-item-details" id="${detailsId}" hidden>
          ${
            target
              ? `<span class="queue-target">${target}</span>`
              : ""
          }
          ${
            sel
              ? `<span class="queue-selector">${sel}</span>`
              : ""
          }
          ${
            pageUrl
              ? `<span class="queue-page"><span class="queue-page-label">Page</span> ${pageUrl}</span>`
              : ""
          }
          <div class="queue-item-actions">
            <button type="button" class="btn secondary" data-action="copy-img"${
              hasImg ? "" : " disabled"
            }>Copy image</button>
          </div>
        </div>
      </div>`;
    ul.appendChild(li);
  });
}

function showDraft(pick) {
  const draft = $("draft");
  if (!pick?.ok) {
    draft.hidden = true;
    return;
  }
  draft.hidden = false;
  const targetEl = $("draftTarget");
  const label =
    pick.elementLabel || pick.selector || "Selected element";
  if (targetEl) targetEl.textContent = label;
  const img = $("draftImg");
  img.onload = () => {
    img.classList.remove("thumb-error");
  };
  img.onerror = () => {
    img.classList.add("thumb-error");
    img.removeAttribute("src");
  };
  img.src = pick.regionDataUrl || "";
  $("draftMeta").textContent = [
    pick.selector && `Selector:\n${pick.selector}`,
    pick.pageUrl && `Page:\n${pick.pageUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  $("draftComment").value = "";
  $("btnCopyDraftImg").disabled = !pick.regionDataUrl;
  $("draftComment").focus();
}

async function refreshDraftFromStorage() {
  const data = await storageGet(["lastPick"]);
  const pick = data.lastPick;
  if (pick?.ok) {
    showDraft(pick);
  } else {
    $("draft").hidden = true;
  }
}

async function dismissDraft() {
  await chrome.storage.local.remove("lastPick");
  $("draft").hidden = true;
  if (chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ text: "" });
  }
  setStatus("Capture discarded.");
}

async function init() {
  if (chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ text: "" });
  }

  const data = await storageGet([STORAGE.prUrl, STORAGE.queue]);
  if (data[STORAGE.prUrl]) $("prUrl").value = data[STORAGE.prUrl];
  syncPreviewLaunchUi();
  renderQueue(await loadQueue());
  await refreshDraftFromStorage();

  async function persistPrUrl() {
    await storageSet({ [STORAGE.prUrl]: $("prUrl").value.trim() });
  }
  $("prUrl").addEventListener("change", () => {
    syncPreviewLaunchUi();
    persistPrUrl();
  });
  $("prUrl").addEventListener("blur", persistPrUrl);
  $("prUrl").addEventListener("input", syncPreviewLaunchUi);

  $("btnLaunchPreview").addEventListener("click", async () => {
    setStatus("");
    const input = $("prUrl").value.trim();
    const r = await buildCloudPreviewUrl(input);
    if (!r.ok) {
      setStatus(r.error, true);
      return;
    }
    await chrome.tabs.create({ url: r.url });
    setStatus("Opening cloud preview in a new tab…");
  });

  async function startCaptureOnPage(tabId, messageType, startedHint, statusLine) {
    function applyPickUiStarted() {
      $("pickHint").textContent = startedHint;
      $("pickHint").hidden = false;
      $("btnCancelPick").hidden = false;
      setStatus(statusLine);
    }

    try {
      const r1 = await chrome.tabs.sendMessage(tabId, { type: messageType });
      if (r1?.ok === false) {
        setStatus(r1.error || "Could not start capture.", true);
        return;
      }
      applyPickUiStarted();
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content/picker.js"],
        });
        const r2 = await chrome.tabs.sendMessage(tabId, { type: messageType });
        if (r2?.ok === false) {
          setStatus(r2.error || "Could not start capture.", true);
          return;
        }
        applyPickUiStarted();
      } catch {
        setStatus(
          "Cannot inject into this page. Refresh the tab and try again; or you may be on a restricted URL (chrome://, Web Store, etc.), or a URL this extension does not match (e.g. file://, LAN IP).",
          true
        );
      }
    }
  }

  $("btnPick").addEventListener("click", async () => {
    setStatus("");
    const tabId = await getActiveTabId();
    if (!tabId) {
      setStatus("Could not get the active tab.", true);
      return;
    }
    await startCaptureOnPage(
      tabId,
      "START_PICK",
      "Picking… click an element on the page · Esc to cancel",
      "Click an element on the page…"
    );
  });

  $("btnRegionPick").addEventListener("click", async () => {
    setStatus("");
    const tabId = await getActiveTabId();
    if (!tabId) {
      setStatus("Could not get the active tab.", true);
      return;
    }
    await startCaptureOnPage(
      tabId,
      "START_REGION_PICK",
      "Drag a rectangle on the page · Esc to cancel",
      "Drag to select a region on the page…"
    );
  });

  async function cancelActivePick() {
    const tabId = await getActiveTabId();
    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: "CANCEL_PICK" });
      } catch {
        /* ignore */
      }
    }
    $("pickHint").hidden = true;
    $("btnCancelPick").hidden = true;
    setStatus("");
  }

  $("btnCancelPick").addEventListener("click", () => {
    cancelActivePick();
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || e.repeat) return;
      if ($("pickHint").hidden) return;
      e.preventDefault();
      cancelActivePick();
    },
    true
  );

  $("btnDiscardDraft").addEventListener("click", () => {
    dismissDraft();
  });

  $("btnCopyDraftImg").addEventListener("click", async () => {
    const data = await storageGet(["lastPick"]);
    const url = data.lastPick?.regionDataUrl || $("draftImg").src;
    try {
      await copyImageFromDataUrl(url);
      setStatus("Screenshot copied to clipboard.");
    } catch {
      setStatus("Could not copy image.", true);
    }
  });

  $("btnAdd").addEventListener("click", async () => {
    const data = await storageGet(["lastPick"]);
    const pick = data.lastPick;
    if (!pick?.ok) {
      setStatus("Capture a region or element first.", true);
      return;
    }
    const comment = $("draftComment").value.trim();
    if (!comment) {
      setStatus("Enter feedback text.", true);
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      comment,
      pageUrl: pick.pageUrl,
      elementLabel: pick.elementLabel || "",
      selector: pick.selector,
      rect: pick.rect,
      styles: pick.styles,
      regionDataUrl: pick.regionDataUrl,
      at: Date.now(),
    };
    const list = await loadQueue();
    list.push(item);
    await saveQueue(list);
    await chrome.storage.local.remove("lastPick");
    renderQueue(list);
    $("draft").hidden = true;
    $("pickHint").hidden = true;
    $("btnCancelPick").hidden = true;
    setStatus("Added to this session.");
  });

  $("queueList").addEventListener("click", async (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const toggle = t.closest("[data-action='toggle-details']");
    if (toggle) {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      const next = !expanded;
      toggle.setAttribute("aria-expanded", String(next));
      const panelId = toggle.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (panel) panel.hidden = !next;
      toggle.setAttribute(
        "aria-label",
        next ? "Hide technical details" : "Show selector and page details"
      );
      return;
    }
    const rm = t.closest("[data-action='remove']");
    const cp = t.closest("[data-action='copy-img']");
    if (!rm && !cp) return;
    const li = t.closest("li[data-item-id]");
    const id = li?.dataset.itemId;
    if (!id) return;

    const list = await loadQueue();
    const idx = list.findIndex((x) => x.id === id);
    if (idx < 0) return;

    if (rm) {
      list.splice(idx, 1);
      await saveQueue(list);
      renderQueue(list);
      setStatus("Item removed.");
      return;
    }

    if (cp) {
      const du = list[idx].regionDataUrl;
      try {
        await copyImageFromDataUrl(du);
        setStatus("Image copied to clipboard.");
      } catch {
        setStatus("Could not copy image.", true);
      }
    }
  });

  $("btnClear").addEventListener("click", async () => {
    await saveQueue([]);
    await chrome.storage.local.remove("lastPick");
    renderQueue([]);
    $("draft").hidden = true;
    setStatus("Session cleared.");
  });

  $("btnCopyMd").addEventListener("click", async () => {
    const list = await loadQueue();
    if (!list.length) {
      setStatus("Nothing to copy.", true);
      return;
    }
    const { [STORAGE.displayName]: displayName } = await storageGet([
      STORAGE.displayName,
    ]);
    const name = (displayName && displayName.trim()) || "UX Reviewer";
    let md = formatMarkdownReport(list, name, { images: "embed" });
    let note = "Markdown copied (with inline screenshots where size allows).";
    if (md.length > 1_800_000) {
      md = formatMarkdownReport(list, name, { images: "omit" });
      note =
        "Report was large; copied without inline images — use Copy image per item.";
    }
    try {
      await navigator.clipboard.writeText(md);
      setStatus(note);
    } catch {
      try {
        md = formatMarkdownReport(list, name, { images: "omit" });
        await navigator.clipboard.writeText(md);
        setStatus("Copied text-only Markdown (clipboard size limit).");
      } catch {
        setStatus("Copy failed. Check clipboard permissions.", true);
      }
    }
  });

  $("btnPostGh").addEventListener("click", async () => {
    const btn = $("btnPostGh");
    if (btn.disabled) return;

    setStatus("");
    await persistPrUrl();
    const prUrl = $("prUrl").value.trim();
    const parsed = parseGithubThreadUrl(prUrl);
    if (!parsed) {
      setStatus(
        "Enter a valid GitHub PR or issue URL (GitHub.com or Enterprise).",
        true
      );
      return;
    }
    const { [STORAGE.token]: token } = await storageGet([STORAGE.token]);
    if (!token) {
      setStatus("Add a GitHub token in Options first.", true);
      return;
    }
    const list = await loadQueue();
    if (!list.length) {
      setStatus("Nothing to post.", true);
      return;
    }

    const { [STORAGE.displayName]: displayName } = await storageGet([
      STORAGE.displayName,
    ]);
    const display = (displayName && displayName.trim()) || "UX Reviewer";

    const origLabel = btn.textContent;
    btn.disabled = true;

    try {
      setStatus("Resolving branch for upload…");
      const head = await resolveUploadTarget(
        parsed.apiBase,
        parsed.owner,
        parsed.repo,
        parsed.number,
        token
      );
      const folder =
        head.threadKind === "pr"
          ? `pr-${parsed.number}`
          : `issue-${parsed.number}`;

      /** @type {(string|null)[]} */
      const hostedUrls = list.map(() => null);
      let uploadErrors = 0;

      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        btn.textContent = `Uploading ${i + 1}/${list.length}…`;
        if (!it.regionDataUrl) continue;
        try {
          const b64 = dataUrlToBase64(it.regionDataUrl);
          const path = `.snapthread/${folder}/${it.id}.png`;
          const kindLabel = head.threadKind === "pr" ? "PR" : "issue";
          const urlImg = await putRepositoryImage({
            apiBase: parsed.apiBase,
            owner: head.headOwner,
            repo: head.headRepo,
            path,
            branch: head.branch,
            message: `snapthread: ${kindLabel} #${parsed.number} screenshot (${i + 1})`,
            contentBase64: b64,
            token,
          });
          hostedUrls[i] = urlImg;
        } catch {
          uploadErrors += 1;
          hostedUrls[i] = null;
        }
      }

      let body = formatMarkdownReport(list, display, {
        images: "hosted",
        hostedUrls,
      });

      if (body.length > MAX_GITHUB_COMMENT_CHARS) {
        body = formatMarkdownReport(list, display, { images: "omit" });
        body += `\n\n---\n*Comment was too large with images; posted text only. Use **Copy image** per finding if needed.*`;
      } else if (uploadErrors > 0) {
        body += `\n\n---\n*${uploadErrors} screenshot(s) could not be uploaded (need **repo** scope and push access to **${head.headOwner}/${head.headRepo}** branch \`${head.branch}\`). Use **Copy image** to add them manually.*`;
      } else if (head.threadKind === "pr") {
        body += `\n\n---\n*Screenshots live under \`.snapthread/${folder}/\` on the PR head branch \`${head.branch}\`; delete after merge if you want.*`;
      } else {
        body += `\n\n---\n*Screenshots live under \`.snapthread/${folder}/\` on the default branch \`${head.branch}\`; remove the folder in a follow-up commit if you want.*`;
      }

      btn.textContent = "Posting…";
      const url = `${parsed.apiBase}/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...GH_HEADERS(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(formatFetchError(errText, res.statusText));
      }
      await saveQueue([]);
      await chrome.storage.local.remove("lastPick");
      renderQueue([]);
      $("draft").hidden = true;
      setStatus("Posted to GitHub.");
    } catch (e) {
      setStatus(`GitHub request failed: ${e.message || e}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  });

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.lastPick) return;
    const nv = changes.lastPick.newValue;
    if (nv === undefined) {
      $("draft").hidden = true;
      $("pickHint").hidden = true;
      $("btnCancelPick").hidden = true;
      return;
    }
    $("pickHint").hidden = true;
    $("btnCancelPick").hidden = true;
    if (!nv.ok) {
      setStatus(nv.error || "Capture failed", true);
      chrome.storage.local.remove("lastPick");
      return;
    }
    refreshDraftFromStorage();
    setStatus("");
  });
}

init();

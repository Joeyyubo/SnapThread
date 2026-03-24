# SnapThread

**SnapThread** is a Chrome extension (Manifest V3) for UX reviews and design walkthroughs on **localhost**, **staging**, and **preview** URLs. Capture UI with context, queue findings in a session, and share them as Markdown—or post directly to **GitHub pull requests and issues** with images that render inline in the thread.

---

## Features

- **Side panel workflow** — Works alongside the page you are reviewing; pin the extension and keep the panel open while you click around.
- **Capture element** — Hover highlight shows exactly what will be snapped; click to capture the element bounds plus a snapshot of **computed CSS** (key properties).
- **Capture region** — Drag a rectangle to screenshot **across multiple components** (not limited to a single DOM node).
- **Session queue** — Collapsible cards: collapsed view shows feedback + thumbnail; expand for full selector, page URL, and **Copy image**.
- **Markdown export** — Copy a structured report (findings, selectors, CSS blocks, embedded or linked images).
- **Post to GitHub** — Uploads PNGs to the repo (under `.snapthread/`) so comments use real `download_url` images (GitHub does not render huge Data URIs the same way).
- **GitHub.com & Enterprise** — Supports `api.github.com` and Enterprise hosts using `/api/v3`.

---

## Install (developer / unpacked)

1. Clone this repository.
2. Open Chrome → **`chrome://extensions`**.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the **`extension`** folder inside this repo (the directory that contains `manifest.json`).

Optional: add your **GitHub Personal Access Token** under the extension **Options** page (stored only in local extension storage on your machine).

---

## How to use

1. Open the page you want to review (HTTP/HTTPS).
2. Open the SnapThread **side panel** (toolbar icon).
3. Use **Capture element** or **Capture region** on the **web page** (not inside the panel).
4. Add feedback in **Current capture**, then **Add to session**.
5. Repeat as needed, then **Post to GitHub** or **Copy Markdown**.

**Tips**

- After updating the extension, **refresh** the tab under review so the content script is active.
- **Esc** cancels picking (works from the page or from the side panel while a capture is in progress).
- **Discard** clears the current capture without adding it to the session.
- Cross-origin **iframes** cannot be picked from the top document—open that URL in its own tab.

---

## GitHub posting & permissions

Posting comments uses the GitHub REST API. Image files are committed to:

| Thread type | Branch | Path pattern |
|-------------|--------|----------------|
| Pull request | PR **head** branch | `.snapthread/pr-<number>/` |
| Plain issue | Repo **default** branch | `.snapthread/issue-<number>/` |

Your token needs appropriate **`repo`** (classic) or fine-grained **Contents: Read and write** on the target repository. Fork PRs require push access to the **fork** that owns the head branch.

---

## Project structure

```
extension/
  manifest.json          # MV3 manifest
  background/            # Service worker (capture, storage hooks)
  content/               # Page overlay & picking
  sidepanel/             # Main UI (side panel)
  popup/                 # Shared styles & scripts
  options/               # Options page (token, display name)
  icons/                 # Toolbar / store icons (PNG)
  scripts/
    generate_icons.py    # Regenerates icons from the brand template
```

---

## Regenerating icons

Requires Python 3 and [Pillow](https://python-pillow.org/):

```bash
cd extension
pip install pillow   # if needed
python3 scripts/generate_icons.py
```

---

## Privacy & data

- **GitHub token** and **queue data** are stored in the extension’s **local** storage only.
- Screenshots are captured with `chrome.tabs.captureVisibleTab` for the **visible** viewport; the extension does not send data to servers other than **GitHub** when you choose **Post to GitHub**.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Links

- **Repository:** [github.com/Joeyyubo/SnapThread](https://github.com/Joeyyubo/SnapThread)

(function () {
  const PICK_OVERLAY_ID = "ux-commenter-overlay";
  const HIGHLIGHT_ID = "ux-commenter-highlight";
  const TAGHINT_ID = "ux-commenter-taghint";
  const REGION_BOX_ID = "ux-commenter-region-box";
  const MIN_REGION_PX = 8;

  function injectOverlay() {
    if (document.getElementById(PICK_OVERLAY_ID)) return;
    const el = document.createElement("div");
    el.id = PICK_OVERLAY_ID;
    el.setAttribute("data-ux-commenter", "overlay");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      cursor: "crosshair",
      background: "rgba(15, 23, 42, 0.12)",
      pointerEvents: "auto",
    });

    const hi = document.createElement("div");
    hi.id = HIGHLIGHT_ID;
    hi.setAttribute("data-ux-commenter", "highlight");
    Object.assign(hi.style, {
      display: "none",
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxSizing: "border-box",
      border: "2px solid #2563eb",
      borderRadius: "4px",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 4px 14px rgba(37,99,235,0.35)",
      transition: "left 40ms ease, top 40ms ease, width 40ms ease, height 40ms ease",
    });

    const tag = document.createElement("div");
    tag.id = TAGHINT_ID;
    tag.setAttribute("data-ux-commenter", "taghint");
    Object.assign(tag.style, {
      display: "none",
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
      maxWidth: "min(90vw, 320px)",
      padding: "4px 8px",
      font: '600 11px/1.3 ui-monospace, Menlo, Consolas, monospace',
      color: "#fff",
      background: "rgba(17,24,39,0.92)",
      borderRadius: "6px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      wordBreak: "break-all",
    });

    el.appendChild(hi);
    el.appendChild(tag);
    document.documentElement.appendChild(el);
  }

  function injectRegionOverlay() {
    if (document.getElementById(PICK_OVERLAY_ID)) return;
    const el = document.createElement("div");
    el.id = PICK_OVERLAY_ID;
    el.setAttribute("data-ux-commenter", "overlay");
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      cursor: "crosshair",
      background: "rgba(15, 23, 42, 0.12)",
      pointerEvents: "auto",
    });

    const box = document.createElement("div");
    box.id = REGION_BOX_ID;
    box.setAttribute("data-ux-commenter", "region-box");
    Object.assign(box.style, {
      display: "none",
      position: "fixed",
      pointerEvents: "none",
      zIndex: "2147483647",
      boxSizing: "border-box",
      border: "2px dashed #2563eb",
      background: "rgba(37, 99, 235, 0.1)",
    });

    el.appendChild(box);
    document.documentElement.appendChild(el);
  }

  function clampRectViewport(x0, y0, x1, y1) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const l = Math.min(x0, x1);
    const t = Math.min(y0, y1);
    const r = Math.max(x0, x1);
    const b = Math.max(y0, y1);
    const left = Math.max(0, Math.min(l, vw));
    const top = Math.max(0, Math.min(t, vh));
    const right = Math.max(left, Math.min(r, vw));
    const bottom = Math.max(top, Math.min(b, vh));
    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }

  function removeOverlay() {
    document.getElementById(PICK_OVERLAY_ID)?.remove();
  }

  function elementLabel(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    let s = tag;
    if (node.id) s += `#${CSS.escape(node.id)}`;
    else if (node.classList?.length) {
      const c = Array.from(node.classList)
        .slice(0, 2)
        .map((cls) => `.${CSS.escape(cls)}`)
        .join("");
      s += c;
    }
    return s;
  }

  function simpleSelector(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    if (node.id) return `#${CSS.escape(node.id)}`;
    const parts = [];
    let el = node;
    let depth = 0;
    while (el && el.nodeType === Node.ELEMENT_NODE && depth < 6) {
      let part = el.tagName.toLowerCase();
      if (el.classList.length) {
        const cls = Array.from(el.classList)
          .slice(0, 2)
          .map((c) => `.${CSS.escape(c)}`)
          .join("");
        part += cls;
      }
      const parent = el.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(
          (c) => c.tagName === el.tagName
        );
        if (same.length > 1) {
          const idx = same.indexOf(el) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      el = parent;
      depth += 1;
    }
    return parts.join(" > ");
  }

  const STYLE_KEYS = [
    "display",
    "position",
    "box-sizing",
    "width",
    "height",
    "margin",
    "padding",
    "background",
    "background-color",
    "color",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "border",
    "border-radius",
    "box-shadow",
    "opacity",
    "gap",
    "align-items",
    "justify-content",
  ];

  function snapshotComputedStyles(element) {
    const cs = getComputedStyle(element);
    const out = {};
    for (const key of STYLE_KEYS) {
      out[key] = cs.getPropertyValue(key);
    }
    return out;
  }

  /**
   * Map viewport CSS pixels to screenshot pixels using the real capture size
   * (fixes wrong crops when zoom ≠ 100% or when DPR ≠ capture scale).
   */
  function cropDataUrl(fullDataUrl, rect, viewportW, viewportH) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const vw = Math.max(1, viewportW || window.innerWidth);
        const vh = Math.max(1, viewportH || window.innerHeight);
        const scaleX = img.naturalWidth / vw;
        const scaleY = img.naturalHeight / vh;
        const sx = Math.max(0, Math.round(rect.left * scaleX));
        const sy = Math.max(0, Math.round(rect.top * scaleY));
        const sw = Math.max(1, Math.round(rect.width * scaleX));
        const sh = Math.max(1, Math.round(rect.height * scaleY));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No canvas context"));
          return;
        }
        try {
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = fullDataUrl;
    });
  }

  let picking = false;
  let onPickHandler = null;
  let onKeyHandler = null;
  let onMoveHandler = null;
  let moveRaf = null;
  let regionListeners = null;

  function pickTargetFromPoint(clientX, clientY) {
    const overlay = document.getElementById(PICK_OVERLAY_ID);
    if (overlay) overlay.style.pointerEvents = "none";
    let el = document.elementFromPoint(clientX, clientY);
    if (overlay) overlay.style.pointerEvents = "auto";
    while (el && el.nodeType !== Node.ELEMENT_NODE) {
      el = el.parentElement;
    }
    while (el?.closest?.("[data-ux-commenter]")) {
      el = el.parentElement;
    }
    return el;
  }

  function updateHoverUI(clientX, clientY) {
    const hi = document.getElementById(HIGHLIGHT_ID);
    const tag = document.getElementById(TAGHINT_ID);
    if (!hi || !tag) return;

    const el = pickTargetFromPoint(clientX, clientY);
    if (
      !el ||
      el === document.documentElement ||
      el === document.body
    ) {
      hi.style.display = "none";
      tag.style.display = "none";
      return;
    }

    const r = el.getBoundingClientRect();
    hi.style.display = "block";
    hi.style.left = `${r.left}px`;
    hi.style.top = `${r.top}px`;
    hi.style.width = `${r.width}px`;
    hi.style.height = `${r.height}px`;

    const label = elementLabel(el);
    tag.textContent = label || el.tagName.toLowerCase();
    tag.style.display = "block";
    const tx = Math.min(clientX + 12, window.innerWidth - 160);
    const ty = Math.min(clientY + 16, window.innerHeight - 40);
    tag.style.left = `${Math.max(8, tx)}px`;
    tag.style.top = `${Math.max(8, ty)}px`;
  }

  function teardownRegionListeners() {
    if (!regionListeners) return;
    const ov = document.getElementById(PICK_OVERLAY_ID);
    if (ov) {
      ov.removeEventListener("mousedown", regionListeners.mousedown, true);
    }
    if (regionListeners.move) {
      document.removeEventListener("mousemove", regionListeners.move, true);
    }
    if (regionListeners.up) {
      document.removeEventListener("mouseup", regionListeners.up, true);
    }
    regionListeners = null;
  }

  function stopPick() {
    picking = false;
    teardownRegionListeners();
    if (onMoveHandler) {
      const ov = document.getElementById(PICK_OVERLAY_ID);
      if (ov) ov.removeEventListener("mousemove", onMoveHandler, true);
      onMoveHandler = null;
    }
    moveRaf = null;
    removeOverlay();
    if (onPickHandler) {
      document.removeEventListener("click", onPickHandler, true);
      onPickHandler = null;
    }
    if (onKeyHandler) {
      document.removeEventListener("keydown", onKeyHandler, true);
      onKeyHandler = null;
    }
  }

  function startPick() {
    if (picking) return;
    picking = true;
    injectOverlay();
    const overlay = document.getElementById(PICK_OVERLAY_ID);

    onMoveHandler = (ev) => {
      if (!picking || moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null;
        if (!picking) return;
        updateHoverUI(ev.clientX, ev.clientY);
      });
    };
    if (overlay) {
      overlay.addEventListener("mousemove", onMoveHandler, true);
    }

    onPickHandler = async (ev) => {
      if (!picking) return;
      ev.preventDefault();
      ev.stopPropagation();
      const x = ev.clientX;
      const y = ev.clientY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (overlay) {
        overlay.removeEventListener("mousemove", onMoveHandler, true);
        onMoveHandler = null;
      }
      moveRaf = null;

      removeOverlay();
      if (onPickHandler) {
        document.removeEventListener("click", onPickHandler, true);
        onPickHandler = null;
      }
      if (onKeyHandler) {
        document.removeEventListener("keydown", onKeyHandler, true);
        onKeyHandler = null;
      }
      picking = false;

      await new Promise((r) => requestAnimationFrame(r));

      let el = pickTargetFromPoint(x, y);
      const pageUrl = location.href;
      if (!el) {
        chrome.runtime.sendMessage({
          type: "PICK_RESULT",
          payload: { ok: false, error: "No valid element at click", pageUrl },
        });
        return;
      }

      const rect = el.getBoundingClientRect();
      const selector = simpleSelector(el);
      const label = elementLabel(el);
      const styles = snapshotComputedStyles(el);

      const cap = await chrome.runtime.sendMessage({
        type: "CAPTURE_VISIBLE_TAB",
      });
      if (!cap?.ok) {
        chrome.runtime.sendMessage({
          type: "PICK_RESULT",
          payload: {
            ok: false,
            error:
              cap?.error ||
              "Screenshot failed (try clicking the page tab once, then Capture again).",
            pageUrl,
          },
        });
        return;
      }

      let regionDataUrl = cap.dataUrl;
      try {
        regionDataUrl = await cropDataUrl(cap.dataUrl, rect, vw, vh);
      } catch {
        regionDataUrl = cap.dataUrl;
      }

      chrome.runtime.sendMessage({
        type: "PICK_RESULT",
        payload: {
          ok: true,
          pageUrl,
          elementLabel: label,
          selector,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
          styles,
          regionDataUrl,
        },
      });
    };

    document.addEventListener("click", onPickHandler, true);

    onKeyHandler = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        stopPick();
        chrome.runtime.sendMessage({ type: "PICK_CANCELLED" });
      }
    };
    document.addEventListener("keydown", onKeyHandler, true);
  }

  function startRegionPick() {
    if (picking) return;
    picking = true;
    injectRegionOverlay();
    const overlay = document.getElementById(PICK_OVERLAY_ID);
    const box = document.getElementById(REGION_BOX_ID);
    if (!overlay || !box) {
      picking = false;
      return;
    }

    let x0 = 0;
    let y0 = 0;
    let dragging = false;

    const onMove = (ev) => {
      if (!dragging || !picking) return;
      const r = clampRectViewport(x0, y0, ev.clientX, ev.clientY);
      box.style.display = "block";
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
    };

    const onUp = async (ev) => {
      if (!dragging || !picking) return;
      dragging = false;
      if (regionListeners?.move) {
        document.removeEventListener("mousemove", regionListeners.move, true);
        regionListeners.move = null;
      }
      if (regionListeners?.up) {
        document.removeEventListener("mouseup", regionListeners.up, true);
        regionListeners.up = null;
      }

      const rect = clampRectViewport(x0, y0, ev.clientX, ev.clientY);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pageUrl = location.href;

      teardownRegionListeners();
      if (onKeyHandler) {
        document.removeEventListener("keydown", onKeyHandler, true);
        onKeyHandler = null;
      }
      removeOverlay();
      picking = false;

      if (
        rect.width < MIN_REGION_PX ||
        rect.height < MIN_REGION_PX
      ) {
        chrome.runtime.sendMessage({
          type: "PICK_RESULT",
          payload: {
            ok: false,
            error: "Region too small — drag a larger rectangle.",
            pageUrl,
          },
        });
        return;
      }

      await new Promise((r) => requestAnimationFrame(r));

      const cap = await chrome.runtime.sendMessage({
        type: "CAPTURE_VISIBLE_TAB",
      });
      if (!cap?.ok) {
        chrome.runtime.sendMessage({
          type: "PICK_RESULT",
          payload: {
            ok: false,
            error:
              cap?.error ||
              "Screenshot failed (try clicking the page tab once, then Capture again).",
            pageUrl,
          },
        });
        return;
      }

      let regionDataUrl = cap.dataUrl;
      try {
        regionDataUrl = await cropDataUrl(cap.dataUrl, rect, vw, vh);
      } catch {
        regionDataUrl = cap.dataUrl;
      }

      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      chrome.runtime.sendMessage({
        type: "PICK_RESULT",
        payload: {
          ok: true,
          pageUrl,
          elementLabel: `Region ${w}×${h}`,
          selector: "(custom region)",
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
          styles: {},
          regionDataUrl,
        },
      });
    };

    const onDown = (ev) => {
      if (!picking) return;
      ev.preventDefault();
      ev.stopPropagation();
      x0 = ev.clientX;
      y0 = ev.clientY;
      dragging = true;
      box.style.display = "block";
      box.style.left = `${x0}px`;
      box.style.top = `${y0}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
      if (regionListeners) {
        regionListeners.move = onMove;
        regionListeners.up = onUp;
      }
    };

    regionListeners = { mousedown: onDown, move: null, up: null };
    overlay.addEventListener("mousedown", onDown, true);

    onKeyHandler = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        stopPick();
        chrome.runtime.sendMessage({ type: "PICK_CANCELLED" });
      }
    };
    document.addEventListener("keydown", onKeyHandler, true);
  }

  if (!globalThis.__SNAPTHREAD_PICKER_LISTENER__) {
    globalThis.__SNAPTHREAD_PICKER_LISTENER__ = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "START_PICK") {
        if (picking) {
          sendResponse({
            ok: false,
            error: "Already capturing — finish or press Esc.",
          });
          return true;
        }
        startPick();
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "START_REGION_PICK") {
        if (picking) {
          sendResponse({
            ok: false,
            error: "Already capturing — finish or press Esc.",
          });
          return true;
        }
        startRegionPick();
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "CANCEL_PICK") {
        stopPick();
        sendResponse({ ok: true });
        return true;
      }
    });
  }
})();

function registerSidePanelClickOpensPanel() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}

registerSidePanelClickOpensPanel();

chrome.runtime.onInstalled.addListener(() => {
  registerSidePanelClickOpensPanel();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PICK_CANCELLED") {
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "PICK_RESULT") {
    chrome.storage.local.set({
      lastPick: {
        ...message.payload,
        tabId: sender.tab?.id,
        at: Date.now(),
      },
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "CAPTURE_VISIBLE_TAB") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab for capture." });
      return true;
    }
    // Never pass `null` as windowId — Chrome treats it as invalid and returns
    // "Either the '<all_urls>' or 'activeTab' permission is required" even when
    // host_permissions are correct. Always resolve a real windowId from the tab.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({
          ok: false,
          error:
            chrome.runtime.lastError?.message ||
            "Could not read tab for capture.",
        });
        return;
      }
      const windowId = tab.windowId;
      if (typeof windowId !== "number") {
        sendResponse({ ok: false, error: "Could not resolve window for tab." });
        return;
      }
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        const err = chrome.runtime.lastError;
        if (err) {
          sendResponse({ ok: false, error: err.message });
          return;
        }
        sendResponse({ ok: true, dataUrl });
      });
    });
    return true;
  }
});

function setCaptureBadge(on) {
  if (on) {
    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.lastPick) return;
  const { newValue } = changes.lastPick;

  if (newValue === undefined) {
    setCaptureBadge(false);
    return;
  }

  if (newValue?.ok === false) {
    setCaptureBadge(false);
    return;
  }

  if (newValue?.ok) {
    setCaptureBadge(true);
    chrome.notifications.create(`snapthread-${newValue.at ?? Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon48.png"),
      title: "SnapThread",
      message:
        "Capture ready — add your note in the side panel (click the toolbar icon if it closed).",
      priority: 1,
    });
  }
});

const STORAGE = {
  token: "ux_commenter_github_token",
  displayName: "ux_commenter_display_name",
};

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.local.get([
    STORAGE.token,
    STORAGE.displayName,
  ]);
  if (data[STORAGE.displayName]) {
    $("displayName").value = data[STORAGE.displayName];
  }
  if (data[STORAGE.token]) {
    $("token").value = data[STORAGE.token];
  }
}

$("save").addEventListener("click", async () => {
  const msg = $("msg");
  msg.textContent = "";
  msg.classList.remove("err");
  await chrome.storage.local.set({
    [STORAGE.displayName]: $("displayName").value.trim() || "UX Reviewer",
    [STORAGE.token]: $("token").value.trim(),
  });
  msg.textContent = "Saved.";
});

load();

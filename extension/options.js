const input = document.getElementById("baseUrl");
const status = document.getElementById("status");

function showStatus(msg) {
  status.textContent = msg;
  setTimeout(() => {
    if (status.textContent === msg) status.textContent = "";
  }, 2000);
}

getCountdownBaseUrl().then((url) => {
  input.value = url;
});

document.getElementById("save").addEventListener("click", () => {
  const value = input.value.trim();
  if (!value) {
    showStatus("Enter a URL, or use Reset to default.");
    return;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch (err) {
    showStatus("That doesn't look like a valid URL.");
    return;
  }
  chrome.storage.sync.set({ [COUNTDOWN_STORAGE_KEY]: value }, () => {
    showStatus("Saved ✓");
  });
});

document.getElementById("reset").addEventListener("click", () => {
  input.value = COUNTDOWN_DEFAULT_BASE_URL;
  chrome.storage.sync.set({ [COUNTDOWN_STORAGE_KEY]: COUNTDOWN_DEFAULT_BASE_URL }, () => {
    showStatus("Reset to default ✓");
  });
});

// Shared config used by both content.js and options.js.
// Kept as a plain script (not a module) so it can be loaded with a simple
// <script> tag in options.html and doesn't need a build step for the
// content script context either.

const COUNTDOWN_DEFAULT_BASE_URL =
  "https://mostlyhumanverified.github.io/BP_calendarPlugincountdown/countdown.html";
const COUNTDOWN_STORAGE_KEY = "countdownBaseUrl";

function getCountdownBaseUrl() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([COUNTDOWN_STORAGE_KEY], (result) => {
        resolve(result && result[COUNTDOWN_STORAGE_KEY] ? result[COUNTDOWN_STORAGE_KEY] : COUNTDOWN_DEFAULT_BASE_URL);
      });
    } catch (err) {
      resolve(COUNTDOWN_DEFAULT_BASE_URL);
    }
  });
}
